const TRACK_OFF_CLASS = 'border-rule bg-navy-raised'
const TRACK_ON_CLASS = 'border-teal bg-teal'
const KNOB_OFF_CLASS = 'translate-x-0'
const KNOB_ON_CLASS = 'translate-x-6'

/**
 * @param {{
 *   id?: string,
 *   checked?: boolean,
 *   onChange?: (event: { target: { checked: boolean } }) => void,
 *   label?: string,
 *   description?: string,
 *   disabled?: boolean,
 *   showState?: boolean,
 *   className?: string,
 * } & Record<string, unknown>} props
 */
export default function Switch({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  showState = true,
  className = '',
  ...rest
}) {
  const descriptionId = description === undefined ? undefined : `${id}-description`
  const trackClass = checked ? TRACK_ON_CLASS : TRACK_OFF_CLASS
  const knobClass = checked ? KNOB_ON_CLASS : KNOB_OFF_CLASS
  const classes = [
    'flex cursor-pointer items-start gap-3 rounded-control focus-within:outline-2',
    'focus-within:outline-offset-2 focus-within:outline-amber has-disabled:cursor-not-allowed',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label {...rest} htmlFor={id} className={classes}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        aria-describedby={descriptionId}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-pill border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber peer-disabled:opacity-60 ${trackClass}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-offwhite transition-transform ${knobClass}`}
        />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold uppercase tracking-[0.12em] text-offwhite">
            {label}
          </span>
          {showState ? (
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-offwhite/40">
              {checked ? 'On' : 'Off'}
            </span>
          ) : null}
        </span>
        {description === undefined ? null : (
          <span
            id={descriptionId}
            className="mt-1 block max-w-md text-sm leading-5 text-offwhite/50"
          >
            {description}
          </span>
        )}
      </span>
    </label>
  )
}
