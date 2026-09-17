/**
 * Accounts and sessions.
 *
 * - Passwords are hashed with scrypt and a per-user random salt.
 * - A session is a random 32-byte token in an httpOnly, SameSite=Lax cookie.
 *   Only its SHA-256 is stored, so a leaked database can't be replayed as logins.
 * - Google sign-in uses Google Identity Services: the browser receives an ID
 *   token, and the server verifies it with Google (audience must match our
 *   client id) before trusting the account it names.
 */
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { sql, id, now } from './db.js'
import { HttpError, asyncRouter, badRequest } from './model.js'

const scrypt = promisify(crypto.scrypt)

const COOKIE = 'devtrack_session'
const SESSION_DAYS = 30
const SESSION_MS = SESSION_DAYS * 86_400_000

const USERNAME = /^[a-zA-Z0-9_.-]{3,32}$/
const MIN_PASSWORD = 8
const MAX_PASSWORD = 200

export const googleClientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || ''

// ── passwords ────────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored ?? '').split('$')
  if (scheme !== 'scrypt' || !salt || !expected) return false
  const expectedBytes = Buffer.from(expected, 'base64')
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expectedBytes.length)
  return crypto.timingSafeEqual(key, expectedBytes)
}

/** Burned on unknown usernames so response time doesn't reveal which ones exist. */
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'))

// ── users ────────────────────────────────────────────────────────────────────

const q = {
  byId: sql.prepare('SELECT * FROM users WHERE id = ?'),
  byUsername: sql.prepare('SELECT * FROM users WHERE username = ?'),
  byGoogle: sql.prepare('SELECT * FROM users WHERE google_sub = ?'),
  insertPassword: sql.prepare(
    'INSERT INTO users (id, username, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
  ),
  insertGoogle: sql.prepare(
    'INSERT INTO users (id, google_sub, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ),
  refreshGoogle: sql.prepare('UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE id = ?'),

  insertSession: sql.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ),
  sessionUser: sql.prepare(`
    SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `),
  deleteSession: sql.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  pruneSessions: sql.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
}

/** The shape the client sees — never the password hash. */
function publicUser(row) {
  return {
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    name: row.name || row.username || row.email || 'User',
    avatarUrl: row.avatar_url || null,
    provider: row.google_sub ? 'google' : 'password',
  }
}

export function findUserByUsername(username) {
  return q.byUsername.get(username)
}

// ── sessions ─────────────────────────────────────────────────────────────────

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

function parseCookies(header) {
  const out = {}
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    if (key) out[key] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return out
}

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const created = new Date()
  q.insertSession.run(
    sha256(token),
    userId,
    created.toISOString(),
    new Date(created.getTime() + SESSION_MS).toISOString(),
  )
  const secure = req.secure ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`,
  )
}

function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (token) q.deleteSession.run(sha256(token))
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Attaches `req.user` when the request carries a valid session cookie. */
export function loadUser(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (token) {
    const row = q.sessionUser.get(sha256(token), now())
    if (row) req.user = publicUser(row)
  }
  next()
}

/** Gate for every workspace route. */
export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Sign in to continue'))
  next()
}

// Expired sessions are harmless (the lookup ignores them) but shouldn't pile up.
q.pruneSessions.run(now())
setInterval(() => q.pruneSessions.run(now()), 6 * 3_600_000).unref()

// ── login throttling ─────────────────────────────────────────────────────────

/** A few wrong guesses are fine; a flood from one address is slowed to a halt. */
const failures = new Map()
const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 10

function checkThrottle(req) {
  const entry = failures.get(req.ip)
  if (entry && Date.now() - entry.first < WINDOW_MS && entry.count >= MAX_FAILURES) {
    throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.')
  }
}

function recordFailure(req) {
  const entry = failures.get(req.ip)
  if (!entry || Date.now() - entry.first >= WINDOW_MS) {
    failures.set(req.ip, { first: Date.now(), count: 1 })
  } else {
    entry.count += 1
  }
}

// ── Google ───────────────────────────────────────────────────────────────────

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

async function verifyGoogleToken(credential) {
  const clientId = googleClientId()
  if (!clientId) throw new HttpError(503, 'Google sign-in is not configured on this server')

  let response
  try {
    response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: AbortSignal.timeout(8000) },
    )
  } catch {
    throw new HttpError(502, 'Could not reach Google to verify the sign-in')
  }
  if (!response.ok) throw new HttpError(401, 'Google sign-in could not be verified')

  const claims = await response.json()
  if (claims.aud !== clientId || !GOOGLE_ISSUERS.includes(claims.iss)) {
    throw new HttpError(401, 'Google sign-in was issued for a different app')
  }
  if (Number(claims.exp) * 1000 < Date.now()) throw new HttpError(401, 'Google sign-in expired')
  if (!claims.sub) throw new HttpError(401, 'Google sign-in is missing an account id')
  return claims
}

// ── routes ───────────────────────────────────────────────────────────────────

export const auth = asyncRouter()

auth.get('/config', (_req, res) => {
  res.json({ googleClientId: googleClientId() || null })
})

auth.get('/me', (req, res) => {
  res.json({ user: req.user ?? null })
})

auth.post('/register', async (req, res) => {
  const username = String(req.body?.username ?? '').trim()
  const password = String(req.body?.password ?? '')

  if (!USERNAME.test(username)) {
    throw badRequest('Username must be 3–32 characters: letters, numbers, dot, dash or underscore')
  }
  if (password.length < MIN_PASSWORD) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`)
  }
  if (password.length > MAX_PASSWORD) throw badRequest('Password is too long')
  if (q.byUsername.get(username)) throw new HttpError(409, 'That username is taken')

  const userId = id('usr')
  try {
    q.insertPassword.run(userId, username, await hashPassword(password), username, now())
  } catch (err) {
    // Two registrations for the same name racing past the check above.
    if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'That username is taken')
    throw err
  }

  startSession(req, res, userId)
  res.status(201).json({ user: publicUser(q.byId.get(userId)) })
})

auth.post('/login', async (req, res) => {
  checkThrottle(req)
  const username = String(req.body?.username ?? '').trim()
  const password = String(req.body?.password ?? '').slice(0, MAX_PASSWORD)

  const row = username ? q.byUsername.get(username) : undefined
  const ok = row?.password_hash
    ? await verifyPassword(password, row.password_hash)
    : (await verifyPassword(password, DUMMY_HASH), false)

  if (!ok) {
    recordFailure(req)
    throw new HttpError(401, 'Incorrect username or password')
  }

  startSession(req, res, row.id)
  res.json({ user: publicUser(row) })
})

auth.post('/google', async (req, res) => {
  const credential = String(req.body?.credential ?? '')
  if (!credential) throw badRequest('"credential" is required')

  const claims = await verifyGoogleToken(credential)
  const email = claims.email_verified === 'true' || claims.email_verified === true ? claims.email : null

  let row = q.byGoogle.get(claims.sub)
  if (row) {
    q.refreshGoogle.run(email, claims.name ?? row.name, claims.picture ?? '', row.id)
  } else {
    const userId = id('usr')
    q.insertGoogle.run(userId, claims.sub, email, claims.name ?? '', claims.picture ?? '', now())
    row = { id: userId }
  }

  startSession(req, res, row.id)
  res.json({ user: publicUser(q.byId.get(row.id)) })
})

auth.post('/logout', (req, res) => {
  endSession(req, res)
  res.status(204).end()
})
