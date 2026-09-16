const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
})

const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

/** "2 days ago", "3 weeks ago", "just now". */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return ''

  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  const future = seconds < 0
  const abs = Math.abs(seconds)

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2629800, 'week'],
    [31557600, 'month'],
    [Infinity, 'year'],
  ]
  const divisors = [1, 60, 3600, 86400, 604800, 2629800, 31557600]

  if (abs < 45) return 'just now'

  const index = units.findIndex(([limit]) => abs < limit)
  const unit = units[index][1]
  const amount = Math.round(abs / divisors[index])

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  return rtf.format(future ? amount : -amount, unit)
}

/** Whole days since `value`, or null when there is no date. */
export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

/** Today as YYYY-MM-DD, in the browser's timezone. */
export function today(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function initials(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim()
  if (!cleaned) return '??'
  const words = cleaned.split(/\s+/)
  return (words.length === 1 ? cleaned.slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

/** Deterministic per-company tint so logos-by-initials stay stable across renders. */
const TINTS = [
  'bg-[#ddf4ff] text-[#0969da]',
  'bg-[#dafbe1] text-[#1a7f37]',
  'bg-[#fff8c5] text-[#9a6700]',
  'bg-[#ffebe9] text-[#cf222e]',
  'bg-[#fbefff] text-[#8250df]',
  'bg-[#ffe7f3] text-[#bf3989]',
  'bg-[#e6f6ff] text-[#0550ae]',
]

export function tintFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return TINTS[hash % TINTS.length]
}
