# Vittova — Google Play Console submission guide

What to enter in Play Console, screen by screen, for **Vittova**
(`com.vittova.app`). Everything here matches the app as built on 2026-09-17.
Supporting detail: `store-listing/PLAY_STORE_LISTING.md` (listing copy and
graphics), `PRIVACY_DATA_INVENTORY.md` (data flows), `RELEASE.md` (build and
signing), `PLAY_STORE_CHECKLIST.md` (release checklist).

Play's forms change often. Where this guide says **verify**, check the wording
in Play Console before answering; do not guess.

---

## 0. Before you open Play Console

| Must be true | How to check |
|---|---|
| **The website loads.** `https://vittova.in/privacy`, `/terms` and `/delete-account` show text (they are static pages and load even if the web app is broken) | Open each URL in a private browser window |
| The web app itself loads at `https://vittova.in` | Needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` set for **Production** in Vercel, then a redeploy |
| `support@vittova.in` receives mail | Send it a test email from another account |
| Upload keystore created and backed up off this computer | `RELEASE.md` §2 |
| A signed release bundle (`.aab`) built | `RELEASE.md` §3; `jarsigner -verify` prints "jar verified" |
| Google sign-in, email sign-in, password reset and notification access pass on a real phone **with the release build** | `DEVICE_TEST_CHECKLIST.md` |

The package name `com.vittova.app` is **permanent** after the first upload.

---

## 1. Create the app

Play Console → **Create app**

| Field | Answer |
|---|---|
| App name | `Vittova: Expense Tracker` |
| Default language | English (India) – en-IN |
| App or game | App |
| Free or paid | Free |
| Declarations | Developer Program Policies ✔, US export laws ✔ |

---

## 2. Store presence → Main store listing

Copy from `store-listing/PLAY_STORE_LISTING.md`.

| Field | Value |
|---|---|
| App name | `Vittova: Expense Tracker` |
| Short description | `Track spending, know what's safe to spend, and split bills with friends.` |
| Full description | the block in `PLAY_STORE_LISTING.md` |
| App icon | `store-listing/icon-512.png` |
| Feature graphic | `store-listing/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8 real screenshots from the release build (Dashboard, Vittova AI, History, Group Pool, Settings). Use a real account with realistic data; no mock-ups with invented numbers |
| Category | Finance |
| Tags | Budgeting / expense tracking tags offered by Play (**verify** the list) |
| Email | `support@vittova.in` |
| Website | `https://vittova.in` |
| Privacy policy | `https://vittova.in/privacy` |

Do not claim: "bank-grade", "SEBI compliant", "reads your bank account",
"reads SMS", user counts or ratings, or Pro pricing.

---

## 3. Policy → App content

### 3.1 Privacy policy
`https://vittova.in/privacy`

### 3.2 App access
**All or some functionality is restricted** → add instructions.

Create a dedicated reviewer account yourself (email + password, confirm the
email), give it a budget and a few expenses, and enter:

```
Name: Reviewer account
Username: <reviewer email you created>
Password: <its password>
Instructions:
1. Open Vittova. On the sign-in screen, under "Email login", enter the
   credentials above and sign in (do not use "Continue with Google").
2. Allow a few seconds on first launch while the server wakes up.
3. Onboarding can be skipped with "Skip".
4. Automatic payment detection is optional: Dashboard → "Enable Notification
   Access". It only reads notifications from supported UPI and bank apps.
No OTP, payment or bank connection is needed.
```

Do not use your personal account. Keep the reviewer account working for as long
as the app is published.

### 3.3 Ads
**No**, the app does not contain ads.

### 3.4 Content rating (IARC questionnaire)
- Category: **All other app types** (finance utility). **Verify** the category names.
- Violence, sexuality, language, controlled substances, gambling: **No** to all.
- Users can interact or exchange content: **Yes**. Group Pool members see each
  other's names and the shared expenses they add to a group they joined by
  invite code. No chat, photos or public profiles.
- Shares the user's current location: **No**.
- Digital purchases: **No** (Vittova Pro cannot be bought).
- Unrestricted internet or web browsing: **No**.

### 3.5 Target audience and content
- Target age groups: **18 and over** only.
- Appeals to children: **No**.

### 3.6 News app
**No**.

### 3.7 Health apps
**No health features**.

### 3.8 Government apps
**No**.

### 3.9 Financial features
Declare the personal-finance / budgeting tool option. Vittova:
- tracks the user's own expenses, budgets and shared bills;
- gives general financial education (not investment advice; not a
  SEBI-registered adviser);
