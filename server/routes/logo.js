import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { asyncRouter, badRequest } from '../model.js'

/**
 * Company logo lookup.
 *
 * The browser only ever talks to this endpoint: we resolve a company to a
 * domain, fetch its icon once, and cache the bytes on disk. That keeps company
 * names out of third-party request logs, makes repeat loads instant and offline,
 * and — the point of the exercise — lets a genuine "no logo exists" answer come
 * back as a 404 so the client can fall back to initials deterministically.
 */
export const logos = asyncRouter()

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'logos')

const DAY = 86_400_000
const HIT_TTL = 30 * DAY
const MISS_TTL = 3 * DAY
const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 6000

/**
 * Applicant-tracking and job-board hosts. A posting URL on one of these belongs
 * to the ATS, not the employer — using it would stamp every application with
 * the Greenhouse logo.
 */
const ATS_HOSTS = [
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'myworkdayjobs.com',
  'ashbyhq.com',
  'jobvite.com',
  'smartrecruiters.com',
  'workable.com',
  'bamboohr.com',
  'icims.com',
  'taleo.net',
  'successfactors.com',
  'oraclecloud.com',
  'recruitee.com',
  'teamtailor.com',
  'breezy.hr',
  'pinpointhq.com',
  'rippling.com',
  'paylocity.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'wellfound.com',
  'angel.co',
  'builtin.com',
  'dice.com',
  'monster.com',
  'otta.com',
  'simplify.jobs',
  'ycombinator.com',
  'notion.site',
  'airtable.com',
  'docs.google.com',
  'forms.gle',
]

/** Companies whose domain is not simply their name. */
const ALIASES = {
  x: 'x.com',
  twitter: 'x.com',
  alphabet: 'google.com',
  'meta platforms': 'meta.com',
  facebook: 'meta.com',
  aws: 'aws.amazon.com',
  'amazon web services': 'aws.amazon.com',
  deepmind: 'deepmind.google',
  'google deepmind': 'deepmind.google',
  jpmorgan: 'jpmorganchase.com',
  'jp morgan': 'jpmorganchase.com',
  'jpmorgan chase': 'jpmorganchase.com',
  'bank of america': 'bankofamerica.com',
  'general motors': 'gm.com',
}

/** Public-looking hostname: at least two labels and an alphabetic TLD. */
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/

function isPublicHostname(host) {
  if (!HOSTNAME.test(host)) return false
  // Reject anything that resolves inward regardless of shape.
  return !/(^|\.)(local|internal|localhost|test|invalid|example)$/.test(host)
}

/** Strip accents, parentheticals and legal suffixes, then squash to a slug. */
function slugify(company) {
  return company
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[&/]/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|plc|nv|bv|ag|sa|pty|kk)\.?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

function hostFromJobUrl(jobUrl) {
  if (!jobUrl) return null
  let parsed
  try {
    parsed = new URL(jobUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (!isPublicHostname(host)) return null
  if (ATS_HOSTS.some((ats) => host === ats || host.endsWith(`.${ats}`))) return null
  return host
}

/** Resolve a company (and optionally its posting URL) to a best-guess domain. */
export function resolveDomain(company, jobUrl) {
  const normalized = String(company ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  const alias = ALIASES[normalized]
  if (alias) return alias

  const fromUrl = hostFromJobUrl(jobUrl)
  if (fromUrl) return fromUrl

  const slug = slugify(normalized)
  if (slug.length < 2) return null

  const guess = `${slug}.com`
  return isPublicHostname(guess) ? guess : null
}

/** Icon sources, tried in order. Each 404s (or returns non-image) when it has nothing. */
const PROVIDERS = [
  (domain) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  (domain) => `https://unavatar.io/${domain}?fallback=false`,
  (domain) => `https://${domain}/favicon.ico`,
]

async function tryProvider(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'image/*' },
    redirect: 'follow',
  })
  if (!response.ok) return null

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim()
  // A missing favicon is often answered with an HTML error page and a 200.
  if (!contentType.startsWith('image/')) return null

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null

  return { contentType, buffer }
}

async function fetchLogo(domain) {
  for (const provider of PROVIDERS) {
    try {
      const found = await tryProvider(provider(domain))
      if (found) return found
    } catch {
      // Timeout, DNS failure, TLS error — just try the next source.
    }
  }
  return null
}

const cacheFile = (domain) => path.join(dir, `${domain}.json`)

async function readCache(domain) {
  try {
    const entry = JSON.parse(await fsp.readFile(cacheFile(domain), 'utf8'))
    const ttl = entry.miss ? MISS_TTL : HIT_TTL
    if (Date.now() - entry.fetchedAt > ttl) return null
    return entry
  } catch {
    return null
  }
}

async function writeCache(domain, entry) {
  try {
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(cacheFile(domain), JSON.stringify(entry), 'utf8')
  } catch (error) {
    console.warn(`[logo] could not cache ${domain}: ${error.message}`)
  }
}

/** Collapses concurrent lookups of the same domain into one upstream fetch. */
const inFlight = new Map()

function lookup(domain) {
  if (!inFlight.has(domain)) {
    const task = (async () => {
      const found = await fetchLogo(domain)
      const entry = found
        ? { contentType: found.contentType, data: found.buffer.toString('base64'), fetchedAt: Date.now() }
        : { miss: true, fetchedAt: Date.now() }
      await writeCache(domain, entry)
      return entry
    })().finally(() => inFlight.delete(domain))

    inFlight.set(domain, task)
  }
  return inFlight.get(domain)
}

logos.get('/', async (req, res) => {
  const { company = '', jobUrl = '', domain: requested = '' } = req.query

  const domain = requested
    ? String(requested).toLowerCase().replace(/^www\./, '')
    : resolveDomain(company, jobUrl)

  if (!domain) throw badRequest('Could not derive a domain from "company" or "jobUrl"')
  if (!isPublicHostname(domain)) throw badRequest('Refusing to fetch a non-public hostname')

  const entry = (await readCache(domain)) ?? (await lookup(domain))

  // Cached either way: a confirmed miss is as useful an answer as a hit.
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.setHeader('X-Logo-Domain', domain)

  if (entry.miss) {
    res.status(404).json({ error: 'No logo found', domain })
    return
  }

  res.setHeader('Content-Type', entry.contentType)
  res.send(Buffer.from(entry.data, 'base64'))
})

/** Diagnostic: what domain would we try, without fetching anything? */
logos.get('/resolve', (req, res) => {
  const { company = '', jobUrl = '' } = req.query
  res.json({ company, jobUrl, domain: resolveDomain(company, jobUrl) })
})
