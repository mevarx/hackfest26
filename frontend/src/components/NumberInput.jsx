import { controlBaseClass, controlHeightClass, smokeClass } from '../styles/classes.js'

// index.css already strips the native number spinner; this draws a replacement
// in Smoke so the stepper belongs to the field's own ink — a control affordance
// inheriting the control's colour, never Compass Gold. Hover deepens to Chalk
// and tints the hit area with the Graphite hairline value: a surface step, not a
// colour. The focus ring is the system's Ash ring, never a hue.
const STEPPER_ROW_CLASS = 'absolute right-1 top-1 flex flex-col gap-0.5'
const STEPPER_BUTTON_CLASS = [
  'grid h-4 w-6 place-items-center rounded-[4px] transition-colors',
  'hover:bg-graphite hover:text-chalk',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ash',
  smokeClass,
].join(' ')

function toNumber(value) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function StepperIcon({ direction }) {
  const path =
    direction === 'up' ? 'M5 12.5 10 7.5 15 12.5' : 'M5 7.5 10 12.5 15 7.5'

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      fill="none"
      className="h-3.5 w-3.5"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * @param {{
 *   id?: string,
 *   value?: string | number,
 *   min?: string | number,
 *   max?: string | number,
 *   step?: string | number,
 *   onChange: (event: { target: { value: string } }) => void,
 *   disabled?: boolean,
 *   className?: string,
 * } & Record<string, unknown>} props
 */
export default function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  className = '',
  ...rest
}) {
  function stepBy(direction) {
    const current = toNumber(value)
    const base = current ?? toNumber(min) ?? 0
    const increment = toNumber(step) ?? 1
    const lowerBound = toNumber(min)
    const upperBound = toNumber(max)
    const stepped = base + direction * increment
    const raised = lowerBound === null ? stepped : Math.max(lowerBound, stepped)
    const next = upperBound === null ? raised : Math.min(upperBound, raised)

    onChange({ target: { value: String(next) } })
  }

  const classes = [
    controlBaseClass,
    controlHeightClass,
    'appearance-none px-3 pr-9',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className="relative block">
      <input
        {...rest}
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={classes}
      />
      <span aria-hidden="true" className={STEPPER_ROW_CLASS}>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => stepBy(1)}
          className={STEPPER_BUTTON_CLASS}
        >
          <StepperIcon direction="up" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => stepBy(-1)}
          className={STEPPER_BUTTON_CLASS}
        >
          <StepperIcon direction="down" />
        </button>
      </span>
    </span>
  )
}
