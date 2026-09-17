import type { ResumeFormat } from '../types'
import { escapeHtml } from './html'
import { latexPageSetup, renderLatex, type LatexPageSetup } from './renderLatex'

/**
 * Turns resume source into a standalone HTML document that is dropped into the
 * preview <iframe> via `srcdoc`. The iframe is sandboxed, so the document is
 * inert — but we still escape everything that is not deliberately emitted.
 */

export { escapeHtml }

/** US Letter at 96dpi, with the margin used both on screen and in print. */
export const PAGE = { width: 816, height: 1056, margin: 57.6 }

/** Bold / italic / code / links, applied to already-escaped text. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
}

function renderMarkdown(source: string): string {
  const out: string[] = []
  let listOpen = false

  const closeList = () => {
    if (listOpen) {
      out.push('</ul>')
      listOpen = false
    }
  }

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd()

    if (!line.trim()) {
      closeList()
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeList()
      out.push('<hr />')
      continue
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      if (!listOpen) {
        out.push('<ul>')
        listOpen = true
      }
      out.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }

    closeList()
    out.push(`<p>${inline(line)}</p>`)
  }

  closeList()
  return out.join('\n')
}

const PAGE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: ${PAGE.margin}px;
    background: #ffffff;
    color: #111418;
    font-family: 'Charter', 'Georgia', 'Times New Roman', serif;
    font-size: 11.5pt;
    line-height: 1.42;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 22pt;
    letter-spacing: -0.01em;
    text-align: center;
  }
  h1 + p, p.contact {
    margin: 0 0 16px;
    text-align: center;
    font-size: 10pt;
    color: #3d444d;
  }
  h2 {
    margin: 18px 0 6px;
    padding-bottom: 2px;
    border-bottom: 1px solid #c9d1d9;
    font-size: 12pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  h3 { margin: 12px 0 2px; font-size: 11.5pt; }
  h4 { margin: 10px 0 2px; font-size: 11pt; font-weight: 600; }
  p { margin: 0 0 8px; }
  ul { margin: 4px 0 10px; padding-left: 20px; }
  li { margin-bottom: 3px; }
  a { color: #0969da; text-decoration: none; }
  code {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.88em;
    background: #f6f8fa;
    padding: 0 3px;
    border-radius: 3px;
  }
  hr { border: 0; border-top: 1px solid #d0d7de; margin: 14px 0; }
  em { color: #3d444d; }
  .entry { margin-top: 8px; }
  .entry-row { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
  .org { font-weight: 700; }
  .role { font-style: italic; }
  .meta { font-size: 10pt; color: #3d444d; white-space: nowrap; }
  .empty { color: #8c959f; font-style: italic; text-align: center; margin-top: 80px; }
  .center { text-align: center; }
  .right { text-align: right; }
  .sc { font-variant: small-caps; }
  .bold { font-weight: 700; }
  .italic { font-style: italic; }
  .size-Huge { font-size: 24pt; line-height: 1.2; }
  .size-huge { font-size: 20pt; line-height: 1.2; }
  .size-LARGE { font-size: 17pt; }
  .size-Large { font-size: 14pt; }
  .size-large { font-size: 12pt; }
  .plain-list { margin: 0 0 6px; }
  .table { margin: 2px 0; }
  .entry + ul, .entry + ol { margin-top: 2px; }
  .page-break { break-after: page; }
  @page { size: letter; margin: ${PAGE.margin}px; }
  @media print {
    body { padding: 0; }
    /* Same rules as the paginated preview: blocks move whole, headings stay with what follows. */
    p, li, pre, tr, img, .entry, .entry-row { break-inside: avoid; }
    h1, h2, h3, h4 { break-after: avoid; }
  }
