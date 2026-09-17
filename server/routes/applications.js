import { read, write, id, now } from '../db.js'
import {
  asyncRouter,
  STATUSES,
  ACTIVE_STATUSES,
  LOCATION_TYPES,
  coerceDate,
  notFound,
  pick,
  requireOneOf,
  requireString,
} from '../model.js'
import { documentName, forkResume } from '../documents.js'

export const applications = asyncRouter()

const EDITABLE = [
  'company',
  'role',
  'location',
  'locationType',
  'reqId',
  'status',
  'dateApplied',
  'salary',
  'jobUrl',
  'source',
  'notes',
  'resumeId',
  'favorite',
]

function find(state, appId) {
  const app = state.applications.find((a) => a.id === appId)
  if (!app) throw notFound('Application')
  return app
}

function validate(patch) {
  const out = { ...patch }
  if (out.company !== undefined) out.company = requireString(out.company, 'company', { max: 120 })
  if (out.role !== undefined) out.role = requireString(out.role, 'role', { max: 160 })
  if (out.status !== undefined) out.status = requireOneOf(out.status, STATUSES, 'status')
  if (out.locationType !== undefined) {
    out.locationType = requireOneOf(out.locationType, LOCATION_TYPES, 'locationType')
  }
  if (out.dateApplied !== undefined) out.dateApplied = coerceDate(out.dateApplied, 'dateApplied')
  if (out.favorite !== undefined) out.favorite = Boolean(out.favorite)
  for (const key of ['location', 'reqId', 'salary', 'jobUrl', 'source', 'notes']) {
    if (out[key] !== undefined) out[key] = out[key] == null ? '' : String(out[key])
  }
  if (out.resumeId !== undefined && out.resumeId !== null) out.resumeId = String(out.resumeId)
  return out
}

applications.get('/', (req, res) => {
  const { q = '', status = '', locationType = '', sort = 'recent' } = req.query
  const needle = String(q).trim().toLowerCase()

  let rows = read(req.user.id).applications.slice()

  if (needle) {
    rows = rows.filter((a) =>
      [a.company, a.role, a.location, a.reqId, a.notes, a.source]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    )
  }
  if (status && status !== 'all') {
    rows = status === 'active'
      ? rows.filter((a) => ACTIVE_STATUSES.includes(a.status))
      : rows.filter((a) => a.status === status)
  }
  if (locationType && locationType !== 'all') {
    rows = rows.filter((a) => a.locationType === locationType)
  }

  const byDate = (a, b) =>
    String(b.dateApplied ?? '').localeCompare(String(a.dateApplied ?? '')) ||
    String(b.createdAt).localeCompare(String(a.createdAt))

  const comparators = {
    recent: byDate,
    oldest: (a, b) => -byDate(a, b),
    company: (a, b) => a.company.localeCompare(b.company),
    status: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || byDate(a, b),
  }
  rows.sort(comparators[sort] ?? comparators.recent)

  res.json(rows)
})

applications.get('/:id', (req, res) => {
  res.json(find(read(req.user.id), req.params.id))
})

applications.post('/', async (req, res) => {
  const patch = validate(pick(req.body ?? {}, EDITABLE))
  requireString(patch.company ?? '', 'company')
  requireString(patch.role ?? '', 'role')

  const timestamp = now()
  const status = patch.status ?? 'applied'
  const app = {
    id: id('app'),
    company: patch.company,
    role: patch.role,
    location: patch.location ?? '',
    locationType: patch.locationType ?? 'onsite',
    reqId: patch.reqId ?? '',
    status,
    // Default to today only when the caller said nothing; an explicit null
    // (a role you have saved but not applied to) is respected.
    dateApplied: 'dateApplied' in patch ? patch.dateApplied : timestamp.slice(0, 10),
    salary: patch.salary ?? '',
    jobUrl: patch.jobUrl ?? '',
    source: patch.source ?? '',
    notes: patch.notes ?? '',
    resumeId: patch.resumeId ?? null,
    favorite: patch.favorite ?? false,
    timeline: [{ id: id('evt'), at: timestamp, to: status, note: 'Application created' }],
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const stored = await write(req.user.id, (state) => {
    // A caller that said nothing about a resume gets the configured default.
    // Saying `resumeId: null` explicitly means "none" and is left alone.
    if (!('resumeId' in patch)) {
      const source = state.settings.defaultResumeId
        ? state.resumes.find((r) => r.id === state.settings.defaultResumeId)
        : undefined

      if (source && state.settings.defaultResumeMode === 'fork') {
        // Each application gets its own copy to tailor, named for the company.
        const copy = forkResume(source, {
          name: documentName(app.company, source.format),
          company: app.company,
          applicationId: app.id,
          note: `Tailored from ${source.name}`,
        })
        state.resumes.push(copy)
        app.resumeId = copy.id
      } else if (source) {
        app.resumeId = source.id
      }
    }

    state.applications.push(app)
    return app
  })

  res.status(201).json(stored)
})

applications.patch('/:id', async (req, res) => {
  const patch = validate(pick(req.body ?? {}, EDITABLE))

  const updated = await write(req.user.id, (state) => {
    const app = find(state, req.params.id)
    app.timeline ??= []
    if (patch.status && patch.status !== app.status) {
      app.timeline.push({
        id: id('evt'),
        at: now(),
        from: app.status,
        to: patch.status,
        note: req.body?.statusNote || `Moved to ${patch.status}`,
      })
    }
    Object.assign(app, patch, { updatedAt: now() })
    return app
  })

  res.json(updated)
})

applications.delete('/:id', async (req, res) => {
  await write(req.user.id, (state) => {
    const index = state.applications.findIndex((a) => a.id === req.params.id)
    if (index === -1) throw notFound('Application')
    state.applications.splice(index, 1)
    // Keep the resumes, just unlink them.
    for (const resume of state.resumes) {
      if (resume.applicationId === req.params.id) resume.applicationId = null
    }
  })
  res.status(204).end()
})

applications.get('/:id/resumes', (req, res) => {
  const state = read(req.user.id)
  find(state, req.params.id)
  res.json(state.resumes.filter((r) => r.applicationId === req.params.id))
})
