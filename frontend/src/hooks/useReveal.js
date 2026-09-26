import { useEffect, useRef, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Observe an element once and flip to visible when it enters the viewport.
 * Respects `prefers-reduced-motion` by reporting visible immediately.
 *
 * @param {{ threshold?: number, rootMargin?: string }} [options]
 * @returns {{ ref: import('react').RefObject<HTMLElement | null>, isVisible: boolean }}
 */
export function useReveal({ threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches
    ) {
      return true
    }

    if (typeof IntersectionObserver === 'undefined') {
      return true
    }

    return false
  })

  useEffect(() => {
    if (isVisible) {
      return undefined
    }

    const element = ref.current

    if (!element || typeof IntersectionObserver === 'undefined') {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.disconnect()
            break
          }
        }
      },
      { threshold, rootMargin },
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [isVisible, threshold, rootMargin])

  return { ref, isVisible }
}

export default useReveal
