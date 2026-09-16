import type { ReactNode } from 'react'
import { Icon } from './Icon'

interface Props {
  icon: string
  title: string
  body: string
  action?: ReactNode
}

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-sm px-md py-xl text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface-variant">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="text-headline-sm text-on-surface">{title}</h3>
      <p className="max-w-sm text-body-md text-on-surface-variant">{body}</p>
      {action && <div className="mt-sm">{action}</div>}
    </div>
  )
}
