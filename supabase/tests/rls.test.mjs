/**
 * Row Level Security and privilege tests against a real PostgreSQL engine
 * (PGlite: Postgres compiled to WebAssembly — no Docker or network needed).
 *
 *   cd supabase/tests && npm install && npm test
 *
 * The harness recreates what matters about a Supabase database: the anon /
 * authenticated roles, auth.users with the signup trigger, auth.uid() read
 * from the request JWT claims, and Supabase's permissive default grants on new
 * public tables (the reason client write access existed at all). It then
 * applies the repository's migrations in deployment order and attacks the
 * result as ordinary users.
 *
 * A second suite applies only the migrations that existed before
 * v1_2_security_p0.sql and asserts the original vulnerabilities are present —
 * proving these tests detect them rather than passing vacuously.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';

const here = dirname(fileURLToPath(import.meta.url));
const sql = (name) => readFileSync(join(here, '..', name), 'utf8');

const USERS = {
    alice: '11111111-1111-4111-8111-111111111111', // group owner
    bob: '22222222-2222-4222-8222-222222222222',   // group member
    carol: '33333333-3333-4333-8333-333333333333', // outsider / attacker
};
const GROUP = '44444444-4444-4444-8444-444444444444';

const SUPABASE_SHIM = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create schema auth;
    create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    create schema extensions;
    -- Supabase puts the extensions schema on the default search_path.
    set search_path = public, extensions;

    -- Supabase's out-of-the-box grants: the API roles get broad privileges on
    -- everything created in public. Tables must be locked down explicitly.
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const SEED = `
    insert into auth.users (id, email, raw_user_meta_data) values
        ('${USERS.alice}', 'alice@example.com', '{"full_name":"Alice"}'),
        ('${USERS.bob}',   'bob@example.com',   '{"full_name":"Bob"}'),
        ('${USERS.carol}', 'carol@example.com', '{"full_name":"Carol"}');

    insert into public.groups (id, name, created_by) values ('${GROUP}', 'Flat 4B', '${USERS.alice}');
    insert into public.group_members (group_id, user_id, role) values
        ('${GROUP}', '${USERS.alice}', 'admin'),
        ('${GROUP}', '${USERS.bob}', 'member');
    insert into public.group_expenses (group_id, description, amount, paid_by)
        values ('${GROUP}', 'Groceries', 1200, '${USERS.alice}');

    insert into public.expenses (user_id, amount, category, description) values
        ('${USERS.alice}', 500, 'Food', 'Alice lunch'),
        ('${USERS.bob}',   300, 'Transport', 'Bob cab');

    insert into public.ai_chat_history (user_id, role, content) values
        ('${USERS.alice}', 'user', 'Alice private question'),
        ('${USERS.bob}',   'user', 'Bob private question');
`;

async function buildDatabase(migrations, { afterEach } = {}) {
    const db = new PGlite({ extensions: { moddatetime } });
    await db.exec(SUPABASE_SHIM);
    for (const file of migrations) {
        try {
            await db.exec(sql(file));
            if (afterEach?.[file]) await db.exec(afterEach[file]);
        } catch (e) {
            throw new Error(`${file} failed to apply: ${e.message}`);
        }
    }
    await db.exec(SEED);
    return db;
}

/** Run one statement as an API role, with auth.uid() = userId. */
async function as(db, role, userId, statement) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId || ''}', false); set role ${role};`);
    try {
        const result = await db.query(statement);
        return { ok: true, rows: result.rows, affected: result.affectedRows ?? 0 };
    } catch (e) {
        return { ok: false, error: e.message };
    } finally {
        await db.exec('reset role;');
    }
}
const asUser = (db, userId, statement) => as(db, 'authenticated', userId, statement);

const denied = (r) => !r.ok && /permission denied/i.test(r.error);

const CURRENT = [
    'schema.sql',
    'v1_schema_extension.sql',
    'security_hardening.sql',
    'v1_1_launch_hardening.sql',
    'v1_2_security_p0.sql',
    'v1_3_product_core.sql',
    'v1_4_admin_ops.sql',
    'v1_6_owner_console.sql',
    'v1_7_money_decisions.sql',
    'v1_8_play_billing.sql',
    'v1_9_subscription_audit.sql',
    'v1_10_sponsored_challenges.sql',
    'v1_11_save_to_earn.sql',
    'v1_12_age_awareness.sql',
    'v1_13_notification_expenses.sql',
    'v1_14_rewards.sql',
    'v1_16_budgets_income.sql',
    'v1_17_financial_features.sql',
];
const BEFORE_P0 = CURRENT.slice(0, 2); // the state the audit found possible in production

