import { useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { renderResumeDocument } from '../lib/renderResume'
import type { Resume } from '../types'

interface Props {
  resume: Resume
  /** Live editor buffer — previews unsaved edits. */
  content: string
}

const ZOOMS = [50, 67, 80, 90, 100, 125, 150]

/**
 * The embedded document view.
 *
 * For 'embed' resumes the iframe points at an external editor (Overleaf, Google
 * Docs, a hosted PDF) so it can be viewed — and edited, where the provider
 * allows it — without leaving DevTrack. For every other format we render the
 * source ourselves and hand the iframe a `srcdoc`, which keeps the preview
 * working offline and printable.
 */
export function ResumePreview({ resume, content }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [zoom, setZoom] = useState(100)

  const isExternal = resume.format === 'embed'
  const srcDoc = useMemo(
    () => (isExternal ? undefined : renderResumeDocument(content, resume.format, resume.name)),
    [isExternal, content, resume.format, resume.name],
  )

  const step = (direction: 1 | -1) => {
    const index = ZOOMS.indexOf(zoom)
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, index + direction))]
    setZoom(next)
  }

  /** Browser print dialog on the rendered document — the "save as PDF" path. */
  const print = () => {
    const view = frame.current?.contentWindow
    if (!view) return
    view.focus()
    view.print()
  }

  const openStandalone = () => {
    if (isExternal) {
      if (resume.embedUrl) window.open(resume.embedUrl, '_blank', 'noopener')
      return
    }
    const blob = new Blob([srcDoc ?? ''], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    // Give the new tab time to load before releasing the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const download = () => {
    const extension = resume.format === 'latex' ? 'tex' : resume.format === 'html' ? 'html' : 'md'
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = resume.name.includes('.') ? resume.name : `${resume.name}.${extension}`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between gap-sm border-b border-outline-variant bg-surface px-md">
        <span className="flex items-center gap-xs text-body-md text-on-surface">
          <Icon name={isExternal ? 'public' : 'visibility'} size={16} />
          {isExternal ? 'Embedded document' : 'Live preview'}
        </span>

        <div className="flex items-center gap-xs">
          {!isExternal && (
            <>
              <button
                className="btn-ghost btn-sm"
                onClick={() => step(-1)}
                disabled={zoom === ZOOMS[0]}
                aria-label="Zoom out"
              >
                <Icon name="zoom_out" size={16} />
              </button>
              <span className="w-11 text-center font-mono text-body-sm text-on-surface-variant">
                {zoom}%
              </span>
              <button
                className="btn-ghost btn-sm"
                onClick={() => step(1)}
                disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                aria-label="Zoom in"
              >
                <Icon name="zoom_in" size={16} />
              </button>
              <span className="mx-xs h-4 w-px bg-outline-variant" />
              <button className="btn-ghost btn-sm" onClick={print} title="Print / save as PDF">
                <Icon name="print" size={16} />
              </button>
              <button className="btn-ghost btn-sm" onClick={download} title="Download source">
                <Icon name="download" size={16} />
              </button>
            </>
          )}
          <button className="btn-ghost btn-sm" onClick={openStandalone} title="Open in a new tab">
            <Icon name="open_in_new" size={16} />
          </button>
        </div>
      </div>

      {isExternal && !resume.embedUrl ? (
        <div className="flex flex-1 items-center justify-center p-lg text-center text-body-md text-on-surface-variant">
          Add an embed URL in the document settings to view this resume here.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-lg">
          {isExternal ? (
            <iframe
              ref={frame}
              title={`${resume.name} (embedded)`}
              src={resume.embedUrl}
              className="h-full min-h-[600px] w-full rounded-md border border-outline-variant bg-background shadow-overlay"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="mx-auto origin-top transition-transform"
              style={{
                width: 816, // 8.5in at 96dpi
                transform: `scale(${zoom / 100})`,
                // Keep the scroll extent honest as the page scales.
                marginBottom: zoom < 100 ? 0 : `${(zoom / 100 - 1) * 1056}px`,
              }}
            >
              <iframe
                ref={frame}
                title={`${resume.name} preview`}
                srcDoc={srcDoc}
                sandbox="allow-same-origin allow-modals"
                className="h-[1056px] w-full rounded-md border border-outline-variant bg-white shadow-overlay"
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
