import { read, write } from '../db.js'
import { RESUME_ASSIGNMENT_MODES, asyncRouter, badRequest, requireOneOf } from '../model.js'

export const settings = asyncRouter()

/**
 * Reads settings, healing a stale default: if the resume it points at has been
 * deleted, report no default rather than a dangling id.
 */
function current(state) {
  const stored = state.settings
  const exists = stored.defaultResumeId
    ? state.resumes.some((r) => r.id === stored.defaultResumeId)
    : false
  return {
    defaultResumeId: exists ? stored.defaultResumeId : null,
    defaultResumeMode: stored.defaultResumeMode,
  }
}

settings.get('/', (req, res) => {
  res.json(current(read(req.user.id)))
})

settings.patch('/', async (req, res) => {
  const body = req.body ?? {}

  const updated = await write(req.user.id, (state) => {
    if ('defaultResumeId' in body) {
      const value = body.defaultResumeId
      if (value === null || value === '') {
        state.settings.defaultResumeId = null
      } else {
        const resume = state.resumes.find((r) => r.id === value)
        if (!resume) throw badRequest('"defaultResumeId" does not match any resume')
        state.settings.defaultResumeId = resume.id
      }
    }
    if ('defaultResumeMode' in body) {
      state.settings.defaultResumeMode = requireOneOf(
        body.defaultResumeMode,
        RESUME_ASSIGNMENT_MODES,
        'defaultResumeMode',
      )
    }
    return current(state)
  })

  res.json(updated)
})
