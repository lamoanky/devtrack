import { escapeHtml } from './html'

/**
 * A pragmatic LaTeX → HTML renderer — enough for a faithful live preview of
 * resume templates without shipping a TeX engine to the browser.
 *
 * It works like a (very) small TeX: comments are stripped, the template's own
 * `\newcommand`s are expanded, and the result is parsed as commands, brace
 * groups and environments — so arguments may span lines, nest, and come from
 * any template. The common "Jake's resume" macros get dedicated markup; other
 * unknown commands vanish while their brace contents still render.
 */

interface Macro {
  arity: number
  /** Default for an optional first argument (`\newcommand{\x}[2][default]`). */
  optionalDefault?: string
  body: string
}

/** Rendered with dedicated markup, so a template's own definition is ignored. */
const SEMANTIC = new Set([
  'name',
  'contact',
  'resumeSubheading',
  'subheading',
  'resumeSubSubheading',
  'resumeProjectHeading',
  'resumeItem',
  'resumeSubItem',
])

/** Jake's list wrappers, for sources that use them without the preamble. */
const DEFAULT_MACROS: Record<string, Macro> = {
  resumeSubHeadingListStart: { arity: 0, body: '\\begin{itemize}[label={}]' },
  resumeSubHeadingListEnd: { arity: 0, body: '\\end{itemize}' },
  resumeItemListStart: { arity: 0, body: '\\begin{itemize}' },
  resumeItemListEnd: { arity: 0, body: '\\end{itemize}' },
}

/** Emitted by a bare `\item`; the enclosing list splits on it. */
const ITEM = `${String.fromCharCode(0)}item${String.fromCharCode(0)}`

const SYMBOLS: Record<string, string> = {
  cdot: '·',
  bullet: '•',
  textbullet: '•',
  vert: '|',
  textbar: '|',
  sim: '~',
  textasciitilde: '~',
  textasciicircum: '^',
  textbackslash: '\\',
  times: '×',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  star: '★',
  ldots: '…',
  dots: '…',
  textellipsis: '…',
  quad: ' ',
  qquad: ' ',
  LaTeX: 'LaTeX',
  TeX: 'TeX',
  S: '§',
  textendash: '–',
  textemdash: '—',
}

/** Size / shape switches that apply until the end of the current group. */
const DECLARATIONS: Record<string, string> = {
  Huge: '<span class="size-Huge">',
  huge: '<span class="size-huge">',
  LARGE: '<span class="size-LARGE">',
  Large: '<span class="size-Large">',
  large: '<span class="size-large">',
  scshape: '<span class="sc">',
  bfseries: '<span class="bold">',
  itshape: '<span class="italic">',
}

/**
 * Layout commands with no visible output, as their argument signature:
 * `o` an optional `[...]`, `m` a mandatory `{...}`.
 */
const IGNORED: Record<string, string> = {
  vspace: 'm',
  hspace: 'm',
  color: 'm',
  setlength: 'mm',
  addtolength: 'mm',
  fontsize: 'mm',
  rule: 'omm',
  phantom: 'm',
  label: 'm',
  pagestyle: 'm',
  thispagestyle: 'm',
  pagenumbering: 'm',
  setcounter: 'mm',
  linespread: 'm',
  input: 'm',
  include: 'm',
  usepackage: 'om',
  documentclass: 'om',
  geometry: 'm',
  hypersetup: 'm',
  urlstyle: 'm',
  definecolor: 'mmm',
  titleformat: 'ommmmmo',
  titlespacing: 'mmmm',
  extracolsep: 'm',
  enlargethispage: 'm',
  fancyhead: 'om',
  fancyfoot: 'om',
  fancyhf: 'm',
  setlist: 'om',
  titlerule: 'o',
}

function skipSpace(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i += 1
  return i
}

/** A balanced `{...}` at `i` (after whitespace), as [content, end]. */
function readGroup(s: string, i: number): [string, number] | null {
  const start = skipSpace(s, i)
  if (s[start] !== '{') return null
  let depth = 0
  for (let j = start; j < s.length; j += 1) {
    const char = s[j]
    if (char === '\\') j += 1
    else if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) return [s.slice(start + 1, j), j + 1]
  }
  return [s.slice(start + 1), s.length]
}

