# Financial content review

Date: 2026-09-13. Scope: everything in the Spendly app, API and marketing site
that discusses investing, returns, financial products or advice.

> **This is an engineering review, not legal advice.** Spendly has **not** been
> reviewed by a lawyer or a SEBI-registered professional. Do not describe the
> app as "SEBI compliant" or "SEBI approved" anywhere until that has actually
> happened. The items under *Needs professional review* must be signed off
> before launch.

---

## 1. What the app did before this review

| Area | Behaviour found | File (before) |
|---|---|---|
| AI coach, "investing" questions | Built a plan sized to the user's surplus that named **specific products**: "UTI Nifty 50 Index Fund Direct Growth", "Parag Parikh Flexi Cap Fund Direct Growth", "buy one share of **TCS or HDFC Bank**", and told the user **where** to buy ("Kuvera", "Zerodha", "Groww", "INDmoney") and **when** ("the 5th of next month"). | `backend/routes/ai.js` (`buildLocalPlan`) |
| AI coach, projections | "What this grows into" tables at a fixed **12%** annual return presented as the expected outcome. | `backend/routes/ai.js` |
| Chat UI | Action chips linking to `zerodha.com/?ref=SPENDLY`, `groww.in/refer/SPENDLY`, `kuvera.in/refer/SPENDLY` and "Buy Digital Gold" (Paytm). The referral codes were **invented**: no affiliate relationship exists. | `frontend/src/pages/Chatbot.jsx` |
| Second chatbot route (unused) | Prompt instructed the model to append the same referral links to every investing answer ("AFFILIATE MONETIZATION — IMPORTANT"), and to "scold" users. | `backend/routes/chatbot.js` |
| Wealth screen | "Investable surplus" with a **"Safe to invest"** badge; SIP projection "at ~12% historical average return", footnote "Based on historical Nifty 50 CAGR of ~12%"; button "Get AI Investment Advice: personalized plan". | `frontend/src/pages/Wealth.jsx` |
| Disclaimers | Component header comment "SEBI-compliant investment disclaimer"; text "not SEBI-regulated advice". | `frontend/src/components/InvestmentDisclaimer.jsx` |
| Burn-rate tip | AI prompt example suggested "Skip 3 Zomato orders" (brand names in generated tips). | `backend/routes/burnRate.js` |
| Paisa Score | Presented a "percentile" ("Top X% of users") that was just `score / 850`, and gave 200 points for merely entering an investment target. | `backend/routes/paisaScore.js`, `Dashboard.jsx` |
| Landing page | "auto-investing your spare change into a micro-savings vault". Nothing is invested and no money moves. | `frontend/src/pages/Landing/Features.jsx` |
| Terms of Service | Described a ₹99/month Play Billing subscription and consumable purchases that do not exist. | `frontend/src/pages/TermsOfService.jsx` |

## 2. Potential compliance concerns (why this was changed)

1. **Personalised product recommendations.** Recommending a named fund or
   stock, sized to an individual's finances, with a platform and timing, is
   the core of what the SEBI (Investment Advisers) Regulations, 2013 regulate.
   Spendly is not a registered investment adviser.
2. **Referral / affiliate links.** Linking recommendations to brokers,
   especially with referral codes, adds a conflict of interest and could look
   like undisclosed paid promotion. SEBI's 2024–25 rules restricting
   association with unregistered "finfluencers" are relevant for any future
   broker partnership. The codes used were also fabricated, which is simply
   misleading.
3. **Projected returns.** A constant 12% return presented as what money
   "grows into" reads as a promise. Return illustrations must be clearly
   hypothetical.
4. **Digital gold.** Digital gold products are not SEBI-regulated; promoting
   them carries its own risk.
5. **Google Play Financial Services policy.** Apps offering financial features
   must not be misleading, and declarations must match functionality.
   Invented affiliate codes, fake percentiles, "auto-investing" claims and a
   non-existent subscription all conflict with that.
6. **Unsupported compliance claims.** Calling a disclaimer "SEBI-compliant"
   asserts a status nobody verified.

## 3. Changes made

