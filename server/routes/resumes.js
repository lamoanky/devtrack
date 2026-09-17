import { read, write, id, now } from '../db.js'
import {
  asyncRouter,
  RESUME_FORMATS,
  badRequest,
  notFound,
  pick,
  requireOneOf,
  requireString,
} from '../model.js'
import { FORMAT_EXTENSION, forkResume, nextVersionLabel, snapshot } from '../documents.js'

export const resumes = asyncRouter()

const EDITABLE = ['name', 'company', 'applicationId', 'format', 'content', 'embedUrl']

function find(state, resumeId) {
  const resume = state.resumes.find((r) => r.id === resumeId)
  if (!resume) throw notFound('Resume')
  return resume
}

function validate(patch, state) {
  const out = { ...patch }
  if (out.name !== undefined) out.name = requireString(out.name, 'name', { max: 120 })
  if (out.format !== undefined) out.format = requireOneOf(out.format, RESUME_FORMATS, 'format')
  if (out.company !== undefined) out.company = String(out.company ?? '')
  if (out.content !== undefined) out.content = String(out.content ?? '')
  if (out.embedUrl !== undefined) {
    const url = String(out.embedUrl ?? '').trim()
    if (url && !/^https?:\/\//i.test(url)) {
      throw badRequest('"embedUrl" must start with http:// or https://')
    }
    out.embedUrl = url
  }
  if (out.applicationId !== undefined) {
    if (out.applicationId === null || out.applicationId === '') {
      out.applicationId = null
    } else {
      const linked = state.applications.find((a) => a.id === out.applicationId)
      if (!linked) throw badRequest('"applicationId" does not match any application')
      out.applicationId = linked.id
    }
  }
  return out
}

/** Clear the stored default when the resume it points at goes away. */
function forgetDefaultIfGone(state, resumeId) {
  if (state.settings.defaultResumeId === resumeId) state.settings.defaultResumeId = null
}

resumes.get('/', (req, res) => {
  const { applicationId, q = '' } = req.query
  const needle = String(q).trim().toLowerCase()
  let rows = read(req.user.id).resumes.slice()

  if (applicationId) rows = rows.filter((r) => r.applicationId === applicationId)
  if (needle) {
    rows = rows.filter((r) =>
      [r.name, r.company].filter(Boolean).some((f) => f.toLowerCase().includes(needle)),
    )
  }

  rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  res.json(rows)
})

/**
 * Portable bundle of every resume, versions included.
 *
 * Registered before `/:id` so the literal path wins the match.
 */
resumes.get('/export', (req, res) => {
  const state = read(req.user.id)
  const bundle = {
    kind: 'devtrack.resumes',
    version: 1,
    exportedAt: now(),
    resumes: state.resumes.map((resume) => ({
      name: resume.name,
      company: resume.company,
      format: resume.format,
      content: resume.content,
      embedUrl: resume.embedUrl,
      versions: resume.versions,
      // Carried as a company name, which survives a round trip into another
      // workspace where the original application ids mean nothing.
      linkedCompany:
        state.applications.find((a) => a.id === resume.applicationId)?.company ?? null,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
    })),
  }

  const stamp = now().slice(0, 10)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="devtrack-resumes-${stamp}.json"`)
  res.send(JSON.stringify(bundle, null, 2))
})

/** Download a single document as its native source file. */
resumes.get('/:id/download', (req, res) => {
  const resume = find(read(req.user.id), req.params.id)
  const extension = FORMAT_EXTENSION[resume.format] ?? 'txt'
  const filename = resume.name.includes('.') ? resume.name : `${resume.name}.${extension}`

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`)
  res.send(resume.format === 'embed' ? resume.embedUrl : resume.content)
})

/**
 * Import documents. Accepts a bundle from `/export`, a bare array, or a single
 * resume object. Everything gets fresh ids; `linkedCompany` is re-resolved
 * against the applications in *this* workspace, so links survive the trip.
 */
