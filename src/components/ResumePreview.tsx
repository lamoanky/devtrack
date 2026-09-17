import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Menu, MenuItem } from './Menu'
import { PAGE, renderResumeDocument } from '../lib/renderResume'
import { downloadResumePdf } from '../lib/printResume'
import { paginate } from '../lib/paginate'
import { usePersistentState } from '../hooks/usePersistentState'
import type { Resume } from '../types'

interface Props {
  resume: Resume
  /** Live editor buffer — previews unsaved edits. */
  content: string
}

const ZOOMS = [50, 67, 80, 90, 100, 125, 150]

/** Space between page sheets, in unscaled pixels. */
const PAGE_GAP = 24

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
  const viewport = useRef<HTMLDivElement>(null)
  // 'fit' scales the page to the pane's width (never past 100%), so a narrow
  // pane shows the whole page instead of a horizontally scrolling slice.
  const [zoomMode, setZoomMode] = usePersistentState<number | 'fit'>('devtrack.previewZoom', 'fit')
  const [fitZoom, setFitZoom] = useState(100)

  const isExternal = resume.format === 'embed'
  const srcDoc = useMemo(
    () => (isExternal ? undefined : renderResumeDocument(content, resume.format, resume.name)),
    [isExternal, content, resume.format, resume.name],
  )

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => {
      const style = getComputedStyle(element)
      const available =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      setFitZoom(Math.max(25, Math.min(100, Math.floor((available / PAGE.width) * 100))))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [isExternal, resume.embedUrl])

  const [pages, setPages] = useState(1)

  // Split the rendered document into pages once it loads (every edit reloads
  // the srcdoc), and again when web fonts settle and change line heights.
  useEffect(() => {
    const iframe = frame.current
    if (isExternal || !iframe) return
    const layout = () => {
      const doc = iframe.contentDocument
      if (!doc?.body) return
      // Transparent, so the sheets drawn behind the frame show through.
      doc.documentElement.style.background = 'transparent'
      doc.body.style.background = 'transparent'
      const run = () => {
        if (iframe.contentDocument === doc) setPages(paginate(doc, { height: PAGE.height, gap: PAGE_GAP }))
      }
      run()
      void doc.fonts?.ready.then(run)
    }
    iframe.addEventListener('load', layout)
    layout()
    return () => iframe.removeEventListener('load', layout)
  }, [isExternal])

  const sheetHeight = pages * PAGE.height + (pages - 1) * PAGE_GAP
  const zoom = zoomMode === 'fit' ? fitZoom : zoomMode

  const step = (direction: 1 | -1) => {
    const next =
      direction === 1 ? ZOOMS.find((z) => z > zoom) : [...ZOOMS].reverse().find((z) => z < zoom)
    if (next !== undefined) setZoomMode(next)
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
              <button
                className={`w-12 rounded-md py-[2px] text-center font-mono text-body-sm hover:bg-surface-container-high ${
                  zoomMode === 'fit' ? 'text-primary' : 'text-on-surface-variant'
                }`}
                onClick={() => setZoomMode('fit')}
                title={zoomMode === 'fit' ? 'Fitting page to width' : 'Fit page to width'}
                aria-pressed={zoomMode === 'fit'}
              >
                {zoom}%
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => step(1)}
                disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                aria-label="Zoom in"
              >
                <Icon name="zoom_in" size={16} />
              </button>
              <span className="mx-xs h-4 w-px bg-outline-variant" />
              <Menu
                label="Download"
                className="w-48"
                triggerClassName="btn-ghost btn-sm"
                trigger={
                  <>
                    <Icon name="download" size={16} />
                    Download
                    <Icon name="expand_more" size={16} />
                  </>
                }
              >
                {(close) => (
                  <>
                    <MenuItem
                      icon="code"
                      onSelect={() => {
                        close()
                        download()
                      }}
                    >
                      Source file
                    </MenuItem>
                    <MenuItem
                      icon="picture_as_pdf"
                      onSelect={() => {
                        close()
                        downloadResumePdf(resume, content)
                      }}
                    >
                      PDF
                    </MenuItem>
                  </>
                )}
              </Menu>
            </>
          )}
        </div>
      </div>

      {isExternal && !resume.embedUrl ? (
        <div className="flex flex-1 items-center justify-center p-lg text-center text-body-md text-on-surface-variant">
          Add an embed URL in the document settings to view this resume here.
        </div>
      ) : (
        <div ref={viewport} className="min-h-0 flex-1 overflow-auto p-lg">
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
            // A transform does not change layout size, so the outer box takes the
            // scaled dimensions — that keeps it centred and the scroll extent honest.
            <div
              className="mx-auto"
              style={{ width: (PAGE.width * zoom) / 100, height: (sheetHeight * zoom) / 100 }}
            >
              <div
                className="relative origin-top-left transition-transform"
                style={{ width: PAGE.width, height: sheetHeight, transform: `scale(${zoom / 100})` }}
              >
                {Array.from({ length: pages }, (_, index) => (
                  <div
                    key={index}
                    aria-hidden="true"
                    className="absolute inset-x-0 rounded-md border border-outline-variant bg-white shadow-overlay"
                    style={{ top: index * (PAGE.height + PAGE_GAP), height: PAGE.height }}
                  />
                ))}
                <iframe
                  ref={frame}
                  title={`${resume.name} preview`}
                  srcDoc={srcDoc}
                  sandbox="allow-same-origin allow-modals"
                  // A matching color-scheme keeps the frame's canvas transparent.
                  style={{ height: sheetHeight, colorScheme: 'light' }}
                  className="relative block w-full border-0 bg-transparent"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
