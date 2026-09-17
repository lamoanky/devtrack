import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

/**
 * Best-effort PDF → LaTeX conversion for single-column resumes.
 *
 * A PDF has no structure, only positioned glyph runs, so this rebuilds one from
 * layout cues: the biggest line up top is the name, short large or all-caps
 * lines are section headings, lines with a far-right column (dates, places)
 * are entry subheadings, and glyph-led lines are bullets. The output uses the
 * "Jake's resume" macro set, so it previews here and compiles on Overleaf.
 *
 * Deliberately free of runtime imports: the caller loads pdfjs and hands over
 * the document, which keeps pdfjs out of the main bundle and this file testable.
 */

interface Run {
  text: string
  x: number
  right: number
  size: number
  bold: boolean
  italic: boolean
}

/** Runs split at wide horizontal gaps — a left column and a right column, usually. */
interface Line {
  segments: Run[][]
  x: number
  right: number
  y: number
  size: number
}

type Block =
  | { kind: 'name'; text: string }
  | { kind: 'contact'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'subheading'; fields: [string, string, string, string] }
  | { kind: 'item'; text: string }
  | { kind: 'paragraph'; text: string }

const BULLET = /^[•●○◦▪▫■□‣⁃∙·*\-–—➢➤►▸✓✔]$|^\p{Co}$/u

export async function pdfToLatex(pdf: PDFDocumentProxy): Promise<string> {
  const lines: Line[] = []
  for (let number = 1; number <= pdf.numPages; number += 1) {
    lines.push(...(await readPage(pdf, number)))
  }
  if (!lines.some((line) => plain(line).trim())) {
    throw new Error('no selectable text — is it a scanned PDF?')
  }
  return emit(classify(lines))
}

async function readPage(pdf: PDFDocumentProxy, number: number): Promise<Line[]> {
  const page = await pdf.getPage(number)
  // Loading the operator list resolves the page's fonts, whose real names
  // ("CMBX12", "Helvetica-Bold") are the only reliable bold/italic signal.
  await page.getOperatorList()
  const content = await page.getTextContent()

  const fontStyle = new Map<string, { bold: boolean; italic: boolean }>()
  const styleOf = (fontName: string) => {
    let style = fontStyle.get(fontName)
    if (!style) {
      style = { bold: false, italic: false }
      try {
        if (page.commonObjs.has(fontName)) {
          const font = page.commonObjs.get(fontName) as { name?: string; bold?: boolean; black?: boolean; italic?: boolean }
          const name = font.name ?? ''
          style.bold = Boolean(font.bold || font.black) || /bold|black|heavy|semibold|demi|CMBX|CMB\d|SFBX/i.test(name)
          style.italic = Boolean(font.italic) || /italic|oblique|CMTI|CMSL|SFTI/i.test(name)
        }
      } catch {
        // Unresolved font: treat as regular weight.
      }
      fontStyle.set(fontName, style)
    }
    return style
  }

  const runs: (Run & { y: number })[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const text = item as TextItem
    const [a, b, , , x, y] = text.transform as number[]
    const size = Math.hypot(a, b) || text.height
    if (!size) continue
    runs.push({
      text: text.str,
      x,
      right: x + text.width,
      y,
      size,
      ...styleOf(text.fontName),
    })
  }
  page.cleanup()

  // Top of the page first; runs whose baselines are close share a line.
  runs.sort((p, q) => q.y - p.y || p.x - q.x)
  const rows: (Run & { y: number })[][] = []
  for (const run of runs) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - run.y) < Math.max(row[0].size, run.size) * 0.45) row.push(run)
    else rows.push([run])
  }

  return rows.map((row) => {
    row.sort((p, q) => p.x - q.x)
    const size = Math.max(...row.map((r) => r.size))
    const segments: Run[][] = [[row[0]]]
    for (let i = 1; i < row.length; i += 1) {
      const gap = row[i].x - row[i - 1].right
      if (gap > size * 2.5) segments.push([row[i]])
      else segments[segments.length - 1].push(row[i])
    }
    return { segments, x: row[0].x, right: Math.max(...row.map((r) => r.right)), y: row[0].y, size }
  })
}

/** Join a segment's runs, inserting spaces where the glyphs are visibly apart. */
function joinRuns(runs: Run[], wrap: (run: Run, text: string) => string): string {
  let out = ''
  runs.forEach((run, index) => {
    const previous = runs[index - 1]
    if (previous && !/\s$/.test(previous.text) && !/^\s/.test(run.text)) {
      if (run.x - previous.right > run.size * 0.12) out += ' '
    }
    out += wrap(run, run.text)
  })
  return tidy(out)
}

function tidy(text: string): string {
  return text
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/\s+/g, ' ')
    .trim()
}

const segmentPlain = (segment: Run[]) => joinRuns(segment, (_, text) => text)
const plain = (line: Line) => line.segments.map(segmentPlain).join(' ')