resumes.post('/import', async (req, res) => {
  const body = req.body ?? {}
  const incoming = Array.isArray(body) ? body : Array.isArray(body.resumes) ? body.resumes : [body]

  if (incoming.length === 0) throw badRequest('Nothing to import')
  if (incoming.length > 200) throw badRequest('Refusing to import more than 200 documents at once')

  const created = await write(req.user.id, (state) => {
    const made = []

    for (const [index, raw] of incoming.entries()) {
      if (!raw || typeof raw !== 'object') {
        throw badRequest(`Entry ${index + 1} is not a resume object`)
      }

      const name = requireString(raw.name ?? '', `resumes[${index}].name`, { max: 120 })
      const format = raw.format
        ? requireOneOf(raw.format, RESUME_FORMATS, `resumes[${index}].format`)
        : 'markdown'

      const embedUrl = String(raw.embedUrl ?? '').trim()
      if (embedUrl && !/^https?:\/\//i.test(embedUrl)) {
        throw badRequest(`resumes[${index}].embedUrl must start with http:// or https://`)
      }

      // Prefer an explicit application id, else match the exported company name.
      const byId = raw.applicationId
        ? state.applications.find((a) => a.id === raw.applicationId)
        : undefined
      const byCompany = raw.linkedCompany
        ? state.applications.find(
            (a) => a.company.toLowerCase() === String(raw.linkedCompany).toLowerCase(),
          )
        : undefined

      const timestamp = now()
      const resume = {
        id: id('res'),
        name,
        company: String(raw.company ?? ''),
        applicationId: byId?.id ?? byCompany?.id ?? null,
        format,
        content: String(raw.content ?? ''),
        embedUrl,
        versions: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      // Preserve exported history when it is well-formed; otherwise start fresh.
      const history = Array.isArray(raw.versions) ? raw.versions : []
      resume.versions = history
        .filter((v) => v && typeof v === 'object' && typeof v.label === 'string')
        .map((v) => ({
          id: id('ver'),
          label: v.label,
          note: String(v.note ?? ''),
          format: RESUME_FORMATS.includes(v.format) ? v.format : format,
          content: String(v.content ?? ''),
          embedUrl: String(v.embedUrl ?? ''),
          createdAt: v.createdAt ?? timestamp,
        }))

      if (resume.versions.length === 0) {
        resume.versions.push(snapshot(resume, 'v1.0', 'Imported'))
      }

      state.resumes.push(resume)
      made.push(resume)
    }

    return made
  })

  res.status(201).json(created)
})

resumes.get('/:id', (req, res) => {
  res.json(find(read(req.user.id), req.params.id))
})

resumes.post('/', async (req, res) => {
  const state = read(req.user.id)
  const patch = validate(pick(req.body ?? {}, EDITABLE), state)
  requireString(patch.name ?? '', 'name')

  const timestamp = now()
  const resume = {
    id: id('res'),
    name: patch.name,
    company: patch.company ?? '',
    applicationId: patch.applicationId ?? null,
    format: patch.format ?? 'markdown',
    content: patch.content ?? '',
    embedUrl: patch.embedUrl ?? '',
    versions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  resume.versions.push(snapshot(resume, 'v1.0', 'Initial draft'))

  await write(req.user.id, (s) => s.resumes.push(resume))
  res.status(201).json(resume)
})

resumes.patch('/:id', async (req, res) => {
  const updated = await write(req.user.id, (state) => {
    const resume = find(state, req.params.id)
    const patch = validate(pick(req.body ?? {}, EDITABLE), state)
    Object.assign(resume, patch, { updatedAt: now() })
    return resume
  })
  res.json(updated)
})

resumes.delete('/:id', async (req, res) => {
  await write(req.user.id, (state) => {
    const index = state.resumes.findIndex((r) => r.id === req.params.id)
    if (index === -1) throw notFound('Resume')
    state.resumes.splice(index, 1)
    for (const app of state.applications) {
      if (app.resumeId === req.params.id) app.resumeId = null
    }
    forgetDefaultIfGone(state, req.params.id)
  })
  res.status(204).end()
})

/** Freeze the current document as a named version. */
resumes.post('/:id/versions', async (req, res) => {
  const created = await write(req.user.id, (state) => {
    const resume = find(state, req.params.id)
    const label = String(req.body?.label ?? '').trim() || nextVersionLabel(resume)
    const version = snapshot(resume, label, req.body?.note)
    resume.versions.unshift(version)
    resume.updatedAt = now()
    return version
  })
  res.status(201).json(created)
})

/** Roll the document back to a version, keeping the pre-restore state as history. */
resumes.post('/:id/versions/:versionId/restore', async (req, res) => {
  const updated = await write(req.user.id, (state) => {
    const resume = find(state, req.params.id)
    const version = resume.versions.find((v) => v.id === req.params.versionId)
    if (!version) throw notFound('Version')

    resume.versions.unshift(snapshot(resume, nextVersionLabel(resume), 'Auto-saved before restore'))
    resume.format = version.format
    resume.content = version.content
    resume.embedUrl = version.embedUrl
    resume.updatedAt = now()
    return resume
  })
  res.json(updated)
})

resumes.delete('/:id/versions/:versionId', async (req, res) => {
  await write(req.user.id, (state) => {
    const resume = find(state, req.params.id)
    const index = resume.versions.findIndex((v) => v.id === req.params.versionId)
    if (index === -1) throw notFound('Version')
    resume.versions.splice(index, 1)
    resume.updatedAt = now()
  })
  res.status(204).end()
})

/**
 * Fork a resume for another company — the core "tailored per application" move.
 */
resumes.post('/:id/duplicate', async (req, res) => {
  const created = await write(req.user.id, (state) => {
    const source = find(state, req.params.id)
    const patch = validate(pick(req.body ?? {}, ['name', 'company', 'applicationId']), state)
    const copy = forkResume(source, patch)
    state.resumes.push(copy)
    return copy
  })
  res.status(201).json(created)
})
