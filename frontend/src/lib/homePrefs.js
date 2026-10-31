/**
 * homePrefs — this device's choices about Home: the goal picked in onboarding,
 * which sections show, and how far the getting-started list has got.
 *
 * Convenience only, so it lives in localStorage and every read survives blocked
 * storage. Hiding a section hides it from Home; no data is affected.
 */
const KEY = 'vittova.home.v1';

export const HOME_SECTIONS = [
  { id: 'today', label: 'Today', hint: 'Spent today against your safe daily amount' },
  { id: 'insight', label: 'Insight', hint: 'The one thing that needs attention' },
  { id: 'week', label: 'Last 7 days', hint: 'Your spending by day' },
  { id: 'month', label: 'This month', hint: 'Bills to come and top categories' },
  { id: 'recent', label: 'Recent activity', hint: 'Your latest payments' },
  { id: 'streak', label: 'Money Streak', hint: 'Your streak and daily mission' },
];

export const GOALS = [
  { id: 'track', label: 'Track my expenses', hint: 'See every payment in one place' },
  { id: 'budget', label: 'Manage a monthly budget', hint: 'Know what is safe to spend' },
  { id: 'understand', label: 'Understand my spending', hint: 'See where the money goes' },
  { id: 'save', label: 'Build my savings', hint: 'Set a target and follow it' },
];

const EMPTY = { goal: null, hidden: [], done: [], startDismissed: false };

function read() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY));
    return parsed && typeof parsed === 'object' ? { ...EMPTY, ...parsed } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function write(next) {
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

export const getHomePrefs = read;
export const setGoal = (goal) => write({ ...read(), goal });
export const dismissGettingStarted = () => write({ ...read(), startDismissed: true });

export function toggleSection(id) {
  const prefs = read();
  const hidden = prefs.hidden.includes(id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id];
  return write({ ...prefs, hidden });
}

/** Record a getting-started step reached ('budget', 'report', 'pro'). */
export function markStep(step) {
  const prefs = read();
  return prefs.done.includes(step) ? prefs : write({ ...prefs, done: [...prefs.done, step] });
}

/** The list, in the order that suits the goal. Only real, reachable steps. */
export function gettingStartedSteps(prefs, hasExpense) {
  const steps = [
    { id: 'expense', label: 'Add your first expense', done: hasExpense },
    { id: 'budget', label: 'Set a category budget', to: '/budgets', done: prefs.done.includes('budget') },
    { id: 'report', label: 'See your monthly report', to: '/reports', done: prefs.done.includes('report') },
    { id: 'pro', label: 'See what Vittova Pro adds', to: '/pro', done: prefs.done.includes('pro') },
  ];
  if (prefs.goal === 'understand') {
    const [expense, budget, report, pro] = steps;
    return [expense, report, budget, pro];
  }
  return steps;
}
