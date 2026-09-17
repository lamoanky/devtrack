import { renderResumeDocument } from './renderResume'
import type { Resume } from '../types'

/**
 * Saves a resume as PDF through the browser's print dialog. Printing keeps the
 * text selectable (ATS-friendly), which a canvas-based PDF library would not.
 *
 * The document is rendered into a hidden iframe so this works from anywhere,
 * not just the preview pane. Browsers name the PDF after the *top-level* page
 * title, so that is swapped to the resume name for the duration of the dialog.
 */
export function downloadResumePdf(resume: Resume, content: string) {
  const name = resume.name.replace(/\.[^.]+$/, '')
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  frame.srcdoc = renderResumeDocument(content, resume.format, name)

  frame.onload = async () => {
    const view = frame.contentWindow
    if (!view) return frame.remove()
    // Web fonts (Computer Modern for LaTeX) must be in before the page is laid out.
    await frame.contentDocument?.fonts.ready
    const previousTitle = document.title
    const restore = () => {
      document.title = previousTitle
      // Removing the frame inside the print call cancels the dialog in some browsers.
      setTimeout(() => frame.remove(), 1000)
    }
    view.addEventListener('afterprint', restore, { once: true })
    document.title = name
    view.focus()
    view.print()
  }

  document.body.appendChild(frame)
}
