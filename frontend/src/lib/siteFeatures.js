/**
 * The features the website shows. `live` means the feature is in the Vittova
 * app on Google Play today. Features from the next update say so on the site,
 * and are not shown with app screenshots until that update is published:
 * set NEXT_UPDATE_LIVE to true only after it is live on Google Play.
 *
 * Sample figures are fictional and are always labelled as examples.
 */
export const NEXT_UPDATE_LIVE = false;

export const FEATURES = [
  {
    id: 'tracking', name: 'Smart expense tracking', live: true, shot: '/screens/05-activity.png',
    summary: 'With your permission, Vittova turns your bank’s debit SMS into expenses. You can also add one in a few taps or scan a receipt.',
    benefits: ['No bank password or bank connection', 'Messages from people are never read', 'Unclear payments wait for your OK'],
    sample: ['Swiggy · Food · ₹240', 'Metro card · Transport · ₹200', 'Notebook · Shopping · ₹120'],
  },
  {
    id: 'budget', name: 'Monthly budget and Safe-to-Spend', live: true, shot: '/screens/01-home.png',
    summary: 'Set a monthly budget and bills. Vittova works out what is left to spend today, after bills and your savings target.',
    benefits: ['One clear number for today', 'Warns when you are on pace to overspend'],
    sample: ['Left to spend: ₹7,157', 'Safe today: ₹298', '24 days left in the month'],
  },
  {
    id: 'afford', name: 'Can I Afford?', live: true, shot: '/screens/02-sheet-afford.png',
    summary: 'Type a price and see whether it fits this month, and when it would fit better.',
    benefits: ['Answers from your own budget', 'Shows what is left after buying'],
    sample: ['Headphones ₹2,499', 'Fits this month', '₹4,658 left for 24 days'],
  },
  {
    id: 'ai', name: 'Vittova AI', live: true, shot: '/screens/06-ai.png',
    summary: 'Ask why spending went up or how long a goal will take. Figures come from your own expenses and budget.',
    benefits: ['Explains in plain words', 'General education, not investment advice'],
    sample: ['“Why is this month higher?”', 'Food is ₹1,200 above last month, mostly weekend orders.'],
  },
  {
    id: 'insights', name: 'Financial insights', live: true, shot: '/screens/04-wealth-expenses.png',
    summary: 'Category breakdowns, trends and the one thing that needs attention this month.',
    benefits: ['See where money really goes', 'Spot repeat payments you forgot'],
    sample: ['Food 34% of spending', 'Two subscriptions renew next week'],
  },
  {
    id: 'wealth', name: 'Wealth overview', live: true, shot: '/screens/03-wealth.png',
    summary: 'See how much you could set aside and what saving a little each month adds up to, using rates you can see.',
    benefits: ['Illustrations, never predictions', 'No product recommendations'],
    sample: ['Set aside ₹2,000 a month', 'Illustration at an assumed rate'],
  },
  {
    id: 'groups', name: 'Group Pools', live: true,
    summary: 'Split shared bills with flatmates and friends, see who owes whom and record settle-ups.',
    benefits: ['Invite with a code', 'Settle through your usual UPI app'],
    sample: ['Flat rent · 4 people', 'You are owed ₹850'],
  },
  {
    id: 'savings', name: 'Save-to-Earn challenges', live: true, shot: '/screens/07-save-to-earn.png',
    summary: 'Personal money challenges and a Victory Pot that show how small changes add up.',
    benefits: ['Built around your own spending'],
    sample: ['No-cab week', 'Estimated ₹600 kept'],
  },
  {
    id: 'reports-csv', name: 'CSV export', live: true,
    summary: 'Download all your expenses as a spreadsheet file at any time.',
    benefits: ['Your data stays yours'],
    sample: ['vittova-expenses.csv'],
  },
  {
    id: 'category-budgets', name: 'Category budgets and income', live: false,
    summary: 'A monthly limit for each category you want to watch, and the income you choose to record, side by side.',
    benefits: ['See which category is running over', 'Income minus spending each month'],
    sample: ['Food: ₹1,840 of ₹2,000', 'Income entered: ₹45,000'],
  },
  {
    id: 'reports', name: 'Reports, CSV and PDF', live: false,
    summary: 'Week, month and year reports by category, with budget performance. CSV is free; PDF is part of Pro.',
    benefits: ['Plain figures from your own records'],
    sample: ['November: ₹18,420 spent', 'Food took 34%'],
  },
  {
    id: 'calendar', name: 'Month Calendar', live: false,
    summary: 'Each day’s spending, bills due and goal dates in one view. Part of Pro.',
    benefits: ['See heavy days and coming bills'],
    sample: ['25 Nov · Rent due', '9 Nov · ₹1,240 spent'],
  },
  {
    id: 'receipt-split', name: 'Split from Receipt', live: false,
    summary: 'Split a group bill item by item. Tax and tips are shared fairly. Part of Pro.',
    benefits: ['Shares always add up to the bill'],
    sample: ['Pizza · 3 people', 'Juice · just you'],
  },
  {
    id: 'wrapped', name: 'Money Wrapped', live: false,
    summary: 'Your month or year in plain figures. Sharing sends counts only, never amounts.',
    benefits: ['Days logged and no-spend days'],
    sample: ['21 days logged', '9 no-spend days'],
  },
  {
    id: 'widget', name: 'Home screen widget and money alerts', live: false,
    summary: 'Today’s safe amount on your home screen, plus alerts you choose: budgets, bills and a weekly summary.',
    benefits: ['Amount hidden unless you turn it on', 'Alerts never show amounts'],
    sample: ['Safe to spend today', 'Rent is due tomorrow'],
  },
];

export const isAvailable = (f) => f.live || NEXT_UPDATE_LIVE;
