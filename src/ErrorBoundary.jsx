import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  componentDidCatch(error, info) {
    // Save to state so UI can show it and also expose to window for debugging
    this.setState({ hasError: true, error, info })
    try {
      // Expose last error for debugging via browser console
      window.__LAST_APP_ERROR = { error: String(error), stack: error?.stack, info }
    } catch { /* ignore */ }
    // Also log to console so remote logging systems can pick it up from browser's logs
    // This is intentional: it helps capture runtime errors that otherwise render a blank screen.
    console.error('Uncaught app error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui,Segoe UI,Roboto,Helvetica,Arial', color: '#900' }}>
          <h2>Application error</h2>
          <p>The app encountered an error. Details are shown below and logged to the console.</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#f8f8f8', padding: 12, borderRadius: 6 }}>
            {String(this.state.error && this.state.error.stack ? this.state.error.stack : this.state.error)}
          </pre>
          <p>If this happened after signing a wallet transaction, please copy the console logs and share them.</p>
        </div>
      )
    }
    return this.props.children
  }
}