// ═══════════════════════════════════════════════════════════════════════════
test('after v1_2_security_p0.sql', async (t) => {
    const db = await buildDatabase(CURRENT);

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_2_security_p0.sql'));
    });

    await t.test('the signup trigger created profiles', async () => {
        const r = await db.query('select count(*)::int as n from public.profiles');
        assert.equal(r.rows[0].n, 3);
    });

    await t.test('a user cannot make themselves Pro', async () => {
        const r = await asUser(db, USERS.carol, `update public.profiles set is_pro = true, pro_expires_at = now() + interval '1 year' where id = '${USERS.carol}'`);
        assert.ok(denied(r), JSON.stringify(r));
        const check = await db.query(`select is_pro from public.profiles where id = '${USERS.carol}'`);
        assert.equal(check.rows[0].is_pro, false);
    });

    await t.test('a user cannot make themselves admin', async () => {
        const r = await asUser(db, USERS.carol, `update public.profiles set role = 'admin' where id = '${USERS.carol}'`);
        assert.ok(denied(r), JSON.stringify(r));
    });

    await t.test('a user cannot change chillar, streak or quota counters', async () => {
        for (const set of ['total_chillar = 99999', 'streak_current = 365', 'chat_messages_today = 0', 'is_banned = false', 'karma_score = 1000']) {
            const r = await asUser(db, USERS.carol, `update public.profiles set ${set} where id = '${USERS.carol}'`);
            assert.ok(denied(r), `${set}: ${JSON.stringify(r)}`);
        }
    });

    await t.test("a user cannot change another user's premium status", async () => {
        const r = await asUser(db, USERS.carol, `update public.profiles set is_pro = true where id = '${USERS.alice}'`);
        assert.ok(denied(r), JSON.stringify(r));
    });

    await t.test('clients cannot insert, update or delete expenses directly (quota bypass)', async () => {
        assert.ok(denied(await asUser(db, USERS.carol, `insert into public.expenses (user_id, amount) values ('${USERS.carol}', 10)`)));
        assert.ok(denied(await asUser(db, USERS.alice, `update public.expenses set amount = 1 where user_id = '${USERS.alice}'`)));
        assert.ok(denied(await asUser(db, USERS.alice, `delete from public.expenses where user_id = '${USERS.alice}'`)));
    });

    await t.test("a user sees only their own expenses and AI history", async () => {
        const exp = await asUser(db, USERS.carol, 'select description from public.expenses');
        assert.deepEqual(exp.rows, []);
        const mine = await asUser(db, USERS.alice, 'select description from public.expenses');
        assert.deepEqual(mine.rows.map((r) => r.description), ['Alice lunch']);
        const chat = await asUser(db, USERS.bob, 'select content from public.ai_chat_history');
        assert.deepEqual(chat.rows.map((r) => r.content), ['Bob private question']);
    });

    await t.test('a user sees only their own profile', async () => {
        const r = await asUser(db, USERS.carol, 'select id from public.profiles');
        assert.deepEqual(r.rows.map((x) => x.id), [USERS.carol]);
    });

    await t.test('an outsider cannot add themselves to a group', async () => {
        const r = await asUser(db, USERS.carol, `insert into public.group_members (group_id, user_id) values ('${GROUP}', '${USERS.carol}')`);
        assert.ok(denied(r), JSON.stringify(r));
        const members = await db.query(`select count(*)::int as n from public.group_members where group_id = '${GROUP}'`);
        assert.equal(members.rows[0].n, 2);
    });

    await t.test("an outsider cannot read a group's expenses, members or settlements", async () => {
        for (const table of ['groups', 'group_members', 'group_expenses', 'group_expense_splits', 'settlements']) {
            const r = await asUser(db, USERS.carol, `select * from public.${table}`);
            assert.ok(r.ok, `${table}: ${r.error}`);
            assert.equal(r.rows.length, 0, table);
        }
    });

    await t.test('a member can read the group without recursive-policy errors', async () => {
        const members = await asUser(db, USERS.bob, `select user_id from public.group_members where group_id = '${GROUP}'`);
        assert.ok(members.ok, members.error);
        assert.equal(members.rows.length, 2);
        const expenses = await asUser(db, USERS.bob, 'select description from public.group_expenses');
        assert.deepEqual(expenses.rows.map((r) => r.description), ['Groceries']);
        const groups = await asUser(db, USERS.bob, 'select name from public.groups');
        assert.deepEqual(groups.rows.map((r) => r.name), ['Flat 4B']);
    });

    await t.test("members cannot modify another user's membership or group ownership", async () => {
        assert.ok(denied(await asUser(db, USERS.bob, `delete from public.group_members where user_id = '${USERS.alice}'`)));
        assert.ok(denied(await asUser(db, USERS.bob, `update public.group_members set role = 'admin' where user_id = '${USERS.bob}'`)));
        assert.ok(denied(await asUser(db, USERS.bob, `update public.groups set created_by = '${USERS.bob}' where id = '${GROUP}'`)));
    });

    await t.test('the anonymous role can read nothing', async () => {
        for (const table of ['profiles', 'expenses', 'groups', 'group_members', 'ai_chat_history']) {
            assert.ok(denied(await as(db, 'anon', null, `select * from public.${table}`)), table);
        }
    });

    await t.test('the membership helper is not callable by anon', async () => {
        const r = await as(db, 'anon', null, `select private.is_group_member('${GROUP}')`);
        assert.ok(!r.ok);
    });

    await t.test('a user cannot forge membership through the helper for someone else', async () => {
        const r = await asUser(db, USERS.carol, `select private.is_group_member('${GROUP}') as member`);
        assert.equal(r.rows[0].member, false);
    });

    await t.test('the service role (backend) can still write', async () => {
        const r = await as(db, 'service_role', null, `update public.profiles set total_chillar = total_chillar + 2 where id = '${USERS.alice}'`);
        // service_role has table privileges via default grants and bypasses RLS.
        assert.ok(r.ok, r.error);
    });

    await t.test('new expense sources are accepted by the enum', async () => {
        await db.exec(`insert into public.expenses (user_id, amount, source) values ('${USERS.alice}', 10, 'upi_auto'), ('${USERS.alice}', 11, 'pdf_import')`);
    });

    await t.test('role values are constrained', async () => {
        await assert.rejects(db.exec(`update public.profiles set role = 'superadmin' where id = '${USERS.alice}'`), /profiles_role_valid/);
    });

    await t.test('verify_production.sql reports only PASS on the migrated database', async () => {
        // Production has exactly one owner account (ADMIN_EMAIL); the check verifies that.
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.alice}'`);
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        const failures = r.rows.filter((row) => row.result !== 'PASS');
        assert.deepEqual(failures, []);
        assert.ok(r.rows.length > 40, `expected many checks, got ${r.rows.length}`);
    });

    await t.test('deleting the auth user removes all of their data (no orphans)', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.bob}'`);
        const tables = ['profiles', 'expenses', 'ai_chat_history', 'group_members'];
        for (const table of tables) {
            const col = table === 'profiles' ? 'id' : 'user_id';
            const r = await db.query(`select count(*)::int as n from public.${table} where ${col} = '${USERS.bob}'`);
            assert.equal(r.rows[0].n, 0, table);
        }
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_6 Owner Console telemetry', async (t) => {
    const db = await buildDatabase(CURRENT);
    const INSTALL = '55555555-5555-4555-8555-555555555555';

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_6_owner_console.sql'));
    });

    await t.test('clients can neither read nor write telemetry, install, issue or audit tables', async () => {
        for (const role of ['anon', 'authenticated']) {
            for (const table of ['app_events', 'app_installs', 'ops_issue_states', 'admin_audit_log', 'ops_events', 'admin_user_stats']) {
                assert.ok(denied(await as(db, role, USERS.carol, `select * from public.${table}`)), `${role} select ${table}`);
            }
            assert.ok(denied(await as(db, role, USERS.carol, "insert into public.app_events (name, source) values ('login', 'client')")), `${role} insert app_events`);
            assert.ok(denied(await as(db, role, USERS.carol, `insert into public.app_installs (install_id, platform) values ('${INSTALL}', 'android')`)), `${role} insert app_installs`);
            assert.ok(denied(await as(db, role, USERS.carol, "insert into public.ops_issue_states (fingerprint) values ('x|-|-|-')")), `${role} resolve issue`);
            assert.ok(denied(await as(db, role, USERS.carol, "insert into public.admin_audit_log (action) values ('forged')")), `${role} forge audit entry`);
        }
    });

    await t.test('a user still cannot make themselves admin', async () => {
        assert.ok(denied(await asUser(db, USERS.carol, `update public.profiles set role = 'admin' where id = '${USERS.carol}'`)));
    });

    await t.test('the backend (service role) records installs and events', async () => {
        const install = await as(db, 'service_role', null, `insert into public.app_installs (install_id, platform, app_version, user_id) values ('${INSTALL}', 'android', '1.0.0', '${USERS.bob}')`);
        assert.ok(install.ok, install.error);
        const event = await as(db, 'service_role', null, `insert into public.app_events (name, source, user_id, install_id, platform, props) values ('first_launch', 'client', '${USERS.bob}', '${INSTALL}', 'android', '{"method":"email"}')`);
        assert.ok(event.ok, event.error);
    });

    await t.test('event names, sources, platforms and property size are constrained', async () => {
        const bad = [
            "insert into public.app_events (name, source) values ('DROP TABLE', 'client')",
            "insert into public.app_events (name, source) values ('login', 'browser')",
            "insert into public.app_events (name, source, platform) values ('login', 'client', 'windows')",
            "insert into public.app_events (name, source, props) values ('login', 'client', jsonb_build_object('blob', repeat('x', 5000)))",
        ];
        for (const statement of bad) {
            const r = await as(db, 'service_role', null, statement);
            assert.ok(!r.ok && /check constraint/i.test(r.error), `${statement}: ${JSON.stringify(r)}`);
        }
    });

    await t.test('the audit log is append-only, even for the service role', async () => {
        const insert = await as(db, 'service_role', null, "insert into public.admin_audit_log (action, details) values ('admin_login', '{}')");
        assert.ok(insert.ok, insert.error);
        const update = await as(db, 'service_role', null, "update public.admin_audit_log set action = 'tampered'");
        assert.ok(!update.ok && /append-only/.test(update.error), JSON.stringify(update));
        const del = await as(db, 'service_role', null, 'delete from public.admin_audit_log');
        assert.ok(!del.ok && /append-only/.test(del.error), JSON.stringify(del));
    });

    await t.test('admin_user_stats exposes scan and import counts', async () => {
        await db.exec(`insert into public.expenses (user_id, amount, category, description, source) values ('${USERS.bob}', 10, 'Shopping', 'Receipt', 'ai_scan')`);
        const r = await as(db, 'service_role', null, `select receipt_scan_count, pdf_import_count from public.admin_user_stats where id = '${USERS.bob}'`);
        assert.ok(r.ok, r.error);
        assert.equal(r.rows[0].receipt_scan_count, 1);
        assert.equal(r.rows[0].pdf_import_count, 0);
    });

    await t.test('deleting an account anonymises its telemetry instead of keeping the link', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.bob}'`);
        const events = await db.query(`select user_id from public.app_events where install_id = '${INSTALL}'`);
        assert.equal(events.rows.length, 1);
        assert.equal(events.rows[0].user_id, null);
        const installs = await db.query(`select user_id from public.app_installs where install_id = '${INSTALL}'`);
        assert.equal(installs.rows[0].user_id, null);
    });

    await t.test('verify_production.sql reports only PASS with v1_6 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.alice}'`);
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        assert.deepEqual(r.rows.filter((row) => row.result !== 'PASS'), []);
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_7 Money Streak and money checks (app v1.1)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);

    await t.test('the migration is idempotent and keeps existing activities valid', async () => {
        await db.exec(sql('v1_7_money_decisions.sql'));
        await db.exec(`insert into public.streak_activities (user_id, activity, activity_date) values ('${USERS.alice}', 'log_expense', '2026-09-01')`);
        const bad = await svc(`insert into public.streak_activities (user_id, activity, activity_date) values ('${USERS.alice}', 'free_xp', '2026-09-01')`);
        assert.ok(!bad.ok && /check constraint/i.test(bad.error), JSON.stringify(bad));
    });

    await t.test('the backend records streak days, XP and no-spend days', async () => {
        for (const statement of [
            `insert into public.money_streak_days (user_id, day, mission, kept, spent, day_limit) values ('${USERS.alice}', '2026-09-01', 'under_limit', true, 120, 450)`,
            `insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.alice}', 'daily_mission', '2026-09-01', 20)`,
            `insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.bob}', 'expense_logged', '2026-09-01:1', 5)`,
            `insert into public.streak_activities (user_id, activity, activity_date) values ('${USERS.alice}', 'no_spend_day', '2026-09-02')`,
        ]) {
            const r = await svc(statement);
            assert.ok(r.ok, `${statement}: ${r.error}`);
        }
    });

    await t.test('an XP award can never be paid twice, even by the backend', async () => {
        const dup = await svc(`insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.alice}', 'daily_mission', '2026-09-01', 20)`);
        assert.ok(!dup.ok && /money_xp_ledger_once|duplicate key/i.test(dup.error), JSON.stringify(dup));
        const dayTwice = await svc(`insert into public.money_streak_days (user_id, day, mission, kept) values ('${USERS.alice}', '2026-09-01', 'log_today', false)`);
        assert.ok(!dayTwice.ok, 'a locked day cannot be re-inserted');
    });

    await t.test('XP values, reasons and missions are constrained', async () => {
        for (const statement of [
            `insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.alice}', 'daily_mission', 'x1', 100000)`,
            `insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.alice}', 'daily_mission', 'x2', -50)`,
            `insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.alice}', 'admin_gift', 'x3', 10)`,
            `insert into public.money_streak_days (user_id, day, mission, kept) values ('${USERS.alice}', '2026-09-05', 'spend_more', true)`,
        ]) {
            const r = await svc(statement);
            assert.ok(!r.ok && /check constraint/i.test(r.error), `${statement}: ${JSON.stringify(r)}`);
        }
    });

    await t.test('a user reads only their own streak days and XP', async () => {
        const mine = await asUser(db, USERS.alice, 'select user_id from public.money_xp_ledger');
        assert.ok(mine.ok, mine.error);
        assert.ok(mine.rows.length >= 1 && mine.rows.every((r) => r.user_id === USERS.alice));
        const other = await asUser(db, USERS.carol, 'select * from public.money_xp_ledger');
        assert.deepEqual(other.rows, []);
        const days = await asUser(db, USERS.bob, 'select * from public.money_streak_days');
        assert.deepEqual(days.rows, []);
    });

    await t.test('clients cannot write XP, streak days or the server-owned profile columns', async () => {
        for (const role of ['anon', 'authenticated']) {
            assert.ok(denied(await as(db, role, USERS.carol, `insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.carol}', 'daily_mission', 'forged', 100)`)), `${role} insert xp`);
            assert.ok(denied(await as(db, role, USERS.alice, `update public.money_xp_ledger set xp = 100 where user_id = '${USERS.alice}'`)), `${role} update xp`);
            assert.ok(denied(await as(db, role, USERS.alice, `delete from public.money_streak_days where user_id = '${USERS.alice}'`)), `${role} delete days`);
            assert.ok(denied(await as(db, role, USERS.carol, `insert into public.money_streak_days (user_id, day, mission, kept) values ('${USERS.carol}', '2026-09-03', 'log_today', true)`)), `${role} insert day`);
            for (const col of ['money_checks_today = 0', 'money_checks_reset_at = null', "money_streak_started_on = '2020-01-01'"]) {
                assert.ok(denied(await as(db, role, USERS.carol, `update public.profiles set ${col} where id = '${USERS.carol}'`)), `${role} update ${col}`);
            }
        }
        assert.ok(denied(await as(db, 'anon', null, 'select * from public.money_xp_ledger')));
        assert.ok(denied(await as(db, 'anon', null, 'select * from public.money_streak_days')));
    });

    await t.test('deleting the account removes streak days and XP', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        for (const table of ['money_streak_days', 'money_xp_ledger']) {
            const r = await db.query(`select count(*)::int as n from public.${table} where user_id = '${USERS.alice}'`);
            assert.equal(r.rows[0].n, 0, table);
        }
    });

    await t.test('verify_production.sql reports only PASS with v1_7 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        assert.deepEqual(r.rows.filter((row) => row.result !== 'PASS'), []);
    });

    await db.close();
});

