/**
 * aiMemory — what the user chose to tell Vittova AI, kept apart from the chat
 * transcript (v1_19_ai_memory.sql).
 *
 * Rules:
 *   - Nothing is remembered silently. A memory is written only when the user
 *     says so (the Memory screen, or confirming a suggestion in chat).
 *   - Personalisation off means memories are neither read nor written.
 *   - Every read and write is scoped to the signed-in user.
 *   - The language model never sees ids, only the facts.
 *
 * A database without v1_19 makes every function answer as if the feature is
 * unavailable, so the AI keeps working.
 */
const { supabase } = require('../config/supabase');

const KINDS = ['income_cycle', 'goal', 'preference', 'situation', 'habit_target', 'language'];
const MAX_MEMORIES = 20;
const MAX_CONTENT = 200;
const MISSING = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);

const unavailable = (error) => Boolean(error && MISSING.has(error.code));

/** True unless the user switched personalisation off. A missing column counts as on. */
async function personalisationOn(userId) {
    const { data, error } = await supabase.from('profiles').select('ai_personalisation').eq('id', userId).maybeSingle();
    if (error || !data) return true;
    return data.ai_personalisation !== false;
}

async function setPersonalisation(userId, on) {
    const { error } = await supabase.from('profiles').update({ ai_personalisation: on === true }).eq('id', userId);
    if (error && !unavailable(error)) throw error;
    // Turning it off also forgets everything, so "off" means off.
    if (on !== true) await forgetAll(userId);
}

/** @returns {{ available: boolean, memories: Array<{id, kind, content, updated_at}> }} */
async function list(userId) {
    const { data, error } = await supabase.from('ai_memories')
        .select('id, kind, content, source, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(MAX_MEMORIES);
    if (error) {
        if (unavailable(error)) return { available: false, memories: [] };
        throw error;
    }
    return { available: true, memories: data || [] };
}

function sanitize(content) {
    return String(content || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT);
}

/** Adds a memory the user stated. Refuses when the list is full. */
async function remember(userId, { kind, content, source = 'user' }) {
    if (!KINDS.includes(kind)) throw Object.assign(new Error('Unknown memory kind'), { code: 'BAD_KIND', status: 400 });
    const text = sanitize(content);
    if (text.length < 2) throw Object.assign(new Error('Say a little more'), { code: 'TOO_SHORT', status: 400 });
    const current = await list(userId);
    if (!current.available) return { available: false };
    if (current.memories.length >= MAX_MEMORIES) {
        throw Object.assign(new Error(`Vittova keeps up to ${MAX_MEMORIES} memories. Remove one first.`), { code: 'MEMORY_FULL', status: 409 });
    }
    // One income cycle and one language at a time: a new one replaces the old.
    if (kind === 'income_cycle' || kind === 'language') {
        await supabase.from('ai_memories').delete().eq('user_id', userId).eq('kind', kind);
    }
    const { data, error } = await supabase.from('ai_memories')
        .insert({ user_id: userId, kind, content: text, source })
        .select('id, kind, content, source, created_at, updated_at')
        .single();
    if (error) {
        if (unavailable(error)) return { available: false };
        throw error;
    }
    return { available: true, memory: data };
}

async function update(userId, id, content) {
    const text = sanitize(content);
    if (text.length < 2) throw Object.assign(new Error('Say a little more'), { code: 'TOO_SHORT', status: 400 });
    const { data, error } = await supabase.from('ai_memories')
        .update({ content: text, updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId)
        .select('id, kind, content, source, created_at, updated_at');
    if (error) {
        if (unavailable(error)) return { available: false };
        throw error;
    }
    return { available: true, memory: data && data[0] ? data[0] : null };
}

async function forget(userId, id) {
    const { data, error } = await supabase.from('ai_memories').delete().eq('id', id).eq('user_id', userId).select('id');
    if (error) {
        if (unavailable(error)) return { available: false, removed: false };
        throw error;
    }
    return { available: true, removed: Boolean(data && data.length) };
}

async function forgetAll(userId) {
    const { error } = await supabase.from('ai_memories').delete().eq('user_id', userId);
    if (error && !unavailable(error)) throw error;
}

/**
 * The memories as the model may see them: kind and text only, newest first,
 * with how old each one is, so the model can ask whether it still holds.
 * Returns [] when personalisation is off.
 */
async function forPrompt(userId, now = new Date()) {
    if (!(await personalisationOn(userId))) return [];
    const { memories } = await list(userId);
    return memories.map((m) => {
        const days = Math.max(0, Math.floor((now.getTime() - new Date(m.updated_at).getTime()) / 86_400_000));
        return { kind: m.kind, content: m.content, savedDaysAgo: days, mayBeStale: days > 90 };
    });
}

/**
 * Candidate facts in a message the user might want remembered. Suggestions
 * only: nothing is saved until the user confirms. Deliberately narrow, so
 * casual mentions are not turned into "facts".
 */
function suggestFromMessage(text) {
    const q = String(text || '').trim();
    const out = [];
    const salary = /\b(?:my )?(?:salary|pay|income|stipend)\s+(?:comes|arrives|is paid|gets credited|is credited|lands)\s+(?:on\s+)?(?:the\s+)?([^.,;!?]{2,40})/i.exec(q);
    if (salary) out.push({ kind: 'income_cycle', content: `Income arrives ${salary[1].trim()}` });
    const goal = /\b(?:i am|i'm|im)\s+saving\s+(?:up\s+)?for\s+(?:an?\s+|the\s+)?([^.,;!?]{2,50})/i.exec(q);
    if (goal) out.push({ kind: 'goal', content: `Saving for ${goal[1].trim()}` });
    const reduce = /\b(?:i (?:want|am trying|'m trying|would like) to)\s+(?:cut|reduce|spend less on|stop)\s+([^.,;!?]{2,50})/i.exec(q);
    if (reduce) out.push({ kind: 'habit_target', content: `Trying to reduce ${reduce[1].trim()}` });
    const prefer = /\bi prefer\s+([^.,;!?]{2,50})/i.exec(q);
    if (prefer) out.push({ kind: 'preference', content: `Prefers ${prefer[1].trim()}` });
    const situation = /\b(?:i am|i'm|im)\s+an?\s+(student|freelancer|fresher|intern|first[- ]jobber|homemaker|salaried (?:employee|professional)|shop ?owner|self[- ]employed)\b/i.exec(q);
    if (situation) out.push({ kind: 'situation', content: `Is a ${situation[1].toLowerCase()}` });
    const hinglish = /\b(kitna|kaise|paisa|bachat|kharcha|mujhe|mera|meri|hai|nahi|karna|chahiye)\b/i.test(q);
    if (hinglish) out.push({ kind: 'language', content: 'Comfortable with Hinglish' });
    return out.slice(0, 3);
}

module.exports = { KINDS, MAX_MEMORIES, personalisationOn, setPersonalisation, list, remember, update, forget, forgetAll, forPrompt, suggestFromMessage };
