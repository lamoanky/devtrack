import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'md',
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)

  // Escape to dismiss, and lock the page behind the dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-on-surface/25 p-md pt-[10vh] animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${WIDTHS[width]} rounded-lg border border-outline-variant bg-background shadow-overlay animate-pop-in`}
      >
        <header className="flex items-start justify-between gap-md border-b border-outline-variant px-md py-sm">
          <div>
            <h2 className="text-headline-sm text-on-surface">{title}</h2>
            {description && (
              <p className="mt-[2px] text-body-sm text-on-surface-variant">{description}</p>
            )}
          </div>
          <button className="btn-ghost btn-sm -mr-sm" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="px-md py-md">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-sm border-t border-outline-variant bg-surface px-md py-sm">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
