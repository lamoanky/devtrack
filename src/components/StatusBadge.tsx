import { STATUS_META } from '../lib/status'
import type { Status } from '../types'
import { Icon } from './Icon'

export function StatusBadge({ status, className = '' }: { status: Status; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-xs rounded-full border px-sm py-[2px] text-body-sm font-medium ${meta.chip} ${className}`}
    >
      <Icon name={meta.icon} size={14} />
      {meta.label}
    </span>
  )
}
