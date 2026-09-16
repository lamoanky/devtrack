# DevTrack

A full-stack SWE application tracker with a built-in resume workspace: every
application can carry its own tailored resume, edited and previewed in an
embedded document view without leaving the app.

Built from the `stitch_swe_application_tracking_suite` design references — the
DevPipeline Light (GitHub-derived) token set, the applications dashboard, and
the split editor/preview resume workspace.

## Stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Frontend | Vite + React 18 + TypeScript + Tailwind CSS + React Router     |
| Backend  | Express (ESM) REST API                                        |
| Storage  | One JSON file, written atomically — `server/data/db.json`     |

There is no database server and no native module to compile: `npm install` and
go. The whole storage surface is `read()` / `write()` in `server/db.js`, so
swapping in SQLite or Postgres later touches one file.

## Running it

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:5174 (Vite proxies `/api` to it, so you only visit 5173)

On first boot the API seeds eight demo applications and five resumes. Delete
`server/data/db.json` to start clean, or run `npm run seed` to reset on purpose.

For a production build:

```bash
npm run build   # type-checks, then builds to dist/
npm start       # Express serves the API *and* dist/ on :5174
```

## What it does

### Application tracking

- Eight pipeline stages — Saved, Applied, Pending OA, Screened, Interview,
  Offer, Rejected, Ghosted.
- Company, role, location and work model, requisition ID, compensation, source,
  posting URL, and free-form notes.
- Search across every text field; filter by stage and work model; sort by date,
  company, or pipeline position.
- Clicking a row opens a detail panel with one-click stage changes. **Every
  stage change is appended to a timeline**, so the history of an application is
  recorded rather than overwritten.
- Live stats — applications sent, open assessments, interviews, offer rate.
- CSV export of everything (RFC 4180-escaped, UTF-8 BOM so Excel behaves).
- **Company logos, fetched automatically.** See below.

### Company logos

Each row and detail panel shows the employer's real logo, falling back to a
tinted initials tile when there isn't one.

The browser only ever calls `/api/logo` — the server resolves the domain, fetches
the icon once, and caches the bytes under `server/data/logos/`. So company names
never reach a third-party request log, repeat loads are instant and work offline,
and a genuine "no logo exists" comes back as a 404 rather than a placeholder
image, which is what makes the initials fallback deterministic.

Domain resolution, in priority order:

1. A curated alias, for names that aren't their domain (`Twitter` → `x.com`,
   `Alphabet` → `google.com`, `AWS` → `aws.amazon.com`).
2. **The job posting URL**, which is authoritative — but only when it isn't an
   applicant-tracking host. A posting on `boards.greenhouse.io` or
   `myworkdayjobs.com` belongs to the ATS, not the employer, so those are
   blocklisted; otherwise every application would wear the Greenhouse logo.
3. Otherwise `<company-slug>.com`, after stripping accents, parentheticals and
   legal suffixes (`Acme, Inc.` → `acme.com`, `Nestlé` → `nestle.com`).

Step 3 is a guess, and it is the one weak point: a company whose domain isn't
`.com` resolves to whoever *does* own the `.com`. Linear is the example —
`linear.com` is a different business, and only the `https://linear.app/careers`
job URL gets it right. **Filling in the job URL makes the logo exact.**

Icons come from DuckDuckGo, then unavatar, then the site's own `/favicon.ico`;
requests are validated against a public-hostname pattern (no loopback, private,
or internal names), capped at 512 KB, timed out at 6s, and deduplicated when
several rows ask for the same domain at once. Hits are cached 30 days, misses 3.

### Resume workspace

The second half of the app, and the reason applications and resumes live in the
same database.

- **Documents per company.** A resume is linked to an application, so the
  dashboard shows at a glance which applications went out with a tailored resume
  and which did not (the "Resume" column, and the coverage stat on Analytics).
- **Fork to tailor.** "Fork" copies the current resume for another company and
  links it to that application in one step — the intended workflow is one base
  resume, forked per application.
- **Four formats.** Markdown, LaTeX (the common `\resumeSubheading` /
  `\resumeItem` macro set), raw HTML, or `embed`.
- **The embedded view.** The right pane is an `<iframe>`:
  - For Markdown / LaTeX / HTML, the source is rendered to a paginated
    letter-size document and handed to the frame as `srcdoc`. It zooms, prints
    (→ save as PDF), opens standalone, and works offline.
  - For `embed`, the frame points at an external editor — an Overleaf project, a
    Google Doc, a hosted PDF — so the real document is viewed and edited in
    place. (Some providers refuse to be framed; "Open in a new tab" is there for
    those.)
- **Editor.** Syntax-highlighted source view with a line gutter, Tab-to-indent,
  autosave after ~1s idle, and Ctrl/Cmd+S to save now.
