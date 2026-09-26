import { controlBaseClass, controlHeightClass, smokeClass } from '../styles/classes.js'

// `appearance-none` retires the native arrow outright rather than letting the
// platform wedge its own geometry and colour into the field. The chevron is
// drawn in Smoke so it reads as a quiet affordance, stepping up to full Chalk
// only while the pointer is over the control.
const SELECT_WRAPPER_CLASS = 'group/select relative block'
const SELECT_CLASS = [
  controlBaseClass,
  controlHeightClass,
  'cursor-pointer appearance-none px-3 pr-9',
].join(' ')
const CHEVRON_SLOT_CLASS = `pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center transition-colors group-hover/select:text-chalk ${smokeClass}`

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * @param {{ className?: string, children?: import('react').ReactNode } & Record<string, unknown>} props
 */
export default function Select({ className = '', children, ...rest }) {
  const classes = [SELECT_CLASS, className].filter(Boolean).join(' ')

  return (
    <span className={SELECT_WRAPPER_CLASS}>
      <select {...rest} className={classes}>
        {children}
      </select>
      <span aria-hidden="true" className={CHEVRON_SLOT_CLASS}>
        <ChevronIcon />
      </span>
    </span>
  )
}
