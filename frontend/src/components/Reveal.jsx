import { createElement } from 'react'
import { useReveal } from '../hooks/useReveal.js'

/**
 * @param {{
 *   as?: import('react').ElementType,
 *   delay?: number,
 *   className?: string,
 *   style?: import('react').CSSProperties,
 *   children?: import('react').ReactNode,
 * } & Record<string, unknown>} props
 */
export default function Reveal({
  as: Tag = 'div',
  delay = 0,
  className = '',
  style,
  children,
  ...rest
}) {
  const { ref, isVisible } = useReveal()
  const classes = ['reveal', isVisible ? 'is-visible' : '', className]
    .filter(Boolean)
    .join(' ')
  const mergedStyle = {
    ...(style ?? {}),
    '--reveal-delay': `${Number.isFinite(Number(delay)) ? Number(delay) : 0}ms`,
  }

  return createElement(
    Tag,
    { ...rest, ref, className: classes, style: mergedStyle },
    children,
  )
}
