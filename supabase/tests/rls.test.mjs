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
    const db = await buildDatabase(CURRENT.filter((f) => !['v1_7_money_decisions.sql', 'v1_8_play_billing.sql', 'v1_9_subscription_audit.sql', 'v1_10_sponsored_challenges.sql'].includes(f)));
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
        ['schema.sql', 'v1_schema_extension.sql', 'v1_1_launch_hardening.sql', 'v1_2_security_p0.sql', 'v1_3_product_core.sql', 'v1_4_admin_ops.sql', 'v1_6_owner_console.sql', 'v1_7_money_decisions.sql', 'v1_8_play_billing.sql', 'v1_9_subscription_audit.sql', 'v1_10_sponsored_challenges.sql'],
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
