interface IconProps {
  name: string
  size?: number
  className?: string
  fill?: boolean
}

/** Material Symbols glyph. The font is loaded once in index.html. */
export function Icon({ name, size = 18, className = '', fill = false }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`icon shrink-0 ${className}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  )
}
