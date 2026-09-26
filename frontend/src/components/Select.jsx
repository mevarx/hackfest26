import { controlBaseClass, controlHeightClass } from '../styles/classes.js'

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
  const classes = [
    controlBaseClass,
    controlHeightClass,
    'cursor-pointer appearance-none px-3 pr-9',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className="relative block">
      <select {...rest} className={classes}>
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-offwhite/50"
      >
        <ChevronIcon />
      </span>
    </span>
  )
}
