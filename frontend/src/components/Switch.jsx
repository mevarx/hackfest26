import {
  captionClass,
  controlFieldHintClass,
  labelClass,
  smokeClass,
} from '../styles/classes.js'

// The switch is a checkbox, not a status light, so it gets no colour at all.
// Off is a Graphite outline, on is a Chalk outline — the state is legible from
// the knob's position and ink alone, which is why the same control works in
// the nav bar and inside the Ghost Twin panel without a themed variant.
// Amber appears only on focus-visible; it is never the track.
const TRACK_OFF_CLASS = 'border-graphite bg-transparent'
const TRACK_ON_CLASS = 'border-chalk bg-transparent'
const KNOB_OFF_CLASS = 'translate-x-0 bg-smoke'
const KNOB_ON_CLASS = 'translate-x-6 bg-chalk'

const TRACK_CLASS = [
  'relative mt-0.5 h-6 w-11 shrink-0 rounded-pill border transition-colors',
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
  'peer-focus-visible:outline-compass-amber',
  'peer-disabled:opacity-60',
].join(' ')
// 16px knob in a 44px track at 2px inset, translated 24px — it lands flush
// against the right inset, which is what makes the pill read as a track.
const KNOB_CLASS = 'absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform'

const SWITCH_LABEL_CLASS = `${labelClass} uppercase`
const SWITCH_STATE_CLASS = `${captionClass} ${smokeClass}`
const SWITCH_DESCRIPTION_CLASS = `${controlFieldHintClass} block max-w-md`

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
    'flex cursor-pointer items-start gap-3 rounded-input',
    'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-compass-amber',
    'has-disabled:cursor-not-allowed',
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
      <span aria-hidden="true" className={`${TRACK_CLASS} ${trackClass}`}>
        <span className={`${KNOB_CLASS} ${knobClass}`} />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={SWITCH_LABEL_CLASS}>{label}</span>
          {showState ? (
            <span className={SWITCH_STATE_CLASS}>{checked ? 'On' : 'Off'}</span>
          ) : null}
        </span>
        {description === undefined ? null : (
          <span id={descriptionId} className={SWITCH_DESCRIPTION_CLASS}>
            {description}
          </span>
        )}
      </span>
    </label>
  )
}
