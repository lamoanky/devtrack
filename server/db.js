/**
 * SQLite datastore (`server/data/devtrack.db`, via Node's built-in `node:sqlite`).
 *
 * Three tables:
 *   users       — accounts: username + scrypt password hash, and/or a Google id
 *   sessions    — login sessions, keyed by the SHA-256 of the cookie token
 *   workspaces  — one row per user holding their applications, resumes and
 *                 settings as a JSON document
 *
 * Workspace access keeps the original `read()` / `write(mutator)` shape, now
 * scoped by user id. There is deliberately no in-memory cache: SQLite is the
 * source of truth, so `npm run seed` can load data while the server is running.
 * Writes are serialised so concurrent requests can't clobber each other.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
fs.mkdirSync(dir, { recursive: true })

export const DB_PATH = path.join(dir, 'devtrack.db')

export const sql = new DatabaseSync(DB_PATH)

sql.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    google_sub    TEXT UNIQUE,
    email         TEXT,
    name          TEXT NOT NULL DEFAULT '',
    avatar_url    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS workspaces (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

const DEFAULT_SETTINGS = { defaultResumeId: null, defaultResumeMode: 'link' }

/** What a brand-new account starts with: nothing. */
export function emptyWorkspace() {
  return { applications: [], resumes: [], settings: { ...DEFAULT_SETTINGS } }
}

const selectWorkspace = sql.prepare('SELECT data FROM workspaces WHERE user_id = ?')
const upsertWorkspace = sql.prepare(`
  INSERT INTO workspaces (user_id, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`)

/** Serialises writes so two concurrent requests can't clobber each other. */
let queue = Promise.resolve()

function load(userId) {
  if (!userId) throw new Error('Workspace access requires a user id')
  const row = selectWorkspace.get(userId)
  let state = emptyWorkspace()
  if (row) {
    try {
      const parsed = JSON.parse(row.data)
      // Merge over the empty shape so a workspace written by an older build gains new keys.
      state = { ...state, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } }
    } catch (err) {
      console.warn(`[db] workspace for ${userId} unreadable (${err.message}) — starting empty`)
    }
  }
  return state
}

/** A user's current workspace. */
export function read(userId) {
  return load(userId)
}

/**
 * Apply `mutator` to a user's workspace and persist it.
 * Returns whatever the mutator returns, once the write has landed.
 */
export function write(userId, mutator) {
  const run = queue.then(async () => {
    // A freshly loaded copy: a mutator that throws halfway persists nothing.
    const state = load(userId)
    const result = mutator(state)
    upsertWorkspace.run(userId, JSON.stringify(state), now())
    return result
  })
  // Keep the chain alive even if this mutation threw.
  queue = run.catch(() => {})
  return run
}

/** Replace a user's entire workspace (used by the seeder). */
export function replaceAll(userId, next) {
  return write(userId, (state) => {
    state.applications = next.applications ?? []
    state.resumes = next.resumes ?? []
    state.settings = { ...DEFAULT_SETTINGS, ...(next.settings ?? {}) }
    return state
  })
}

export function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function now() {
  return new Date().toISOString()
}
