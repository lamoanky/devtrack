/**
 * Tiny JSON-file datastore.
 *
 * Everything lives in one document (`server/data/db.json`) that is read once at
 * boot and written back atomically (tmp file + rename) after every mutation, so
 * a crash mid-write can never leave a half-serialised database behind.
 *
 * The whole surface is `read()` / `write(mutator)` — swapping this for SQLite or
 * Postgres later only means reimplementing those two functions.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const file = path.join(dir, 'db.json')
const tmp = path.join(dir, 'db.tmp.json')

const DEFAULT_SETTINGS = { defaultResumeId: null, defaultResumeMode: 'link' }

const EMPTY = { applications: [], resumes: [], settings: { ...DEFAULT_SETTINGS } }

let cache = null
/** Serialises writes so two concurrent requests can't clobber each other. */
let queue = Promise.resolve()

function load() {
  if (cache) return cache
  fs.mkdirSync(dir, { recursive: true })
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    // Merge over EMPTY so a database written by an older build gains new keys.
    cache = { ...EMPTY, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[db] ${file} unreadable (${err.message}) — starting empty`)
    }
    cache = structuredClone(EMPTY)
  }
  return cache
}

async function flush() {
  await fsp.writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8')
  await fsp.rename(tmp, file)
}

/** Current state. Treat the result as read-only. */
export function read() {
  return load()
}

/**
 * Apply `mutator` to the database and persist it.
 * Returns whatever the mutator returns, once the write has landed on disk.
 */
export function write(mutator) {
  const run = queue.then(async () => {
    const state = load()
    const result = mutator(state)
    await flush()
    return result
  })
  // Keep the chain alive even if this mutation threw.
  queue = run.catch(() => {})
  return run
}

/** Replace the entire database (used by the seeder). */
export function replaceAll(next) {
  return write((state) => {
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
