import { useMemo } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { Icon } from '../components/Icon'
import { StatCard } from '../components/StatCard'
import { EmptyState } from '../components/EmptyState'
import { STATUS_META } from '../lib/status'
import { daysSince } from '../lib/format'
import { STATUSES, type Application } from '../types'

interface Props {
  applications: Application[]
  revision: number
}

export function Analytics({ applications, revision }: Props) {
  const stats = useAsync(() => api.stats(), [revision])
  const data = stats.data

  /** Applications sitting in a non-terminal stage the longest. */
  const stale = useMemo(
    () =>
      applications
        .filter((a) => !STATUS_META[a.status].terminal && a.dateApplied)
        .map((a) => ({ application: a, days: daysSince(a.dateApplied) ?? 0 }))
        .sort((a, b) => b.days - a.days)
        .slice(0, 5),
    [applications],
  )

  if (stats.error) {
    return <p className="p-lg text-body-md text-error">{stats.error}</p>
  }

  if (!data) {
    return <p className="p-lg text-body-md text-on-surface-variant">Loading analytics…</p>
  }

  if (data.total === 0) {
    return (
      <EmptyState
        icon="monitoring"
        title="Nothing to measure yet"
        body="Add a few applications and this page will show conversion rates, weekly volume, and which roles are going stale."
      />
    )
  }

  const peakWeek = Math.max(1, ...data.weeks.map((w) => w.count))
  const funnelTop = Math.max(1, data.funnel[0]?.count ?? 1)

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-lg p-lg">
      <h1 className="text-headline-lg text-on-surface">Analytics</h1>

      <div className="grid grid-cols-1 gap-md sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Response rate"
          value={`${data.responseRate}%`}
          icon="mark_email_read"
          ring={data.responseRate}
          hint="Reached OA or beyond"
        />
        <StatCard
          label="Interview rate"
          value={`${data.interviewRate}%`}
          icon="record_voice_over"
          ring={data.interviewRate}
          hint="Got to a human conversation"
        />
        <StatCard
          label="Offer rate"
          value={`${data.offerRate}%`}
          icon="celebration"
          ring={data.offerRate}
          hint={`${data.byStatus.offer} offer${data.byStatus.offer === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Resume coverage"
          value={`${data.resumes.coverage}%`}
          icon="description"
          ring={data.resumes.coverage}
          hint={`${data.resumes.linked} of ${data.total} applications tailored`}
        />
      </div>

      <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
        <section className="card">
          <header className="card-header">
            <h2 className="text-headline-sm text-on-surface">Funnel</h2>
            <span className="text-body-sm text-on-surface-variant">Cumulative, all time</span>
          </header>
          <div className="space-y-md p-md">
            {data.funnel.map((stage) => (
              <div key={stage.stage}>
                <div className="mb-xs flex items-baseline justify-between">
                  <span className="text-body-md text-on-surface">{stage.stage}</span>
                  <span className="font-mono text-body-md text-on-surface-variant">
                    {stage.count}
                    <span className="ml-xs">
                      ({Math.round((stage.count / funnelTop) * 100) || 0}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.round((stage.count / funnelTop) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card-header">
            <h2 className="text-headline-sm text-on-surface">Applications per week</h2>
            <span className="text-body-sm text-on-surface-variant">Last 12 weeks</span>
          </header>
          <div className="flex h-[188px] items-end gap-xs p-md">
            {data.weeks.map((week) => (
              <div key={week.week} className="group flex flex-1 flex-col items-center gap-xs">
                <span className="text-body-sm text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100">
                  {week.count}
                </span>
                <div
                  className="w-full rounded-t-sm bg-primary/70 transition-all duration-500 group-hover:bg-primary"
                  style={{ height: `${Math.max(2, (week.count / peakWeek) * 120)}px` }}
                  title={`Week of ${week.week}: ${week.count}`}
                />
                <span className="text-[10px] text-on-surface-variant">
                  {week.week.slice(5).replace('-', '/')}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card-header">
            <h2 className="text-headline-sm text-on-surface">Where things stand</h2>
          </header>
          <ul className="divide-y divide-outline-variant">
            {STATUSES.filter((status) => data.byStatus[status] > 0).map((status) => (
              <li key={status} className="flex items-center gap-sm px-md py-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[status].fill}`} />
                <span className="flex-1 text-body-md text-on-surface">
                  {STATUS_META[status].label}
                </span>
                <span className="w-40 overflow-hidden rounded-full bg-surface-container-highest">
                  <span
                    className={`block h-2 rounded-full ${STATUS_META[status].fill}`}
                    style={{ width: `${(data.byStatus[status] / data.total) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right font-mono text-body-md text-on-surface-variant">
                  {data.byStatus[status]}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <header className="card-header">
            <h2 className="text-headline-sm text-on-surface">Going stale</h2>
            <span className="text-body-sm text-on-surface-variant">Longest without a decision</span>
          </header>
          {stale.length === 0 ? (
            <p className="p-md text-body-md text-on-surface-variant">
              Nothing is waiting — every application has reached a decision.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {stale.map(({ application, days }) => (
                <li key={application.id} className="flex items-center gap-sm px-md py-sm">
                  <Icon
                    name={days > 30 ? 'warning' : 'schedule'}
                    size={16}
                    className={days > 30 ? 'text-attention' : 'text-on-surface-variant'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-md text-on-surface">
                      {application.company} — {application.role}
                    </span>
                    <span className="block text-body-sm text-on-surface-variant">
                      {STATUS_META[application.status].label}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-body-md text-on-surface-variant">
                    {days}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data.topCompanies.length > 1 && (
        <section className="card">
          <header className="card-header">
            <h2 className="text-headline-sm text-on-surface">Most applied-to companies</h2>
          </header>
          <div className="flex flex-wrap gap-sm p-md">
            {data.topCompanies.map((entry) => (
              <span
                key={entry.company}
                className="inline-flex items-center gap-xs rounded-full border border-outline-variant bg-surface px-sm py-[3px] text-body-md"
              >
                {entry.company}
                <span className="font-mono text-body-sm text-on-surface-variant">
                  ×{entry.count}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