- does **not** lend money, offer credit, trade securities or crypto, hold funds,
  or make or receive payments (Group Pool only records settle-ups; money moves
  in the user's own UPI app).

If Play offers only regulated categories (loans, banking, payments, trading…),
choose **none of these** or the budgeting/"other" option. **Verify** the
current list; do not select a lending or investment category.

### 3.10 Data safety

Answer from `PRIVACY_DATA_INVENTORY.md`. Under Play's definitions, sending data to
a **service provider** that processes it on your behalf (Supabase, Render,
Vercel, Google Gemini) is **not "sharing"**. **Verify** this definition in the
form's help text before answering "No" to sharing.

**Overview**
| Question | Answer |
|---|---|
| Does the app collect or share any required user data types? | Yes |
| Is all user data encrypted in transit? | Yes |
| Do you provide a way for users to request that their data is deleted? | Yes: in-app (Settings → Delete account) and `https://vittova.in/delete-account` |

**Data types**

| Play data type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **Email address** | Yes | No | No | Required | App functionality, Account management |
| Financial info → **Other financial info** (expense amounts, categories, payees, budget, bills) | Yes | No | No | Required | App functionality |
| Photos and videos → **Photos** (receipt scan) | Yes | No | **Yes** (not stored) | Optional | App functionality |
| App activity → **App interactions** (open, sign-in outcome, expense added, etc.) | Yes | No | No | Required | Analytics |
| App activity → **Other user-generated content** (AI coach questions) | Yes | No | No | Optional | App functionality |
| App info and performance → **Crash logs** (error class only) | Yes | No | No | Required | Analytics |
| App info and performance → **Diagnostics** | Yes | No | No | Required | Analytics |
| Device or other IDs (random installation ID created by the app) | Yes | No | No | Required | Analytics |

**Do not declare** (not collected): location, contacts, SMS or call log,
messages, calendar, health, audio, files and docs (bank statement import is
not available; declare it if you enable it), web browsing, purchase history,
payment card or bank account numbers, advertising ID.

**Notification data:** supported payment notifications are parsed **on the
device** and nothing leaves the phone unless the user taps *Add expense*, and
then it becomes an expense (already declared as financial info). On-device-only
processing is not "collected" under Play's definition. **Verify**.

**Security practices:** data encrypted in transit: Yes. Deletion: Yes.
Independent security review: No.

### 3.11 Account deletion (part of Data safety)
- Deletion URL: `https://vittova.in/delete-account`
- Deletes: login, profile, expenses, bills, score and streak history, import
  history, coach conversations, created group pools.
- Partial deletion: users can delete individual expenses in the app.
- Retained: backups until normal expiry; limited server logs (no amounts or
  notification text).

### 3.12 Sensitive permissions and APIs
The merged release manifest requests **only** `INTERNET` (plus an Android
system receiver permission declared by the app itself). There is **no** SMS,
call log, location, contacts, storage, camera, accessibility or
`QUERY_ALL_PACKAGES` permission, so no Permissions Declaration Form applies.

**Notification access** (`NotificationListenerService`, bound with
`BIND_NOTIFICATION_LISTENER_SERVICE`) is still personal and sensitive data
under the User Data policy. If Play asks:

> Vittova uses Android Notification Access only when the user turns it on, to
> detect completed payments from supported UPI and bank apps (Google Pay,
> PhonePe, Paytm, BHIM and others listed in the privacy policy) and offer to
> log them as expenses. Notifications from all other apps are ignored without
> being read. From a supported notification the app keeps only the amount,
> payee, app name and time on the device for at most 7 days; nothing is
> uploaded unless the user taps "Add expense". The app does not read SMS.

**Prominent disclosure (in-app):** Onboarding → the notification screen, and
Dashboard → "Enable Notification Access". Both explain the use before Android
Settings opens. Keep a 30–60 second screen recording of this flow on the
release build ready to upload if asked.

---

## 4. Test and release

### 4.1 Signing
Enrol in **Play App Signing** when uploading the first bundle. Keep the upload
key (`vittova-upload.jks`) and its passwords backed up.

Google sign-in uses Supabase's **web** OAuth client, so no Android OAuth client
or SHA-1 fingerprint is needed for it.

### 4.2 Internal testing (first)
Upload the signed `.aab` → add yourself and a few testers → install from the
Play link and repeat the device tests on this Play-installed build. Play
installs are not affected by Android's "Restricted setting" for Notification
Access, which only applies to APK files installed by hand.

### 4.3 Closed testing
Personal developer accounts created after November 2023 must run a **closed
test with at least 12 testers opted in for 14 consecutive days** before they can
apply for production access. **Verify** the current numbers on the Dashboard
of your developer account; organisation accounts are exempt.

### 4.4 Production
Apply for production access → roll out to 10–20% first → watch Android vitals
(crashes and ANRs) and the Owner Console (`https://vittova.in/admin`) for a few
days before 100%.

### 4.5 Every upload
- Increase `versionCode` in `frontend/android/app/build.gradle` (it must go up
  by at least 1 each upload); set `versionName` to the user-facing version.
- Release notes (en-IN), for example:

```
First release of Vittova.
• Track expenses and see what you can safely spend today
• Optional automatic detection of UPI payment notifications
• Vittova AI answers from your own spending data
• Split shared bills with Group Pool
```

---

## 5. Legal pages

| Page | URL | Source |
|---|---|---|
| Privacy Policy | `https://vittova.in/privacy` | `frontend/public/legal/privacy.html` (in-app: `src/pages/PrivacyPolicy.jsx`) |
| Terms of Service | `https://vittova.in/terms` | `frontend/public/legal/terms.html` (in-app: `src/pages/TermsOfService.jsx`) |
| Account deletion | `https://vittova.in/delete-account` | `frontend/public/legal/delete-account.html` (in-app: `src/pages/DeleteAccountInfo.jsx`) |

The web URLs are static HTML with no JavaScript, so Play reviewers can read
them even if the web app fails to load. `frontend/tests/legalPages.test.js`
fails if the static and in-app copies drift apart; change both together and
update `POLICY_LAST_UPDATED` in `src/lib/legal.js`.

**Recommended before production (owner / legal):**
- Have a lawyer review the Privacy Policy and Terms for India's Digital Personal
  Data Protection Act 2023 and IT Rules. In particular: whether a named
  grievance officer and postal address must be published, and the
  limitation-of-liability wording (changed on 2026-09-17 from a cap tied to Pro
  payments, which cannot be made, to "to the extent permitted by applicable law").
- Add the legal name of the person or company that operates Vittova if your
  lawyer advises it. Play also shows your developer name and contact details
  from the developer account.
- Confirm the Gemini API plan and whether Google may use submitted content
  under it, and reflect that in section 4 of the Privacy Policy if needed.
