/**
 * Demo data. New accounts always start with an empty workspace; this loads the
 * sample applications and resumes into one account on request:
 *
 *   npm run seed -- <username>           only if that workspace is empty
 *   npm run seed -- <username> --force   replace whatever is there
 */
import { read, replaceAll, id, now } from './db.js'
import { findUserByUsername } from './auth.js'

const day = 86_400_000

/** `n` days ago as YYYY-MM-DD. */
function ago(n) {
  return new Date(Date.now() - n * day).toISOString().slice(0, 10)
}
function agoIso(n) {
  return new Date(Date.now() - n * day).toISOString()
}

const LATEX_RESUME = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage[usenames,dvipsnames]{color}

\begin{document}

\name{Alex Developer}
\contact{alex@example.com | +1-123-456-7890 | linkedin.com/in/alex | github.com/alex}

\section{Experience}
\resumeSubheading{Google}{Mountain View, CA}{Software Engineer Intern}{May 2023 -- Aug 2023}
\resumeItem{Optimized search ranking pre-filters, cutting p99 query latency 15\%.}
\resumeItem{Built Go microservices deployed on Kubernetes serving 40k RPS.}
\resumeItem{Added distributed tracing that cut mean incident triage from 40 to 12 minutes.}

\resumeSubheading{Northwind Labs}{Remote}{Backend Engineer (Part-time)}{Sep 2022 -- Apr 2023}
\resumeItem{Designed the event pipeline backing the customer analytics product.}
\resumeItem{Cut Postgres write amplification 60\% by batching ingestion.}

\section{Projects}
\resumeSubheading{DevTrack}{Personal}{React, Node, Vite}{2024}
\resumeItem{Full-stack application tracker with per-company tailored resume versioning.}

\section{Education}
\resumeSubheading{University of Technology}{San Francisco, CA}{B.S. Computer Science}{May 2024}
\resumeItem{Coursework: Distributed Systems, Compilers, Databases, Machine Learning.}

\section{Skills}
\resumeItem{Languages: TypeScript, Go, Python, SQL, Rust}
\resumeItem{Infrastructure: Kubernetes, Terraform, Postgres, Kafka, AWS}

\end{document}`

const MARKDOWN_RESUME = `# Alex Developer
alex@example.com | +1-123-456-7890 | linkedin.com/in/alex | github.com/alex

## Summary
Full-stack engineer who ships product-facing features end to end. Tailored for
frontend-heavy roles: emphasis on rendering performance, design systems and
accessibility.

## Experience

### Google — Software Engineer Intern
*Mountain View, CA · May 2023 - Aug 2023*

- Rebuilt the results surface in React, cutting time-to-interactive by 380ms.
- Shipped a shared component library adopted by four sibling teams.
- Drove the WCAG 2.2 AA audit to zero blocking violations.

### Northwind Labs — Backend Engineer (Part-time)
*Remote · Sep 2022 - Apr 2023*

- Designed the event pipeline behind the customer analytics product.
- Reduced Postgres write amplification 60% by batching ingestion.

## Projects

### DevTrack — React, Node, Vite
Full-stack application tracker with per-company tailored resume versioning and
an embedded document editor.

## Education

### University of Technology — B.S. Computer Science
*San Francisco, CA · May 2024*

