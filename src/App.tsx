import { useCallback, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { ApplicationForm } from './components/ApplicationForm'
import { ToastProvider, useToast } from './components/Toast'
import { Applications } from './pages/Applications'
import { ResumeWorkspace } from './pages/ResumeWorkspace'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'
import { api } from './lib/api'
import { useAsync } from './hooks/useAsync'
import type { Application, ApplicationDraft, Settings as SettingsShape } from './types'

/** Used until the real settings land, so no child has to handle `undefined`. */
const FALLBACK_SETTINGS: SettingsShape = { defaultResumeId: null, defaultResumeMode: 'link' }

function Workspace() {
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Application | undefined>()
  const { notify } = useToast()

  // Shared lookups: every page needs the full lists for linking and labels.
  const allApplications = useAsync(() => api.applications.list({ status: 'all' }), [revision])
  const allResumes = useAsync(() => api.resumes.list(), [revision])
  const settings = useAsync(() => api.settings.get(), [revision])

  const onChanged = useCallback(() => setRevision((n) => n + 1), [])

  const openNew = useCallback(() => {
    setEditing(undefined)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((application: Application) => {
    setEditing(application)
    setFormOpen(true)
  }, [])

  const submit = useCallback(
    async (draft: ApplicationDraft) => {
      if (editing) {
        await api.applications.update(editing.id, draft)
        notify('Application updated', 'success')
      } else {
        await api.applications.create(draft)
        notify('Application added', 'success')
      }
      onChanged()
    },
    [editing, notify, onChanged],
  )

  const applications = allApplications.data ?? []
  const resumes = allResumes.data ?? []
  const config = settings.data ?? FALLBACK_SETTINGS

  return (
    <>
      <Shell search={search} onSearch={setSearch} onNewApplication={openNew}>
        <Routes>
          <Route path="/" element={<Navigate to="/applications" replace />} />
          <Route
            path="/applications"
            element={
              <Applications
                search={search}
                resumes={resumes}
                onEdit={openEdit}
                revision={revision}
                onChanged={onChanged}
              />
            }
          />
          <Route
            path="/resumes"
            element={
              <ResumeWorkspace
                applications={applications}
                resumes={resumes}
                settings={config}
                loading={allResumes.loading}
                onChanged={onChanged}
              />
            }
          />
          <Route
            path="/resumes/:resumeId"
            element={
              <ResumeWorkspace
                applications={applications}
                resumes={resumes}
                settings={config}
                loading={allResumes.loading}
                onChanged={onChanged}
              />
            }
          />
          <Route
            path="/analytics"
            element={<Analytics applications={applications} revision={revision} />}
          />
          <Route
            path="/settings"
            element={
              <Settings
                applications={applications}
                resumes={resumes}
                settings={config}
                onChanged={onChanged}
              />
            }
          />
          <Route path="*" element={<Navigate to="/applications" replace />} />
        </Routes>
      </Shell>

      <ApplicationForm
        open={formOpen}
        application={editing}
        resumes={resumes}
        settings={config}
        onClose={() => setFormOpen(false)}
        onSubmit={submit}
      />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Workspace />
    </ToastProvider>
  )
}
