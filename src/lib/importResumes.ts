import { api } from './api'
import type { Resume, ResumeFormat } from '../types'

/** File extensions the picker offers, and what format each maps to. */
export const IMPORT_ACCEPT = '.md,.markdown,.txt,.tex,.latex,.html,.htm,.json'

const BY_EXTENSION: Record<string, ResumeFormat> = {
  md: 'markdown',
  markdown: 'markdown',
  txt: 'markdown',
  tex: 'latex',
  latex: 'latex',
  html: 'html',
  htm: 'html',
}

function formatFor(filename: string, content: string): ResumeFormat {
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  const known = BY_EXTENSION[extension]
  if (known) return known

  // No useful extension — infer from what the file actually looks like.
  if (/\\(documentclass|begin\{document\}|section\{)/.test(content)) return 'latex'
  if (/<(html|body|h1|div|p)\b/i.test(content)) return 'html'
  return 'markdown'
}

export interface ImportResult {
  created: Resume[]
  /** Files that could not be read or parsed, with the reason. */
  skipped: { file: string; reason: string }[]
}

/**
 * Import one or more picked files.
 *
 * A `.json` file is treated as a DevTrack bundle (or a bare array / single
 * resume object) and goes to the import endpoint, which preserves version
 * history and re-links documents to applications by company name. Anything else
 * becomes a single new document whose format is taken from its extension.
 */
export async function importResumeFiles(files: File[]): Promise<ImportResult> {
  const created: Resume[] = []
  const skipped: ImportResult['skipped'] = []

  for (const file of files) {
    try {
      const text = await file.text()

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed: unknown = JSON.parse(text)
        const made = await api.resumes.import(parsed)
        created.push(...made)
        continue
      }

      if (!text.trim()) {
        skipped.push({ file: file.name, reason: 'file is empty' })
        continue
      }

      const format = formatFor(file.name, text)
      const made = await api.resumes.import({
        name: file.name,
        company: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        format,
        content: text,
        versions: [],
      })
      created.push(...made)
    } catch (error) {
      skipped.push({
        file: file.name,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { created, skipped }
}

/** Human-readable outcome for a toast. */
export function describeImport({ created, skipped }: ImportResult): string {
  const parts: string[] = []
  if (created.length) {
    parts.push(`Imported ${created.length} document${created.length === 1 ? '' : 's'}`)
  }
  if (skipped.length) {
    parts.push(`skipped ${skipped.map((s) => `${s.file} (${s.reason})`).join(', ')}`)
  }
  return parts.join(' — ') || 'Nothing imported'
}