/** An optional `[...]` at `i` (after whitespace), as [content, end]. */
function readOptional(s: string, i: number): [string, number] | null {
  const start = skipSpace(s, i)
  if (s[start] !== '[') return null
  let depth = 0
  for (let j = start + 1; j < s.length; j += 1) {
    const char = s[j]
    if (char === '\\') j += 1
    else if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === ']' && depth === 0) return [s.slice(start + 1, j), j + 1]
  }
  return null
}

/** A macro name given as `{\name}` or `\name`, as [name, end]. */
function readMacroName(s: string, i: number): [string, number] | null {
  const group = readGroup(s, i)
  if (group) return [group[0].trim().replace(/^\\/, ''), group[1]]
  const start = skipSpace(s, i)
  const match = /^\\([a-zA-Z]+)/.exec(s.slice(start, start + 100))
  return match ? [match[1], start + match[0].length] : null
}

/** Consume a command's arguments per its `o`/`m` signature; returns the new index. */
function skipArgs(s: string, i: number, signature: string): number {
  for (const kind of signature) {
    const read = kind === 'o' ? readOptional(s, i) : readGroup(s, i)
    if (read) i = read[1]
  }
  return i
}

function stripComments(source: string): string {
  return source.replace(/(^|[^\\])%.*$/gm, '$1')
}

function readMacros(source: string): Record<string, Macro> {
  const macros: Record<string, Macro> = { ...DEFAULT_MACROS }
  const pattern = /\\(?:re|provide)?newcommand\*?/g
  while (pattern.exec(source)) {
    const named = readMacroName(source, pattern.lastIndex)
    if (!named) continue
    let [name, i] = named
    const count = readOptional(source, i)
    if (count) i = count[1]
    const optional = count ? readOptional(source, i) : null
    if (optional) i = optional[1]
    const body = readGroup(source, i)
    if (!body) continue
    pattern.lastIndex = body[1]
    if (SEMANTIC.has(name)) continue
    macros[name] = {
      arity: count ? Number.parseInt(count[0], 10) || 0 : 0,
      optionalDefault: optional?.[0],
      body: body[0],
    }
  }
  return macros
}

/** Expand user macros textually, so e.g. `\resumeItemListStart` can open an environment. */
function expandMacros(source: string, macros: Record<string, Macro>): string {
  for (let pass = 0; pass < 10; pass += 1) {
    const pattern = /\\([a-zA-Z]+)/g
    let out = ''
    let copied = 0
    let changed = false
    let match: RegExpExecArray | null

    while ((match = pattern.exec(source))) {
      const macro = macros[match[1]]
      if (!macro) continue

      let i = pattern.lastIndex
      const args: string[] = []
      if (macro.optionalDefault !== undefined) {
        const optional = readOptional(source, i)
        args.push(optional ? optional[0] : macro.optionalDefault)
        if (optional) i = optional[1]
      }
      while (args.length < macro.arity) {
        const group = readGroup(source, i)
        if (!group) break
        args.push(group[0])
        i = group[1]
      }

      // `\small#3` must not fuse into `\smallBachelor` once substituted.
      const expanded = macro.body.replace(
        /(\\[a-zA-Z]+)?#([1-9])/g,
        (_, command: string | undefined, n: string) =>
          (command ? `${command} ` : '') + (args[Number(n) - 1] ?? ''),
      )
      out += source.slice(copied, match.index) + expanded
      copied = i
      pattern.lastIndex = i
      changed = true
    }

    source = out + source.slice(copied)
    if (!changed || source.length > 500_000) break
  }
  return source
}

/** Split at top-level `\\` (rows) or `&` (cells), ignoring anything inside braces. */
function splitTopLevel(s: string, kind: 'row' | 'cell'): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let j = 0; j < s.length; j += 1) {
    const char = s[j]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === '\\') {
      if (kind === 'row' && depth === 0 && s[j + 1] === '\\') {
        parts.push(s.slice(start, j))
        const spacing = readOptional(s, j + 2)
        start = spacing ? spacing[1] : j + 2
        j = start - 1
      } else {
        j += 1
      }
    } else if (kind === 'cell' && char === '&' && depth === 0) {
      parts.push(s.slice(start, j))
      start = j + 1
    }
  }
  parts.push(s.slice(start))
  return parts
}

