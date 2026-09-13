/**
 * groupBalances — shared-expense maths for Group Pools.
 *
 * Everything is done in integer paise, so ₹100 split three ways is
 * 3334 + 3333 + 3333 paise and always sums back to the original amount.
 * Pure functions: rows in, numbers out.
 *
 * Sign convention for a member's net balance:
 *   positive → the group owes them (they paid more than their share)
 *   negative → they owe the group
 */

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => Math.round(paise) / 100;

/**
 * Split an amount equally. Leftover paise go one each to participants in a
 * stable order (sorted by id), so the result is deterministic and exact.
 * @returns {Map<string, number>} participantId -> share in paise
 */
function splitEqually(amountPaise, participantIds) {
  const ids = [...new Set(participantIds)].sort();
  if (ids.length === 0) throw new Error('At least one participant is required');
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error('Amount must be a positive number of paise');
  const base = Math.floor(amountPaise / ids.length);
  let remainder = amountPaise - base * ids.length;
  const shares = new Map();
  for (const id of ids) {
    shares.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return shares;
}

/**
 * @param {string[]} memberIds
 * @param {Array<{amount:number|string, paid_by:string, splits:Array<{user_id:string, share_amount?:number|string|null}>}>} expenses
 * @param {Array<{from_user_id:string, to_user_id:string, amount:number|string}>} settlements
 * @returns {Map<string, number>} memberId -> net balance in paise
 */
function computeNetBalances(memberIds, expenses, settlements) {
  const net = new Map(memberIds.map((id) => [id, 0]));
  const add = (id, paise) => net.set(id, (net.get(id) || 0) + paise);

  for (const e of expenses || []) {
    const amount = toPaise(e.amount);
    const splits = e.splits || [];
    if (amount <= 0 || splits.length === 0) continue;

    // Use the stored shares when every split has one and they add up exactly;
    // otherwise fall back to an equal split (older rows have no shares).
    const stored = splits.map((s) => (s.share_amount === null || s.share_amount === undefined ? null : toPaise(s.share_amount)));
    const storedValid = stored.every((v) => v !== null) && stored.reduce((a, b) => a + b, 0) === amount;
    const shares = storedValid
      ? new Map(splits.map((s, i) => [s.user_id, stored[i]]))
      : splitEqually(amount, splits.map((s) => s.user_id));

    add(e.paid_by, amount);
    for (const [userId, share] of shares) add(userId, -share);
  }

  for (const s of settlements || []) {
    const amount = toPaise(s.amount);
    if (amount <= 0) continue;
    // Paying someone reduces what you owe and what they are owed.
    add(s.from_user_id, amount);
    add(s.to_user_id, -amount);
  }
  return net;
}

/**
 * Turn net balances into a short list of payments that settles everyone.
 * Greedy largest-debtor-to-largest-creditor; produces at most n-1 transfers.
 * @param {Map<string, number>} net
 * @returns {Array<{from:string, to:string, amount:number}>} amounts in rupees
 */
function suggestSettlements(net) {
  const debtors = [];
  const creditors = [];
  for (const [id, paise] of net) {
    if (paise < 0) debtors.push({ id, left: -paise });
    else if (paise > 0) creditors.push({ id, left: paise });
  }
  const byLeftThenId = (a, b) => b.left - a.left || (a.id < b.id ? -1 : 1);
  debtors.sort(byLeftThenId);
  creditors.sort(byLeftThenId);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].left, creditors[j].left);
    if (pay > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: toRupees(pay) });
    debtors[i].left -= pay;
    creditors[j].left -= pay;
    if (debtors[i].left === 0) i++;
    if (creditors[j].left === 0) j++;
  }
  return transfers;
}

module.exports = { splitEqually, computeNetBalances, suggestSettlements, toPaise, toRupees };