/** LaTeX for a segment, keeping bold/italic runs unless the whole thing shares one style. */
function segmentLatex(segment: Run[]): string {
  const allBold = segment.every((r) => r.bold)
  const allItalic = segment.every((r) => r.italic)
  // Merge neighbouring runs of the same style so we emit one \textbf{...} per phrase.
  const merged: Run[] = []
  for (const run of segment) {
    const last = merged[merged.length - 1]
    const bold = run.bold && !allBold
    const italic = run.italic && !allItalic
    if (last && last.bold === bold && last.italic === italic) {
      const spaced = !/\s$/.test(last.text) && run.x - last.right > run.size * 0.12
      merged[merged.length - 1] = { ...last, text: last.text + (spaced ? ' ' : '') + run.text, right: run.right }
    } else {
      merged.push({ ...run, bold, italic })
    }
  }
  return joinRuns(merged, (run, text) => {
    const escaped = escapeLatex(tidy(text))
    if (!escaped) return text
    const lead = /^\s/.test(text) ? ' ' : ''
    const trail = /\s$/.test(text) ? ' ' : ''
    if (run.bold) return `${lead}\\textbf{${escaped}}${trail}`
    if (run.italic) return `${lead}\\textit{${escaped}}${trail}`
    return lead + escaped + trail
  })
}

function classify(lines: Line[]): Block[] {
  const blocks: Block[] = []
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b)
  const body = sizes[Math.floor(sizes.length / 2)]

  const isBulletLine = (line: Line) => {
    const lead = line.segments[0][0].text.trim()
    return BULLET.test(lead) || (BULLET.test(lead[0]) && /^.\s/.test(lead))
  }
  const isHeading = (line: Line) => {
    if (line.segments.length !== 1 || isBulletLine(line)) return false
    const text = plain(line)
    const letters = text.replace(/[^A-Za-z]/g, '')
    if (letters.length < 3 || text.split(' ').length > 5 || /[.,;]$/.test(text)) return false
    return line.size >= body * 1.12 || letters === letters.toUpperCase()
  }

  let index = 0

  // Name: the largest line near the top of the first page.
  const head = lines.slice(0, 4)
  const top = head.reduce((best, line) => (line.size > best.size ? line : best), head[0])
  if (top && top.size >= body * 1.25) {
    index = lines.indexOf(top) + 1
    blocks.push({ kind: 'name', text: escapeLatex(plain(top)) })
    // Contact details: everything until the first heading.
    const contact: string[] = []
    const stop = index + 4
    while (index < lines.length && index < stop && !isHeading(lines[index])) {
      for (const segment of lines[index].segments) {
        for (const part of segmentPlain(segment).split(/\s+[|•·◦⋄♦]\s+|\s{2,}/)) {
          if (part.trim()) contact.push(linkify(part))
        }
      }
      index += 1
    }
    if (contact.length) blocks.push({ kind: 'contact', text: contact.join(' $|$ ') })
  }

  let bulletTextX: number | null = null
  let glyphBullets = false
  const leftMargin = Math.min(...lines.map((l) => l.x))
  const rightMargin = Math.max(...lines.map((l) => l.right))

  for (; index < lines.length; index += 1) {
    const line = lines[index]
    const previous = blocks[blocks.length - 1]

    if (isHeading(line)) {
      bulletTextX = null
      blocks.push({ kind: 'section', text: escapeLatex(titleCase(plain(line))) })
      continue
    }

    if (isBulletLine(line)) {
      const [first, ...rest] = line.segments
      const runs = first.slice(1)
      // Some PDFs put the glyph and the text in one run ("• Built...").
      const glued = first[0].text.trim().length > 1 ? [{ ...first[0], text: first[0].text.trim().slice(1) }] : []
      const segment = [...glued, ...runs, ...rest.flat()]
      bulletTextX = segment[0]?.x ?? line.x
      glyphBullets = true
      if (segment.length) blocks.push({ kind: 'item', text: segmentLatex(segment) })
      continue
    }

    // A wrapped bullet: indented to the bullet's text, no right-hand column.
    if (
      previous?.kind === 'item' &&
      bulletTextX !== null &&
      line.segments.length === 1 &&
      line.x >= bulletTextX - line.size
    ) {
      // Without a text glyph to mark new bullets, only a full previous line means it wrapped.
      // (Full = the next line's first word would not have fit after it.)
      const first = line.segments[0][0]
      const word = first.text.trimStart().split(/\s/)[0]
      const wordWidth = ((first.right - first.x) * (word.length + 1)) / Math.max(1, first.text.length)
      const wrapped = glyphBullets || lines[index - 1].right + wordWidth >= rightMargin - body * 0.5
      if (wrapped || Math.abs(line.x - bulletTextX) > body) {
        previous.text += ' ' + segmentLatex(line.segments[0])
        continue
      }
    }

    // Chrome, Word and friends draw list dots as shapes, not text, so an
    // indented single-column line is the only sign of a bullet.
    if (line.segments.length === 1 && line.x > leftMargin + body * 0.8) {
      glyphBullets = false
      bulletTextX = line.x
      blocks.push({ kind: 'item', text: segmentLatex(line.segments[0]) })
      continue
    }
    bulletTextX = null

    if (line.segments.length >= 2) {
      const left = escapeLatex(segmentPlain(line.segments[0]))
      const right = escapeLatex(line.segments.slice(1).map(segmentPlain).join(' '))
      // Second row of a two-row entry: role and dates under company and place.
      if (previous?.kind === 'subheading' && !previous.fields[2] && !previous.fields[3]) {
        previous.fields[2] = left
        previous.fields[3] = right
      } else {
        blocks.push({ kind: 'subheading', fields: [left, right, '', ''] })
      }
      continue
    }

    const segment = line.segments[0]
    if (segment.every((r) => r.bold)) {
      blocks.push({ kind: 'subheading', fields: [escapeLatex(segmentPlain(segment)), '', '', ''] })
      continue
    }

    // Italic line under a one-column subheading: the role.
    if (previous?.kind === 'subheading' && !previous.fields[2] && segment.every((r) => r.italic)) {
      previous.fields[2] = escapeLatex(segmentPlain(segment))
      continue
    }

    const text = segmentLatex(segment)
    // Re-join a wrapped sentence: previous line ran on, this one starts lowercase.
    if (previous?.kind === 'paragraph' && !/[.:;!?]$/.test(previous.text) && /^[a-z]/.test(text)) {
      previous.text += ' ' + text
    } else {
      blocks.push({ kind: 'paragraph', text })
    }
  }

  return blocks
}

