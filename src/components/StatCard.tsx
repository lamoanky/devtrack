import { Icon } from './Icon'

interface Props {
  label: string
  value: number | string
  icon: string
  /** 0–100; renders a ring instead of a plain glyph when provided. */
  ring?: number
  hint?: string
}

export function StatCard({ label, value, icon, ring, hint }: Props) {
  return (
    <div className="card flex items-center justify-between gap-md p-md shadow-card transition-colors hover:bg-surface">
      <div className="flex min-w-0 flex-col gap-xs">
        <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
        <span className="text-display-lg text-on-surface">{value}</span>
        {hint && <span className="truncate text-body-sm text-on-surface-variant">{hint}</span>}
      </div>

      {ring === undefined ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface-variant">
          <Icon name={icon} size={20} />
        </span>
      ) : (
        <span className="relative h-11 w-11 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <path
              className="text-outline-variant"
              d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="text-primary transition-all duration-700 ease-out"
              d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(100, ring))}, 100`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-primary">
            <Icon name={icon} size={18} />
          </span>
        </span>
      )}
    </div>
  )
}
