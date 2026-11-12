# Vittova AI evaluation report (12 Nov 2026)

## Automated tests (stubbed model, synthetic data)

| Suite | Result |
|---|---|
| Server (includes 29 coaching tests in `tests/aiCoach.test.js`) | 590 / 590 |
| Website (includes `tests/aiCoachClient.test.js`) | 214 / 214 |
| Database rules (includes v1_19) | 121 / 121 |

Covered: brief scenarios 1–7, 9–20 (8, multiple accounts and transfers, does not apply: Vittova imports no transfers). Isolation, injection, confirmation, memory consent, deletion, Hinglish, off-topic, stock tips, duplicates, figure-keeping.

## Real-model evaluation (Gemini `gemini-3.5-flash`, synthetic users, local fake database)

18 scenarios, run four times. The key's free quota limited how many reached the model.

| Run | Answered by the model | Generic fall-through replies | Notes |
|---|---|---|---|
| 1 (before fixes) | 3 of 18 (then quota) | **7** | overspending, goal, bills, distress, freelancer, "went up", Hinglish |
| 2 (after fixes) | 10 of 18 | **1** (the injection attempt, by design) | median 2.3 s |
| 3 | 1 of 18 | — | quota |
| 4 (final) | 0 of 18 | 2 → fixed to 1 (Hinglish added, retested in automated suite) | quota |

### Quality review of the 10 real-model answers (run 2)

- **Figures:** every figure checked against the draft; no invented numbers reached the user (the grounding check would have blocked them).
- **Empathy:** the distress answer opened with an acknowledgement and stayed practical.
- **Honesty:** income was said to be unknown, not guessed; the ₹1,00,000-in-2-months target got "₹48,000 more than your current target".
- **Hinglish:** natural and correct ("Aapke paas ₹15,313 bache hain").
- **Two defects found and fixed:** the model claimed Vittova had no merchant details (false), and repeated the income footnote in nearly every answer. The instructions now forbid both. **Not yet re-verified with the real model** because of the quota.

## Not measured

Answer helpfulness from real users (feedback buttons now exist), cost per answer, budget adherence over time, real-device behaviour.

The evaluation script is local only and used made-up data.