`

/** Computer Modern, so LaTeX previews wrap lines where the PDF would. */
const CM_FONT_BASE = 'https://cdn.jsdelivr.net/gh/dreampulse/computer-modern-web-font@master/font/Serif/'
const CM_FONT_FACES = [
  ['cmunrm', 'normal', 'normal'],
  ['cmunbx', 'bold', 'normal'],
  ['cmunti', 'normal', 'italic'],
  ['cmunbi', 'bold', 'italic'],
]
  .map(
    ([file, weight, style]) =>
      `@font-face { font-family: 'Computer Modern Serif'; src: local('CMU Serif'), url('${CM_FONT_BASE}${file}.woff') format('woff'); font-weight: ${weight}; font-style: ${style}; font-display: block; }`,
  )
  .join('\n')

/** LaTeX's font sizes and baselines (pt) for each class option. */
const LATEX_SIZES = {
  10: { normal: [10, 12], small: [9, 11], large: [12, 14], Huge: [20.74, 25] },
  11: { normal: [10.95, 13.6], small: [10, 12], large: [12, 14], Huge: [24.88, 30] },
  12: { normal: [12, 14.5], small: [10.95, 13.6], large: [14.4, 18], Huge: [24.88, 30] },
}

/**
 * Typesetting that mirrors article.cls + titlesec + Jake's resume macros, so a
 * LaTeX preview takes the same space as the compiled PDF. The spacings follow
 * the template's own \vspace tweaks layered on LaTeX's list and section skips.
 */
function latexCss({ size, margin }: LatexPageSetup): string {
  const sizes = LATEX_SIZES[size]
  const font = ([fontSize, baseline]: number[]) => `font-size: ${fontSize}pt; line-height: ${baseline}pt;`
  const pad = `${margin.top}px ${margin.right}px ${margin.bottom}px ${margin.left}px`
  return `
  ${CM_FONT_FACES}
  body.latex {
    padding: ${pad};
    color: #000;
    font-family: 'Computer Modern Serif', 'CMU Serif', 'Latin Modern Roman', 'Times New Roman', serif;
    ${font(sizes.normal)}
    font-kerning: normal;
  }
  .latex a, .latex em { color: inherit; }
  .latex .size-Huge { ${font(sizes.Huge)} }
  .latex .size-large { ${font(sizes.large)} }
  .latex .center { ${font(sizes.small)} margin: 0 0 9pt; }
  .latex .center .size-Huge { line-height: ${sizes.Huge[0] * 1.05}pt; }
  .latex h1 { ${font(sizes.Huge)} font-weight: normal; font-variant: small-caps; letter-spacing: 0; margin: 0 0 2pt; }
  .latex h1 + p, .latex p.contact { ${font(sizes.small)} color: inherit; margin: 0 0 9pt; }
  .latex h2 {
    ${font(sizes.large)}
    font-weight: normal;
    font-variant: small-caps;
    text-transform: none;
    letter-spacing: 0;
    border-bottom: 0.4pt solid #000;
    padding-bottom: 1pt;
    margin: 12.5pt 0 0;
  }
  .latex p { margin: 0 0 4pt; }
  .latex .plain-list { margin: 0; padding-left: 0.15in; }
  .latex .plain-list > div { ${font(sizes.small)} margin-top: 5.8pt; }
  .latex .entry { margin-top: 8.5pt; }
  /* Jake's rows are a tabular* 0.97\textwidth wide, indented 0.15in by the list. */
  .latex .plain-list > .entry { width: calc(0.97 * (100% + 0.15in)); }
  .latex h2 + .plain-list > .entry:first-child,
  .latex h2 + .entry { margin-top: 3.8pt; }
  .latex .entry-row { gap: 0; line-height: ${sizes.normal[1]}pt; }
  .latex .entry-row + .entry-row { font-size: ${sizes.small[0]}pt; font-style: italic; }
  .latex .entry-row > span:first-child:not(.org):not(.role) { font-size: ${sizes.small[0]}pt; }
  .latex .meta { font-size: inherit; color: inherit; }
  .latex ul, .latex ol { margin: 0 0 1.5pt; padding-left: 2.2em; }
  .latex .entry + ul, .latex .entry + ol { margin-top: 0; }
  .latex li { ${font(sizes.small)} margin: 0 0 2pt; list-style-type: disc; }
  .latex li::marker { font-size: 0.7em; }
  @page { margin: ${pad}; }
`
}

/** Build the full `srcdoc` document for the preview iframe. */
export function renderResumeDocument(
  content: string,
  format: ResumeFormat,
  title = 'Resume preview',
): string {
  let inner: string
  let extraCss = ''
  let bodyClass = ''

  if (!content.trim()) {
    inner = '<p class="empty">Nothing to preview yet — start typing on the left.</p>'
  } else if (format === 'markdown') {
    inner = renderMarkdown(content)
  } else if (format === 'latex') {
    inner = renderLatex(content)
    extraCss = latexCss(latexPageSetup(content))
    bodyClass = ' class="latex"'
  } else {
    // 'html' — the author's own markup, rendered inside the sandboxed frame.
    inner = content
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_CSS}${extraCss}</style>
</head>
<body${bodyClass}>
${inner}
</body>
</html>`
}
