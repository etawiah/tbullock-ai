import React from 'react'

// Shows a recovery screen instead of a blank page if any part of the app
// throws while rendering. Your data is stored on the server, so reloading is safe.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{ padding: '32px 20px', textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827' }}>
        <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Something went wrong</p>
        <p style={{ fontSize: '15px', color: '#4b5563', marginBottom: '20px' }}>
          Your bar data is safe. Reload to continue.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ minHeight: '48px', padding: '12px 28px', fontSize: '16px', fontWeight: 600, color: 'white', background: '#5b4bd1', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
        >
          Reload
        </button>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '20px', wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</p>
      </div>
    )
  }
}
