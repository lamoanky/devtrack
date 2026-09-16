import { useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { IMPORT_ACCEPT, describeImport, importResumeFiles } from '../lib/importResumes'
import type { Application, Resume, Settings as SettingsShape } from '../types'

interface Props {
  applications: Application[]
  resumes: Resume[]
  settings: SettingsShape
  onChanged: () => void
}

export function Settings({ applications, resumes, settings, onChanged }: Props) {
  const { attempt, notify } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const resumeInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importingResumes, setImportingResumes] = useState(false)

  const setDefault = async (defaultResumeId: string | null) => {
    const saved = await attempt(
      () => api.settings.update({ defaultResumeId }),
      defaultResumeId ? 'Default resume updated' : 'Default resume cleared',
    )
    if (saved) onChanged()
  }

  const setMode = async (defaultResumeMode: SettingsShape['defaultResumeMode']) => {
    const saved = await attempt(() => api.settings.update({ defaultResumeMode }))
    if (saved) onChanged()
  }

  const runResumeImport = async (files: FileList | null) => {
    if (!files?.length) return
    setImportingResumes(true)
    const result = await attempt(() => importResumeFiles(Array.from(files)))
    setImportingResumes(false)
    if (!result) return
    notify(describeImport(result), result.skipped.length ? 'info' : 'success')
    onChanged()
  }

  const exportJson = () => {
    const payload = JSON.stringify({ applications, resumes }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `devtrack-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Restores a backup by replaying it through the public API, so every record
   * is validated the same way a hand-created one would be.
   */
  const importJson = async (file: File) => {
    setImporting(true)
    try {
      const parsed = JSON.parse(await file.text()) as {
        applications?: Application[]
        resumes?: Resume[]
      }
      const incoming = parsed.applications ?? []
      if (!Array.isArray(incoming)) throw new Error('Backup has no applications array')

      // Map old application ids to the new ones so resume links survive.
      const idMap = new Map<string, string>()
      for (const app of incoming) {
        const created = await api.applications.create({
          company: app.company,
          role: app.role,
          location: app.location,
          locationType: app.locationType,
          reqId: app.reqId,
          status: app.status,
          dateApplied: app.dateApplied,
          salary: app.salary,
          jobUrl: app.jobUrl,
          source: app.source,
          notes: app.notes,
        })
        idMap.set(app.id, created.id)
      }

      for (const resume of parsed.resumes ?? []) {
        const created = await api.resumes.create({
          name: resume.name,
          company: resume.company,
          format: resume.format,
          content: resume.content,
          embedUrl: resume.embedUrl,
          applicationId: resume.applicationId ? (idMap.get(resume.applicationId) ?? null) : null,
        })
        if (created.applicationId) {
          await api.applications.update(created.applicationId, { resumeId: created.id })
        }
      }

      notify(`Imported ${incoming.length} applications`, 'success')
      onChanged()
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const wipe = async () => {
    const typed = window.prompt(
      `This deletes all ${applications.length} applications and ${resumes.length} resumes. Type DELETE to confirm.`,
    )
    if (typed !== 'DELETE') return

    const done = await attempt(async () => {
      for (const resume of resumes) await api.resumes.remove(resume.id)
      for (const app of applications) await api.applications.remove(app.id)
      return true
    }, 'Everything deleted')
    if (done) onChanged()
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-lg p-lg">
      <h1 className="text-headline-lg text-on-surface">Settings</h1>

      <section className="card">
        <header className="card-header">
          <h2 className="text-headline-sm text-on-surface">Data</h2>
        </header>
        <div className="divide-y divide-outline-variant">
          <Row
            title="Export applications as CSV"
            body="Every field, ready for a spreadsheet."
            action={
              <a className="btn-default" href={api.exportUrl()}>
                <Icon name="download" size={16} />
                Download CSV
              </a>
            }
          />
          <Row
            title="Back up everything as JSON"
            body="Applications, resumes and every saved version."
            action={
              <button className="btn-default" onClick={exportJson}>
                <Icon name="archive" size={16} />
                Download backup
              </button>
            }
          />
          <Row
            title="Restore a backup"
            body="Records are appended, not replaced — clear the workspace first for a clean restore."
            action={
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importJson(file)
                  }}
                />
                <button
                  className="btn-default"
                  disabled={importing}
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon name="upload" size={16} />
                  {importing ? 'Importing…' : 'Choose file'}
                </button>
              </>
            }
          />
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="text-headline-sm text-on-surface">Resumes</h2>
        </header>
        <div className="divide-y divide-outline-variant">
          <div className="px-md py-md">
            <p className="text-body-md font-medium text-on-surface">Default resume</p>
            <p className="mb-sm text-body-sm text-on-surface-variant">
              Attached to every new application automatically. You can still pick a different one
              when adding an application, and change it on any application afterwards.
            </p>

            <select
              className="field"
              value={settings.defaultResumeId ?? ''}
              onChange={(event) => void setDefault(event.target.value || null)}
            >
              <option value="">No default — new applications start unlinked</option>
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.name}
                  {resume.company ? ` — ${resume.company}` : ''}
                </option>
              ))}
            </select>

            {settings.defaultResumeId && (
              <fieldset className="mt-md">
                <legend className="label">How it is attached</legend>
                {(
                  [
                    [
                      'link',
                      'Link the same document',
                      'Every application points at this one resume. Simplest, and edits show everywhere.',
                    ],
                    [
                      'fork',
                      'Give each application its own copy',
                      'Creates a tailored copy named for the company, so you can edit it without touching the original.',
                    ],
                  ] as const
                ).map(([mode, title, description]) => (
                  <label
                    key={mode}
                    className={`mb-xs flex cursor-pointer gap-sm rounded-md border p-sm transition-colors ${
                      settings.defaultResumeMode === mode
                        ? 'border-primary bg-primary-container/40'
                        : 'border-outline-variant hover:bg-surface'
                    }`}
                  >
                    <input
                      type="radio"
                      name="defaultResumeMode"
                      className="mt-[3px]"
                      checked={settings.defaultResumeMode === mode}
                      onChange={() => void setMode(mode)}
                    />
                    <span>
                      <span className="block text-body-md text-on-surface">{title}</span>
                      <span className="block text-body-sm text-on-surface-variant">
                        {description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>

          <Row
            title="Export all resumes"
            body="One JSON bundle with every document and its full version history."
            action={
              <a className="btn-default" href={api.resumeBundleUrl()}>
                <Icon name="download" size={16} />
                Export bundle
              </a>
            }
          />
          <Row
            title="Import resumes"
            body="A DevTrack .json bundle, or plain .md / .tex / .html files — one new document each."
            action={
              <>
                <input
                  ref={resumeInput}
                  type="file"
                  multiple
                  accept={IMPORT_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    void runResumeImport(event.target.files)
                    event.target.value = ''
                  }}
                />
                <button
                  className="btn-default"
                  disabled={importingResumes}
                  onClick={() => resumeInput.current?.click()}
                >
                  <Icon name="upload_file" size={16} />
                  {importingResumes ? 'Importing…' : 'Choose files'}
                </button>
              </>
            }
          />
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="text-headline-sm text-on-surface">Workspace</h2>
        </header>
        <div className="divide-y divide-outline-variant">
          <Row
            title="Where your data lives"
            body="A single JSON file on this machine — server/data/db.json. Nothing leaves your computer."
          />
          <Row
            title={`${applications.length} applications · ${resumes.length} resumes`}
            body={`${resumes.reduce((total, r) => total + r.versions.length, 0)} saved resume versions in total.`}
          />
        </div>
      </section>

      <section className="card border-error/30">
        <header className="card-header border-error/30 bg-error/5">
          <h2 className="text-headline-sm text-error">Danger zone</h2>
        </header>
        <Row
          title="Delete all data"
          body="Removes every application, resume and version. There is no undo."
          action={
            <button className="btn-danger" onClick={wipe}>
              <Icon name="delete_forever" size={16} />
              Delete everything
            </button>
          }
        />
      </section>
    </div>
  )
}

function Row({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-md px-md py-md">
      <div className="min-w-0">
        <p className="text-body-md font-medium text-on-surface">{title}</p>
        <p className="text-body-sm text-on-surface-variant">{body}</p>
      </div>
      {action && <div className="flex shrink-0 items-center gap-sm">{action}</div>}
    </div>
  )
}
