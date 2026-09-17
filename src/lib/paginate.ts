/**
 * Lays a rendered resume out as separate pages inside its preview frame.
 *
 * The document is one continuous flow, so this walks its smallest blocks
 * (headings, entries, bullets, paragraphs) and, whenever one would cross the
 * bottom margin of a page, inserts an invisible spacer that pushes it to the
 * top of the next page. Headings travel with the block that follows them.
 * Returns the page count; the caller draws the sheets behind the frame.
 *
 * Top and bottom margins come from the body's padding, which the renderer sets
 * per document (a LaTeX template's own geometry, for instance).
 */

interface PageBox {
  height: number
  /** Visual gap between sheets. */
  gap: number
}

/** Blocks that are never split, even though they contain other blocks. */
const KEEP_TOGETHER = '.entry, .entry-row, tr, pre, img, table'
const HEADING = /^H[1-6]$/

export function paginate(doc: Document, { height, gap }: PageBox): number {
  const view = doc.defaultView
  const body = doc.body
  if (!view || !body) return 1

  const bodyStyle = view.getComputedStyle(body)
  const marginTop = parseFloat(bodyStyle.paddingTop) || 0
  const marginBottom = parseFloat(bodyStyle.paddingBottom) || 0

  doc.querySelectorAll('[data-page-gap]').forEach((spacer) => spacer.remove())

  const isInline = (element: Element) => view.getComputedStyle(element).display.startsWith('inline')
  const blocks: Element[] = []
  const collect = (parent: Element) => {
    for (const child of parent.children) {
      const display = view.getComputedStyle(child).display
      if (display === 'none' || display.startsWith('inline')) continue
      const hasBlocks = [...child.children].some((grandchild) => !isInline(grandchild))
      if (hasBlocks && !child.matches(KEEP_TOGETHER)) collect(child)
      else blocks.push(child)
    }
  }
  collect(body)

  const top = (element: Element) => element.getBoundingClientRect().top + view.scrollY
  const pageStart = (page: number) => page * (height + gap)
  const contentTop = (page: number) => pageStart(page) + marginTop
  const contentBottom = (page: number) => pageStart(page) + height - marginBottom

  const pushTo = (element: Element, y: number) => {
    const spacer = doc.createElement('div')
    spacer.dataset.pageGap = ''
    // Zero height at first lets surrounding margins collapse exactly as before;
    // then grow it until the element lands where it should (margins can shift it).
    spacer.style.cssText = 'height:0;margin:0;padding:0;border:0'
    element.before(spacer)
    let size = 0
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delta = y - top(element)
      if (Math.abs(delta) < 0.5) break
      size = Math.max(0, size + delta)
      spacer.style.height = `${size}px`
    }
  }

  let page = 0
  let previous: Element | undefined

  for (const block of blocks) {
    while (top(block) >= contentTop(page + 1)) page += 1

    const rect = block.getBoundingClientRect()
    const bottom = rect.bottom + view.scrollY
    const fits = bottom <= contentBottom(page) + 0.5

    // Taller than a whole page: nothing to gain by moving it, let it run over.
    if (!fits && rect.height <= height - marginTop - marginBottom) {
      const orphanedHeading =
        previous && HEADING.test(previous.tagName) && top(previous) >= contentTop(page) ? previous : undefined
      pushTo(orphanedHeading ?? block, contentTop(page + 1))
      page += 1
    }

    while (block.getBoundingClientRect().bottom + view.scrollY > contentBottom(page) + 0.5) page += 1
    previous = block
  }

  const contentEnd = body.getBoundingClientRect().bottom + view.scrollY - marginBottom
  return Math.max(page + 1, Math.floor(Math.max(0, contentEnd - 1) / (height + gap)) + 1)
}
