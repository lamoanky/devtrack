import type { ResumeFormat } from '../types'

/**
 * Turns resume source into a standalone HTML document that is dropped into the
 * preview <iframe> via `srcdoc`. The iframe is sandboxed, so the document is
 * inert — but we still escape everything that is not deliberately emitted.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

/**
 * A pragmatic renderer for the common "Jake's resume" LaTeX macro set — enough
 * to give a faithful live preview without shipping a TeX engine to the browser.
 * Anything it does not recognise is dropped, exactly like an unused package.
 */
function renderLatex(source: string): string {
  // Keep only the document body when the preamble is present.
  const body = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(source)?.[1] ?? source

  const out: string[] = []
  let listOpen = false

  const closeList = () => {
    if (listOpen) {
      out.push('</ul>')
      listOpen = false
    }
  }

  /** \textbf{x}, \textit{x}, \href{url}{label}, escaped % and &, en-dashes. */
  const text = (value: string) =>
    escapeHtml(value)
      .replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>')
      .replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>')
      .replace(/\\emph\{([^}]*)\}/g, '<em>$1</em>')
      .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '<a href="$1">$2</a>')
      .replace(/--/g, '&ndash;')
      .replace(/\\([%&$#_{}])/g, '$1')
      .replace(/\\[a-zA-Z]+/g, '')
      .trim()

  /** Split `{a}{b}{c}` into its brace groups, respecting nesting. */
  const groups = (value: string): string[] => {
    const found: string[] = []
    let depth = 0
    let current = ''
    for (const char of value) {
      if (char === '{') {
        depth += 1
        if (depth === 1) continue
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          found.push(current)
          current = ''
          continue
        }
      }
      if (depth > 0) current += char
    }
    return found
  }

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('%')) continue

    const command = /^\\([a-zA-Z]+)\s*(.*)$/.exec(line)
    const name = command?.[1]
    const rest = command?.[2] ?? ''

    if (name === 'name') {
      closeList()
      out.push(`<h1>${text(groups(rest)[0] ?? '')}</h1>`)
      continue
    }
    if (name === 'contact') {
      closeList()
      out.push(`<p class="contact">${text(groups(rest)[0] ?? '')}</p>`)
      continue
    }
    if (name === 'section') {
      closeList()
      out.push(`<h2>${text(groups(rest)[0] ?? '')}</h2>`)
      continue
    }
    if (name === 'resumeSubheading' || name === 'subheading') {
      closeList()
      const [org = '', place = '', role = '', dates = ''] = groups(rest)
      out.push(
        `<div class="entry">` +
          `<div class="entry-row"><span class="org">${text(org)}</span><span class="meta">${text(place)}</span></div>` +
          `<div class="entry-row"><span class="role">${text(role)}</span><span class="meta">${text(dates)}</span></div>` +
          `</div>`,
      )
      continue
    }
    if (name === 'resumeItem' || name === 'item') {
      if (!listOpen) {
        out.push('<ul>')
        listOpen = true
      }
      out.push(`<li>${text(groups(rest)[0] ?? rest)}</li>`)
      continue
    }
    // Structural macros (\begin, \end, \usepackage, list start/end…) render nothing.
    if (name) continue

    closeList()
    const paragraph = text(line)
    if (paragraph) out.push(`<p>${paragraph}</p>`)
  }

  closeList()
  return out.join('\n')
}

const PAGE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 40px 48px;
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
  @page { margin: 0.6in; }
`

/** Build the full `srcdoc` document for the preview iframe. */
export function renderResumeDocument(
  content: string,
  format: ResumeFormat,
  title = 'Resume preview',
): string {
  let inner: string

  if (!content.trim()) {
    inner = '<p class="empty">Nothing to preview yet — start typing on the left.</p>'
  } else if (format === 'markdown') {
    inner = renderMarkdown(content)
  } else if (format === 'latex') {
    inner = renderLatex(content)
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
<style>${PAGE_CSS}</style>
</head>
<body>
${inner}
</body>
</html>`
}
