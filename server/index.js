import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

// Optional `.env` in the project root (GOOGLE_CLIENT_ID, PORT, …).
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'))
} catch {
  // No .env — environment variables alone are fine.
}

import cors from 'cors'

import { applications } from './routes/applications.js'
import { resumes } from './routes/resumes.js'
import { stats } from './routes/stats.js'
import { exports_ } from './routes/exports.js'
import { logos } from './routes/logo.js'
import { settings } from './routes/settings.js'
import {
  STATUSES,
  LOCATION_TYPES,
  RESUME_FORMATS,
  RESUME_ASSIGNMENT_MODES,
} from './model.js'
import { auth, loadUser, requireUser } from './auth.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 5174)

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(loadUser)

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    statuses: STATUSES,
    locationTypes: LOCATION_TYPES,
    resumeFormats: RESUME_FORMATS,
    resumeAssignmentModes: RESUME_ASSIGNMENT_MODES,
  })
})
app.use('/api/auth', auth)

// Everything below belongs to the signed-in user's workspace.
app.use('/api/applications', requireUser, applications)
app.use('/api/resumes', requireUser, resumes)
app.use('/api/stats', requireUser, stats)
app.use('/api/export', requireUser, exports_)
app.use('/api/logo', requireUser, logos)
app.use('/api/settings', requireUser, settings)

// In production the built SPA is served from the same origin as the API.
const dist = path.join(root, '..', 'dist')
app.use(express.static(dist))
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next()
  })
})

// Central error handler — routes and validators just throw.
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500
  if (status >= 500) console.error(err)
  res.status(status).json({ error: err.message ?? 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`DevTrack API listening on http://localhost:${PORT}`)
})
