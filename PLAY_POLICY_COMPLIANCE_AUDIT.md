# Play policy compliance audit, vc33 (23 Oct 2026)

**Code** = fixed or verified in the build. **Console** = only the owner can do it in Play Console.

| # | Requirement | Evidence | Status | Fix / owner action |
|---|---|---|---|---|
| 1 | Sensitive permissions used only as declared | merged manifest: RECEIVE_SMS and READ_SMS are the only restricted ones; asked only from a tap | PASS (code) | — |
| 2 | No dependency-added restricted permissions | `aapt2` badging of the release build | PASS | — |
| 3 | Prominent disclosure + consent before SMS access | onboarding step, `SmsAccessSheet`; not granted at launch (emulator `dumpsys`) | PASS (code); device run BLOCKED | owner records it in the demo video |
| 4 | Privacy policy and Terms reachable without login, matching the code | vittova.in/privacy is static and loads with no login; the SMS section matches `SmsIntake` | PASS | — |
| 5 | Data safety matches behaviour | SMS text stays on the device (not declared); the expense is uploaded (Financial info); Gemini only on request (declared) | PASS as documented in PLAY_DECLARATIONS_V1_1.md | Console: confirm unchanged |
| 6 | Ads | no ad SDK in the dependencies | PASS | Console: "No ads" |
| 7 | Target audience 18+, content rating | `PLAY_CONSOLE_SUBMISSION.md` §3.4–3.5 | Console | confirm |
| 8 | Listing matches the features | the listing leads with bank-SMS tracking, and it is implemented | PASS | — |
| 9 | Account deletion, in the app and on the web | Profile → Delete account; vittova.in/delete-account | PASS | — |
| 10 | Auth, session, logout | unit tests (authRecovery, googleSignIn); Google sign-in fixed 22 Oct | PASS (tests); reviewer login BLOCKED | REVIEW_CREDENTIALS_SETUP.md |
| 11 | Pro / billing | Play Billing verified on the server; reviewer gets a manual grant | PASS (code) | Console: reviewer instructions mention Pro is unlocked |
| 12 | AI financial guidance | "not investment advice / not SEBI-registered" notes (FINANCIAL_CONTENT_REVIEW.md); Financial features declaration = Other | PASS | — |
| 13 | No debug, secrets or sensitive logs | release not debuggable; the bundle secret scan passes; PipelineLog records event names only | PASS | — |
| 14 | Review-flow robustness | offline message; Render cold start of about 30 s is mentioned in the instructions | PASS / risk noted | — |
| 15 | Version, signing, integrity | 33 / 1.1.3, upload key, SHA-256 recorded | PASS | — |
| R | **Reviewer credentials (rejection finding)** | no reviewer account exists in the repo; the old instructions skipped SMS | **BLOCKED** | owner: create the account and App access text |
| R | **SMS declaration verifiable (rejection finding)** | sample preview added (code); a real-capture video is needed | code PASS; video **BLOCKED** | owner: record and link the video, and tick only "SMS-based money management" |
