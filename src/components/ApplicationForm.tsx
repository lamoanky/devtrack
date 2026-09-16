import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { STATUS_META } from '../lib/status'
import { today } from '../lib/format'
import {
  LOCATION_TYPES,
  STATUSES,
  type Application,
  type ApplicationDraft,
  type Resume,
  type Settings,
} from '../types'

interface Props {
  open: boolean
  /** Omit to create a new application. */
  application?: Application
  resumes: Resume[]
  settings: Settings
  onClose: () => void
  onSubmit: (draft: ApplicationDraft) => Promise<unknown>
}

/**
 * Sentinel for "leave the resume to my default". It maps to an *absent*
 * `resumeId`, which is what tells the server to apply the default — distinct
 * from `null`, which explicitly means no resume at all.
 */
const USE_DEFAULT = '__default__'

const BLANK: ApplicationDraft = {
  company: '',
  role: '',
  location: '',
  locationType: 'onsite',
  reqId: '',
  status: 'applied',
  dateApplied: today(),
  salary: '',
  jobUrl: '',
  source: '',
  notes: '',
  resumeId: undefined,
}

export function ApplicationForm({
  open,
  application,
  resumes,
  settings,
  onClose,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<ApplicationDraft>(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultResume = settings.defaultResumeId
    ? resumes.find((r) => r.id === settings.defaultResumeId)
    : undefined

  // Reset whenever the dialog opens so a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!open) return
    setError(null)
    setDraft(
      application
        ? {
            company: application.company,
            role: application.role,
            location: application.location,
            locationType: application.locationType,
            reqId: application.reqId,
            status: application.status,
            dateApplied: application.dateApplied ?? '',
            salary: application.salary,
            jobUrl: application.jobUrl,
            source: application.source,
            notes: application.notes,
            resumeId: application.resumeId,
          }
        : { ...BLANK },
    )
  }, [open, application])

  const set = <K extends keyof ApplicationDraft>(key: K, value: ApplicationDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    if (!draft.company?.trim() || !draft.role?.trim()) {
      setError('Company and role are both required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ ...draft, dateApplied: draft.dateApplied || null })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={application ? 'Edit application' : 'New application'}
      description={
        application
          ? 'Changing the status appends an entry to the timeline.'
          : 'Track a role you have applied to — or saved for later.'
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn-default" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : application ? 'Save changes' : 'Add application'}
          </button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-md"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div>
          <label className="label" htmlFor="company">
            Company *
          </label>
          <input
            id="company"
            data-autofocus
            className="field"
            value={draft.company ?? ''}
            onChange={(e) => set('company', e.target.value)}
            placeholder="Stripe"
          />
        </div>

        <div>
          <label className="label" htmlFor="role">
            Role *
          </label>
          <input
            id="role"
            className="field"
            value={draft.role ?? ''}
            onChange={(e) => set('role', e.target.value)}
            placeholder="Frontend Engineer"
          />
        </div>

        <div>
          <label className="label" htmlFor="location">
            Location
          </label>
          <input
            id="location"
            className="field"
            value={draft.location ?? ''}
            onChange={(e) => set('location', e.target.value)}
            placeholder="San Francisco, CA"
          />
        </div>

        <div>
          <label className="label" htmlFor="locationType">
            Work model
          </label>
          <select
            id="locationType"
            className="field"
            value={draft.locationType}
            onChange={(e) => set('locationType', e.target.value as ApplicationDraft['locationType'])}
          >
            {LOCATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type[0].toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            className="field"
            value={draft.status}
            onChange={(e) => set('status', e.target.value as ApplicationDraft['status'])}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dateApplied">
            Date applied
          </label>
          <input
            id="dateApplied"
            type="date"
            className="field"
            value={draft.dateApplied ?? ''}
            onChange={(e) => set('dateApplied', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="reqId">
            Requisition ID
          </label>
          <input
            id="reqId"
            className="field font-mono text-code-md"
            value={draft.reqId ?? ''}
            onChange={(e) => set('reqId', e.target.value)}
            placeholder="REQ-8472"
          />
        </div>

        <div>
          <label className="label" htmlFor="salary">
            Compensation
          </label>
          <input
            id="salary"
            className="field font-mono text-code-md"
            value={draft.salary ?? ''}
            onChange={(e) => set('salary', e.target.value)}
            placeholder="$185k + equity"
          />
        </div>

        <div>
          <label className="label" htmlFor="source">
            Source
          </label>
          <input
            id="source"
            className="field"
            value={draft.source ?? ''}
            onChange={(e) => set('source', e.target.value)}
            placeholder="Referral, LinkedIn, careers page…"
          />
        </div>

        <div>
          <label className="label" htmlFor="resumeId">
            Linked resume
          </label>
          <select
            id="resumeId"
            className="field"
            value={draft.resumeId === undefined ? USE_DEFAULT : (draft.resumeId ?? '')}
            onChange={(e) =>
              set(
                'resumeId',
                e.target.value === USE_DEFAULT ? undefined : e.target.value || null,
              )
            }
          >
            {defaultResume && !application && (
              <option value={USE_DEFAULT}>
                {settings.defaultResumeMode === 'fork'
                  ? `Tailored copy of ${defaultResume.name} (default)`
                  : `${defaultResume.name} (default)`}
              </option>
            )}
            <option value="">No resume linked</option>
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.name}
                {resume.company ? ` — ${resume.company}` : ''}
              </option>
            ))}
          </select>
          {defaultResume && !application && draft.resumeId === undefined && (
            <p className="mt-xs text-body-sm text-on-surface-variant">
              {settings.defaultResumeMode === 'fork'
                ? 'A copy is created for this company so you can tailor it.'
                : 'Links the shared default document. Fork it later to tailor.'}
            </p>
          )}
        </div>

        <div className="col-span-2">
          <label className="label" htmlFor="jobUrl">
            Job posting URL
          </label>
          <input
            id="jobUrl"
            className="field"
            value={draft.jobUrl ?? ''}
            onChange={(e) => set('jobUrl', e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="col-span-2">
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className="field min-h-[88px] resize-y"
            value={draft.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Recruiter name, interview prep, deadlines…"
          />
        </div>

        {error && (
          <p className="col-span-2 rounded-md border border-error/30 bg-error/5 px-sm py-xs text-body-sm text-error">
            {error}
          </p>
        )}

        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}
