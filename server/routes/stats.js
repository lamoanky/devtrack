import { read } from '../db.js'
import { ACTIVE_STATUSES, STATUSES, asyncRouter } from '../model.js'

export const stats = asyncRouter()

/** Statuses that prove a human actually looked at the application. */
const RESPONDED = ['oa', 'screened', 'interview', 'offer']

function isoWeekStart(date) {
  const d = new Date(date)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

stats.get('/', (_req, res) => {
  const apps = read().applications
  const resumes = read().resumes

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const app of apps) byStatus[app.status] = (byStatus[app.status] ?? 0) + 1

  const sent = apps.filter((a) => a.status !== 'saved').length
  const responded = apps.filter(
    (a) => RESPONDED.includes(a.status) || (a.timeline ?? []).some((e) => RESPONDED.includes(e.to)),
  ).length
  const interviewed = apps.filter((a) =>
    ['screened', 'interview', 'offer'].includes(a.status) ||
    (a.timeline ?? []).some((e) => ['screened', 'interview'].includes(e.to)),
  ).length

  // Last 12 weeks of application volume, oldest first.
  const weeks = []
  const cursor = new Date()
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(cursor)
    d.setUTCDate(d.getUTCDate() - i * 7)
    weeks.push({ week: isoWeekStart(d), count: 0 })
  }
  const weekIndex = new Map(weeks.map((w, i) => [w.week, i]))
  for (const app of apps) {
    if (!app.dateApplied) continue
    const slot = weekIndex.get(isoWeekStart(app.dateApplied))
    if (slot !== undefined) weeks[slot].count += 1
  }

  const companies = new Map()
  for (const app of apps) {
    companies.set(app.company, (companies.get(app.company) ?? 0) + 1)
  }

  res.json({
    total: apps.length,
    active: apps.filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
    sent,
    byStatus,
    funnel: [
      { stage: 'Applied', count: sent },
      { stage: 'Responded', count: responded },
      { stage: 'Interviewed', count: interviewed },
      { stage: 'Offer', count: byStatus.offer },
    ],
    responseRate: sent ? Math.round((responded / sent) * 100) : 0,
    interviewRate: sent ? Math.round((interviewed / sent) * 100) : 0,
    offerRate: sent ? Math.round((byStatus.offer / sent) * 100) : 0,
    weeks,
    topCompanies: [...companies.entries()]
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
      .slice(0, 6),
    resumes: {
      total: resumes.length,
      linked: apps.filter((a) => a.resumeId).length,
      coverage: apps.length ? Math.round((apps.filter((a) => a.resumeId).length / apps.length) * 100) : 0,
    },
  })
})