- **Version history.** Snapshot the document under a label with a note, restore
  any earlier version (restoring first snapshots the current state, so a restore
  is never destructive), or delete versions you no longer want.

#### Import and export

Both live in the workspace rail (and again under Settings → Resumes).

- **Export one document** as its native source file — `.md`, `.tex`, `.html`.
- **Export everything** as a JSON bundle: every document with its full version
  history. Links are written as a **company name** rather than an application
  id, so a bundle restored into a different workspace re-attaches itself to the
  matching applications instead of dangling.
- **Import** a bundle, or plain `.md` / `.tex` / `.html` files — one new document
  each, format taken from the extension (and sniffed from the content when the
  extension says nothing). Imports never overwrite: everything arrives with
  fresh ids. Files that fail are skipped and named, rather than aborting the
  batch.

#### Default resume

Set any document as the default with the ★ button, and every new application
picks it up automatically. Two modes, chosen under Settings → Resumes:

- **Link** (the default) — every application points at the same document. Edits
  show up everywhere.
- **Fork** — each new application gets its own copy, named for the company
  (`resume_fork_mode_inc.md`) and linked to it. Editing that copy never touches
  the original, which is the point: it is a tailoring starting line.

The default is a starting point, never a lock-in. The New Application dialog
shows which resume is about to be attached and lets you pick another (or none)
before saving, and the link can be changed on any application afterwards.
Deleting the default resume clears the setting rather than leaving a dangling
reference.

### Analytics

Funnel conversion, applications per week over the last 12 weeks, distribution
across stages, resume coverage, and a "going stale" list of applications waiting
longest on a decision.

### Settings

The default-resume choice and its attach mode, resume import/export, CSV export,
full JSON backup, restore-from-backup (replayed through the API so
every record is validated, with resume↔application links remapped), and a
guarded delete-everything.

## API

| Method | Path                                          | Purpose                              |
| ------ | --------------------------------------------- | ------------------------------------ |
| GET    | `/api/applications?q=&status=&locationType=&sort=` | List / search / filter          |
| POST   | `/api/applications`                           | Create                               |
| GET    | `/api/applications/:id`                       | Read one                             |
| PATCH  | `/api/applications/:id`                       | Update (status changes log an event) |
| DELETE | `/api/applications/:id`                       | Delete (resumes are kept, unlinked)  |
| GET    | `/api/applications/:id/resumes`               | Resumes tailored for this role       |
| GET    | `/api/resumes?applicationId=&q=`              | List / search                        |
| POST   | `/api/resumes`                                | Create                               |
| PATCH  | `/api/resumes/:id`                            | Update content, format, link         |
| DELETE | `/api/resumes/:id`                            | Delete                               |
| POST   | `/api/resumes/:id/duplicate`                  | Fork for another company             |
| GET    | `/api/resumes/export`                         | JSON bundle of every document        |
| GET    | `/api/resumes/:id/download`                   | One document as its source file      |
| POST   | `/api/resumes/import`                         | Bundle, array, or single document    |
| GET    | `/api/settings`                               | Default resume + attach mode         |
| PATCH  | `/api/settings`                               | Change them                          |
| POST   | `/api/resumes/:id/versions`                   | Snapshot the current document        |
| POST   | `/api/resumes/:id/versions/:vid/restore`      | Roll back (snapshots first)          |
| DELETE | `/api/resumes/:id/versions/:vid`              | Drop a version                       |
| GET    | `/api/stats`                                  | Dashboard + analytics aggregates     |
| GET    | `/api/export/applications.csv`                | CSV download                         |
| GET    | `/api/logo?company=&jobUrl=`                  | Company logo bytes, or 404           |
| GET    | `/api/logo/resolve?company=&jobUrl=`          | Which domain would be tried          |
| GET    | `/api/health`                                 | Liveness + enum vocabulary           |

## Layout

```
server/
  index.js            Express app, error handling, static SPA in production
  db.js               JSON store: cached read, serialised atomic writes
  model.js            Shared enums, validators, promise-aware Router
  seed.js             First-run demo data
  documents.js        Version snapshots, forking, per-company filenames
  routes/             applications · resumes · settings · stats · exports · logo
src/
  lib/api.ts          Typed client for every endpoint
  lib/renderResume.ts Markdown + LaTeX → the preview document
  lib/status.ts       Stage vocabulary, colours, icons
  lib/importResumes.ts  File picking, format sniffing, bundle import
  components/         Shell, editor, preview, drawer, logo, dialogs, toasts
  pages/              Applications · ResumeWorkspace · Analytics · Settings
```

## Notes

- The preview iframe is sandboxed without `allow-scripts`, so HTML-format
  resumes render but cannot execute anything.
- LaTeX preview is a renderer for the common resume macros, not a TeX engine.
  It is there for a fast visual check; compile the real PDF in Overleaf (an
  `embed` document is the right home for that).
