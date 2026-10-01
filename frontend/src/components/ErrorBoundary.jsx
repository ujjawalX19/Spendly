import React from 'react';
import { flushTelemetry, track } from '../lib/telemetry';

/**
 * The screen shown if the app itself breaks. People see a calm, branded
 * message and one way forward; the error text and component stack are shown
 * only in a development build (they are developer information, and can contain
 * the person's own data).
 *
 * Inline styles on purpose: this must render even if the stylesheet or a
 * component library is what failed.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Error class only (e.g. TypeError): messages and stacks can contain user data.
    track('app_crash', { kind: /^[A-Za-z]{1,40}$/.test(error?.name || '') ? error.name : 'Error' });
    flushTelemetry();
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const dev = Boolean(import.meta.env?.DEV);
    return (
      <div role="alert" style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0B1220', color: '#F4F4F5', padding: '24px',
        fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
      }}>
        <div style={{ maxWidth: '380px', width: '100%', textAlign: 'center' }}>
          <img src="/vittova-mark.svg" alt="" width="56" height="56" style={{ display: 'block', margin: '0 auto 20px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '15px', lineHeight: 1.5, color: '#A1A1AA', margin: 0 }}>
            Vittova hit a problem and couldn&rsquo;t show this screen. Your data is safe. Reopen the app to carry on.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '24px', minHeight: '48px', width: '100%', padding: '0 20px',
              background: '#A3E635', color: '#0B1220', border: 'none', borderRadius: '14px',
              fontWeight: 800, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Reopen Vittova
          </button>
          {dev && (
            <pre style={{
              marginTop: '24px', textAlign: 'left', background: '#05080F', color: '#FBBF24', padding: '12px',
              borderRadius: '8px', overflow: 'auto', fontSize: '12px', lineHeight: 1.5, maxHeight: '260px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
