import { Router as ExpressRouter } from 'express'

/** Shared vocabulary between the API and the client. */

export const STATUSES = [
  'saved',
  'applied',
  'oa',
  'screened',
  'interview',
  'offer',
  'rejected',
  'ghosted',
]

/** Statuses that still count as "in flight". */
export const ACTIVE_STATUSES = ['saved', 'applied', 'oa', 'screened', 'interview', 'offer']

export const LOCATION_TYPES = ['onsite', 'remote', 'hybrid']

export const RESUME_FORMATS = ['markdown', 'latex', 'html', 'embed']

/** How the default resume is attached to a newly created application. */
export const RESUME_ASSIGNMENT_MODES = ['link', 'fork']

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function badRequest(message) {
  return new HttpError(400, message)
}

export function notFound(what) {
  return new HttpError(404, `${what} not found`)
}

/** Pick only the listed keys, dropping `undefined` values. */
export function pick(source, keys) {
  const out = {}
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

export function requireString(value, field, { max = 500 } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`"${field}" is required`)
  }
  if (value.length > max) throw badRequest(`"${field}" must be ${max} characters or fewer`)
  return value.trim()
}

export function requireOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw badRequest(`"${field}" must be one of: ${allowed.join(', ')}`)
  }
  return value
}

/** Accepts "2024-03-01" or a full ISO timestamp; returns a YYYY-MM-DD date. */
export function coerceDate(value, field) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw badRequest(`"${field}" is not a valid date`)
  return date.toISOString().slice(0, 10)
}

/**
 * Express 4 does not observe rejected promises returned by handlers, so an
 * `async` route that throws would hang the request instead of producing a 500.
 * This router auto-forwards both sync throws and rejections to `next()`.
 */
export function asyncRouter() {
  const router = ExpressRouter()
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router)
    router[method] = (routePath, ...handlers) =>
      original(
        routePath,
        ...handlers.map((handler) => (req, res, next) =>
          Promise.resolve(handler(req, res, next)).catch(next),
        ),
      )
  }
  return router
}
