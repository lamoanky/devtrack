import type { Status } from '../types'

export interface StatusMeta {
  label: string
  icon: string
  /** Tailwind classes for the badge pill. */
  chip: string
  /** Bar/dot fill used in charts and the pipeline rail. */
  fill: string
  /** Statuses past this point are terminal. */
  terminal?: boolean
}

export const STATUS_META: Record<Status, StatusMeta> = {
  saved: {
    label: 'Saved',
    icon: 'bookmark',
    chip: 'bg-surface-container-high text-on-surface-variant border-outline-variant',
    fill: 'bg-on-surface-variant/40',
  },
  applied: {
    label: 'Applied',
    icon: 'send',
    chip: 'bg-primary/10 text-primary border-primary/20',
    fill: 'bg-primary',
  },
  oa: {
    label: 'Pending OA',
    icon: 'terminal',
    chip: 'bg-attention/10 text-attention border-attention/20',
    fill: 'bg-attention',
  },
  screened: {
    label: 'Screened',
    icon: 'phone_in_talk',
    chip: 'bg-attention/10 text-attention border-attention/20',
    fill: 'bg-attention/70',
  },
  interview: {
    label: 'Interview',
    icon: 'record_voice_over',
    chip: 'bg-done/10 text-done border-done/20',
    fill: 'bg-done',
  },
  offer: {
    label: 'Offer',
    icon: 'task_alt',
    chip: 'bg-success/10 text-success border-success/20',
    fill: 'bg-success',
    terminal: true,
  },
  rejected: {
    label: 'Rejected',
    icon: 'cancel',
    chip: 'bg-error/10 text-error border-error/20',
    fill: 'bg-error',
    terminal: true,
  },
  ghosted: {
    label: 'Ghosted',
    icon: 'do_not_disturb_on',
    chip: 'bg-surface-container-high text-on-surface-variant border-outline-variant',
    fill: 'bg-outline',
    terminal: true,
  },
}

export const ACTIVE_STATUSES: Status[] = ['saved', 'applied', 'oa', 'screened', 'interview', 'offer']

export const LOCATION_ICON: Record<string, string> = {
  onsite: 'apartment',
  remote: 'public',
  hybrid: 'domain',
}

export const LOCATION_LABEL: Record<string, string> = {
  onsite: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
}
