import React from 'react';

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
    console.error('🔴 ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1115',
          color: '#e4e4e7',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '2rem',
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            background: '#1a1b23',
            borderRadius: '16px',
            border: '1px solid rgba(239,68,68,0.3)',
            padding: '2rem',
          }}>
            <h1 style={{ color: '#ef4444', fontSize: '1.5rem', marginBottom: '1rem' }}>
              ⚠️ Something went wrong
            </h1>
            <pre style={{
              background: '#0a0a0f',
              color: '#fbbf24',
              padding: '1rem',
              borderRadius: '8px',
              overflow: 'auto',
              fontSize: '0.8rem',
              lineHeight: '1.5',
              maxHeight: '300px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem',
                padding: '0.6rem 1.5rem',
                background: '#a3e635',
                color: '#0f1115',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
