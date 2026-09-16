/**
 * Resume document helpers shared by the resume routes, the application routes
 * (which fork the default resume for new applications) and the importer.
 */
import { id, now } from './db.js'

export const FORMAT_EXTENSION = {
  markdown: 'md',
  latex: 'tex',
  html: 'html',
  embed: 'txt',
}

/** A version entry is a frozen copy of the editable document fields. */
export function snapshot(resume, label, note) {
  return {
    id: id('ver'),
    label,
    note: note ?? '',
    format: resume.format,
    content: resume.content,
    embedUrl: resume.embedUrl,
    createdAt: now(),
  }
}

/** Next label after the highest `vX.Y` already present. */
export function nextVersionLabel(resume) {
  const numbers = (resume.versions ?? [])
    .map((v) => /^v(\d+)\.(\d+)$/.exec(v.label ?? ''))
    .filter(Boolean)
    .map((m) => Number(m[1]) * 1000 + Number(m[2]))
  const highest = numbers.length ? Math.max(...numbers) : 1000
  return `v${Math.floor(highest / 1000)}.${(highest % 1000) + 1}`
}

/** `resume_stripe.tex` — a predictable per-company filename. */
export function documentName(company, format) {
  const slug = String(company ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `resume_${slug || 'untitled'}.${FORMAT_EXTENSION[format] ?? 'md'}`
}

/**
 * Copy a resume for another company. The copy starts its own history at v1.0 —
 * the source's versions belong to the source, not to the tailored fork.
 */
export function forkResume(source, { name, company, applicationId, note } = {}) {
  const timestamp = now()
  const copy = {
    id: id('res'),
    name: name ?? `${source.name} (copy)`,
    company: company ?? source.company,
    applicationId: applicationId ?? null,
    format: source.format,
    content: source.content,
    embedUrl: source.embedUrl ?? '',
    versions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  copy.versions.push(snapshot(copy, 'v1.0', note ?? `Forked from ${source.name}`))
  return copy
}
