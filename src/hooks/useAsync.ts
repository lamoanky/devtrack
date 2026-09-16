import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  /** Re-run the loader. */
  refresh: () => void
  /** Replace the cached value locally without a round trip. */
  set: (next: T) => void
}

/**
 * Runs `loader` on mount and whenever `deps` change, discarding results from
 * requests that were superseded while in flight.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  // Only the newest run is allowed to write state.
  const runId = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    const current = ++runId.current
    setLoading(true)

    loaderRef.current().then(
      (value) => {
        if (runId.current !== current) return
        setData(value)
        setError(null)
        setLoading(false)
      },
      (err: unknown) => {
        if (runId.current !== current) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const set = useCallback((next: T) => setData(next), [])

  // Stable identity so callers can safely list the result in dependency arrays.
  return useMemo(
    () => ({ data, error, loading, refresh, set }),
    [data, error, loading, refresh, set],
  )
}

/** Debounces a rapidly-changing value (search boxes, editor autosave). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
