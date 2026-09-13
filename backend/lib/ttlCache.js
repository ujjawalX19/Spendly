/**
 * A small bounded in-memory cache with per-entry expiry.
 *
 * Used to avoid paying for identical AI calls (e.g. the burn-rate tip on every
 * dashboard load). Per-process and lost on restart, which is acceptable: the
 * worst case is one extra call after a deploy.
 */
class TtlCache {
    constructor({ maxEntries = 5000, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.map = new Map();
    }

    get(key, now = Date.now()) {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= now) {
            this.map.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key, value, now = Date.now()) {
        if (this.map.has(key)) this.map.delete(key);
        else if (this.map.size >= this.maxEntries) {
            // Evict the oldest insertion (Map preserves insertion order).
            this.map.delete(this.map.keys().next().value);
        }
        this.map.set(key, { value, expiresAt: now + this.ttlMs });
    }

    clear() {
        this.map.clear();
    }
}

module.exports = { TtlCache };
