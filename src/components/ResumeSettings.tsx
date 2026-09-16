import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { RESUME_FORMATS, type Application, type Resume, type ResumeDraft } from '../types'

interface Props {
  open: boolean
  /** Omit to create a new document. */
  resume?: Resume
  applications: Application[]
  /** Pre-selected application when arriving from `/resumes?linkTo=…`. */
  defaultApplicationId?: string | null
  onClose: () => void
  onSubmit: (draft: ResumeDraft) => Promise<unknown>
}

const FORMAT_LABEL: Record<string, string> = {
  markdown: 'Markdown — write plainly, preview as a document',
  latex: 'LaTeX — Jake-style resume macros, rendered preview',
  html: 'HTML — full control over the rendered page',
  embed: 'Embed — point at Overleaf, Google Docs or a hosted PDF',
}

export function ResumeSettings({
  open,
  resume,
  applications,
  defaultApplicationId,
  onClose,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<ResumeDraft>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (resume) {
      setDraft({
        name: resume.name,
        company: resume.company,
        applicationId: resume.applicationId,
        format: resume.format,
        embedUrl: resume.embedUrl,
      })
      return
    }

    const linked = applications.find((a) => a.id === defaultApplicationId)
    setDraft({
      name: linked ? `resume_${linked.company.toLowerCase().replace(/\W+/g, '_')}.md` : '',
      company: linked?.company ?? '',
      applicationId: linked?.id ?? null,
      format: 'markdown',
      embedUrl: '',
    })
  }, [open, resume, applications, defaultApplicationId])

  const set = <K extends keyof ResumeDraft>(key: K, value: ResumeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    if (!draft.name?.trim()) {
      setError('Give the document a name.')
      return
    }
    if (draft.format === 'embed' && !draft.embedUrl?.trim()) {
      setError('An embedded document needs a URL.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(draft)
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
      title={resume ? 'Document settings' : 'New resume'}
      description={
        resume
          ? 'Rename, re-target, or repoint this document.'
          : 'Every application can carry its own tailored version.'
      }
      onClose={onClose}
      width="sm"
      footer={
        <>
          <button className="btn-default" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : resume ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-md">
        <div>
          <label className="label" htmlFor="resume-name">
            File name *
          </label>
          <input
            id="resume-name"
            data-autofocus
            className="field font-mono text-code-md"
            value={draft.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            placeholder="resume_stripe.md"
          />
        </div>

        <div>
          <label className="label" htmlFor="resume-company">
            Tailored for
          </label>
          <input
            id="resume-company"
            className="field"
            value={draft.company ?? ''}
            onChange={(e) => set('company', e.target.value)}
            placeholder="Stripe, or a theme like “Backend SWE”"
          />
        </div>

        <div>
          <label className="label" htmlFor="resume-app">
            Linked application
          </label>
          <select
            id="resume-app"
            className="field"
            value={draft.applicationId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null
              set('applicationId', id)
              const app = applications.find((a) => a.id === id)
              if (app && !draft.company) set('company', app.company)
            }}
          >
            <option value="">Not linked to an application</option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.company} — {application.role}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="resume-format">
            Format
          </label>
          <select
            id="resume-format"
            className="field"
            value={draft.format ?? 'markdown'}
            onChange={(e) => set('format', e.target.value as ResumeDraft['format'])}
          >
            {RESUME_FORMATS.map((format) => (
              <option key={format} value={format}>
                {FORMAT_LABEL[format]}
              </option>
            ))}
          </select>
        </div>

        {draft.format === 'embed' && (
          <div>
            <label className="label" htmlFor="resume-url">
              Embed URL *
            </label>
            <input
              id="resume-url"
              className="field"
              value={draft.embedUrl ?? ''}
              onChange={(e) => set('embedUrl', e.target.value)}
              placeholder="https://www.overleaf.com/project/…"
            />
            <p className="mt-xs text-body-sm text-on-surface-variant">
              Some providers refuse to be framed. If the panel stays blank, use “Open in a new tab”.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-error/30 bg-error/5 px-sm py-xs text-body-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
