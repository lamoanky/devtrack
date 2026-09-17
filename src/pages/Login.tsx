import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { Icon } from '../components/Icon'
import type { User } from '../types'

/** The slice of Google Identity Services we use. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string
        callback: (response: { credential: string }) => void
      }): void
      renderButton(
        parent: HTMLElement,
        options: { theme?: string; size?: string; width?: number; text?: string; shape?: string },
      ): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client'

function loadGoogleScript(): Promise<GoogleIdentity> {
  if (window.google?.accounts) return Promise.resolve(window.google)
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', () =>
      window.google ? resolve(window.google) : reject(new Error('Google sign-in failed to load')),
    )
    script.addEventListener('error', () => reject(new Error('Google sign-in failed to load')))
  })
}

interface Props {
  onSignedIn: (user: User) => void
}

export function Login({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [googleClientId, setGoogleClientId] = useState<string | null | undefined>(undefined)
  const googleButton = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.auth.config().then(
      (config) => setGoogleClientId(config.googleClientId),
      () => setGoogleClientId(null),
    )
  }, [])

  useEffect(() => {
    if (!googleClientId) return
    let cancelled = false
    loadGoogleScript().then(
      (google) => {
        if (cancelled || !googleButton.current) return
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            setError(null)
            setBusy(true)
            try {
              const { user } = await api.auth.google(credential)
              onSignedIn(user)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
              setBusy(false)
            }
          },
        })
        google.accounts.id.renderButton(googleButton.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'rectangular',
        })
      },
      (err: Error) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [googleClientId, onSignedIn])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { user } =
        mode === 'signin'
          ? await api.auth.login(username, password)
          : await api.auth.register(username, password)
      onSignedIn(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'signin' ? 'register' : 'signin')
    setError(null)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface p-md">
      <div className="w-full max-w-sm">
        <div className="mb-lg flex flex-col items-center gap-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-on-primary">
            <Icon name="conversion_path" size={24} />
          </span>
          <h1 className="text-headline-md text-on-surface">
            {mode === 'signin' ? 'Sign in to DevTrack' : 'Create your account'}
          </h1>
        </div>

        <div className="card p-lg shadow-card">
          <form className="flex flex-col gap-md" onSubmit={submit}>
            <div>
              <label className="label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                className="field"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="field"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {mode === 'register' && (
                <p className="mt-xs text-body-sm text-on-surface-variant">At least 8 characters.</p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-xs rounded-md border border-error/30 bg-error/5 px-sm py-[6px] text-body-sm text-error"
              >
                <Icon name="error" size={16} className="mt-[1px]" />
                {error}
              </p>
            )}

            <button className="btn-primary w-full" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="my-md flex items-center gap-sm text-body-sm text-on-surface-variant">
            <span className="h-px flex-1 bg-outline-variant" />
            or
            <span className="h-px flex-1 bg-outline-variant" />
          </div>

          {googleClientId ? (
            <div ref={googleButton} className="flex min-h-[44px] justify-center" />
          ) : (
            <button
              className="btn-default w-full"
              type="button"
              disabled
              title={
                googleClientId === null
                  ? 'Set GOOGLE_CLIENT_ID in .env on the server to enable Google sign-in'
                  : undefined
              }
            >
              <GoogleMark />
              Continue with Google
            </button>
          )}
          {googleClientId === null && (
            <p className="mt-xs text-center text-body-sm text-on-surface-variant">
              Google sign-in isn't set up on this server yet.
            </p>
          )}
        </div>

        <p className="mt-md text-center text-body-md text-on-surface-variant">
          {mode === 'signin' ? 'New to DevTrack?' : 'Already have an account?'}{' '}
          <button className="font-medium text-primary hover:underline" onClick={switchMode}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
