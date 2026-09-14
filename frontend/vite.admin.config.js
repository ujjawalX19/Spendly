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
 *   npm run dev:admin     http://localhost:5174
 *   npm run build:admin   -> admin/dist  (deploy as its own site; see ADMIN_PANEL.md)
 *
 * Environment variables are read from frontend/.env* like the user app:
 * VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_ADMIN_API_URL
 * (falls back to VITE_API_URL). Never put a service-role key in any VITE_ var.
 */
export default defineConfig({
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
