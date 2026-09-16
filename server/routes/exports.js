import { read } from '../db.js'
import { asyncRouter } from '../model.js'

export const exports_ = asyncRouter()

const COLUMNS = [
  ['Company', (a) => a.company],
  ['Role', (a) => a.role],
  ['Location', (a) => a.location],
  ['Work model', (a) => a.locationType],
  ['Req ID', (a) => a.reqId],
  ['Status', (a) => a.status],
  ['Date applied', (a) => a.dateApplied ?? ''],
  ['Compensation', (a) => a.salary],
  ['Source', (a) => a.source],
  ['Job URL', (a) => a.jobUrl],
  ['Resume', (a, resumes) => resumes.get(a.resumeId)?.name ?? ''],
  ['Notes', (a) => a.notes],
]

/** RFC 4180 escaping — quote everything that could confuse a spreadsheet. */
function cell(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

exports_.get('/applications.csv', (_req, res) => {
  const { applications, resumes } = read()
  const byId = new Map(resumes.map((r) => [r.id, r]))

  const lines = [COLUMNS.map(([header]) => cell(header)).join(',')]
  for (const app of applications) {
    lines.push(COLUMNS.map(([, get]) => cell(get(app, byId))).join(','))
  }

  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="devtrack-applications-${stamp}.csv"`)
  // Leading BOM so Excel opens the file as UTF-8 rather than the system codepage.
  res.send('﻿' + lines.join('\r\n') + '\r\n')
})
