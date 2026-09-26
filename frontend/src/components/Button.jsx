import {
  buttonGhostClass,
  buttonPrimaryClass,
  focusRingClass,
} from '../styles/classes.js'

// Two buttons exist, and only two. `primary` is the single filled action a
// screen is allowed; `ghost` is everything else. There is no third style and no
// accent variant — Compass Amber is not a button colour in this system, it is
// the focus ring and the current-stage dot.
const VARIANT_CLASS = {
  // Solid Ink block, Chalk label, 6px radius (12px from the base). A page-local
  // primary action, not the top-level CTA — pills are reserved for the nav bar.
  primary: `${buttonPrimaryClass} py-3 px-6`,
  // No fill at rest *or* on hover. The 1px rule simply resolves from 60% to
  // full opacity, so the control never gains a second surface.
  ghost: `${buttonGhostClass} py-2.5 px-5`,
}

const BUTTON_BASE_CLASS = [
  'inline-flex items-center justify-center gap-2',
  'rounded-input font-utility text-label font-medium uppercase leading-none',
  'tracking-caption transition-colors',
  'disabled:pointer-events-none disabled:opacity-50',
  focusRingClass,
].join(' ')

/**
 * @param {{
 *   variant?: 'primary' | 'ghost',
 *   type?: 'button' | 'submit' | 'reset',
 *   className?: string,
 *   disabled?: boolean,
 *   children?: import('react').ReactNode,
 * } & Record<string, unknown>} props
 */
export default function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...rest
}) {
  const classes = [BUTTON_BASE_CLASS, VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary, className]
    .filter(Boolean)
    .join(' ')

  return <button {...rest} type={type} className={classes} />
}
