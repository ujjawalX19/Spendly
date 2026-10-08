import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The typeface ships inside the app: it works offline and nothing is fetched
// from a font service.
import '@fontsource-variable/inter'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initTelemetry } from './lib/telemetry'

initTelemetry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
