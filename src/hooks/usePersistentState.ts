import { useCallback, useState } from 'react'

/**
 * `useState` that remembers its value in localStorage — for per-browser UI
 * preferences like collapsed panels. Storage can be unavailable (private
 * windows, blocked site data), so every access falls back to plain state.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? initial : (JSON.parse(stored) as T)
    } catch {
      return initial
    }
  })

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(previous) : next
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          // Not persisted this time; the in-memory value still applies.
        }
        return resolved
      })
    },
    [key],
  )

  return [value, update] as const
}
