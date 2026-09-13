# Spendly — web and Android app

React 19 + Vite + Tailwind, packaged for Android with Capacitor 8.

```bash
npm install
npm run dev        # web dev server (proxies /api to localhost:5000)
npm test           # unit tests (node:test)
npm run lint
npm run build      # production web build into dist/
npx cap sync android
```

Configuration is read at build time from `.env` / `.env.production`
(see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_API_URL`, and optionally `VITE_SUPPORT_EMAIL`.

Android build and release steps: see `../RELEASE.md`.
Auth deep links and required Supabase settings: `../AUTH_DEEP_LINKS.md`.
