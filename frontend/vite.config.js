import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Without these, src/lib/supabaseClient.js throws on load and the app is a
  // blank screen (versionCode 10 shipped that way from a checkout with no
  // .env.local). Fail the build instead of producing it.
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !env[k])
    if (missing.length) throw new Error(`Build needs ${missing.join(' and ')} (frontend/.env.local or the environment).`)
  }
  return {
  plugins: [react(), tailwindcss()],
  // Reported by web telemetry as the app version (Android reports its versionName).
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
  }
})
