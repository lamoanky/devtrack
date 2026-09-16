import { useState } from 'react'
import { initials, tintFor } from '../lib/format'

interface Props {
  company: string
  /** Used to derive the domain when the company name alone is a poor guess. */
  jobUrl?: string
  /** Square edge length in pixels. */
  size?: number
  /** Desaturate, for applications that are closed out. */
  muted?: boolean
  className?: string
}

/**
 * Remembers, for this page load, which companies the server had no logo for, so
 * a scrolled-past row does not re-request a known miss and flash on every mount.
 * (The 404 itself is cached by the browser too; this just avoids the flicker.)
 */
const known404 = new Set<string>()

/**
 * The company's real logo, with the initials tile as the substrate.
 *
 * The tile renders immediately and the image fades in over it once loaded, so
 * there is never an empty square — and if the lookup 404s, the tile is simply
 * what stays on screen.
 */
export function CompanyLogo({ company, jobUrl, size = 36, muted = false, className = '' }: Props) {
  const cacheKey = `${company}|${jobUrl ?? ''}`
  const [failed, setFailed] = useState(() => known404.has(cacheKey))
  const [loaded, setLoaded] = useState(false)

  const params = new URLSearchParams({ company })
  if (jobUrl) params.set('jobUrl', jobUrl)

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-semibold ${tintFor(company)} ${muted ? 'grayscale' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      title={company}
    >
      <span aria-hidden={!failed}>{initials(company)}</span>

      {!failed && (
        <img
          src={`/api/logo?${params}`}
          alt={`${company} logo`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full bg-white object-contain p-[2px] transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => {
            known404.add(cacheKey)
            setFailed(true)
          }}
        />
      )}
    </span>
  )
}
