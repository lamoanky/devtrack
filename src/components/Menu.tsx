import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

interface MenuProps {
  /** Accessible name for the trigger button. */
  label: string
  /** Contents of the trigger button. */
  trigger: ReactNode
  triggerClassName: string
  /** Receives `close` so items can dismiss the menu after acting. */
  children: (close: () => void) => ReactNode
  className?: string
}

/** A button that opens a right-aligned dropdown; closes on outside click or Escape. */
export function Menu({ label, trigger, triggerClassName, children, className = 'w-56' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full z-50 mt-xs animate-pop-in rounded-lg border border-outline-variant bg-surface-container-lowest py-xs shadow-overlay ${className}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: string
  children: ReactNode
  onSelect?: () => void
  /** Renders as a link (e.g. a download) instead of a button. */
  href?: string
  danger?: boolean
  iconFill?: boolean
  iconClassName?: string
}

export function MenuItem({
  icon,
  children,
  onSelect,
  href,
  danger = false,
  iconFill = false,
  iconClassName,
}: MenuItemProps) {
  const className = `flex w-full items-center gap-sm px-md py-[6px] text-left text-body-md hover:bg-surface-container-high ${
    danger ? 'text-error' : 'text-on-surface'
  }`
  const glyph = (
    <Icon
      name={icon}
      size={18}
      fill={iconFill}
      className={iconClassName ?? (danger ? 'text-error' : 'text-on-surface-variant')}
    />
  )

  if (href) {
    return (
      <a role="menuitem" className={className} href={href} onClick={onSelect}>
        {glyph}
        {children}
      </a>
    )
  }
  return (
    <button role="menuitem" className={className} onClick={onSelect}>
      {glyph}
      {children}
    </button>
  )
}

export function MenuDivider() {
  return <div className="my-xs h-px bg-outline-variant" />
}
