import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { ResumeEditor } from '../components/ResumeEditor'
import { ResumePreview } from '../components/ResumePreview'
import { ResumeSettings } from '../components/ResumeSettings'
import { useToast } from '../components/Toast'
import { formatDateTime, relativeTime } from '../lib/format'
import { IMPORT_ACCEPT, describeImport, importResumeFiles } from '../lib/importResumes'
import type { Application, Resume, ResumeDraft, Settings as SettingsShape } from '../types'

interface Props {
  applications: Application[]
  resumes: Resume[]
  settings: SettingsShape
  loading: boolean
  /** Reload the shared resume list held by App. */
  onChanged: () => void
}

type Rail = 'documents' | 'versions'

const AUTOSAVE_MS = 900

export function ResumeWorkspace({
  applications,
  resumes,
  settings,
  loading,
  onChanged,
}: Props) {
  const { resumeId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { attempt, notify } = useToast()

  const [rail, setRail] = useState<Rail>('documents')
  const [filter, setFilter] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  // Editor buffer, kept separate from the persisted document.
  const [buffer, setBuffer] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const linkTo = params.get('linkTo')
  // The `?linkTo=` prompt should fire once, not every time the list reloads.
  const prompted = useRef(false)

  // Pick a document as soon as one is available.
  useEffect(() => {
    if (resumeId || loading) return
    if (linkTo) {
      const existing = resumes.find((r) => r.applicationId === linkTo)
      if (existing) {
        navigate(`/resumes/${existing.id}`, { replace: true })
        return
      }
      if (!prompted.current) {
        prompted.current = true
        setCreating(true)
        setSettingsOpen(true)
      }
      return
    }
    if (resumes.length) navigate(`/resumes/${resumes[0].id}`, { replace: true })
  }, [resumeId, resumes, loading, linkTo, navigate])

  const detail = useAsync(
    () => (resumeId ? api.resumes.get(resumeId) : Promise.resolve(undefined)),
    [resumeId],
  )
  const resume = detail.data

  // Load the document into the editor whenever a different one is opened.
  const loadedId = useRef<string | null>(null)
  useEffect(() => {
    if (!resume || loadedId.current === resume.id) return
    loadedId.current = resume.id
    setBuffer(resume.content)
    setDirty(false)
    setSavedAt(resume.updatedAt)
  }, [resume])

  const persist = useCallback(
    async (content: string) => {
      if (!resume) return
      setSaving(true)
      const updated = await attempt(() => api.resumes.update(resume.id, { content }))
      setSaving(false)
      if (updated) {
        detail.set(updated)
        setDirty(false)
        setSavedAt(updated.updatedAt)
        onChanged()
      }
    },
    [resume, attempt, detail, onChanged],
  )

  // Debounced autosave — the reference design's "cloud_done" affordance.
  useEffect(() => {
    if (!dirty || !resume) return
    const timer = setTimeout(() => void persist(buffer), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [buffer, dirty, resume, persist])

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (dirty) void persist(buffer)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [buffer, dirty, persist])

  const applicationsById = useMemo(
    () => new Map(applications.map((a) => [a.id, a] as const)),
    [applications],
  )

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return resumes
    return resumes.filter((r) =>
      [r.name, r.company].filter(Boolean).some((f) => f.toLowerCase().includes(needle)),
    )
  }, [resumes, filter])

  const saveVersion = async () => {
    if (!resume) return
    if (dirty) await persist(buffer)
    const label = window.prompt('Version label', suggestLabel(resume))
    if (label === null) return
    const note = window.prompt('What changed in this version?', '') ?? ''
    const created = await attempt(
      () => api.resumes.saveVersion(resume.id, { label: label.trim(), note }),
      'Version saved',
    )
    if (created) {
      detail.refresh()
      onChanged()
      setRail('versions')
    }
  }

  const restore = async (versionId: string) => {
    if (!resume) return
    const updated = await attempt(
      () => api.resumes.restoreVersion(resume.id, versionId),
      'Version restored',
    )
    if (updated) {
      detail.set(updated)
      loadedId.current = null // force the buffer to reload
      setBuffer(updated.content)
      setDirty(false)
      onChanged()
    }
  }

  const fork = async () => {
    if (!resume) return
    const company = window.prompt('Tailor this resume for which company?', '')
    if (!company?.trim()) return
    const slug = company.trim().toLowerCase().replace(/\W+/g, '_')
    const extension = resume.format === 'latex' ? 'tex' : 'md'
    const match = applications.find(
      (a) => a.company.toLowerCase() === company.trim().toLowerCase(),
    )
    const created = await attempt(
      () =>
        api.resumes.duplicate(resume.id, {
          name: `resume_${slug}.${extension}`,
          company: company.trim(),
          applicationId: match?.id ?? null,
        }),
      `Forked for ${company.trim()}`,
    )
    if (created) {
      onChanged()
      navigate(`/resumes/${created.id}`)
    }
  }

  const runImport = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    const result = await attempt(() => importResumeFiles(Array.from(files)))
    setImporting(false)
    if (!result) return

    notify(describeImport(result), result.skipped.length ? 'info' : 'success')
    onChanged()
    if (result.created.length) navigate(`/resumes/${result.created[0].id}`)
  }

  /** Make this the document every new application starts from — or clear it. */
  const toggleDefault = async () => {
    if (!resume) return
    const makeDefault = settings.defaultResumeId !== resume.id
    const saved = await attempt(
      () => api.settings.update({ defaultResumeId: makeDefault ? resume.id : null }),
      makeDefault ? `${resume.name} is now the default resume` : 'Default resume cleared',
    )
    if (saved) onChanged()
  }

  const removeResume = async () => {
    if (!resume) return
    const isDefault = settings.defaultResumeId === resume.id
    const warning = isDefault
      ? `${resume.name} is your default resume. Delete it? New applications will stop getting a resume, and every version goes with it.`
      : `Delete ${resume.name}? Every version goes with it.`
    if (!window.confirm(warning)) return
    const done = await attempt(async () => {
      await api.resumes.remove(resume.id)
      return true
    }, 'Document deleted')
    if (done) {
      onChanged()
      navigate('/resumes', { replace: true })
    }
  }

  const linkApplication = async (applicationId: string | null) => {
    if (!resume) return
    const app = applicationId ? applicationsById.get(applicationId) : undefined
    const updated = await attempt(
      () =>
        api.resumes.update(resume.id, {
          applicationId,
          company: app?.company ?? resume.company,
        }),
      app ? `Linked to ${app.company}` : 'Unlinked',
    )
    if (!updated) return
    detail.set(updated)
    // Mirror the link on the application so the dashboard shows it too.
    if (applicationId) {
      await attempt(() => api.applications.update(applicationId, { resumeId: resume.id }))
    }
    onChanged()
  }

  const submitSettings = async (draft: ResumeDraft) => {
    if (creating) {
      const created = await api.resumes.create({
        ...draft,
        content: draft.format === 'embed' ? '' : STARTER[draft.format ?? 'markdown'],
      })
      if (created.applicationId) {
        await api.applications.update(created.applicationId, { resumeId: created.id })
      }
      onChanged()
      setParams({}, { replace: true })
      navigate(`/resumes/${created.id}`)
      notify('Document created', 'success')
      return
    }
    if (!resume) return
    const updated = await api.resumes.update(resume.id, draft)
    detail.set(updated)
    onChanged()
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Documents / versions rail */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-outline-variant bg-surface">
        <div className="flex items-center gap-xs border-b border-outline-variant p-sm">
          <div className="flex flex-1 rounded-md border border-outline-variant bg-background p-[2px]">
            {(['documents', 'versions'] as Rail[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setRail(tab)}
                className={`flex-1 rounded-[4px] px-xs py-[3px] text-body-sm capitalize transition-colors ${
                  rail === tab
                    ? 'bg-primary-container font-semibold text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <input
            ref={importInput}
            type="file"
            multiple
            accept={IMPORT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              void runImport(event.target.files)
              event.target.value = ''
            }}
          />
          <button
            className="btn-ghost btn-sm"
            title="Import resumes (.md, .tex, .html, or a DevTrack .json bundle)"
            disabled={importing}
            onClick={() => importInput.current?.click()}
          >
            <Icon name={importing ? 'hourglass_top' : 'upload_file'} size={20} />
          </button>
          <a
            className="btn-ghost btn-sm"
            title="Export every resume as a JSON bundle"
            href={api.resumeBundleUrl()}
          >
            <Icon name="download" size={20} />
          </a>
          <button
            className="btn-ghost btn-sm"
            title="New resume"
            onClick={() => {
              setCreating(true)
              setSettingsOpen(true)
            }}
          >
            <Icon name="add_box" size={20} />
          </button>
        </div>

        {rail === 'documents' ? (
          <>
            <div className="border-b border-outline-variant p-sm">
              <input
                className="field"
                placeholder="Filter documents…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <ul className="min-h-0 flex-1 space-y-[2px] overflow-y-auto p-sm">
              {visible.map((item) => {
                const active = item.id === resumeId
                const app = item.applicationId ? applicationsById.get(item.applicationId) : undefined
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => navigate(`/resumes/${item.id}`)}
                      className={`w-full rounded-md px-sm py-sm text-left transition-colors ${
                        active
                          ? 'bg-primary-container text-primary'
                          : 'text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      <span className="flex items-center gap-xs">
                        <Icon
                          name={item.format === 'embed' ? 'public' : 'description'}
                          size={16}
                          className={active ? 'text-primary' : 'text-on-surface-variant'}
                        />
                        <span className="truncate font-mono text-code-md">{item.name}</span>
                        {settings.defaultResumeId === item.id && (
                          <Icon
                            name="star"
                            size={14}
                            fill
                            className="ml-auto text-attention"
                            // title lives on the wrapper; the glyph is decorative
                          />
                        )}
                      </span>
                      <span className="mt-[2px] block truncate text-body-sm opacity-70">
                        {app ? `${app.company} — ${app.role}` : item.company || 'Not tailored'}
                      </span>
                    </button>
                  </li>
                )
              })}
              {visible.length === 0 && (
                <li className="px-sm py-md text-body-sm text-on-surface-variant">
                  No documents match.
                </li>
              )}
            </ul>
          </>
        ) : (
          <ul className="min-h-0 flex-1 space-y-[2px] overflow-y-auto p-sm">
            {(resume?.versions ?? []).map((version, index) => (
              <li
                key={version.id}
                className={`rounded-md px-sm py-sm ${
                  index === 0 ? 'bg-primary-container text-primary' : 'text-on-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-xs">
                  <span className="text-body-md font-semibold">{version.label}</span>
                  {index === 0 ? (
                    <span className="text-[10px] uppercase tracking-wider opacity-70">Current</span>
                  ) : (
                    <span className="flex gap-xs">
                      <button
                        className="text-body-sm text-primary hover:underline"
                        onClick={() => void restore(version.id)}
                      >
                        Restore
                      </button>
                      <button
                        className="text-body-sm text-on-surface-variant hover:text-error"
                        title="Delete version"
                        onClick={async () => {
                          if (!resume) return
                          if (!window.confirm(`Delete version ${version.label}?`)) return
                          const ok = await attempt(async () => {
                            await api.resumes.deleteVersion(resume.id, version.id)
                            return true
                          }, 'Version deleted')
                          if (ok) detail.refresh()
                        }}
                      >
                        <Icon name="delete" size={14} />
                      </button>
                    </span>
                  )}
                </div>
                {version.note && (
                  <p className="mt-[2px] text-body-sm opacity-75">{version.note}</p>
                )}
                <p className="mt-[2px] text-body-sm opacity-60">
                  {relativeTime(version.createdAt)}
                </p>
              </li>
            ))}
            {resume && resume.versions.length === 0 && (
              <li className="px-sm py-md text-body-sm text-on-surface-variant">
                No versions yet — use “Save version” to snapshot the document.
              </li>
            )}
          </ul>
        )}
      </aside>

      {/* Editor + preview */}
      {!resume ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon="description"
            title={loading ? 'Loading…' : 'No resume selected'}
            body="Create a document, then tailor a copy for each company you apply to."
            action={
              <button
                className="btn-primary"
                onClick={() => {
                  setCreating(true)
                  setSettingsOpen(true)
                }}
              >
                <Icon name="add" size={16} />
                New resume
              </button>
            }
          />
        </div>
      ) : (
        <>
          <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-outline-variant">
            <div className="flex h-12 shrink-0 items-center justify-between gap-sm border-b border-outline-variant bg-surface px-md">
              <div className="flex min-w-0 items-center gap-xs">
                <span className="truncate font-mono text-code-md text-on-surface">
                  {resume.name}
                </span>
                <SaveIndicator dirty={dirty} saving={saving} savedAt={savedAt} />
              </div>

              <div className="flex shrink-0 items-center gap-xs">
                <label className="relative inline-flex cursor-pointer items-center gap-xs rounded-md border border-outline-variant bg-background px-sm py-[3px] text-body-sm shadow-card hover:bg-surface-container-high">
                  <Icon name="link" size={14} className="text-primary" />
                  <span className="max-w-[140px] truncate">
                    {resume.applicationId
                      ? (applicationsById.get(resume.applicationId)?.company ?? 'Linked')
                      : 'Link to app'}
                  </span>
                  <Icon name="expand_more" size={14} className="text-on-surface-variant" />
                  <select
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Link to application"
                    value={resume.applicationId ?? ''}
                    onChange={(event) => void linkApplication(event.target.value || null)}
                  >
                    <option value="">Not linked</option>
                    {applications.map((application) => (
                      <option key={application.id} value={application.id}>
                        {application.company} — {application.role}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className={`btn-sm ${
                    settings.defaultResumeId === resume.id ? 'btn-default text-attention' : 'btn-default'
                  }`}
                  onClick={toggleDefault}
                  title={
                    settings.defaultResumeId === resume.id
                      ? 'This is the default for new applications — click to clear'
                      : 'Use this resume for every new application'
                  }
                >
                  <Icon
                    name="star"
                    size={14}
                    fill={settings.defaultResumeId === resume.id}
                  />
                  {settings.defaultResumeId === resume.id ? 'Default' : 'Set default'}
                </button>

                <a
                  className="btn-default btn-sm"
                  href={api.resumeDownloadUrl(resume.id)}
                  title="Export this document as its source file"
                >
                  <Icon name="download" size={14} />
                  Export
                </a>

                <button className="btn-default btn-sm" onClick={fork} title="Tailor a copy">
                  <Icon name="fork_right" size={14} />
                  Fork
                </button>
                <button className="btn-primary btn-sm" onClick={saveVersion}>
                  <Icon name="history" size={14} />
                  Save version
                </button>
                <button
                  className="btn-ghost btn-sm"
                  title="Document settings"
                  onClick={() => {
                    setCreating(false)
                    setSettingsOpen(true)
                  }}
                >
                  <Icon name="settings" size={16} />
                </button>
                <button className="btn-ghost btn-sm" title="Delete document" onClick={removeResume}>
                  <Icon name="delete" size={16} />
                </button>
              </div>
            </div>

            {resume.format === 'embed' ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-sm p-lg text-center">
                <Icon name="public" size={28} className="text-on-surface-variant" />
                <p className="max-w-xs text-body-md text-on-surface-variant">
                  This document lives in an external editor. Edit it in the embedded panel on the
                  right, or open it in its own tab.
                </p>
                <p className="max-w-full truncate font-mono text-code-md text-primary">
                  {resume.embedUrl}
                </p>
              </div>
            ) : (
              <ResumeEditor
                value={buffer}
                format={resume.format}
                onChange={(next) => {
                  setBuffer(next)
                  setDirty(true)
                }}
              />
            )}
          </section>

          <ResumePreview resume={resume} content={buffer} />
        </>
      )}

      <ResumeSettings
        open={settingsOpen}
        resume={creating ? undefined : resume}
        applications={applications}
        defaultApplicationId={linkTo}
        onClose={() => {
          setSettingsOpen(false)
          setCreating(false)
        }}
        onSubmit={submitSettings}
      />
    </div>
  )
}

/** Cloud-save affordance from the reference design. */
function SaveIndicator({
  dirty,
  saving,
  savedAt,
}: {
  dirty: boolean
  saving: boolean
  savedAt: string | null
}) {
  if (saving) {
    return (
      <span className="flex items-center gap-xs text-body-sm text-on-surface-variant">
        <Icon name="cloud_sync" size={14} />
        Saving…
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-xs text-body-sm text-attention">
        <Icon name="cloud_upload" size={14} />
        Unsaved
      </span>
    )
  }
  return (
    <span
      className="flex items-center gap-xs text-body-sm text-success"
      title={savedAt ? `Last saved ${formatDateTime(savedAt)}` : undefined}
    >
      <Icon name="cloud_done" size={14} />
      Saved
    </span>
  )
}

/** Next label after the newest `vX.Y`, matching the server's own scheme. */
function suggestLabel(resume: Resume): string {
  const numbers = resume.versions
    .map((v) => /^v(\d+)\.(\d+)$/.exec(v.label))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => Number(m[1]) * 1000 + Number(m[2]))
  const highest = numbers.length ? Math.max(...numbers) : 1000
  return `v${Math.floor(highest / 1000)}.${(highest % 1000) + 1}`
}

const STARTER: Record<string, string> = {
  markdown: `# Your Name
you@example.com | +1-555-0100 | linkedin.com/in/you | github.com/you

## Summary
One or two lines aimed squarely at this company's job description.

## Experience

### Company — Title
*City, ST · Mon 20XX - Mon 20XX*

- Impact-first bullet: what changed, and by how much.
- Second bullet, with the technology named.

## Projects

### Project — Stack
What it does and why it mattered.

## Education

### University — B.S. Computer Science
*City, ST · May 20XX*

## Skills
Languages, frameworks, infrastructure.
`,
  latex: `\\documentclass[letterpaper,11pt]{article}
\\usepackage[empty]{fullpage}

\\begin{document}

\\name{Your Name}
\\contact{you@example.com | +1-555-0100 | linkedin.com/in/you}

\\section{Experience}
\\resumeSubheading{Company}{City, ST}{Title}{Mon 20XX -- Mon 20XX}
\\resumeItem{Impact-first bullet: what changed, and by how much.}

\\section{Education}
\\resumeSubheading{University}{City, ST}{B.S. Computer Science}{May 20XX}

\\section{Skills}
\\resumeItem{Languages: ...}

\\end{document}
`,
  html: `<h1>Your Name</h1>
<p class="contact">you@example.com | +1-555-0100 | linkedin.com/in/you</p>

<h2>Experience</h2>
<div class="entry">
  <div class="entry-row"><span class="org">Company</span><span class="meta">City, ST</span></div>
  <div class="entry-row"><span class="role">Title</span><span class="meta">Mon 20XX &ndash; Mon 20XX</span></div>
</div>
<ul>
  <li>Impact-first bullet: what changed, and by how much.</li>
</ul>
`,
  embed: '',
}