| Change | Where |
|---|---|
| Coach scope limited to explaining the user's own spending, affordability and saving, plus **general** financial education (emergency funds, how SIPs work, diversification, risk, costs, checking SEBI registration). | `backend/routes/ai.js`, `backend/lib/coachContent.js` |
| Model instructed never to name or recommend any stock, fund, ETF, bond, insurance, bank product, broker, trading app or platform; never to predict returns; never to include links; never to recommend F&O, crypto, chit funds or unregulated schemes. | `backend/routes/ai.js` |
| Deterministic fallback text rewritten: concepts only, no product names, no projections. A unit test asserts it never contains UTI, Parag, Nifty 50, TCS, HDFC, Zerodha, Groww, Kuvera, INDmoney, `http` or `ref=`. | `backend/lib/coachContent.js`, `backend/tests/financialLogic.test.js` |
| Output guardrail: links are stripped from every AI reply; investing answers always end with the education disclaimer; output length and token budget capped. Tested. | `backend/lib/coachContent.js`, `backend/tests/security.test.js` |
| Broker/gold chips and invented referral codes removed; "goal" selector that steered toward stocks/funds removed; placeholder text changed from "Where should I invest 5000 rs?" to spending questions. | `frontend/src/pages/Chatbot.jsx` |
| Unused affiliate chatbot route deleted. | `backend/routes/chatbot.js` (removed) |
| Wealth: "Safe to invest" badge and index-return claim removed; projection is now "How regular saving compounds", an illustration with a **user-chosen assumed rate** (4/6/8/10%, default 6%), showing amount put in rather than "returns", with a footnote that it is not a forecast or recommendation and real investments can lose value. | `frontend/src/pages/Wealth.jsx` |
| Disclaimer wording: "General financial education, not investment advice. Spendly is not a SEBI-registered investment adviser." No "SEBI-compliant" claims remain in code or copy. | `InvestmentDisclaimer.jsx`, `Chatbot.jsx`, `PrivacyPolicy.jsx`, `TermsOfService.jsx`, `coachContent.js` |
| Burn-rate AI tip: prompt forbids brand/product names and links; output links stripped. | `backend/routes/burnRate.js` |
| Paisa Score: fake percentile removed; every component is computed from the user's data and explained; labelled as not a credit score. | `backend/lib/paisaScore.js` |
| Landing copy: no "auto-investing"; round-ups described as a figure to set aside yourself. | `Landing/Features.jsx` |
| Terms: no subscription or purchase terms for products that do not exist. | `TermsOfService.jsx` |

## 4. Remaining financial features (post-change)

- Safe-to-Spend: arithmetic on the user's own budget, spending and bills.
- Spending forecast (burn rate): extrapolation of the current month's pace.
- Round-ups: a displayed number; no money is moved or held.
- Paisa Score: transparent spending-discipline score, not a credit score.
- Coach: spending explanations and general education (see scope above).
- Compounding illustration: user-chosen assumed rate, clearly hypothetical.

## 5. Needs professional / legal review before launch

1. Whether the **coach's general education**, grounded in the user's own
   figures ("you have ₹X left this month; here is how emergency funds work"),
   stays on the right side of personalised investment advice. Obtain written
   advice from an Indian securities lawyer or a SEBI-registered IA.
2. The exact **disclaimer wording** and where it must appear (every AI answer,
   the Wealth screen, store listing).
3. The **compounding illustration**: whether showing it next to the user's
   leftover budget is acceptable, and whether any rate should be shown at all.
4. **Google Play Financial Services declaration**: which category applies, and
   whether any licence/registration evidence is requested.
5. **DPDP Act 2023** obligations for financial data, including the age of users
   (the privacy policy now states 18+) and consent for notification access.
6. Any future **broker, fund or insurance partnership or affiliate programme**
   must be reviewed *before* implementation; none exists today.
7. **AI accuracy**: generated answers can be wrong. Confirm the in-app warning
   is sufficient.

## 6. Rules for future changes

- Never name, rank or link to a specific security, scheme, broker or platform
  in app copy or AI output without legal sign-off.
- Never present an assumed rate as expected or historical performance.
- Never add a referral/affiliate link without a real, disclosed agreement and
  review.
- Keep `backend/tests/financialLogic.test.js` (banned-terms test) and the
  link-stripping security test passing.