test('verify_production.sql flags a database where v1_7 has not been applied', async () => {
    const db = await buildDatabase(CURRENT.filter((f) => !['v1_7_money_decisions.sql', 'v1_8_play_billing.sql', 'v1_9_subscription_audit.sql', 'v1_10_sponsored_challenges.sql', 'v1_11_save_to_earn.sql', 'v1_12_age_awareness.sql', 'v1_14_rewards.sql'].includes(f)));
    await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.alice}'`);
    const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
    const failing = r.rows.filter((row) => row.result !== 'PASS').map((row) => row.check_name);
    assert.ok(failing.includes('RLS enabled: money_xp_ledger'), failing.join('\n'));
    assert.ok(failing.includes('streak_activities accepts no_spend_day'), failing.join('\n'));
    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_8 Google Play purchases (app v1.1)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);
    const HASH = 'a'.repeat(64);

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_8_play_billing.sql'));
    });

    await t.test('the backend records a verified purchase; a token binds to one account', async () => {
        const ok = await svc(`insert into public.play_purchases (token_hash, user_id, purchase_token, product_id, state, expires_at, entitled) values ('${HASH}', '${USERS.alice}', 'purchase-token-123', 'vittova_pro', 'SUBSCRIPTION_STATE_ACTIVE', now() + interval '30 days', true)`);
        assert.ok(ok.ok, ok.error);
        const reuse = await svc(`insert into public.play_purchases (token_hash, user_id, purchase_token, product_id, state) values ('${HASH}', '${USERS.carol}', 'purchase-token-123', 'vittova_pro', 'SUBSCRIPTION_STATE_ACTIVE')`);
        assert.ok(!reuse.ok && /duplicate key|play_purchases_pkey/i.test(reuse.error), JSON.stringify(reuse));
        const badHash = await svc(`insert into public.play_purchases (token_hash, user_id, purchase_token, product_id, state) values ('not-a-hash', '${USERS.carol}', 'purchase-token-456', 'vittova_pro', 'x')`);
        assert.ok(!badHash.ok && /check constraint/i.test(badHash.error));
    });

    await t.test('clients can neither read nor write purchases, nor set pro_source', async () => {
        for (const role of ['anon', 'authenticated']) {
            assert.ok(denied(await as(db, role, USERS.alice, 'select * from public.play_purchases')), `${role} select`);
            assert.ok(denied(await as(db, role, USERS.carol, `insert into public.play_purchases (token_hash, user_id, purchase_token, product_id, state, entitled) values ('${'b'.repeat(64)}', '${USERS.carol}', 'forged-token-000', 'vittova_pro', 'SUBSCRIPTION_STATE_ACTIVE', true)`)), `${role} insert`);
            assert.ok(denied(await as(db, role, USERS.alice, `update public.play_purchases set entitled = true`)), `${role} update`);
            assert.ok(denied(await as(db, role, USERS.carol, `update public.profiles set pro_source = 'manual' where id = '${USERS.carol}'`)), `${role} pro_source`);
        }
        const badSource = await svc(`update public.profiles set pro_source = 'gift' where id = '${USERS.carol}'`);
        assert.ok(!badSource.ok && /profiles_pro_source_valid/.test(badSource.error));
    });

    await t.test('deleting the account removes its purchase records', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        const r = await db.query(`select count(*)::int as n from public.play_purchases where user_id = '${USERS.alice}'`);
        assert.equal(r.rows[0].n, 0);
    });

    await t.test('verify_production.sql reports only PASS with v1_8 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        assert.deepEqual(r.rows.filter((row) => row.result !== 'PASS'), []);
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_9 Subscription audit (app v1.1)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_9_subscription_audit.sql'));
    });

    await t.test('the backend stores decisions and expectations; values are constrained', async () => {
        for (const statement of [
            `insert into public.recurring_decisions (user_id, merchant_key, decision) values ('${USERS.alice}', 'netflix', 'unwanted')`,
            `insert into public.recurring_expectations (user_id, merchant_key, expected_date, expected_amount) values ('${USERS.alice}', 'netflix', '2026-10-05', 649)`,
        ]) {
            const r = await svc(statement);
            assert.ok(r.ok, `${statement}: ${r.error}`);
        }
        for (const statement of [
            `insert into public.recurring_decisions (user_id, merchant_key, decision) values ('${USERS.alice}', 'spotify', 'cancel_now')`,
            `insert into public.recurring_decisions (user_id, merchant_key, decision) values ('${USERS.alice}', 'Bad<Key>', 'confirmed')`,
            `insert into public.recurring_expectations (user_id, merchant_key, expected_date, expected_amount, status) values ('${USERS.alice}', 'x', '2026-10-05', 10, 'charged')`,
            `insert into public.recurring_expectations (user_id, merchant_key, expected_date, expected_amount) values ('${USERS.alice}', 'y', '2026-10-05', -5)`,
        ]) {
            const r = await svc(statement);
            assert.ok(!r.ok && /check constraint/i.test(r.error), `${statement}: ${JSON.stringify(r)}`);
        }
        const dup = await svc(`insert into public.recurring_expectations (user_id, merchant_key, expected_date, expected_amount) values ('${USERS.alice}', 'netflix', '2026-10-05', 649)`);
        assert.ok(!dup.ok, 'one expectation per payment and date');
    });

    await t.test('users read only their own rows and cannot write any', async () => {
        const own = await asUser(db, USERS.alice, 'select merchant_key from public.recurring_decisions');
        assert.deepEqual(own.rows.map((r) => r.merchant_key), ['netflix']);
        assert.deepEqual((await asUser(db, USERS.carol, 'select * from public.recurring_decisions')).rows, []);
        assert.deepEqual((await asUser(db, USERS.carol, 'select * from public.recurring_expectations')).rows, []);
        for (const role of ['anon', 'authenticated']) {
            assert.ok(denied(await as(db, role, USERS.carol, `insert into public.recurring_decisions (user_id, merchant_key, decision) values ('${USERS.carol}', 'netflix', 'confirmed')`)), role);
            assert.ok(denied(await as(db, role, USERS.alice, `update public.recurring_expectations set status = 'matched'`)), role);
        }
        assert.ok(denied(await as(db, 'anon', null, 'select * from public.recurring_decisions')));
    });

    await t.test('deleting the account removes decisions and expectations', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        for (const table of ['recurring_decisions', 'recurring_expectations']) {
            const r = await db.query(`select count(*)::int as n from public.${table} where user_id = '${USERS.alice}'`);
            assert.equal(r.rows[0].n, 0, table);
        }
    });

    await t.test('verify_production.sql reports only PASS with v1_9 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        assert.deepEqual(r.rows.filter((row) => row.result !== 'PASS'), []);
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_10 Sponsored challenges (app v1.1)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);
    const S = '66666666-6666-4666-8666-666666666666';
    const C = '77777777-7777-4777-8777-777777777777';
    const E = '88888888-8888-4888-8888-888888888888';
    const V = '99999999-9999-4999-8999-999999999999';

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_10_sponsored_challenges.sql'));
    });

    await t.test('the backend runs a campaign end to end', async () => {
        for (const statement of [
            `insert into public.sponsors (id, name, website) values ('${S}', 'Example Brand', 'https://brand.example')`,
            `insert into public.campaigns (id, sponsor_id, name, challenge_type, duration_days, reward_label, reward_value_inr, starts_at, ends_at, eligibility, terms, status)
             values ('${C}', '${S}', '7-Day Zero Food-Delivery', 'no_food_delivery', 7, '₹200 voucher', 200, now() - interval '1 day', now() + interval '30 days', 'Pro members', 'One reward per person, while stocks last.', 'scheduled')`,
            `insert into public.campaign_vouchers (id, campaign_id, code) values ('${V}', '${C}', 'BRAND-200-A')`,
            `insert into public.challenge_enrollments (id, campaign_id, user_id, starts_on, ends_on) values ('${E}', '${C}', '${USERS.alice}', '2026-09-08', '2026-09-14')`,
            `update public.challenge_enrollments set status = 'completed' where id = '${E}'`,
            `insert into public.challenge_completions (enrollment_id, campaign_id) values ('${E}', '${C}')`,
            `update public.campaign_vouchers set issued_at = now(), issued_to = '${E}' where id = '${V}'`,
            `insert into public.reward_issuances (enrollment_id, campaign_id, voucher_id) values ('${E}', '${C}', '${V}')`,
            `update public.reward_issuances set revealed_at = now() where enrollment_id = '${E}'`,
            `insert into public.campaign_impressions (campaign_id, kind) values ('${C}', 'view')`,
        ]) {
            const r = await svc(statement);
            assert.ok(r.ok, `${statement}: ${r.error}`);
        }
    });

    await t.test('completions, issuances and issued vouchers cannot be rewritten, even by the backend', async () => {
        const cases = [
            [`update public.challenge_completions set completed_at = now() - interval '9 days'`, /immutable/],
            [`update public.reward_issuances set revealed_at = null`, /revealed once/],
            [`update public.reward_issuances set voucher_id = '${V}', redemption_id = gen_random_uuid()`, /revealed once/],
            [`update public.campaign_vouchers set issued_at = null, issued_to = null where id = '${V}'`, /cannot be reissued/],
            [`update public.campaign_vouchers set code = 'OTHER' where id = '${V}'`, /fixed/],
        ];
        for (const [statement, re] of cases) {
            const r = await svc(statement);
            assert.ok(!r.ok && re.test(r.error), `${statement}: ${JSON.stringify(r)}`);
        }
        const twice = await svc(`insert into public.challenge_enrollments (campaign_id, user_id, starts_on, ends_on) values ('${C}', '${USERS.alice}', '2026-09-20', '2026-09-26')`);
        assert.ok(!twice.ok, 'one enrolment per user and campaign');
        const secondReward = await svc(`insert into public.reward_issuances (enrollment_id, campaign_id, voucher_id) values ('${E}', '${C}', '${V}')`);
        assert.ok(!secondReward.ok, 'one reward per completion');
    });

    await t.test('campaign values are constrained (no paid entry, fixed positive rewards, responsible types)', async () => {
        for (const statement of [
            `insert into public.campaigns (sponsor_id, name, challenge_type, duration_days, reward_label, reward_value_inr, starts_at, ends_at, eligibility, terms) values ('${S}', 'Spin to win', 'lucky_draw', 7, 'Prize', 200, now(), now() + interval '1 day', 'All', 'Terms that are long enough here.')`,
            `insert into public.campaigns (sponsor_id, name, challenge_type, duration_days, reward_label, reward_value_inr, starts_at, ends_at, eligibility, terms) values ('${S}', 'Negative', 'no_impulse', 7, 'Prize', -1, now(), now() + interval '1 day', 'All', 'Terms that are long enough here.')`,
            `insert into public.campaigns (sponsor_id, name, challenge_type, duration_days, reward_label, reward_value_inr, starts_at, ends_at, eligibility, terms) values ('${S}', 'Backwards', 'no_impulse', 7, 'Prize', 10, now(), now() - interval '1 day', 'All', 'Terms that are long enough here.')`,
        ]) {
            const r = await svc(statement);
            assert.ok(!r.ok && /check constraint/i.test(r.error), `${statement}: ${JSON.stringify(r)}`);
        }
    });

    await t.test('no campaign table is readable or writable by clients', async () => {
        for (const role of ['anon', 'authenticated']) {
            for (const table of ['sponsors', 'campaigns', 'campaign_vouchers', 'challenge_enrollments', 'challenge_completions', 'reward_issuances', 'campaign_impressions']) {
                assert.ok(denied(await as(db, role, USERS.alice, `select * from public.${table}`)), `${role} select ${table}`);
            }
            assert.ok(denied(await as(db, role, USERS.carol, `insert into public.challenge_completions (enrollment_id, campaign_id) values ('${E}', '${C}')`)), `${role} forge completion`);
            assert.ok(denied(await as(db, role, USERS.carol, `update public.campaigns set reward_value_inr = 100000`)), `${role} change reward`);
            assert.ok(denied(await as(db, role, USERS.carol, `insert into public.campaign_vouchers (campaign_id, code) values ('${C}', 'FREE')`)), `${role} add inventory`);
        }
    });

    await t.test('deleting the account removes enrolments and rewards but keeps the voucher used', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        for (const table of ['challenge_enrollments', 'challenge_completions', 'reward_issuances']) {
            const r = await db.query(`select count(*)::int as n from public.${table}`);
            assert.equal(r.rows[0].n, 0, table);
        }
        const v = await db.query(`select issued_at, issued_to from public.campaign_vouchers where id = '${V}'`);
        assert.ok(v.rows[0].issued_at);
        assert.equal(v.rows[0].issued_to, null);
    });

    await t.test('verify_production.sql reports only PASS with v1_10 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        assert.deepEqual(r.rows.filter((row) => row.result !== 'PASS'), []);
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('production-like database: partial v1 extension, v1_1 applied, no v1_2', async (t) => {
    // Mirrors the read-only production check of 2026-09-13: ai_chat_history
    // and groups.pool_state missing; expense_source lacks upi_auto/pdf_import.
    const db = await buildDatabase(
        ['schema.sql', 'v1_schema_extension.sql', 'v1_1_launch_hardening.sql', 'v1_2_security_p0.sql', 'v1_3_product_core.sql', 'v1_4_admin_ops.sql', 'v1_6_owner_console.sql', 'v1_7_money_decisions.sql', 'v1_8_play_billing.sql', 'v1_9_subscription_audit.sql', 'v1_10_sponsored_challenges.sql', 'v1_11_save_to_earn.sql', 'v1_12_age_awareness.sql', 'v1_13_notification_expenses.sql', 'v1_14_rewards.sql'],
        { afterEach: { 'v1_schema_extension.sql': 'drop table public.ai_chat_history; alter table public.groups drop column pool_state;' } }
    );

    await t.test('v1_2, v1_3 and v1_4 apply cleanly on the production-like schema', async () => {
        const r = await db.query("select to_regclass('public.ai_chat_history') as a, to_regclass('public.cancelled_subscriptions') as c");
        assert.ok(r.rows[0].a && r.rows[0].c);
    });

    await t.test('verify_production.sql passes afterwards', async () => {
        // Production has exactly one owner account (ADMIN_EMAIL); the check verifies that.
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.alice}'`);
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        assert.deepEqual(r.rows.filter((row) => row.result !== 'PASS'), []);
    });

    await t.test('clients cannot write the new tables', async () => {
        assert.ok(denied(await asUser(db, USERS.carol, `insert into public.cancelled_subscriptions (user_id, normalized_name, merchant, monthly_amount) values ('${USERS.carol}', 'netflix', 'Netflix', 649)`)));
        assert.ok(denied(await asUser(db, USERS.carol, `insert into public.ai_chat_history (user_id, role, content) values ('${USERS.carol}', 'user', 'x')`)));
    });

    await t.test('an outsider cannot read a group invite code', async () => {
        await db.exec(`update public.groups set invite_code = 'SECRET42' where id = '${GROUP}'`);
        const outsider = await asUser(db, USERS.carol, 'select invite_code from public.groups');
        assert.deepEqual(outsider.rows, []);
        const member = await asUser(db, USERS.bob, 'select invite_code from public.groups');
        assert.equal(member.rows[0].invite_code, 'SECRET42');
    });

    await t.test('duplicate cancelled-subscription records are impossible', async () => {
        await db.exec(`insert into public.cancelled_subscriptions (user_id, normalized_name, merchant, monthly_amount) values ('${USERS.alice}', 'netflix', 'Netflix', 649)`);
        await assert.rejects(db.exec(`insert into public.cancelled_subscriptions (user_id, normalized_name, merchant, monthly_amount) values ('${USERS.alice}', 'netflix', 'NETFLIX.COM', 649)`), /duplicate key/);
    });

    await t.test('v1_5 backfills profiles for accounts created without one, and changes nothing else', async () => {
        const legacy = '44444444-4444-4444-4444-444444444444';
        await db.exec(`
            alter table auth.users disable trigger on_auth_user_created;
            insert into auth.users (id, email, raw_user_meta_data) values ('${legacy}', 'legacy@example.com', '{"name":"Legacy Google"}');
            alter table auth.users enable trigger on_auth_user_created;
            update public.profiles set monthly_budget = 4321 where id = '${USERS.alice}';
        `);
        const before = await db.query(`select count(*)::int as n from public.profiles where id = '${legacy}'`);
        assert.equal(before.rows[0].n, 0);

        await db.exec(sql('v1_5_backfill_profiles.sql'));
        await db.exec(sql('v1_5_backfill_profiles.sql')); // idempotent

        const row = await db.query(`select email, full_name, is_pro, role from public.profiles where id = '${legacy}'`);
        assert.deepEqual(row.rows, [{ email: 'legacy@example.com', full_name: 'Legacy Google', is_pro: false, role: 'user' }]);
        const alice = await db.query(`select monthly_budget::int as b from public.profiles where id = '${USERS.alice}'`);
        assert.equal(alice.rows[0].b, 4321);
        const orphans = await db.query('select count(*)::int as n from auth.users u left join public.profiles p on p.id = u.id where p.id is null');
        assert.equal(orphans.rows[0].n, 0);

        // The trigger still creates profiles for new signups.
        const fresh = '55555555-5555-5555-5555-555555555555';
        await db.exec(`insert into auth.users (id, email) values ('${fresh}', 'fresh@example.com')`);
        const freshRow = await db.query(`select count(*)::int as n from public.profiles where id = '${fresh}'`);
        assert.equal(freshRow.rows[0].n, 1);
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('baseline: before the P0 migration the vulnerabilities are reproducible', async (t) => {
    const db = await buildDatabase(BEFORE_P0);

    await t.test('a user could grant themselves Pro', async () => {
        const r = await asUser(db, USERS.carol, `update public.profiles set is_pro = true where id = '${USERS.carol}'`);
        assert.ok(r.ok, r.error);
        const check = await db.query(`select is_pro from public.profiles where id = '${USERS.carol}'`);
        assert.equal(check.rows[0].is_pro, true);
    });

    await t.test('verify_production.sql flags the vulnerable database', async () => {
        const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
        const failed = r.rows.filter((row) => row.result === 'FAIL').map((row) => row.check_name);
        assert.ok(failed.includes('authenticated cannot UPDATE profiles.is_pro'), failed.join('\n'));
        assert.ok(failed.includes('No "users can add themselves" group_members policy'));
    });

    await t.test('the group_members read policy recursed', async () => {
        const r = await asUser(db, USERS.bob, 'select * from public.group_members');
        assert.ok(!r.ok && /infinite recursion/i.test(r.error), JSON.stringify(r));
    });

    await t.test('the self-join insert was masked by that recursion error...', async () => {
        const r = await asUser(db, USERS.carol, `insert into public.group_members (group_id, user_id) values ('${GROUP}', '${USERS.carol}')`);
        assert.ok(!r.ok && /infinite recursion/i.test(r.error), JSON.stringify(r));
    });

    await t.test('...and opens as soon as the recursion is fixed the obvious way', async () => {
        // Simulate a well-meant fix of only the recursion, leaving the
        // "users can add themselves" clause in place.
        await db.exec(`
            drop policy "Members can view group members" on public.group_members;
            create policy "Members can view group members" on public.group_members
                for select using (user_id = auth.uid());
        `);
        const join = await asUser(db, USERS.carol, `insert into public.group_members (group_id, user_id) values ('${GROUP}', '${USERS.carol}')`);
        assert.ok(join.ok, join.error);
        const read = await asUser(db, USERS.carol, 'select description from public.group_expenses');
        assert.deepEqual(read.rows.map((x) => x.description), ['Groceries'], 'outsider can now read the private group expenses');
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Release audit: account deletion reaches every table, found from the schema
// itself rather than a hand-kept list, so a new table cannot be forgotten.
// ═══════════════════════════════════════════════════════════════════════════
test('release audit: every column that points at a user is removed or anonymised with the account', async () => {
    const db = await buildDatabase(CURRENT);
    const fks = await db.query(`
        select c.conrelid::regclass::text as tbl, a.attname as col,
               c.confrelid::regclass::text as ref, c.confdeltype as on_delete
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.contype = 'f'
          and c.connamespace = 'public'::regnamespace
          and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
        order by 1, 2`);
    // a = no action, r = restrict, c = cascade, n = set null, d = set default
    const blocking = fks.rows.filter((r) => r.on_delete === 'a' || r.on_delete === 'r');
    assert.deepEqual(blocking.map((r) => `${r.tbl}.${r.col} -> ${r.ref}`), [],
        'a user-referencing column would block or orphan account deletion');
    assert.ok(fks.rows.length >= 15, `only ${fks.rows.length} user references found`);

    // Every public table with a user_id column has such a foreign key.
    const userIdCols = await db.query(`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'user_id'
          and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')`);
    const covered = new Set(fks.rows.filter((r) => r.col === 'user_id').map((r) => r.tbl.replace(/^public\./, '')));
    const uncovered = userIdCols.rows.map((r) => r.table_name).filter((t) => !covered.has(t));
    assert.deepEqual(uncovered, [], 'user_id without a foreign key to the account');
    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_11 Save-to-Earn (app v1.1)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);
    const challenge = (user, status = 'active') => `insert into public.money_challenges (user_id, template, duration_days, starts_on, ends_on, status) values ('${user}', 'no_food_delivery_7', 7, '2026-09-21', '2026-09-27', '${status}') returning id`;

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_11_save_to_earn.sql'));
        // v1_11 redefines the XP reasons; a later migration widens them again.
        // Re-running one migration means re-running every later one, in order.
        for (const later of CURRENT.slice(CURRENT.indexOf('v1_11_save_to_earn.sql') + 1)) await db.exec(sql(later));
    });

    await t.test('one active challenge per user; values are constrained', async () => {
        assert.ok((await svc(challenge(USERS.alice))).ok);
        assert.ok(!(await svc(challenge(USERS.alice))).ok, 'a second active challenge is refused');
        assert.ok((await svc(challenge(USERS.alice, 'skipped'))).ok, 'finished ones are fine');
        for (const bad of [
            `insert into public.money_challenges (user_id, template, duration_days, starts_on, ends_on) values ('${USERS.bob}', 'spend_more_7', 7, '2026-09-21', '2026-09-27')`,
            `insert into public.money_challenges (user_id, template, duration_days, starts_on, ends_on, status, impact_inr) values ('${USERS.bob}', 'log_daily_7', 7, '2026-09-21', '2026-09-27', 'completed', -5)`,
            `insert into public.money_challenges (user_id, template, duration_days, starts_on, ends_on, status, impact_inr) values ('${USERS.bob}', 'log_daily_7', 7, '2026-09-21', '2026-09-27', 'skipped', 300)`,
            `insert into public.user_badges (user_id, badge) values ('${USERS.bob}', 'opened_app_10_times')`,
            `insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.bob}', 'challenge_completed', 'x', 500)`,
        ]) {
            const r = await svc(bad);
            assert.ok(!r.ok && /check constraint/i.test(r.error), `${bad}: ${JSON.stringify(r)}`);
        }
        assert.ok((await svc(`insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.bob}', 'challenge_completed', 'c1', 75)`)).ok);
        assert.ok(!(await svc(`insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.bob}', 'challenge_completed', 'c1', 75)`)).ok, 'XP for a challenge is paid once');
        assert.ok((await svc(`insert into public.user_badges (user_id, badge) values ('${USERS.bob}', 'first_challenge')`)).ok);
        assert.ok(!(await svc(`insert into public.user_badges (user_id, badge) values ('${USERS.bob}', 'first_challenge')`)).ok, 'a badge is earned once');
    });

    await t.test('a finished challenge is final, even for the backend', async () => {
        const ins = await svc(challenge(USERS.carol));
        const id = ins.rows[0].id;
        assert.ok((await svc(`update public.money_challenges set status = 'completed', impact_inr = 400, judged_at = now() where id = '${id}'`)).ok);
        for (const change of ['impact_inr = 99999', "status = 'active'", "status = 'not_completed'"]) {
            const r = await svc(`update public.money_challenges set ${change} where id = '${id}'`);
            assert.ok(!r.ok && /cannot be changed/.test(r.error), change);
        }
        const another = await svc(challenge(USERS.carol));
        const r = await svc(`update public.money_challenges set starts_on = '2026-01-01' where id = '${another.rows[0].id}'`);
        assert.ok(!r.ok && /fixed once started/.test(r.error));
    });

    await t.test('users read only their own challenges, badges and memberships, and write none', async () => {
        const own = await asUser(db, USERS.alice, 'select user_id from public.money_challenges');
        assert.ok(own.rows.length >= 1 && own.rows.every((r) => r.user_id === USERS.alice));
        assert.deepEqual((await asUser(db, USERS.alice, 'select * from public.user_badges')).rows, []);
        for (const role of ['anon', 'authenticated']) {
            assert.ok(denied(await as(db, role, USERS.alice, challenge(USERS.alice, 'skipped'))), role);
            assert.ok(denied(await as(db, role, USERS.alice, 'update public.money_challenges set impact_inr = 5000')), role);
            assert.ok(denied(await as(db, role, USERS.alice, `insert into public.user_badges (user_id, badge) values ('${USERS.alice}', 'habit_30')`)), role);
            assert.ok(denied(await as(db, role, USERS.alice, `insert into public.campaign_members (user_id, sponsor_id, role) values ('${USERS.alice}', gen_random_uuid(), 'campaign_manager')`)), role);
        }
        assert.ok(denied(await as(db, 'anon', null, 'select * from public.money_challenges')));
    });

    await t.test('deleting the account removes challenges, badges and memberships', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        for (const table of ['money_challenges', 'user_badges', 'campaign_members']) {
            const r = await db.query(`select count(*)::int as n from public.${table} where user_id = '${USERS.alice}'`);
            assert.equal(r.rows[0].n, 0, table);
        }
    });

    await t.test('verify_production.sql reports only PASS with v1_11 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const res = await db.query(sql('tests/verify_production.sql'));
        assert.deepEqual(res.rows.filter((r) => r.result !== 'PASS'), []);
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_12 age-aware accounts (app v1.1)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_12_age_awareness.sql'));
    });

    await t.test('month and year only, and only the backend can set it', async () => {
        assert.ok((await svc(`update public.profiles set birth_year_month = '2007-04' where id = '${USERS.alice}'`)).ok);
        for (const bad of ['2007-04-12', '2007-4', '1800-01', '2007-13']) {
            const r = await svc(`update public.profiles set birth_year_month = '${bad}' where id = '${USERS.bob}'`);
            assert.ok(!r.ok && /check constraint/i.test(r.error), bad);
        }
        assert.ok(denied(await asUser(db, USERS.carol, `update public.profiles set birth_year_month = '1990-01' where id = '${USERS.carol}'`)), 'client cannot set its own age');
    });

    await t.test('guardian consent: backend writes, user reads own, verified needs a method', async () => {
        assert.ok((await svc(`insert into public.guardian_consents (user_id) values ('${USERS.alice}')`)).ok);
        const bad = await svc(`update public.guardian_consents set status = 'verified' where user_id = '${USERS.alice}'`);
        assert.ok(!bad.ok && /check constraint/i.test(bad.error), 'verified without method/time is refused');
        assert.ok((await svc(`update public.guardian_consents set status = 'verified', method = 'support_verified', decided_at = now() where user_id = '${USERS.alice}'`)).ok);
        assert.equal((await asUser(db, USERS.alice, 'select status from public.guardian_consents')).rows[0].status, 'verified');
        assert.deepEqual((await asUser(db, USERS.bob, 'select * from public.guardian_consents')).rows, []);
        assert.ok(denied(await asUser(db, USERS.bob, `insert into public.guardian_consents (user_id, status, method, decided_at) values ('${USERS.bob}', 'verified', 'support_verified', now())`)));
        assert.ok(denied(await as(db, 'anon', null, 'select * from public.guardian_consents')));
    });

    await t.test('deleting the account removes the consent record', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        assert.equal((await db.query(`select count(*)::int as n from public.guardian_consents where user_id = '${USERS.alice}'`)).rows[0].n, 0);
    });

    await t.test('verify_production.sql reports only PASS with v1_12 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const res = await db.query(sql('tests/verify_production.sql'));
        assert.deepEqual(res.rows.filter((r) => r.result !== 'PASS'), []);
    });

    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_13 idempotent automatic expenses (app v1.1)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);
    const REF = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const insert = (userId, ref) => svc(`insert into public.expenses (user_id, amount, description, source, client_ref) values ('${userId}', 150, 'Chai Point', 'upi_auto', ${ref === null ? 'null' : `'${ref}'`})`);

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_13_notification_expenses.sql'));
    });

    await t.test('one detected payment is stored once per account', async () => {
        assert.ok((await insert(USERS.alice, REF)).ok);
        const again = await insert(USERS.alice, REF);
        assert.ok(!again.ok && /duplicate key|unique/i.test(again.error), 'the same detection twice is refused');
        assert.ok((await insert(USERS.bob, REF)).ok, 'another account is unaffected');
        // Ordinary expenses have no reference and are never constrained by it.
        assert.ok((await insert(USERS.alice, null)).ok);
        assert.ok((await insert(USERS.alice, null)).ok);
    });

    await t.test('only the device format is accepted', async () => {
        for (const bad of ['short', 'A1B2C3D4E5F60718293A4B5C6D7E8F90', `${REF}0`]) {
            const r = await insert(USERS.carol, bad);
            assert.ok(!r.ok && /check constraint/i.test(r.error), bad);
        }
    });

    await t.test('clients still cannot write expenses directly', async () => {
        assert.ok(denied(await asUser(db, USERS.carol, `insert into public.expenses (user_id, amount, source, client_ref) values ('${USERS.carol}', 10, 'upi_auto', '${'c'.repeat(32)}')`)));
        assert.ok(denied(await asUser(db, USERS.alice, `update public.expenses set client_ref = '${'d'.repeat(32)}' where user_id = '${USERS.alice}'`)));
        assert.ok(denied(await as(db, 'anon', null, `insert into public.expenses (user_id, amount) values ('${USERS.carol}', 10)`)));
        // Users read only their own detected payments.
        const bobs = await asUser(db, USERS.bob, 'select user_id, client_ref from public.expenses');
        assert.ok(bobs.ok);
        assert.ok(bobs.rows.every((r) => r.user_id === USERS.bob));
    });

    await t.test('deleting the account removes its detected payments', async () => {
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        assert.equal((await db.query(`select count(*)::int as n from public.expenses where user_id = '${USERS.alice}'`)).rows[0].n, 0);
    });

    await t.test('verify_production.sql reports only PASS with v1_13 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const res = await db.query(sql('tests/verify_production.sql'));
        assert.deepEqual(res.rows.filter((r) => r.result !== 'PASS'), []);
    });

    await db.close();
});

