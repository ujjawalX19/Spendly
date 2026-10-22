# Build report — vc32 (19 Oct 2026)

Commit `6a8e9ff` (branch `release/vc31`). Clean run: `node_modules`, `frontend/dist`, Android build directories and synced web assets deleted first; dependencies installed from lockfiles. Node 24.13.1, npm 11.8.0, OpenJDK 21, Gradle 8.14.3, AGP 8.13.0, build-tools 36.0.0.

| Step | Command | Exit | Result |
|---|---|---|---|
| Install | `npm ci` (backend, frontend, supabase/tests) | 0, 0, 0 | from lockfiles |
| Audit | `npm audit --omit=dev` (backend, frontend) | 0, 0 | 0 vulnerabilities (3 moderate dev-only in `@capacitor/cli`) |
| Backend tests | `npm test` | 0 | 465 passed, 0 failed, 0 skipped |
| Database tests (PGlite) | `npm test` | 0 | 97 passed, 0 failed, 0 skipped |
| Lint | `npm run lint` | 0 | 0 problems |
| Website + Owner Console | `npm run build:web` | 0 | chunk-size warning only (see audit #8) |
| Frontend tests | `npm test` | 0 | 163 passed, 0 failed, 0 skipped (needs `build:web` output first) |
| App web build | `npm run build` | 0 | `dist` without the Owner Console |
| Capacitor | `npx cap sync android` | 0 | — |
| Android | `gradlew --max-workers=2 clean` then `bundleRelease assembleRelease` | 0 | signed AAB + APK |
| Android tests + lint | `gradlew testDebugUnitTest lintRelease` | 0 | 107 JUnit passed, 0 failed; lint 0 errors / 26 warnings |

Not available: TypeScript type check (JavaScript project), Android instrumentation tests (none exist).

## Artifacts (`release-final/vc32/`)

| File | Version | Signature | SHA-256 |
|---|---|---|---|
| `Vittova-1.1.2-vc32.aab` | com.vittova.app 1.1.2 (32), min 24, target 36 | jarsigner verified; upload key SHA-1 3B:AE:EA:F4:06:E1:17:8C:2A:8B:81:C5:8B:75:39:8A:39:7F:8D:46 | ae64ac55a6dd4056951f32f327cfe902be3709b25f56cc1f53879b9f0bf08b88 |
| `Vittova-1.1.2-vc32.apk` | same | apksigner v2 verified, same certificate | dab5b7a9fbcd748a1980261ce9cf2dd0527f67f73c1f3685c69afd849dffaec9 |

Contents checked: permissions identical to vc29–vc31 (INTERNET, RECEIVE_SMS, READ_SMS, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, BILLING, ACCESS_NETWORK_STATE, own dynamic-receiver permission); not debuggable; 66 web asset files; 0 Owner Console files; no keystore, env or key files. Signing files were copied in for the build and deleted afterwards.

Emulator (Pixel 7 AVD): installed, cold start 4.8 s, no crash or fatal exception, sign-in screen correct, correct at 1.3× font scale.

`release-final/vc31/` is superseded by vc32 (same source plus the audit fixes). Upload vc32 only.

## Re-check, 22 Oct 2026

- `sha256sum -c SHA256SUMS.txt` in `release-final/vc32/`: AAB OK, APK OK (artifacts unchanged).
- Release branch now `7354f13`: after `6a8e9ff` only documentation and a lockfile patch (Vite 7.3.7, follow-redirects 1.16.1). The app's web bundle rebuilt with the patch is **byte-identical** to the 90 web files inside the vc32 AAB, so vc32 corresponds to the current source; no rebuild needed.
- Clean install + tests at `7354f13`: backend 465/465, database 97/97, frontend 163/163, lint 0, `build:web` exit 0, production `npm audit` 0 (backend and frontend).
- Android build and JUnit not re-run today (no Android or app-code change since 19 Oct).
