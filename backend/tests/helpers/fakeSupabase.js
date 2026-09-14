/**
 * An in-memory stand-in for the subset of @supabase/supabase-js the backend
 * uses, so route tests exercise the real Express app without a database.
 *
 * It behaves like the service-role client: no RLS. That is deliberate — the
 * backend bypasses RLS in production too, so these tests prove the *route code*
 * enforces ownership. Database-level policies are tested separately in
 * supabase/tests/.
 *
 * Supported: select (with simple embeds), insert, update, delete, upsert,
 * eq/neq/gt/gte/lt/lte/in/is/ilike, order, range, limit, single, maybeSingle,
 * count: 'exact', auth.getUser, auth.admin.deleteUser/updateUserById.
 */

const crypto = require('node:crypto');

const UNIQUE_KEYS = {
    streak_activities: ['user_id', 'activity', 'activity_date'],
    paisa_scores: ['user_id', 'week_start'],
    group_members: ['group_id', 'user_id'],
};

// Rows that belong to a user and cascade when the auth user is deleted.
const CASCADE = [
    ['expenses', 'user_id'], ['recurring_bills', 'user_id'], ['streak_activities', 'user_id'],
    ['paisa_scores', 'user_id'], ['pdf_imports', 'user_id'], ['ai_chat_history', 'user_id'],
    ['group_members', 'user_id'], ['groups', 'created_by'], ['profiles', 'id'],
];

function ilikeTest(c, pattern) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i');
    return (r) => re.test(String(r[c] ?? ''));
}

/** Mirror of the public.admin_user_stats view (supabase/v1_4_admin_ops.sql). */
function adminUserStats(tables) {
    const of = (table, userId, extra = () => true) => (tables[table] || []).filter((r) => r.user_id === userId && extra(r));
    const latest = (...lists) => lists.flat().map((r) => r.created_at).filter(Boolean).sort().pop() || null;
    return (tables.profiles || []).map((p) => {
        const expenses = of('expenses', p.id);
        const questions = of('ai_chat_history', p.id, (r) => r.role === 'user');
        return {
            id: p.id, email: p.email, full_name: p.full_name, role: p.role, is_banned: p.is_banned,
            is_pro: p.is_pro, pro_expires_at: p.pro_expires_at, created_at: p.created_at, last_active_at: p.last_active_at ?? null,
            expense_count: expenses.length,
            goal_count: Number(p.investment_target) > 0 ? 1 : 0,
            subscription_count: of('recurring_bills', p.id).length + of('cancelled_subscriptions', p.id).length,
            ai_question_count: questions.length,
            group_count: of('group_members', p.id).length,
            last_activity_at: latest(expenses, questions, of('pdf_imports', p.id)),
        };
    });
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function same(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    return String(a) === String(b);
}

function compare(a, b) {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== '' && b !== '') return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** Split a PostgREST select string on top-level commas. */
function splitTopLevel(s) {
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            parts.push(cur.trim());
            cur = '';
        } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
}

class Query {
    constructor(db, table) {
        this.db = db;
        this.table = table;
        this.op = 'select';
        this.filters = [];
        this.columns = '*';
        this.returning = false;
        this.countMode = null;
        this.orders = [];
        this.rangeFrom = null;
        this.rangeTo = null;
        this.limitN = null;
        this.mode = 'many';
    }

    select(columns = '*', options) {
        this.columns = columns;
        if (options?.count) this.countMode = options.count;
        if (options?.head) this.head = true;
        if (this.op !== 'select') this.returning = true;
        return this;
    }
    insert(values) { this.op = 'insert'; this.values = values; return this; }
    update(values) { this.op = 'update'; this.values = values; return this; }
    delete() { this.op = 'delete'; return this; }
    upsert(values, options = {}) { this.op = 'upsert'; this.values = values; this.onConflict = options.onConflict; return this; }

