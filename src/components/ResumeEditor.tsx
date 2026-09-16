import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { escapeHtml } from '../lib/renderResume'
import type { ResumeFormat } from '../types'

interface Props {
  value: string
  format: ResumeFormat
  onChange: (value: string) => void
  readOnly?: boolean
}

/** Token colours borrowed from the GitHub light syntax theme. */
const C = {
  keyword: '#cf222e',
  entity: '#0550ae',
  string: '#0a3069',
  comment: '#6e7781',
  strong: '#1f2328',
}

/**
 * Highlights one already-escaped line. Both renderers stay strictly
 * character-preserving so the overlay lines up with the textarea beneath it.
 */
function highlightLine(line: string, format: ResumeFormat): string {
  const safe = escapeHtml(line)

  if (format === 'latex') {
    if (/^\s*%/.test(line)) return `<span style="color:${C.comment}">${safe}</span>`
    return safe
      .replace(/(\\[a-zA-Z@]+\*?)/g, `<span style="color:${C.keyword}">$1</span>`)
      .replace(/(\{|\})/g, `<span style="color:${C.entity}">$1</span>`)
  }

  if (format === 'markdown') {
    if (/^\s*#{1,6}\s/.test(line)) {
      return `<span style="color:${C.keyword};font-weight:600">${safe}</span>`
    }
    if (/^\s*[-*+]\s/.test(line)) {
      return safe.replace(/^(\s*[-*+])/, `<span style="color:${C.entity}">$1</span>`)
    }
    return safe
      .replace(/(\*\*[^*]+\*\*)/g, `<span style="color:${C.strong};font-weight:600">$1</span>`)
      .replace(/(`[^`]+`)/g, `<span style="color:${C.string}">$1</span>`)
  }

  if (format === 'html') {
    return safe
      .replace(/(&lt;\/?[a-zA-Z][\w-]*)/g, `<span style="color:${C.keyword}">$1</span>`)
      .replace(/([a-zA-Z-]+)(=)(&quot;[^&]*&quot;)/g, `$1$2<span style="color:${C.string}">$3</span>`)
  }

  return safe
}

export function ResumeEditor({ value, format, onChange, readOnly = false }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const overlay = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const lines = useMemo(() => value.split('\n'), [value])

  const html = useMemo(
    // The trailing newline keeps the last line visible while scrolled to the bottom.
    () => `${lines.map((line) => highlightLine(line, format) || '&nbsp;').join('\n')}\n`,
    [lines, format],
  )

  // Keep the gutter and the highlight layer pinned to the textarea's scroll position.
  useLayoutEffect(() => {
    const node = textarea.current
    if (!node) return
    const sync = () => {
      setScrollTop(node.scrollTop)
      if (overlay.current) {
        overlay.current.scrollTop = node.scrollTop
        overlay.current.scrollLeft = node.scrollLeft
      }
    }
    node.addEventListener('scroll', sync)
    return () => node.removeEventListener('scroll', sync)
  }, [])

  /** Tab inserts two spaces instead of leaving the editor. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab' || readOnly) return
    event.preventDefault()
    const node = event.currentTarget
    const { selectionStart, selectionEnd } = node
    const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
    onChange(next)
    requestAnimationFrame(() => {
      node.selectionStart = node.selectionEnd = selectionStart + 2
    })
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <div
        ref={gutter}
        className="editor-shared w-12 shrink-0 select-none overflow-hidden border-r border-outline-variant bg-background py-md text-right text-on-surface-variant"
      >
        <div style={{ transform: `translateY(${-scrollTop}px)` }}>
          {lines.map((_, index) => (
            <div key={index} className="px-xs">
              {index + 1}
            </div>
          ))}
        </div>
      </div>

      <div className="relative min-w-0 flex-1">
        <pre
          ref={overlay}
          aria-hidden="true"
          className="editor-shared pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-md text-on-surface"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <textarea
          ref={textarea}
          spellCheck={false}
          readOnly={readOnly}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Resume source"
          className="editor-shared absolute inset-0 h-full w-full resize-none whitespace-pre border-0 bg-transparent p-md text-transparent caret-primary outline-none"
        />
      </div>
    </div>
  )
}
