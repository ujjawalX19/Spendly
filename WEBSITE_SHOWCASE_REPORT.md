# Website showcase: route migration and test report (8 Nov 2026)

Branch `feat/website-showcase`, from `feat/vittova-2`. **Not deployed.** The Android app is built from the same code, so every change below applies to the website only (`!Capacitor.isNativePlatform()` in `App.jsx`). Backend, accounts, database and Android sign-in are unchanged.

## Route migration

| Route | Before (website) | Now (website) | Android app |
|---|---|---|---|
| `/` | Homepage with sign-up buttons | Homepage, every CTA goes to Google Play | Unchanged (Home) |
| `/features` | — | New feature showcase, 15 features | Not routed |
| `/demo` | — | New interactive demo, sample data only | Not routed |
| `/download` | — | New: Play button, QR code, steps | Not routed |
| `/pro` | Paywall (and Razorpay passes on this branch) | Pro showcase, links to Google Play | Unchanged (paywall) |
| `/about` | — | New | Not routed |
| `/login`, `/signup`, `/forgot-password`, `/welcome` | Working sign-in | "Full experience is in the Android app" page | Unchanged |
| `/dash`, `/transactions`, `/pool`, `/pool/:id`, `/bot`, `/wealth`, `/settings`, `/graveyard`, `/import`, `/subscription-audit`, `/challenges`, `/save-to-earn`, `/rewards`, `/rewards/recap`, `/goals`, `/budgets`, `/reports`, `/calendar`, `/alerts`, `/wrapped`, `/money-saved` | Working app screens | Same "Android app" page | Unchanged |
| `/reset-password`, `/auth/callback` | Email links | **Kept**, Android users' email links land here | Unchanged |
| `/privacy`, `/terms`, `/delete-account`, `/support`, `/students`, `/young-professionals` | Legal and help | Kept | — |
| `/vittova-ops` | Owner Console | Unchanged, own bundle and admin checks | — |
| Anything else | Home | Home | Home |

## Removed or locked on the website

Sign-in, sign-up and Google sign-in; all money screens; Pro purchase; Razorpay checkout (`paymentChannel` returns `none` on the web, so the checkout component can't be shown). Terms, Privacy and the FAQ no longer describe buying on vittova.in. Indus Appstore passes are unchanged.

**Limit:** this removes the website's sign-in and screens. It doesn't change the server, because the Android app uses the same API. Someone with their own account token could still call the API, which only ever returns their own data.

## Added

Feature showcase (shipped features use real app screenshots; next-update features say "Coming in the next update" and have no install button), interactive demo (fictional data, no network calls, nothing saved), Download page with QR, Pro showcase (shipped Pro features listed separately from next-update ones; ₹199 offer shown only while the server flag is on, with renewal price), mobile download bar, new navigation (Home, Features, Demo, Vittova Pro, About, Help, Download app), page titles and descriptions per page, sitemap entries, and website analytics events: `site_home_view`, `site_feature_view`, `site_demo_started`, `site_demo_completed`, `site_play_click` (with the button's placement), `site_qr_click`, `site_faq_open`, `site_pro_cta`. Every Play link uses `lib/playStore.js` with a `utm_*` referrer.

## Test results

- Website tests 211/211, including new website checks; server tests 562/562; lint clean.
- Browser at 375 px: 15 routes. All app and sign-in routes showed the Android page; no password field anywhere; every Play link was the verified listing; no sideways scroll; no unnamed buttons.
- Demo: clicking every tab and asking a question made 0 network requests and saved nothing.
- Android debug build and unit tests pass; its routes are a separate block from the website's and are unchanged.

## Owner actions and open items

1. **Official Google Play badge:** the buttons are text buttons. Google's badge image must come from Google's badge generator and follow its brand rules; download it and I'll add it.
2. **Screenshots:** they are from the 1.1 app (8 Oct) and include the store headline. Fine to use; new ones are needed when the next update ships.
3. **When vc34 is live on Play,** set `NEXT_UPDATE_LIVE = true` in `lib/siteFeatures.js` so those features show as available.
4. **Deploy:** the website and the server change (new analytics events allowed) go out together. Approval needed.
5. Not done: a Lighthouse performance run, and analytics checked end to end on production.
