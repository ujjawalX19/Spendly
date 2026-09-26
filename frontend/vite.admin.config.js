import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

/**
 * Owner admin panel — a separate web app, built separately.
 *
 * It lives in frontend/admin so it can share this package's dependencies, but
 * it is never part of the user app: `npm run build` (and therefore the
 * Capacitor/Android bundle, which syncs `dist/`) does not include it.
 *
 *   npm run dev:admin     http://localhost:5174/vittova-ops/
 *   npm run build:admin   -> admin/dist
 *   npm run build:web     user app -> dist/, console -> dist/admin/ (the Vercel
 *                         build for https://vittova.in/vittova-ops; never used for the
 *                         Android bundle, which runs `npm run build` only)
 *
 * Environment variables are read from frontend/.env* like the user app:
 * VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_ADMIN_API_URL
 * (falls back to VITE_API_URL). Never put a service-role key in any VITE_ var.
 */
export default defineConfig({
  // Served from https://vittova.in/vittova-ops/ by the existing Vercel project.
  base: '/vittova-ops/',
  root: fileURLToPath(new URL('./admin', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
