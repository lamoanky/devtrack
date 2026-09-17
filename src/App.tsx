import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { ApplicationForm } from './components/ApplicationForm'
import { ToastProvider, useToast } from './components/Toast'
import { DialogProvider } from './components/Dialog'
import { Applications } from './pages/Applications'
import { ResumeWorkspace } from './pages/ResumeWorkspace'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { api, setUnauthorizedHandler } from './lib/api'
import { useAsync } from './hooks/useAsync'
import type { Application, ApplicationDraft, Settings as SettingsShape, User } from './types'

/** Used until the real settings land, so no child has to handle `undefined`. */
const FALLBACK_SETTINGS: SettingsShape = { defaultResumeId: null, defaultResumeMode: 'link' }

interface WorkspaceProps {
  user: User
  onSignOut: () => void
}

function Workspace({ user, onSignOut }: WorkspaceProps) {
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
      <Shell
        search={search}
        onSearch={setSearch}
        onNewApplication={openNew}
        user={user}
        onSignOut={onSignOut}
      >
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
  // undefined while the session check is in flight, null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    api.auth.me().then(
      ({ user }) => setUser(user),
      () => setUser(null),
    )
    // Any API call that finds the session expired drops back to the login screen.
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
    }
  }, [])

  if (user === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-on-surface-variant">
        Loading…
      </div>
    )
  }

  return (
    <ToastProvider>
      <DialogProvider>
        {user ? (
          // Keyed by account so nothing from one user's session carries into the next.
          <Workspace key={user.id} user={user} onSignOut={signOut} />
        ) : (
          <Login onSignedIn={setUser} />
        )}
      </DialogProvider>
    </ToastProvider>
  )
}
