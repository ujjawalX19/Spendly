# Deferred work

`peer-sessions-2026-09-13.patch` — uncommitted changes written by two other
Claude sessions (`paisa-buddy-ce`, `paisa-buddy-51`) at 11:18 on 2026-09-13,
while the P0 security pass was in progress. Also kept as `git stash@{0}`.

They were removed from the working tree, not deleted, by the owner's decision
("Keep P0, save theirs"), because they:

- reverted `backend/routes/ai.js` to the version that recommends named mutual
  funds, stocks and brokers and has no AI quota or rate limits;
- changed the fake purchase button to "Unlock Pro — ₹299 once" with no billing;
- added new features (subscription cancellation guides, pricing, a
  `cancelled_subscriptions` table with client write policies appended to an
  already-deployed migration) during a phase where new features were deferred.

To revisit in the growth phase: re-apply feature by feature on top of the P0
architecture. Keep server-side quotas, education-only coach content, no
purchase UI without server-verified billing, backend-only writes, and put any
schema change in a new migration file.