test('verify_production.sql flags a database where v1_13 has not been applied', async () => {
    const db = await buildDatabase(CURRENT.filter((f) => f !== 'v1_13_notification_expenses.sql'));
    await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.alice}'`);
    const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
    const failing = r.rows.filter((row) => row.result !== 'PASS').map((row) => row.check_name);
    assert.deepEqual(failing.sort(), ['expenses.client_ref exists (detected-payment id)', 'expenses: unique (user_id, client_ref)'].sort());
    await db.close();
});

// ═══════════════════════════════════════════════════════════════════════════
test('v1_16 and v1_17: budgets, income, Money-Saved and receipts are private and server-written', async () => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);
    assert.ok((await svc(`insert into public.category_budgets (user_id, category, limit_inr) values ('${USERS.alice}', 'Food', 500)`)).ok);
    assert.ok((await svc(`insert into public.income_entries (user_id, amount_inr, received_on) values ('${USERS.alice}', 500, '2026-01-01')`)).ok);
    assert.ok((await svc(`insert into public.savings_events (user_id, kind, amount) values ('${USERS.alice}', 'price_difference', 5)`)).ok);
    assert.ok((await svc(`insert into public.planned_purchases (user_id, amount, decision) values ('${USERS.alice}', 5, 'skipped')`)).ok);
    for (const table of ['category_budgets', 'income_entries', 'savings_events', 'planned_purchases']) {
        assert.equal((await asUser(db, USERS.alice, `select * from public.${table}`)).rows.length, 1, table);
        assert.equal((await asUser(db, USERS.bob, `select * from public.${table}`)).rows.length, 0, table);
        assert.ok(denied(await as(db, 'anon', null, `select * from public.${table}`)), `anon ${table}`);
        assert.ok(denied(await asUser(db, USERS.alice, `delete from public.${table}`)), `delete ${table}`);
    }
    assert.ok(denied(await asUser(db, USERS.alice, `insert into public.income_entries (user_id, amount_inr, received_on) values ('${USERS.alice}', 1, '2026-01-01')`)));
    const made = await svc(`insert into public.group_expenses (group_id, description, amount, paid_by) values ('${GROUP}', 'Dinner', 100, '${USERS.alice}') returning id`);
    assert.ok(made.ok);
    assert.ok((await svc(`insert into public.group_expense_receipts (group_expense_id, group_id, created_by, client_ref, total, allocation) values ('${made.rows[0].id}', '${GROUP}', '${USERS.alice}', 'ref-12345', 100, '{}')`)).ok);
    assert.equal((await asUser(db, USERS.alice, 'select * from public.group_expense_receipts')).rows.length, 1);
    assert.equal((await asUser(db, USERS.carol, 'select * from public.group_expense_receipts')).rows.length, 0);
    await db.close();
});

