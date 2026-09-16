import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
}

/**
 * Without this, any render error unmounts the whole tree and leaves a blank
 * white page with nothing to go on. Showing the message and stack on screen
 * turns "it's just white" into something actionable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    console.error('DevTrack crashed while rendering:', error, info.componentStack)
  }

  render() {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto max-w-3xl p-lg">
        <div className="rounded-lg border border-error/30 bg-error/5 p-md">
          <h1 className="mb-xs text-headline-md text-error">DevTrack hit an error</h1>
          <p className="mb-md text-body-md text-on-surface-variant">
            The page failed to render. The details below are also in the browser console.
          </p>

          <pre className="mb-md overflow-auto rounded-md border border-outline-variant bg-background p-sm font-mono text-code-md text-on-surface">
            {error.message}
          </pre>

          {error.stack && (
            <details className="mb-md">
              <summary className="cursor-pointer text-body-md text-on-surface">Stack trace</summary>
              <pre className="mt-xs max-h-64 overflow-auto rounded-md border border-outline-variant bg-background p-sm font-mono text-body-sm text-on-surface-variant">
                {error.stack}
              </pre>
            </details>
          )}

          {componentStack && (
            <details className="mb-md">
              <summary className="cursor-pointer text-body-md text-on-surface">
                Component stack
              </summary>
              <pre className="mt-xs max-h-64 overflow-auto rounded-md border border-outline-variant bg-background p-sm font-mono text-body-sm text-on-surface-variant">
                {componentStack}
              </pre>
            </details>
          )}

          <div className="flex gap-sm">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              className="btn-default"
              onClick={() => this.setState({ error: null, componentStack: null })}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
