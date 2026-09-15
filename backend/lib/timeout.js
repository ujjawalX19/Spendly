/**
 * withTimeout — reject with code AI_TIMEOUT if a promise has not settled in
 * time. Used for model calls so a hung provider never holds a request open.
 */
function withTimeout(promise, ms, onTimeout) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            if (onTimeout) onTimeout();
            reject(Object.assign(new Error('AI request timed out'), { code: 'AI_TIMEOUT' }));
        }, ms);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
