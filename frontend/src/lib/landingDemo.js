/**
 * landingDemo — the "Can I afford this?" demo on the public homepage.
 *
 * It runs on ONE fixed, clearly labelled example month so a visitor can see
 * how the decision reads. It is not the app's engine and it never touches
 * anyone's data: in the app every figure comes from the server
 * (backend/lib/moneyDecisions.js) and the user's own records.
 */

export const EXAMPLE_MONTH = {
  leftThisMonth: 9300, // budget left after spending so far
  daysLeft: 12,
  bill: { name: 'Phone recharge', amount: 2000, inDays: 5 },
  usualPerDay: 350, // what this example person usually spends a day
};

/**
 * @param {number} price rupees
 * @returns {{verdict:'can_afford'|'wait'|'not_comfortable', perDay:number, shortBy:number, leftAfter:number}}
 */
export function demoCheck(price, month = EXAMPLE_MONTH) {
  const afterBill = month.leftThisMonth - month.bill.amount;
  const leftAfter = afterBill - price;
  if (leftAfter < 0) return { verdict: 'not_comfortable', perDay: 0, shortBy: -leftAfter, leftAfter: 0 };
  const perDay = Math.floor(leftAfter / month.daysLeft);
  return { verdict: perDay >= month.usualPerDay ? 'can_afford' : 'wait', perDay, shortBy: 0, leftAfter };
}
