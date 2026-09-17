import { useCallback, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAsync, useDebounced } from '../hooks/useAsync'
import { Icon } from '../components/Icon'
import { StatCard } from '../components/StatCard'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { ApplicationDrawer } from '../components/ApplicationDrawer'
import { CompanyLogo } from '../components/CompanyLogo'
import { useToast } from '../components/Toast'
import { useDialog } from '../components/Dialog'
import { STATUS_META, LOCATION_ICON } from '../lib/status'
import { formatDate, relativeTime } from '../lib/format'
import { STATUSES, type Application, type Resume, type Status } from '../types'

interface Props {
  search: string
  resumes: Resume[]
  onEdit: (application: Application) => void
  /** Bumped by the shell whenever an application is created or edited. */
  revision: number
  onChanged: () => void
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'active', label: 'All active' },
  { value: 'all', label: 'Everything' },
  ...STATUSES.map((status) => ({ value: status, label: STATUS_META[status].label })),
]

const LOCATION_FILTERS = [
  { value: 'all', label: 'Anywhere' },
  { value: 'onsite', label: 'On-site' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
]

const SORTS = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'company', label: 'Company A–Z' },
  { value: 'status', label: 'Pipeline stage' },
]

export function Applications({ search, resumes, onEdit, revision, onChanged }: Props) {
  const [status, setStatus] = useState('active')
  const [locationType, setLocationType] = useState('all')
  const [sort, setSort] = useState('recent')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { attempt, notify } = useToast()
  const dialog = useDialog()
  const debouncedSearch = useDebounced(search, 250)

  const list = useAsync(
    () => api.applications.list({ q: debouncedSearch, status, locationType, sort }),
    [debouncedSearch, status, locationType, sort, revision],
  )
  const stats = useAsync(() => api.stats(), [revision])

  const applications = list.data ?? []
  const resumesById = useMemo(() => new Map(resumes.map((r) => [r.id, r] as const)), [resumes])
  const selected = applications.find((a) => a.id === selectedId) ?? null

  const changeStatus = useCallback(
    async (application: Application, next: Status) => {
      const updated = await attempt(
        () => api.applications.update(application.id, { status: next }),
        `${application.company} → ${STATUS_META[next].label}`,
      )
      if (updated) onChanged()
    },
    [attempt, onChanged],
  )

  const remove = useCallback(
    async (application: Application) => {
      const confirmed = await dialog.confirm({
        title: 'Delete application?',
        body: `The ${application.role} application at ${application.company} and its timeline will be deleted. Linked resumes are kept.`,
        confirmLabel: 'Delete application',
        danger: true,
      })
      if (!confirmed) return
      const done = await attempt(async () => {
        await api.applications.remove(application.id)
        return true
      }, 'Application deleted')
      if (done) {
        setSelectedId(null)
        onChanged()
      }
    },
    [attempt, dialog, onChanged],
  )

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-lg p-lg">
      <section>
        <h1 className="mb-md text-headline-lg text-on-surface">Application Pipeline</h1>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Applications sent"
            value={stats.data?.sent ?? 0}
            icon="send"
            hint={`${stats.data?.active ?? 0} still active`}
          />
          <StatCard
            label="Online assessments"
            value={stats.data?.byStatus.oa ?? 0}
            icon="terminal"
            hint="Awaiting your submission"
          />
          <StatCard
            label="Interviews"
            value={(stats.data?.byStatus.screened ?? 0) + (stats.data?.byStatus.interview ?? 0)}
            icon="record_voice_over"
            hint={`${stats.data?.interviewRate ?? 0}% of applications`}
          />
          <StatCard
            label="Total offers"
            value={stats.data?.byStatus.offer ?? 0}
            icon="celebration"
            ring={stats.data?.offerRate ?? 0}
            hint={`${stats.data?.offerRate ?? 0}% offer rate`}
          />
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-sm">
        <Select
          icon="filter_list"
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_FILTERS}
        />
        <Select
          icon="location_on"
          label="Location"
          value={locationType}
          onChange={setLocationType}
          options={LOCATION_FILTERS}
        />
        <Select icon="sort" label="Sort" value={sort} onChange={setSort} options={SORTS} />

        <span className="ml-auto text-body-md text-on-surface-variant">
          {list.loading ? 'Loading…' : `${applications.length} shown`}
        </span>
        <a className="btn-default" href={api.exportUrl()}>
          <Icon name="download" size={16} />
          Export CSV
        </a>
      </section>

      <section className="card overflow-hidden">
        <div className="grid grid-cols-[minmax(200px,3fr)_minmax(180px,3fr)_minmax(120px,2fr)_minmax(130px,2fr)_88px] items-center gap-md border-b border-outline-variant bg-surface px-md py-sm text-label-caps uppercase text-on-surface-variant">
          <span>Company</span>
          <span>Role &amp; location</span>
          <span>Date applied</span>
          <span>Status</span>
          <span className="text-right">Resume</span>
        </div>

        {list.error && (
          <p className="px-md py-md text-body-md text-error">
            {list.error}{' '}
            <button className="underline" onClick={list.refresh}>
              Retry
            </button>
          </p>
        )}

        {!list.error && applications.length === 0 && !list.loading && (
          <EmptyState
            icon="inbox"
            title="No applications match"
            body={
              search
                ? `Nothing matches “${search}”. Try clearing the search or widening the filters.`
                : 'Add your first application, or relax the status filter to see archived ones.'
            }
          />
        )}

        <ul className="divide-y divide-outline-variant">
          {applications.map((application) => {
            const resume = application.resumeId ? resumesById.get(application.resumeId) : undefined
            const terminal = STATUS_META[application.status].terminal

            return (
              <li key={application.id}>
                <button
                  onClick={() => setSelectedId(application.id)}
                  className={`grid w-full grid-cols-[minmax(200px,3fr)_minmax(180px,3fr)_minmax(120px,2fr)_minmax(130px,2fr)_88px] items-center gap-md px-md py-sm text-left transition-colors hover:bg-surface ${
                    terminal ? 'opacity-70' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-sm">
                    <CompanyLogo
                      company={application.company}
                      jobUrl={application.jobUrl}
                      size={36}
                      muted={terminal}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-body-lg font-semibold text-on-surface ${
                          application.status === 'rejected' ? 'line-through decoration-outline' : ''
                        }`}
                      >
                        {application.company}
                      </span>
                      <span className="block truncate font-mono text-body-sm text-on-surface-variant">
                        {application.reqId || '—'}
                      </span>
                    </span>
                    {application.favorite && (
                      <Icon name="star" size={16} fill className="text-attention" />
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-body-md font-medium text-on-surface">
                      {application.role}
                    </span>
                    <span className="flex items-center gap-xs truncate text-body-sm text-on-surface-variant">
                      <Icon name={LOCATION_ICON[application.locationType]} size={14} />
                      {application.location || '—'}
                    </span>
                  </span>

                  <span className="min-w-0">
                    <span className="block text-body-md text-on-surface">
                      {formatDate(application.dateApplied)}
                    </span>
                    <span className="block text-body-sm text-on-surface-variant">
                      {relativeTime(application.dateApplied)}
                    </span>
                  </span>

                  <span>
                    <StatusBadge status={application.status} />
                  </span>

                  <span className="flex justify-end">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                        resume
                          ? 'border-outline-variant bg-surface text-primary'
                          : 'border-dashed border-outline-variant text-outline'
                      }`}
                      title={resume ? `Linked to ${resume.name}` : 'No resume linked'}
                    >
                      <Icon name={resume ? 'link' : 'link_off'} size={16} />
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <ApplicationDrawer
        application={selected}
        resume={selected?.resumeId ? resumesById.get(selected.resumeId) : undefined}
        onClose={() => setSelectedId(null)}
        onEdit={(application) => {
          setSelectedId(null)
          onEdit(application)
        }}
        onDelete={remove}
        onStatusChange={(application, next) => {
          void changeStatus(application, next)
          if (next === 'offer') notify('Congratulations! 🎉', 'success')
        }}
      />
    </div>
  )
}

interface SelectProps {
  icon: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

/** Native <select> dressed as the GitHub-style filter pill from the design refs. */
function Select({ icon, label, value, onChange, options }: SelectProps) {
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-xs rounded-md border border-outline-variant bg-surface px-sm py-[6px] text-body-md shadow-card transition-colors hover:bg-surface-container-high">
      <Icon name={icon} size={16} className="text-on-surface-variant" />
      <span className="text-on-surface-variant">{label}:</span>
      <span className="font-semibold text-on-surface">
        {options.find((option) => option.value === value)?.label ?? value}
      </span>
      <Icon name="expand_more" size={16} className="text-on-surface-variant" />
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