function emit(blocks: Block[]): string {
  const out: string[] = []
  let entries = false
  let items = false

  const closeItems = () => {
    if (items) out.push('  \\resumeItemListEnd')
    items = false
  }
  const closeEntries = () => {
    closeItems()
    if (entries) out.push('\\resumeSubHeadingListEnd')
    entries = false
  }

  for (const block of blocks) {
    switch (block.kind) {
      case 'name':
        out.push(`\\name{${block.text}}`)
        break
      case 'contact':
        out.push(`\\contact{${block.text}}`)
        break
      case 'section':
        closeEntries()
        out.push('', `\\section{${block.text}}`)
        break
      case 'subheading':
        closeItems()
        if (!entries) out.push('\\resumeSubHeadingListStart')
        entries = true
        out.push(`  \\resumeSubheading{${block.fields.join('}{')}}`)
        break
      case 'item':
        if (!items) out.push('  \\resumeItemListStart')
        items = true
        out.push(`    \\resumeItem{${block.text}}`)
        break
      case 'paragraph':
        closeEntries()
        out.push(block.text, '')
        break
    }
  }
  closeEntries()

  return `${PREAMBLE}
\\begin{document}

${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}

\\end{document}
`
}

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
}

function escapeLatex(text: string): string {
  return text
    .replace(/[\\&%$#_{}~^]/g, (char) => LATEX_ESCAPES[char] ?? `\\${char}`)
    .replace(/–/g, '--')
}

/** Wrap an email or bare URL in \href; anything else is escaped as text. */
function linkify(text: string): string {
  const value = text.replace(/^[|•·\s]+|[|•·\s]+$/g, '')
  if (/^[^\s@{}\\%#]+@[^\s@{}\\%#]+\.[a-z]{2,}$/i.test(value)) {
    return `\\href{mailto:${value}}{${escapeLatex(value)}}`
  }
  if (/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/[\w./-]*)?$/i.test(value) && !/^\d/.test(value)) {
    const url = /^https?:/i.test(value) ? value : `https://${value}`
    return `\\href{${url}}{${escapeLatex(value)}}`
  }
  return escapeLatex(value)
}

/** "EXPERIENCE" → "Experience"; mixed-case headings are left alone. */
function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text
  return text.toLowerCase().replace(/(^|[\s/&-])([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())
}

const PREAMBLE = String.raw`%------------------------------------------------------------------
% Converted from PDF by DevTrack. The structure is inferred from the
% layout, so skim it once — especially dates and multi-column parts.
%------------------------------------------------------------------
\documentclass[letterpaper,11pt]{article}

\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}
\setlength{\parindent}{0pt}
\raggedbottom
\raggedright

\titleformat{\section}{\vspace{-4pt}\scshape\raggedright\large}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\name}[1]{\begin{center}{\Huge \scshape #1}\end{center}\vspace{-8pt}}
\newcommand{\contact}[1]{\begin{center}\small #1\end{center}}
\newcommand{\resumeItem}[1]{\item\small{#1 \vspace{-2pt}}}
\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
`