## Skills
TypeScript, React, Go, Python, SQL, Kubernetes, Postgres, AWS`

const BACKEND_SUMMARY = `## Summary
Product-minded engineer with distributed-systems depth. Tailored for large-scale
backend work: throughput, data modelling and on-call ownership.`

function buildSeed() {
  const applications = [
    {
      company: 'Stripe',
      role: 'Frontend Engineer',
      location: 'San Francisco, CA',
      locationType: 'onsite',
      reqId: 'REQ-8472',
      status: 'offer',
      dateApplied: ago(24),
      salary: '$185k + equity',
      jobUrl: 'https://stripe.com/jobs',
      source: 'Referral',
      notes: 'Offer verbally extended. Team: Checkout surfaces. 10 days to respond.',
      favorite: true,
      history: [
        [24, null, 'applied', 'Applied via referral'],
        [20, 'applied', 'screened', 'Recruiter screen — 30 min'],
        [12, 'screened', 'interview', 'Onsite loop: 2 coding, 1 system design, 1 behavioural'],
        [3, 'interview', 'offer', 'Offer call from hiring manager'],
      ],
    },
    {
      company: 'Vercel',
      role: 'Full Stack Developer',
      location: 'Remote (US)',
      locationType: 'remote',
      reqId: 'REQ-1029',
      status: 'screened',
      dateApplied: ago(18),
      salary: '$170k',
      jobUrl: 'https://vercel.com/careers',
      source: 'Company site',
      notes: 'Recruiter mentioned a take-home is next. Lead with edge/runtime work.',
      favorite: false,
      history: [
        [18, null, 'applied', 'Applied through careers page'],
        [6, 'applied', 'screened', 'Recruiter screen booked'],
      ],
    },
    {
      company: 'Meta',
      role: 'Software Engineer E4',
      location: 'Menlo Park, CA',
      locationType: 'hybrid',
      reqId: 'REQ-4421',
      status: 'oa',
      dateApplied: ago(14),
      salary: '$190k + RSU',
      jobUrl: 'https://metacareers.com',
      source: 'LinkedIn',
      notes: 'CodeSignal assessment expires in 4 days. Practise graphs + heaps.',
      favorite: true,
      history: [
        [14, null, 'applied', 'Applied via LinkedIn'],
        [5, 'applied', 'oa', 'CodeSignal OA sent'],
      ],
    },
    {
      company: 'Linear',
      role: 'Product Engineer',
      location: 'Remote (Global)',
      locationType: 'remote',
      reqId: 'REQ-0312',
      status: 'interview',
      dateApplied: ago(11),
      salary: '$165k',
      jobUrl: 'https://linear.app/careers',
      source: 'Hacker News Who Is Hiring',
      notes: 'Final round is a paid work trial. Ask about the sync engine.',
      favorite: false,
      history: [
        [11, null, 'applied', 'Applied'],
        [7, 'applied', 'screened', 'Founder screen'],
        [2, 'screened', 'interview', 'Work trial scheduled'],
      ],
    },
    {
      company: 'Amazon',
      role: 'SDE II',
      location: 'Seattle, WA',
      locationType: 'onsite',
      reqId: 'REQ-9912',
      status: 'rejected',
      dateApplied: ago(38),
      salary: '$175k',
      jobUrl: 'https://amazon.jobs',
      source: 'Recruiter outreach',
      notes: 'Rejected after the loop — feedback was depth on system design.',
      favorite: false,
      history: [
        [38, null, 'applied', 'Recruiter reached out'],
        [30, 'applied', 'oa', 'Online assessment'],
        [22, 'oa', 'interview', 'Virtual loop'],
        [16, 'interview', 'rejected', 'Rejected — system design depth'],
      ],
    },
    {
      company: 'Anthropic',
      role: 'Software Engineer, Product',
      location: 'San Francisco, CA',
      locationType: 'hybrid',
      reqId: 'REQ-2201',
      status: 'applied',
      dateApplied: ago(4),
      salary: '$210k',
      jobUrl: 'https://anthropic.com/careers',
      source: 'Company site',
      notes: 'Tailored the resume toward LLM tooling and evals.',
      favorite: true,
      history: [[4, null, 'applied', 'Applied']],
    },
    {
      company: 'Figma',
      role: 'Software Engineer, Editor',
      location: 'New York, NY',
      locationType: 'hybrid',
      reqId: 'REQ-7788',
      status: 'ghosted',
      dateApplied: ago(46),
      salary: '',
      jobUrl: 'https://figma.com/careers',
      source: 'LinkedIn',
      notes: 'No response in six weeks. Try a warm intro next cycle.',
      favorite: false,
      history: [[46, null, 'applied', 'Applied']],
    },
    {
      company: 'Ramp',
      role: 'Software Engineer, Platform',
      location: 'New York, NY',
      locationType: 'onsite',
      reqId: '',
      status: 'saved',
      dateApplied: null,
      salary: '$180k',
      jobUrl: 'https://ramp.com/careers',
      source: 'Bookmarked',
      notes: 'Posting closes at the end of the month — tailor the platform resume first.',
      favorite: false,
      history: [],
    },
  ].map((seed) => {
    const { history, ...rest } = seed
    const createdAt = agoIso(rest.dateApplied ? 50 : 2)
    return {
      id: id('app'),
      ...rest,
      resumeId: null,
      timeline: history.map(([daysAgo, from, to, note]) => ({
        id: id('evt'),
        at: agoIso(daysAgo),
        from,
        to,
        note,
      })),
      createdAt,
      updatedAt: history.length ? agoIso(history[history.length - 1][0]) : createdAt,
    }
  })

  const byCompany = Object.fromEntries(applications.map((a) => [a.company, a]))

  const resumes = [
    {
      name: 'resume_stripe.tex',
      company: 'Stripe',
      applicationId: byCompany.Stripe.id,
      format: 'latex',
      content: LATEX_RESUME,
      versions: [
        ['v1.3', 'Stripe tailored — payments + reliability framing', 0],
        ['v1.2', 'Trimmed to one page', 9],
        ['v1.1', 'General SWE base', 26],
      ],
    },
    {
      name: 'resume_vercel.md',
      company: 'Vercel',
      applicationId: byCompany.Vercel.id,
      format: 'markdown',
      content: MARKDOWN_RESUME,
      versions: [
        ['v1.2', 'Frontend / edge-runtime framing', 0],
        ['v1.1', 'General SWE base', 17],
      ],
    },
    {
      name: 'resume_meta.md',
      company: 'Meta',
      applicationId: byCompany.Meta.id,
      format: 'markdown',
      content: MARKDOWN_RESUME.replace(
        /## Summary\n[\s\S]*?\n\n## Experience/,
        `${BACKEND_SUMMARY}\n\n## Experience`,
      ),
      versions: [['v1.0', 'Meta E4 tailored', 0]],
    },
    {
      name: 'resume_general.md',
      company: 'General SWE',
      applicationId: null,
      format: 'markdown',
      content: MARKDOWN_RESUME,
      versions: [['v1.0', 'Base resume — fork this per company', 33]],
    },
    {
      name: 'Overleaf — master template',
      company: 'Template',
      applicationId: null,
      format: 'embed',
      content: '',
      embedUrl: 'https://www.overleaf.com/gallery/tagged/cv',
      versions: [['v1.0', 'External Overleaf project', 40]],
    },
  ].map((seed) => {
    const { versions, ...rest } = seed
    const createdAt = agoIso(versions[versions.length - 1][2])
    const resume = {
      id: id('res'),
      embedUrl: '',
      ...rest,
      createdAt,
      updatedAt: agoIso(versions[0][2]),
    }
    resume.versions = versions.map(([label, note, daysAgo]) => ({
      id: id('ver'),
      label,
      note,
      format: resume.format,
      content: resume.content,
      embedUrl: resume.embedUrl,
      createdAt: agoIso(daysAgo),
    }))
    return resume
  })

  // Link each application back to the resume tailored for it.
  for (const resume of resumes) {
    if (!resume.applicationId) continue
    const app = applications.find((a) => a.id === resume.applicationId)
    if (app) app.resumeId = resume.id
  }

  return { applications, resumes }
}

/** Populate a user's workspace only if it is empty (or --force was passed). */
export async function ensureSeed(userId, { force = false } = {}) {
  const state = read(userId)
  if (!force && (state.applications.length || state.resumes.length)) return false
  await replaceAll(userId, buildSeed())
  console.log(`[seed] wrote demo data at ${now()}`)
  return true
}

// `npm run seed -- <username>` executes this file directly.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('server/seed.js')) {
  const force = process.argv.includes('--force')
  const username = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
  const user = username ? findUserByUsername(username) : undefined

  if (!user) {
    console.error(
      username
        ? `[seed] no account named "${username}" — sign up in the app first`
        : '[seed] usage: npm run seed -- <username> [--force]',
    )
    process.exit(1)
  }

  const seeded = await ensureSeed(user.id, { force })
  if (!seeded) console.log('[seed] that workspace already has data — pass --force to replace it')
  process.exit(0)
}
