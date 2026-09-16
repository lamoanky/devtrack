import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type ToastTone = 'info' | 'success' | 'error'

interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  notify: (message: string, tone?: ToastTone) => void
  /** Runs `task`, surfacing any thrown error as a toast. Returns undefined on failure. */
  attempt: <T>(task: () => Promise<T>, success?: string) => Promise<T | undefined>
}

const ToastContext = createContext<ToastApi | null>(null)

const TONE: Record<ToastTone, { icon: string; className: string }> = {
  info: { icon: 'info', className: 'border-outline-variant bg-background text-on-surface' },
  success: { icon: 'check_circle', className: 'border-success/30 bg-success/10 text-success' },
  error: { icon: 'error', className: 'border-error/30 bg-error/10 text-error' },
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId++
    setToasts((current) => [...current, { id, tone, message }])
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000)
  }, [])

  const attempt = useCallback(
    async <T,>(task: () => Promise<T>, success?: string) => {
      try {
        const result = await task()
        if (success) notify(success, 'success')
        return result
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), 'error')
        return undefined
      }
    },
    [notify],
  )

  const value = useMemo(() => ({ notify, attempt }), [notify, attempt])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-md right-md z-[60] flex flex-col gap-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex max-w-sm items-center gap-sm rounded-md border px-md py-sm text-body-md shadow-overlay animate-pop-in ${TONE[toast.tone].className}`}
          >
            <Icon name={TONE[toast.tone].icon} size={18} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