    eq(c, v) { this.filters.push((r) => same(r[c], v)); return this; }
    neq(c, v) { this.filters.push((r) => !same(r[c], v)); return this; }
    gt(c, v) { this.filters.push((r) => r[c] != null && compare(r[c], v) > 0); return this; }
    gte(c, v) { this.filters.push((r) => r[c] != null && compare(r[c], v) >= 0); return this; }
    lt(c, v) { this.filters.push((r) => r[c] != null && compare(r[c], v) < 0); return this; }
    lte(c, v) { this.filters.push((r) => r[c] != null && compare(r[c], v) <= 0); return this; }
    in(c, vs) { this.filters.push((r) => vs.some((v) => same(r[c], v))); return this; }
    is(c, v) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
    ilike(c, pattern) {
        this.filters.push(ilikeTest(c, pattern));
        return this;
    }
    /** PostgREST `or`: comma-separated `col.op.value` terms (ilike, is, lt, gt, eq). */
    or(expr) {
        const tests = expr.split(',').map((term) => {
            const [c, op, ...rest] = term.split('.');
            const v = rest.join('.');
            if (op === 'ilike') return ilikeTest(c, v);
            if (op === 'is') return (r) => (v === 'null' ? r[c] === null || r[c] === undefined : String(r[c]) === v);
            if (op === 'lt') return (r) => r[c] != null && compare(r[c], v) < 0;
            if (op === 'gt') return (r) => r[c] != null && compare(r[c], v) > 0;
            if (op === 'eq') return (r) => same(r[c], v);
            throw new Error(`fake or(): unsupported op ${op}`);
        });
        this.filters.push((r) => tests.some((f) => f(r)));
        return this;
    }
    // Postgres default: NULLS LAST ascending, NULLS FIRST descending.
    order(c, { ascending = true, nullsFirst = !ascending } = {}) { this.orders.push({ c, ascending, nullsFirst }); return this; }
    range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
    limit(n) { this.limitN = n; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }

    then(resolve, reject) {
        return Promise.resolve().then(() => this.execute()).then(resolve, reject);
    }

    rows() {
        if (this.table === 'admin_user_stats') return adminUserStats(this.db.tables);
        if (!this.db.tables[this.table]) this.db.tables[this.table] = [];
        return this.db.tables[this.table];
    }

    project(row) {
        if (this.columns === '*' || !this.columns) return clone(row);
        const out = {};
        for (const part of splitTopLevel(this.columns.replace(/\s+/g, ' '))) {
            const embed = /^(?:(\w+):)?(\w+)(?:!(\w+))?\s*\((.*)\)$/s.exec(part);
            if (embed) {
                const [, alias, target, hint, inner] = embed;
                out[alias || target] = this.db.embed(this.table, row, target, hint, inner);
            } else if (part === '*') {
                Object.assign(out, clone(row));
            } else {
                out[part] = clone(row[part]);
            }
        }
        return out;
    }

    finish(rows, count) {
        if (this.mode === 'single') {
            if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'expected one row' }, count };
            return { data: rows[0], error: null, count };
        }
        if (this.mode === 'maybe') {
            if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'more than one row' }, count };
            return { data: rows[0] || null, error: null, count };
        }
        return { data: rows, error: null, count };
    }

    execute() {
        const failure = this.db.failures.find((f) => f.table === this.table && (!f.op || f.op === this.op));
        if (failure) return { data: null, error: { message: 'simulated failure' } };

        const table = this.rows();
        const matches = () => table.filter((r) => this.filters.every((f) => f(r)));

        if (this.op === 'select') {
            let rows = matches();
            for (const { c, ascending, nullsFirst } of [...this.orders].reverse()) {
                rows = [...rows].sort((a, b) => {
                    const an = a[c] === null || a[c] === undefined;
                    const bn = b[c] === null || b[c] === undefined;
                    if (an || bn) return an === bn ? 0 : (an ? -1 : 1) * (nullsFirst ? 1 : -1);
                    return (ascending ? 1 : -1) * compare(a[c], b[c]);
                });
            }
            const count = this.countMode ? rows.length : null;
            if (this.head) return { data: null, error: null, count };
            if (this.rangeFrom !== null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
            if (this.limitN !== null) rows = rows.slice(0, this.limitN);
            return this.finish(rows.map((r) => this.project(r)), count);
        }

        if (this.op === 'insert' || this.op === 'upsert') {
            const values = Array.isArray(this.values) ? this.values : [this.values];
            const written = [];
            for (const v of values) {
                const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...clone(v) };
                const keys = this.op === 'upsert' && this.onConflict ? this.onConflict.split(',') : UNIQUE_KEYS[this.table];
                const existing = keys ? table.find((r) => keys.every((k) => same(r[k], row[k]))) : null;
                if (existing) {
                    if (this.op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' } };
                    Object.assign(existing, clone(v));
                    written.push(existing);
                } else {
                    table.push(row);
                    written.push(row);
                }
            }
            if (!this.returning) return { data: null, error: null };
            return this.finish(written.map((r) => this.project(r)));
        }

        if (this.op === 'update') {
            const rows = matches();
            for (const r of rows) Object.assign(r, clone(this.values));
            if (!this.returning) return { data: null, error: null };
            return this.finish(rows.map((r) => this.project(r)));
        }

        if (this.op === 'delete') {
            const rows = matches();
            this.db.tables[this.table] = table.filter((r) => !rows.includes(r));
            if (!this.returning) return { data: null, error: null };
            return this.finish(rows.map((r) => this.project(r)));
        }

        throw new Error(`unsupported op ${this.op}`);
    }
}

