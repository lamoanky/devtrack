import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { CompanyLogo } from './CompanyLogo'
import { STATUS_META, LOCATION_ICON, LOCATION_LABEL } from '../lib/status'
import { formatDate, formatDateTime, relativeTime } from '../lib/format'
import { STATUSES, type Application, type Resume, type Status } from '../types'

interface Props {
  application: Application | null
  resume: Resume | undefined
  onClose: () => void
  onEdit: (application: Application) => void
  onDelete: (application: Application) => void
  onStatusChange: (application: Application, status: Status) => void
}

export function ApplicationDrawer({
  application,
  resume,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
}: Props) {
  useEffect(() => {
    if (!application) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [application, onClose])

  if (!application) return null

  const timeline = [...(application.timeline ?? [])].reverse()

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-on-surface/20 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-label={`${application.company} — ${application.role}`}
        className="flex h-full w-full max-w-lg flex-col border-l border-outline-variant bg-background shadow-overlay"
      >
        <header className="flex items-start gap-md border-b border-outline-variant bg-surface px-md py-md">
          <CompanyLogo
            company={application.company}
            jobUrl={application.jobUrl}
            size={44}
            muted={Boolean(STATUS_META[application.status].terminal)}
          />

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-headline-sm text-on-surface">{application.company}</h2>
            <p className="truncate text-body-md text-on-surface-variant">{application.role}</p>
          </div>

          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close panel">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-lg overflow-y-auto px-md py-md">
          <section>
            <h3 className="mb-sm text-label-caps uppercase text-on-surface-variant">Status</h3>
            <div className="flex flex-wrap gap-xs">
              {STATUSES.map((status) => {
                const active = application.status === status
                return (
                  <button
                    key={status}
                    onClick={() => !active && onStatusChange(application, status)}
                    className={`inline-flex items-center gap-xs rounded-full border px-sm py-[3px] text-body-sm transition-colors ${
                      active
                        ? STATUS_META[status].chip + ' font-semibold'
                        : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                  >
                    <Icon name={STATUS_META[status].icon} size={14} />
                    {STATUS_META[status].label}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="card divide-y divide-outline-variant">
            <Row label="Location">
              <span className="inline-flex items-center gap-xs">
                <Icon name={LOCATION_ICON[application.locationType]} size={16} />
                {application.location || '—'}
                <span className="text-on-surface-variant">
                  ({LOCATION_LABEL[application.locationType]})
                </span>
              </span>
            </Row>
            <Row label="Date applied">
              {formatDate(application.dateApplied)}
              {application.dateApplied && (
                <span className="ml-xs text-on-surface-variant">
                  · {relativeTime(application.dateApplied)}
                </span>
              )}
            </Row>
            <Row label="Requisition">
              <span className="font-mono text-code-md">{application.reqId || '—'}</span>
            </Row>
            <Row label="Compensation">
              <span className="font-mono text-code-md">{application.salary || '—'}</span>
            </Row>
            <Row label="Source">{application.source || '—'}</Row>
            <Row label="Posting">
              {application.jobUrl ? (
                <a
                  className="inline-flex items-center gap-xs text-primary hover:underline"
                  href={application.jobUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open posting
                  <Icon name="open_in_new" size={14} />
                </a>
              ) : (
                '—'
              )}
            </Row>
          </section>

          <section>
            <h3 className="mb-sm text-label-caps uppercase text-on-surface-variant">
              Tailored resume
            </h3>
            {resume ? (
              <Link
                to={`/resumes/${resume.id}`}
                className="card flex items-center gap-sm p-sm transition-colors hover:bg-surface"
              >
                <Icon name="description" size={20} className="text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-code-md text-on-surface">
                    {resume.name}
                  </span>
                  <span className="block truncate text-body-sm text-on-surface-variant">
                    {resume.company || 'Untailored'} · {resume.versions.length} version
                    {resume.versions.length === 1 ? '' : 's'}
                  </span>
                </span>
                <Icon name="chevron_right" size={18} className="text-on-surface-variant" />
              </Link>
            ) : (
              <div className="card flex items-center justify-between gap-sm p-sm">
                <span className="text-body-md text-on-surface-variant">
                  No resume linked to this application.
                </span>
                <Link className="btn-default btn-sm" to={`/resumes?linkTo=${application.id}`}>
                  Tailor one
                </Link>
              </div>
            )}
          </section>

          {application.notes && (
            <section>
              <h3 className="mb-sm text-label-caps uppercase text-on-surface-variant">Notes</h3>
              <p className="card whitespace-pre-wrap p-sm text-body-md text-on-surface">
                {application.notes}
              </p>
            </section>
          )}

          <section>
            <h3 className="mb-sm text-label-caps uppercase text-on-surface-variant">Timeline</h3>
            {timeline.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                Nothing recorded yet — change the status to start the history.
              </p>
            ) : (
              <ol className="relative space-y-md border-l border-outline-variant pl-md">
                {timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      className={`absolute -left-[21px] top-[6px] h-[9px] w-[9px] rounded-full ring-2 ring-background ${STATUS_META[event.to].fill}`}
                    />
                    <div className="flex items-baseline justify-between gap-sm">
                      <span className="text-body-md font-medium text-on-surface">
                        {STATUS_META[event.to].label}
                      </span>
                      <span className="shrink-0 text-body-sm text-on-surface-variant">
                        {formatDateTime(event.at)}
                      </span>
                    </div>
                    {event.note && (
                      <p className="mt-[2px] text-body-sm text-on-surface-variant">{event.note}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-sm border-t border-outline-variant bg-surface px-md py-sm">
          <button className="btn-danger btn-sm" onClick={() => onDelete(application)}>
            <Icon name="delete" size={16} />
            Delete
          </button>
          <button className="btn-primary" onClick={() => onEdit(application)}>
            <Icon name="edit" size={16} />
            Edit application
          </button>
        </footer>
      </aside>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-md px-sm py-[10px]">
      <span className="shrink-0 text-body-md text-on-surface-variant">{label}</span>
      <span className="min-w-0 text-right text-body-md text-on-surface">{children}</span>
    </div>
  )
}

