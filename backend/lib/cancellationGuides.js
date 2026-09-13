/**
 * cancellationGuides — how to actually cancel the things Spendly detects.
 *
 * Detecting a forgotten subscription is the easy half and every competitor
 * does it. What people pay for is the outcome: the money stops leaving their
 * account. Rocket Money employs staff to make the cancellation call; a solo
 * team can't, but it can turn "twenty taps through a settings maze you have to
 * find first" into two taps and a checklist, which captures most of the value.
 *
 * Matches must be specific enough not to fire inside ordinary words
 * ("cult" is inside "difficult", "apple" inside "pineapple").
 *
 * Matching is done on the merchant string that came out of a payment
 * notification or bank statement, so it is messy: "NETFLIX.COM", "Netflix
 * India", "NETFLIX BILLING BANGALORE". Patterns are therefore substring
 * matches on a normalised name rather than exact lookups.
 *
 * Every URL here is a cancellation or subscription-management page, not a
 * marketing page or a signup link. Nothing in this file earns Spendly money;
 * that is the point — the user has to be able to trust the recommendation to
 * cancel.
 */

/** Strip everything that varies between statements. */
function normalise(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * @typedef {object} Guide
 * @property {string}   name      canonical service name
 * @property {string[]} match     normalised substrings that identify it
 * @property {string}   [url]     direct link to the cancellation/manage page
 * @property {string[]} steps     what to do, in order
 * @property {string}   [note]    anything that commonly trips people up
 */

/** @type {Guide[]} */
const GUIDES = [
    {
        name: 'Netflix',
        match: ['netflix'],
        url: 'https://www.netflix.com/cancelplan',
        steps: ['Sign in to Netflix', 'Confirm "Finish Cancellation"'],
        note: 'You keep access until the end of the billing period already paid for.',
    },
    {
        name: 'Amazon Prime',
        match: ['amazonprime', 'primevideo'],
        url: 'https://www.amazon.in/gp/primecentral',
        steps: ['Open Prime Membership settings', 'Choose "End Membership"'],
        note: 'Ending Prime also ends free delivery and Prime Video together.',
    },
    {
        name: 'JioHotstar',
        match: ['hotstar', 'jiohotstar', 'disneyhotstar'],
        url: 'https://www.hotstar.com/in/subscribe/my-account',
        steps: ['Open My Account', 'Select your plan', 'Choose "Cancel Subscription"'],
        note: 'If you subscribed through a Jio or Airtel plan, cancel with that operator instead.',
    },
    {
        name: 'Spotify',
        match: ['spotify'],
        url: 'https://www.spotify.com/in-en/account/subscription/',
        steps: ['Open your account page', 'Choose "Change Plan"', 'Scroll to Spotify Free and Cancel Premium'],
    },
    {
        name: 'YouTube Premium',
        match: ['youtubepremium', 'googleyoutube', 'youtubemusic'],
        url: 'https://www.youtube.com/paid_memberships',
        steps: ['Open paid memberships', 'Select YouTube Premium', 'Deactivate'],
    },
    {
        name: 'Swiggy One',
        match: ['swiggyone', 'swiggysuper'],
        steps: ['Open Swiggy', 'Account → Swiggy One', 'Turn off auto-renew'],
        note: 'Swiggy One has no web cancellation page — it must be done in the app.',
    },
    {
        name: 'Zomato Gold',
        match: ['zomatogold', 'zomatopro', 'zomatoexclusive'],
        steps: ['Open Zomato', 'Profile → Gold', 'Manage membership → turn off auto-renew'],
    },
    {
        name: 'Google One',
        match: ['googleone', 'googlestorage'],
        url: 'https://one.google.com/settings',
        steps: ['Open Google One settings', 'Choose "Cancel subscription"'],
        note: 'Storage above the free 15 GB stops after the period ends — move files first.',
    },
    {
        name: 'Apple services',
        match: ['applecom', 'applebill', 'appleservices', 'itunes', 'icloud'],
        steps: ['On iPhone: Settings → your name → Subscriptions', 'On the web: reportaproblem.apple.com', 'Select the subscription and cancel'],
        note: 'Apple bills several services on one line, so check which one this is.',
    },
    {
        name: 'Adobe',
        match: ['adobe', 'creativecloud'],
        url: 'https://account.adobe.com/plans',
        steps: ['Open your plans page', 'Manage plan → Cancel your plan'],
        note: 'Annual plans billed monthly usually charge an early-termination fee.',
    },
    {
        name: 'Microsoft 365',
        match: ['microsoft', 'office365', 'msoffice'],
        url: 'https://account.microsoft.com/services',
        steps: ['Open Services & subscriptions', 'Manage → Cancel subscription'],
    },
    {
        name: 'LinkedIn Premium',
        match: ['linkedin'],
        url: 'https://www.linkedin.com/premium/my-premium/',
        steps: ['Open Premium settings', 'Manage subscription → Cancel'],
    },
    {
        name: 'Cult.fit',
        match: ['cultfit', 'curefit'],
        steps: ['Open Cult.fit', 'Profile → Memberships', 'Cancel or pause auto-renew'],
        note: 'Pausing is often better than cancelling if you plan to return — you keep the rate.',
    },
    {
        name: 'Audible',
        match: ['audible'],
        url: 'https://www.audible.in/account/membership',
        steps: ['Open membership settings', 'Cancel membership'],
        note: 'Books already bought with credits stay yours after cancelling.',
    },
    {
        name: 'Coursera',
        match: ['coursera'],
        url: 'https://www.coursera.org/account-settings',
        steps: ['Open account settings', 'Subscriptions → Cancel'],
    },
    {
        name: 'Unacademy',
        match: ['unacademy'],
        steps: ['Open Unacademy', 'Profile → Subscriptions', 'Turn off auto-renew'],
    },
    {
        name: 'ChatGPT Plus',
        match: ['openai', 'chatgpt'],
        url: 'https://chatgpt.com/#settings/Subscription',
        steps: ['Settings → Subscription', 'Manage → Cancel plan'],
    },
    {
        name: 'Claude Pro',
        match: ['anthropic', 'claudeai'],
        url: 'https://claude.ai/settings/billing',
        steps: ['Settings → Billing', 'Cancel subscription'],
    },
    {
        name: 'Notion',
        match: ['notion'],
        url: 'https://www.notion.so/my-settings',
        steps: ['Settings → Plans', 'Downgrade to Free'],
    },
    {
        name: 'Canva',
        match: ['canva'],
        url: 'https://www.canva.com/settings/billing-and-plans',
        steps: ['Billing & plans', 'Cancel subscription'],
    },
];

/**
 * A fallback that is still more useful than nothing: on Android most
 * recurring UPI debits are either a Play Store subscription or a UPI AutoPay
 * mandate, and both can be stopped from one screen the user rarely knows about.
 */
const GENERIC_GUIDE = {
    name: null,
    url: null,
    steps: [
        'Check Play Store → your profile → Payments & subscriptions → Subscriptions',
        'Check your UPI app → Autopay / Mandates, and pause or revoke the mandate',
        'If neither lists it, sign in to the service directly and look under Account or Billing',
    ],
    note: 'A UPI AutoPay mandate keeps charging even after you delete the app, so revoke the mandate rather than just uninstalling.',
};

/**
 * Find cancellation instructions for a detected merchant.
 * @param {string} merchant raw merchant/description text
 * @returns {Guide & {matched: boolean}}
 */
function guideFor(merchant) {
    const key = normalise(merchant);
    if (key) {
        for (const guide of GUIDES) {
            if (guide.match.some((m) => key.includes(m))) {
                return { ...guide, matched: true };
            }
        }
    }
    return { ...GENERIC_GUIDE, matched: false };
}

module.exports = { guideFor, normalise, GUIDES, GENERIC_GUIDE };
