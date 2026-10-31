/**
 * receiptSplit — who owes what from a receipt, in whole paise.
 *
 * Each item is split equally between the people who had it. Whatever separates
 * the items from the amount paid (tax, service, tip, or a discount) is shared
 * in proportion to each person's items. Shares always add up to the total
 * exactly: leftover paise go to the largest fractional remainders.
 */
const { splitEqually } = require('./groupBalances');

class ReceiptSplitError extends Error {}

function allocateReceipt(items, totalPaise) {
    if (!items.length) throw new ReceiptSplitError('Add at least one item');
    const base = new Map();
    let itemsPaise = 0;
    for (const item of items) {
        if (!item.participants.length) throw new ReceiptSplitError(`Choose who had ${item.name}`);
        if (item.pricePaise < item.participants.length) throw new ReceiptSplitError(`${item.name} is too small to split`);
        itemsPaise += item.pricePaise;
        for (const [id, paise] of splitEqually(item.pricePaise, item.participants)) base.set(id, (base.get(id) || 0) + paise);
    }
    const extra = totalPaise - itemsPaise;
    // A discount cannot exceed the items; a far larger total means a misread item.
    if (extra <= -itemsPaise || extra > itemsPaise) throw new ReceiptSplitError("The items don't match the total. Check the prices.");

    const ids = [...base.keys()].sort();
    const exact = ids.map((id) => ({ id, value: (base.get(id) * extra) / itemsPaise }));
    const floored = exact.map((x) => ({ ...x, floor: Math.floor(x.value) }));
    let left = extra - floored.reduce((sum, x) => sum + x.floor, 0);
    const order = [...floored].sort((a, b) => (b.value - b.floor) - (a.value - a.floor) || a.id.localeCompare(b.id));
    const add = new Map(floored.map((x) => [x.id, x.floor]));
    for (const x of order) {
        if (left <= 0) break;
        add.set(x.id, add.get(x.id) + 1);
        left -= 1;
    }
    return new Map(ids.map((id) => [id, base.get(id) + add.get(id)]));
}

module.exports = { allocateReceipt, ReceiptSplitError };
