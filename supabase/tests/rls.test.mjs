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

async function buildDatabase(migrations) {
    const db = new PGlite({ extensions: { moddatetime } });
    await db.exec(SUPABASE_SHIM);
    for (const file of migrations) {
        try {
            await db.exec(sql(file));
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
