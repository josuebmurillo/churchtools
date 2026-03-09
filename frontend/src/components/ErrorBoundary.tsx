import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('UI error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app app--single">
          <main className="main">
            <div className="module-panel">
              <div className="module-summary">
                <div>
                  <h3>Se produjo un error</h3>
                  <p>Recarga la página para continuar.</p>
                </div>
              </div>
            </div>
          </main>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