function createFakeSupabase() {
    const db = {
        tables: {},
        tokens: new Map(),   // token -> user id
        authUsers: new Map(), // id -> { id, email, banned }
        failures: [],
        calls: [],
    };

    db.embed = (fromTable, row, target, hint, inner) => {
        const singular = (t) => t.replace(/s$/, '');
        const targetRows = db.tables[target] || [];
        const sub = { columns: inner };
        const project = (r) => Query.prototype.project.call({ ...sub, db, table: target }, r);

        const fk = hint || (row[`${singular(target)}_id`] !== undefined ? `${singular(target)}_id` : null)
            || (target === 'profiles' && row.user_id !== undefined ? 'user_id' : null);
        if (fk) {
            const hit = targetRows.find((t) => same(t.id, row[fk]));
            return hit ? project(hit) : null;
        }
        const backRef = `${singular(fromTable)}_id`;
        return targetRows.filter((t) => same(t[backRef], row.id)).map(project);
    };

    const client = {
        from: (table) => new Query(db, table),
        auth: {
            getUser: async (token) => {
                const id = db.tokens.get(token);
                const user = id && db.authUsers.get(id);
                if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
                return { data: { user: { id: user.id, email: user.email, email_confirmed_at: user.emailConfirmed === false ? null : '2026-01-01T00:00:00Z' } }, error: null };
            },
            admin: {
                deleteUser: async (id) => {
                    db.calls.push(['deleteUser', id]);
                    if (!db.authUsers.has(id)) return { data: null, error: { message: 'User not found' } };
                    db.authUsers.delete(id);
                    for (const [t, token] of db.tokens) if (token === id) db.tokens.delete(t);
                    for (const [table, column] of CASCADE) {
                        db.tables[table] = (db.tables[table] || []).filter((r) => !same(r[column], id));
                    }
                    return { data: {}, error: null };
                },
                getUserById: async (id) => {
                    const user = db.authUsers.get(id);
                    if (!user) return { data: { user: null }, error: { message: 'User not found' } };
                    return { data: { user: { id, email: user.email, email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, app_metadata: { providers: ['email'] } } }, error: null };
                },
                listUsers: async () => {
                    if (db.failures.find((f) => f.table === 'auth')) return { data: null, error: { message: 'simulated failure' } };
                    return { data: { users: [...db.authUsers.values()].slice(0, 1) }, error: null };
                },
                updateUserById: async (id, attrs) => {
                    db.calls.push(['updateUserById', id, attrs]);
                    return { data: {}, error: null };
                },
            },
        },
    };

    /** Create an auth user + profile and return its bearer token. */
    db.addUser = (overrides = {}) => {
        const id = overrides.id || crypto.randomUUID();
        const email = overrides.email || `${id.slice(0, 8)}@example.com`;
        const token = `token-${id}`;
        db.authUsers.set(id, { id, email, emailConfirmed: overrides.emailConfirmed !== false });
        delete overrides.emailConfirmed;
        db.tokens.set(token, id);
        db.tables.profiles = db.tables.profiles || [];
        db.tables.profiles.push({
            id, email, full_name: overrides.full_name || 'Test User', role: 'user', is_banned: false, created_at: new Date().toISOString(),
            monthly_budget: 10000, investment_target: 0, karma_score: 100,
            streak_current: 0, streak_longest: 0, streak_last_log: null, total_chillar: 0,
            is_pro: false, pro_expires_at: null, streak_freezes_remaining: 0, paisa_score: 0,
            receipt_scans_this_month: 0, receipt_scans_reset_month: null,
            chat_messages_today: 0, chat_messages_reset_at: null,
            expenses_today: 0, expenses_reset_at: null,
            ...overrides,
        });
        return { id, email, token };
    };

    db.profile = (id) => (db.tables.profiles || []).find((p) => p.id === id);
    db.client = client;
    return db;
}

module.exports = { createFakeSupabase };