test('v1_14 rewards: missions, Points, savings goals (app v1.2)', async (t) => {
    const db = await buildDatabase(CURRENT);
    const svc = (statement) => as(db, 'service_role', null, statement);
    const TODAY = "(now() at time zone 'Asia/Kolkata')::date";
    const points = (user, reason, ref, pts) => svc(`insert into public.money_points_ledger (user_id, reason, ref_key, points) values ('${user}', '${reason}', '${ref}', ${pts})`);
    const balance = async (user) => (await db.query(`select coalesce(sum(points), 0)::int as n from public.money_points_ledger where user_id = '${user}'`)).rows[0].n;
    const goal = (user) => svc(`insert into public.savings_goals (user_id, name, target_inr, target_date) values ('${user}', 'Laptop', 60000, '2027-03-01') returning id`);

    await t.test('the migration is idempotent', async () => {
        await db.exec(sql('v1_14_rewards.sql'));
    });

    await t.test('existing users keep their data and get the automatic difficulty', async () => {
        const r = await db.query(`select mission_difficulty from public.profiles where id = '${USERS.alice}'`);
        assert.equal(r.rows[0].mission_difficulty, 'auto');
        assert.ok((await svc(`update public.profiles set mission_difficulty = 'advanced' where id = '${USERS.bob}'`)).ok);
        const bad = await svc(`update public.profiles set mission_difficulty = 'impossible' where id = '${USERS.bob}'`);
        assert.ok(!bad.ok && /check constraint/i.test(bad.error));
    });

    await t.test('one mission per user and day; only today\'s can be replaced, and never backwards', async () => {
        const assign = (user, day, mission = 'under_limit') => svc(`insert into public.money_daily_missions (user_id, day, mission, difficulty, reason, source) values ('${user}', ${day}, '${mission}', 'balanced', 'Your usual daily spend', 'personalised')`);
        assert.ok((await assign(USERS.alice, TODAY)).ok);
        assert.ok(!(await assign(USERS.alice, TODAY)).ok, 'a second mission for the same day is refused');
        assert.ok((await assign(USERS.alice, `${TODAY} - 1`, 'log_today')).ok);

        const replace = await svc(`update public.money_daily_missions set mission = 'delivery_cap', source = 'replacement', replacements = 1, previous = array['under_limit'] where user_id = '${USERS.alice}' and day = ${TODAY}`);
        assert.ok(replace.ok, JSON.stringify(replace));
        const back = await svc(`update public.money_daily_missions set replacements = 0 where user_id = '${USERS.alice}' and day = ${TODAY}`);
        assert.ok(!back.ok && /cannot go down/.test(back.error));
        const third = await svc(`update public.money_daily_missions set replacements = 3 where user_id = '${USERS.alice}' and day = ${TODAY}`);
        assert.ok(!third.ok && /check constraint/i.test(third.error), 'at most two replacements a day');
        const past = await svc(`update public.money_daily_missions set mission = 'no_spend' where user_id = '${USERS.alice}' and day = ${TODAY} - 1`);
        assert.ok(!past.ok && /only today/.test(past.error), 'a finished day\'s mission is fixed');
        const moved = await svc(`update public.money_daily_missions set day = ${TODAY} + 1 where user_id = '${USERS.alice}' and day = ${TODAY}`);
        assert.ok(!moved.ok && /cannot move/.test(moved.error));
        for (const bad of [
            `insert into public.money_daily_missions (user_id, day, mission, difficulty, reason, source) values ('${USERS.bob}', ${TODAY}, 'buy_something', 'easy', 'x', 'personalised')`,
            `insert into public.money_daily_missions (user_id, day, mission, difficulty, reason, source) values ('${USERS.bob}', ${TODAY}, 'log_today', 'extreme', 'x', 'personalised')`,
            `insert into public.money_daily_missions (user_id, day, mission, difficulty, reason, source) values ('${USERS.bob}', ${TODAY}, 'log_today', 'easy', '', 'personalised')`,
        ]) {
            const r = await svc(bad);
            assert.ok(!r.ok && /check constraint/i.test(r.error), bad);
        }
    });

    await t.test('a check-in is stored once, by day and by event id', async () => {
        const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const checkin = (mission, eventId, day = TODAY) => svc(`insert into public.money_mission_checkins (user_id, day, mission, event_id) values ('${USERS.bob}', ${day}, '${mission}', '${eventId}')`);
        assert.ok((await checkin('bill_ready', E1)).ok);
        assert.ok(!(await checkin('bill_ready', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).ok, 'same mission, same day');
        assert.ok(!(await checkin('review_recurring', E1)).ok, 'same event replayed');
        const bad = await checkin('under_limit', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
        assert.ok(!bad.ok && /check constraint/i.test(bad.error), 'verified missions cannot be checked in');
    });

    await t.test('Points: paid once, signed by reason, append-only, never below zero', async () => {
        assert.ok((await points(USERS.bob, 'daily_mission', '2026-10-15', 8)).ok);
        const twice = await points(USERS.bob, 'daily_mission', '2026-10-15', 8);
        assert.ok(!twice.ok && /duplicate key|unique/i.test(twice.error), 'the same award twice is refused');
        assert.ok((await points(USERS.bob, 'goal_milestone', 'g1:25', 5)).ok);
        assert.equal(await balance(USERS.bob), 13);

        for (const [reason, pts] of [['daily_mission', -8], ['reversal', 5], ['redemption', 10], ['daily_mission', 5000], ['adjustment', 0], ['spin_the_wheel', 5]]) {
            const r = await points(USERS.bob, reason, `bad-${reason}-${pts}`, pts);
            assert.ok(!r.ok && /check constraint/i.test(r.error), `${reason} ${pts}: ${JSON.stringify(r)}`);
        }
        const overdraw = await points(USERS.bob, 'redemption', 'r1', -14);
        assert.ok(!overdraw.ok && /not enough points/.test(overdraw.error));
        assert.ok((await points(USERS.bob, 'reversal', 'daily_mission:2026-10-15', -8)).ok, 'a reversal is its own row');
        assert.equal(await balance(USERS.bob), 5);

        const edit = await svc(`update public.money_points_ledger set points = 1000 where user_id = '${USERS.bob}'`);
        assert.ok(!edit.ok && /cannot be changed/.test(edit.error), 'even the backend cannot rewrite history');
        const remove = await svc(`delete from public.money_points_ledger where user_id = '${USERS.bob}'`);
        assert.ok(!remove.ok && /cannot be changed/.test(remove.error));
        assert.equal(await balance(USERS.bob), 5);
    });

    await t.test('a second debit sees the first and cannot overdraw', async () => {
        assert.ok((await points(USERS.carol, 'weekly_goal', '2026-W41', 15)).ok);
        // PGlite is a single connection, so two debits are run in one transaction:
        // the second sees the first and is refused.
        await db.exec('begin');
        await db.exec(`insert into public.money_points_ledger (user_id, reason, ref_key, points) values ('${USERS.carol}', 'redemption', 'r-a', -10)`);
        await assert.rejects(db.exec(`insert into public.money_points_ledger (user_id, reason, ref_key, points) values ('${USERS.carol}', 'redemption', 'r-b', -10)`), /not enough points/);
        await db.exec('rollback');
        assert.equal(await balance(USERS.carol), 15);
    });

    await t.test('savings goals and contributions: constrained, owned, once per client reference', async () => {
        const g = (await goal(USERS.alice)).rows[0].id;
        const REF = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        const add = (user, goalId, amount, ref) => svc(`insert into public.savings_contributions (goal_id, user_id, amount_inr, contributed_on, client_ref) values ('${goalId}', '${user}', ${amount}, ${TODAY}, '${ref}')`);
        assert.ok((await add(USERS.alice, g, 2000, REF)).ok);
        const again = await add(USERS.alice, g, 2000, REF);
        assert.ok(!again.ok && /duplicate key|unique/i.test(again.error), 'a retried contribution is stored once');
        const stolen = await add(USERS.bob, g, 500, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        assert.ok(!stolen.ok && /goal's owner/.test(stolen.error), 'nobody adds to someone else\'s goal');
        for (const bad of [
            `insert into public.savings_goals (user_id, name, target_inr, target_date) values ('${USERS.alice}', '   ', 5000, '2027-01-01')`,
            `insert into public.savings_goals (user_id, name, target_inr, target_date) values ('${USERS.alice}', 'Tiny', 10, '2027-01-01')`,
            `insert into public.savings_goals (user_id, name, target_inr, target_date, status) values ('${USERS.alice}', 'Trip', 5000, '2027-01-01', 'deleted')`,
            `insert into public.savings_contributions (goal_id, user_id, amount_inr, contributed_on, client_ref) values ('${g}', '${USERS.alice}', 0, ${TODAY}, gen_random_uuid())`,
            `insert into public.savings_contributions (goal_id, user_id, amount_inr, contributed_on, client_ref, source) values ('${g}', '${USERS.alice}', 100, ${TODAY}, gen_random_uuid(), 'bank_verified')`,
        ]) {
            const r = await svc(bad);
            assert.ok(!r.ok && /check constraint/i.test(r.error), bad);
        }
    });

    await t.test('older tables accept the new values; existing rows still pass', async () => {
        assert.ok((await svc(`insert into public.money_streak_days (user_id, day, mission, kept) values ('${USERS.carol}', '2026-10-01', 'delivery_cap', true)`)).ok);
        assert.ok((await svc(`insert into public.money_streak_days (user_id, day, mission, kept) values ('${USERS.carol}', '2026-10-02', 'under_limit', true)`)).ok);
        assert.ok((await svc(`insert into public.money_xp_ledger (user_id, reason, ref_key, xp) values ('${USERS.carol}', 'goal_milestone', 'g:50', 10)`)).ok);
        assert.ok((await svc(`insert into public.user_badges (user_id, badge) values ('${USERS.carol}', 'level_6')`)).ok);
        const bad = await svc(`insert into public.user_badges (user_id, badge) values ('${USERS.carol}', 'level_99')`);
        assert.ok(!bad.ok && /check constraint/i.test(bad.error));
    });

    await t.test('users read only their own rows and write none', async () => {
        const tables = ['money_daily_missions', 'money_mission_checkins', 'money_points_ledger', 'savings_goals', 'savings_contributions'];
        for (const table of tables) {
            const r = await asUser(db, USERS.alice, `select user_id from public.${table}`);
            assert.ok(r.ok, table);
            assert.ok(r.rows.every((row) => row.user_id === USERS.alice), table);
            assert.ok(denied(await as(db, 'anon', null, `select * from public.${table}`)), `anon ${table}`);
            for (const role of ['anon', 'authenticated']) {
                assert.ok(denied(await as(db, role, USERS.alice, `delete from public.${table}`)), `${role} delete ${table}`);
                assert.ok(denied(await as(db, role, USERS.alice, `update public.${table} set user_id = user_id`)), `${role} update ${table}`);
            }
        }
        assert.equal((await asUser(db, USERS.bob, 'select * from public.savings_goals')).rows.length, 0, 'Bob cannot see Alice\'s goal');
        for (const role of ['anon', 'authenticated']) {
            assert.ok(denied(await as(db, role, USERS.alice, `insert into public.money_points_ledger (user_id, reason, ref_key, points) values ('${USERS.alice}', 'adjustment', 'gift', 1000)`)), role);
            assert.ok(denied(await as(db, role, USERS.alice, `insert into public.savings_goals (user_id, name, target_inr, target_date) values ('${USERS.alice}', 'x', 500, '2027-01-01')`)), role);
            assert.ok(denied(await as(db, role, USERS.alice, `insert into public.money_daily_missions (user_id, day, mission, difficulty, reason, source) values ('${USERS.alice}', ${TODAY} + 1, 'log_today', 'easy', 'x', 'personalised')`)), role);
        }
        assert.ok(denied(await asUser(db, USERS.alice, `update public.profiles set mission_difficulty = 'advanced' where id = '${USERS.alice}'`)), 'difficulty is set through the backend');
    });

    await t.test('deleting the account removes missions, check-ins, Points, goals and contributions', async () => {
        assert.ok((await points(USERS.alice, 'daily_mission', 'del-test', 5)).ok);
        await db.exec(`delete from auth.users where id = '${USERS.alice}'`);
        for (const table of ['money_daily_missions', 'money_mission_checkins', 'money_points_ledger', 'savings_goals', 'savings_contributions']) {
            const r = await db.query(`select count(*)::int as n from public.${table} where user_id = '${USERS.alice}'`);
            assert.equal(r.rows[0].n, 0, table);
        }
    });

    await t.test('verify_production.sql reports only PASS with v1_14 applied', async () => {
        await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.bob}'`);
        const res = await db.query(sql('tests/verify_production.sql'));
        assert.deepEqual(res.rows.filter((r) => r.result !== 'PASS'), []);
    });

    await t.test('the rollback removes v1.14, keeps older rows, and v1.14 applies again', async () => {
        await db.exec(sql('v1_14_rewards_rollback.sql'));
        await db.exec(sql('v1_14_rewards_rollback.sql')); // idempotent
        assert.equal((await db.query("select to_regclass('public.money_points_ledger') as t")).rows[0].t, null);
        const kept = await db.query(`select mission from public.money_streak_days where user_id = '${USERS.carol}' order by day`);
        assert.deepEqual(kept.rows.map((r) => r.mission), ['delivery_cap', 'under_limit'], 'locked days survive the rollback');
        const refused = await svc(`insert into public.money_streak_days (user_id, day, mission, kept) values ('${USERS.carol}', '2026-10-03', 'goal_step', true)`);
        assert.ok(!refused.ok && /check constraint/i.test(refused.error), 'the old rules apply to new writes');

        await db.exec(sql('v1_14_rewards.sql'));
        const res = await db.query(sql('tests/verify_production.sql'));
        assert.deepEqual(res.rows.filter((r) => r.result !== 'PASS'), []);
    });

    await db.close();
});

test('verify_production.sql flags a database where v1_14 has not been applied', async () => {
    const db = await buildDatabase(CURRENT.filter((f) => f !== 'v1_14_rewards.sql'));
    await db.exec(`update public.profiles set role = 'admin' where id = '${USERS.alice}'`);
    const r = await db.query(readFileSync(join(here, 'verify_production.sql'), 'utf8'));
    const failing = r.rows.filter((row) => row.result !== 'PASS');
    assert.equal(failing.length, 25, failing.map((row) => row.check_name).join('\n'));
    assert.ok(failing.every((row) => /v1_14_rewards\.sql/.test(row.detail)), 'every failure points at v1_14');
    await db.close();
});
