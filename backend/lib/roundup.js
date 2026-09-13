/** Round-up to the next ₹5 ("chillar"). ₹123 -> 2, ₹125 -> 0. Computed in paise to avoid float drift. */
function roundupFor(amount) {
    const paise = Math.round(Number(amount) * 100);
    const remainder = paise % 500;
    return remainder === 0 ? 0 : (500 - remainder) / 100;
}

module.exports = { roundupFor };