/** Index range of the body of `\begin{env}` starting at `i`: [bodyEnd, afterEnd]. */
function findEnd(s: string, i: number, env: string): [number, number] {
  const pattern = /\\(begin|end)\s*\{([^}]*)\}/g
  pattern.lastIndex = i
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = pattern.exec(s))) {
    if (match[2].trim() !== env) continue
    depth += match[1] === 'begin' ? 1 : -1
    if (depth === 0) return [match.index, pattern.lastIndex]
  }
  return [s.length, s.length]
}

const unescapeUrl = (url: string) => url.trim().replace(/\\([%&#_~$])/g, '$1')

class Renderer {
  private listDepth = 0

  render(s: string): string {
    let out = ''
    const closers: string[] = []
    const word = /[a-zA-Z]+/y
    let i = 0

    while (i < s.length) {
      const char = s[i]

      if (char === '\\') {
        const next = s[i + 1] ?? ''
        if (next === '\\') {
          const spacing = readOptional(s, i + 2)
          i = spacing ? spacing[1] : i + 2
          out += '<br />'
          continue
        }
        word.lastIndex = i + 1
        const name = word.exec(s)?.[0]
        if (!name) {
          // Control symbol: \% \& \$ \# \_ \{ \} and spacing like "\ " or "\,".
          out += /[%&$#_{}]/.test(next) ? escapeHtml(next) : ' '
          i += 2
          continue
        }
        i += 1 + name.length
        if (s[i] === '*') i += 1

        const declaration = DECLARATIONS[name]
        if (declaration) {
          out += declaration
          closers.push('</span>')
          continue
        }
        const [html, end] = this.command(name, s, i)
        out += html
        i = end
        continue
      }

      if (char === '{') {
        const group = readGroup(s, i)!
        out += this.render(group[0])
        i = group[1]
        continue
      }
      if (char === '$') {
        const close = s.indexOf('$', i + 1)
        const end = close === -1 ? s.length : close
        out += this.render(s.slice(i + 1, end))
        i = end + 1
        continue
      }
      if (/\s/.test(char)) {
        if (!out.endsWith(' ')) out += ' '
        i += 1
        continue
      }
      if (s.startsWith('---', i)) {
        out += '—'
        i += 3
        continue
      }
      if (s.startsWith('--', i)) {
        out += '–'
        i += 2
        continue
      }
      if (s.startsWith('``', i) || s.startsWith("''", i)) {
        out += char === '`' ? '“' : '”'
        i += 2
        continue
      }

      out +=
        char === '~' ? '&nbsp;' : char === '`' ? '‘' : char === "'" ? '’' : char === '}' || char === '&' ? '' : escapeHtml(char)
      i += 1
    }

    return out + closers.reverse().join('')
  }

  /** Render one control word whose arguments start at `i`; returns [html, end]. */
  private command(name: string, s: string, i: number): [string, number] {
    const arg = () => {
      const group = readGroup(s, i)
      if (!group) return ''
      i = group[1]
      return group[0]
    }
    const optional = () => {
      const read = readOptional(s, i)
      if (read) i = read[1]
      return read?.[0]
    }
    const content = () => this.render(arg())

    if (name in SYMBOLS) return [escapeHtml(SYMBOLS[name]), i]

    switch (name) {
      case 'textbf':
        return [`<strong>${content()}</strong>`, i]
      case 'textit':
      case 'emph':
      case 'textsl':
        return [`<em>${content()}</em>`, i]
      case 'underline':
      case 'uline':
        return [`<u>${content()}</u>`, i]
      case 'textsc':
        return [`<span class="sc">${content()}</span>`, i]
      case 'texttt':
        return [`<code>${content()}</code>`, i]
      case 'textcolor':
        arg()
        return [content(), i]
      case 'raisebox':
        arg()
        return [content(), i]
      case 'makebox':
        optional()
        optional()
        return [content(), i]
      case 'href': {
        const url = unescapeUrl(arg())
        return [`<a href="${escapeHtml(url)}">${content()}</a>`, i]
      }
      case 'url': {
        const url = unescapeUrl(arg())
        return [`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`, i]
      }
      case 'section':
        optional()
        return [`<h2>${content()}</h2>`, i]
      case 'subsection':
        optional()
        return [`<h3>${content()}</h3>`, i]
      case 'subsubsection':
        optional()
        return [`<h4>${content()}</h4>`, i]
      case 'name':
        return [`<h1>${content()}</h1>`, i]
      case 'contact':
        return [`<p class="contact">${content()}</p>`, i]
      case 'resumeSubheading':
      case 'subheading': {
        const [org, place, role, dates] = [content(), content(), content(), content()]
        return [
          `<div class="entry">` +
            `<div class="entry-row"><span class="org">${org}</span><span class="meta">${place}</span></div>` +
            `<div class="entry-row"><span class="role">${role}</span><span class="meta">${dates}</span></div>` +
            `</div>`,
          i,
        ]
      }
      case 'resumeSubSubheading': {
        const [role, dates] = [content(), content()]
        return [
          `<div class="entry"><div class="entry-row"><span class="role">${role}</span><span class="meta">${dates}</span></div></div>`,
          i,
        ]
      }
      case 'resumeProjectHeading': {
        const [title, dates] = [content(), content()]
        return [
          `<div class="entry"><div class="entry-row"><span>${title}</span><span class="meta">${dates}</span></div></div>`,
          i,
        ]
      }
      case 'resumeItem':
      case 'resumeSubItem': {
        // Outside a list (e.g. the bundled sample) these get wrapped afterwards.
        const orphan = this.listDepth === 0 ? ' class="orphan"' : ''
        return [`<li${orphan}>${content()}</li>`, i]
      }
      case 'item':
        optional()
        return [ITEM, i]
      case 'begin':
        return this.environment(arg().trim(), s, i)
      case 'end':
        arg()
        return ['', i]
      case 'newpage':
      case 'clearpage':
      case 'pagebreak':
        return ['<div class="page-break"></div>', i]
      case 'newcommand':
      case 'renewcommand':
      case 'providecommand': {
        const named = readMacroName(s, i)
        if (named) i = named[1]
        return ['', skipArgs(s, i, 'oom')]
      }
    }

    if (name in IGNORED) return ['', skipArgs(s, i, IGNORED[name])]
    // Unknown: drop the command; any brace groups that follow render as text.
    return ['', i]
  }

  private environment(env: string, s: string, start: number): [string, number] {
    const [bodyEnd, end] = findEnd(s, start, env)
    const body = s.slice(start, bodyEnd)
    const base = env.replace(/\*$/, '')

    if (base === 'itemize' || base === 'enumerate' || base === 'description') {
      const options = readOptional(body, 0)
      const plain = /label\s*=\s*\{\s*\}/.test(options?.[0] ?? '')
      this.listDepth += 1
      const [head, ...items] = this.render(options ? body.slice(options[1]) : body).split(ITEM)
      this.listDepth -= 1

      if (plain) {
        return [`<div class="plain-list">${head}${items.map((item) => `<div>${item}</div>`).join('')}</div>`, end]
      }
      const tag = base === 'enumerate' ? 'ol' : 'ul'
      return [`<${tag}>${head}${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`, end]
    }

    if (base === 'tabular' || base === 'tabularx') {
      // tabular*/tabularx take a width first; all take [pos]{colspec}.
      let i = env === 'tabular' ? 0 : (readGroup(body, 0)?.[1] ?? 0)
      i = skipArgs(body, i, 'om')
      const rows = splitTopLevel(body.slice(i), 'row')
        .map((row) => row.replace(/\\hline/g, ''))
        .filter((row) => row.trim())
        .map((row) => {
          const cells = splitTopLevel(row, 'cell').map((cell) => `<span>${this.render(cell).trim()}</span>`)
          return `<div class="entry-row">${cells.join('')}</div>`
        })
      return [`<div class="table">${rows.join('')}</div>`, end]
    }

    const signatures: Record<string, string> = { minipage: 'om', multicols: 'm', adjustwidth: 'mm' }
    const inner = this.render(body.slice(skipArgs(body, 0, signatures[base] ?? '')))
    if (base === 'center') return [`<div class="center">${inner}</div>`, end]
    if (base === 'flushright') return [`<div class="right">${inner}</div>`, end]
    return [inner, end]
  }
}

export interface LatexPageSetup {
  /** Base font size from `\documentclass[..pt]`. */
  size: 10 | 11 | 12
  /** Page margins in CSS pixels. */
  margin: { top: number; right: number; bottom: number; left: number }
}

const PAPER = { width: 8.5, height: 11 }

/** `0.5in`, `-.5in`, `2cm`, `15mm`, `36pt` → inches. */
function toInches(value: string): number | undefined {
  const match = /^\s*(-?\d*\.?\d+)\s*(in|cm|mm|pt|bp)\s*$/.exec(value)
  if (!match) return undefined
  const per = { in: 1, cm: 1 / 2.54, mm: 1 / 25.4, pt: 1 / 72.27, bp: 1 / 72 }
  return Number(match[1]) * per[match[2] as keyof typeof per]
}

/**
 * Page geometry as LaTeX would lay it out: article defaults, then `fullpage`,
 * then the template's `\setlength`/`\addtolength` tweaks, then `geometry`.
 * Only letter paper is modelled — the preview sheet is always US Letter.
 */
export function latexPageSetup(source: string): LatexPageSetup {
  const clean = stripComments(source)
  const option = /\\documentclass\s*\[([^\]]*)\]/.exec(clean)?.[1] ?? ''
  const size = Number(/\b(10|11|12)pt\b/.exec(option)?.[1] ?? 10) as 10 | 11 | 12

  // Article's own text block is narrow (345/360/390pt) and roughly centred.
  let width = { 10: 345, 11: 360, 12: 390 }[size] / 72.27
  let left = (PAPER.width - width) / 2
  let top = 1.5
  let height = PAPER.height - 3

  if (/\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bfullpage\b/.test(clean)) {
    ;[left, top, width, height] = [1, 1, 6.5, 9]
  }

  const lengths = /\\(set|addto)length\s*\{?\s*\\(oddsidemargin|topmargin|textwidth|textheight)\s*\}?\s*\{([^}]*)\}/g
  for (const [, kind, name, raw] of clean.matchAll(lengths)) {
    const value = toInches(raw)
    if (value === undefined) continue
    const add = kind === 'addto'
    // \oddsidemargin and \topmargin are measured from TeX's 1in origin.
    if (name === 'oddsidemargin') left = add ? left + value : 1 + value
    if (name === 'topmargin') top = add ? top + value : 1 + value
    if (name === 'textwidth') width = add ? width + value : value
    if (name === 'textheight') height = add ? height + value : value
  }

  let right = PAPER.width - left - width
  let bottom = PAPER.height - top - height

  const geometry = [
    /\\usepackage\s*\[([^\]]*)\]\s*\{geometry\}/.exec(clean)?.[1],
    /\\geometry\s*\{([^}]*)\}/.exec(clean)?.[1],
  ]
    .filter(Boolean)
    .join(',')
  for (const pair of geometry.split(',')) {
    const [key, raw = ''] = pair.split('=').map((part) => part.trim())
    const value = toInches(raw)
    if (value === undefined) continue
    if (key === 'margin') [top, right, bottom, left] = [value, value, value, value]
    if (key === 'hmargin') [left, right] = [value, value]
    if (key === 'vmargin') [top, bottom] = [value, value]
    if (key === 'left' || key === 'lmargin') left = value
    if (key === 'right' || key === 'rmargin') right = value
    if (key === 'top' || key === 'tmargin') top = value
    if (key === 'bottom' || key === 'bmargin') bottom = value
  }

  const px = (inches: number) => Math.round(Math.min(3, Math.max(0.2, inches)) * 96 * 10) / 10
  return { size, margin: { top: px(top), right: px(right), bottom: px(bottom), left: px(left) } }
}

export function renderLatex(source: string): string {
  const clean = stripComments(source)
  const body = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(clean)?.[1] ?? clean
  const html = new Renderer().render(expandMacros(body, readMacros(clean)))

  return html
    .replace(/(?:<li class="orphan">[\s\S]*?<\/li>\s*)+/g, (run) => `<ul>${run}</ul>`)
    .split(ITEM)
    .join('')
}
