# Vittova Roadmap

Ordered by what keeps people coming back, not by what is most interesting to
build. Vittova does not need to be the biggest finance app in India before it
launches. It needs to be simple, trustworthy, fast, and different enough to
remember.

The loop the whole product should serve:

> **Track → Understand → Get an insight → Take an action → Save money → Return**

Anything that does not feed that loop is a distraction.

---

## Launch

Ship when the core loop works and nothing lies to the user.

**Must be true**

Automatic UPI tracking that is right far more often than it is wrong, and
silent when it is unsure. A dashboard that answers *what did I spend, what can
I still spend, where is it going* in one glance. Safe-to-Spend with its
assumptions shown. Expense add, edit, delete, export. Account deletion. Google
and email sign-in that stay inside the app.

**Deliberately not at launch**

Play Billing, if it is not fully verified server-side. A free app that works is
worth more than a paid app that cannot take payment. Income tracking beyond
acknowledging that money arrived. Family and shared budgets. Bank integrations.

**The differentiator to lead with:** Safe-to-Spend. Every other Indian expense
app tells you what you *spent*. Telling someone "you can spend about ₹850 a day
until your salary lands" is a different product — it is advice, not a receipt.

---

## First 30 days

The goal is retention past week two, which is where expense trackers die. The
failure mode is always the same: logging feels like work and gives nothing
back.

**Transaction list with search and filter.** The API already supports it
(`?q=`, category, date and amount ranges, four sorts, pagination). Without the
screen, users cannot find last month's Swiggy spend, which is the single most
common thing they want.

**Onboarding, three screens.** Track, understand, improve — then ask for
notification access *in context*, after explaining what it does. Asking for
notification access on a cold start with no explanation is why most users say
no, and a user who says no never sees the product's best feature.

**Weekly spending insight.** "You spent 38 % more on food this week than your
usual." One notification, weekly, not daily. This is the cheapest retention
mechanism available and it feeds the loop directly.

**Subscription detection surfaced properly.** The backend already detects
recurring payments. Show the monthly total, the annualised total, and what is
coming up. "You're paying ₹4,788 a year for things you may have forgotten" is
the kind of sentence people screenshot.

**Apply the error helper everywhere.** Users still see raw failures on several
screens. In a money app, an unexplained error reads as lost data.

---

## 90 days

**Monthly money report.** Income, expenses, savings, top category, unusual
spending, subscription cost, budget performance, one suggested action. Delivered
on the 1st. This is the strongest natural return trigger the product has: it
arrives, the user sees progress, they come back. Build the notification and the
report together — a report nobody is told about does nothing.

**Financial goals.** Emergency fund, phone, trip, bike. Target, progress,
required monthly saving, estimated completion. Goals plus progress
notifications are the second return loop.

**"Where did my money go?"** A plain-English month-over-month diff: "Your
spending rose ₹3,200, mainly because food delivery rose ₹1,850." Computing this
is easy; the value is entirely in the sentence.

**AI coach that answers real questions.** Can I afford this? Why did I
overspend? What should I cut? When will I reach my goal? The coach must reason
over the user's actual aggregates, and it must say when it does not know. A
finance chatbot that confidently invents a number is worse than none.

**Monetisation, properly.** Free keeps unlimited manual tracking, the
dashboard, basic categories and basic reports — locking basic expense tracking
behind a paywall would kill the product. Pro gets unlimited AI, anomaly
detection, advanced reports and goals, subscription intelligence, and export
automation. No dark patterns, no fake urgency, and no purchase button that
cannot complete a purchase.

**Crash monitoring and privacy-conscious analytics.** Events only —
`app_open`, `signup`, `expense_added`, `goal_created`, `ai_used`, `pro_viewed`,
`purchase_started`, `purchase_completed`. Never amounts, payees, descriptions,
tokens or email addresses.

---

## Six months

**Recurring-payment intelligence.** Predict upcoming debits, warn before an EMI
or SIP lands when the balance is thin, and fold that into Safe-to-Spend. This
is where Safe-to-Spend stops being arithmetic and starts being genuinely
useful.

**Shared budgets and family accounts.** The group-splitting code already
exists; this is the productised version. Also the strongest organic growth
channel the app has, because it requires inviting someone.

**Advanced reports.** Category trends over time, year in review, tax-relevant
summaries.

**Credit-card bill tracking.** Due dates, minimum versus full payment, and the
cost of paying only the minimum. High value in India and largely unserved.

**Bank integrations (account aggregator).** Real coverage instead of
notification scraping. Significant regulatory and integration work — worth
doing only once the loop above is proven, and never as a substitute for it.

**Credit-score awareness.** Useful, but it invites regulatory scope. Treat as
informational only unless you are prepared for the compliance work.

---

## Growth, without spam

The honest loops are the ones already in the product.

The monthly report gives a reason to return each month. Goal progress gives a
reason to return each week. A spending insight that names a specific,
actionable number gives a reason to act today. Shared budgets bring a second
person in because the feature does not work alone.

What to avoid: referral schemes that pay for installs, daily streak nags,
notifications with nothing to say, and anything that treats the user's
attention as inventory. This is an app people let watch their money. Trust is
the entire moat.

---

## Explicitly not planned

Lending, investment advice with specific recommendations, and payments. Each
carries Indian regulatory obligations that a solo developer cannot absorb, and
each would change what Vittova is. Keep investment content informational, and
keep the disclaimer visible.
