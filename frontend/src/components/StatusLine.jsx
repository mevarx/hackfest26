import { chalkClass, smokeClass } from '../styles/classes.js'

/**
 * @typedef {object} StatusVariant
 * @property {string} label
 * @property {string} rootClass Ink for the word; the dot inherits it so an
 *   outlined dot strokes in the same colour as the text it sits beside.
 * @property {string} dotClass
 */

/** @type {Record<'running' | 'done' | 'waiting' | 'idle', StatusVariant>} */
const STATUS_VARIANTS = {
  // Outline plus the 1.5s opacity breath from index.css. Smoke because a
  // running task is not yet a fact the reader needs at full ink.
  running: {
    label: 'running',
    rootClass: smokeClass,
    dotClass: 'border border-current bg-transparent running-dot',
  },
  // The only filled dot in the system. Sage, not a bright success green, so it
  // cannot be mistaken for the single amber accent.
  done: {
    label: 'done',
    rootClass: chalkClass,
    dotClass: 'bg-pulse',
  },
  // Graphite outline carrying a 1px amber ring. Amber repeats per row here and
  // only here: "waiting for consent" genuinely blocks the run, so it is the
  // one documented exception to single-accent discipline. The ring is a
  // box-shadow rather than a border so the dot's own stroke stays Graphite.
  waiting: {
    label: 'waiting',
    rootClass: chalkClass,
    dotClass:
      'border border-graphite bg-transparent shadow-[0_0_0_1px_var(--color-compass-amber)]',
  },
  // Nothing happening. Fades back to the same muted ink as `running` so quiet
  // rows recede and active ones do not need a colour to stand out.
  idle: {
    label: 'idle',
    rootClass: smokeClass,
    dotClass: 'border border-graphite bg-transparent',
  },
}

const STATUS_LINE_CLASS = 'inline-flex items-center gap-1.5'

// 6px. The status line is a dot and a word — no box, no border, no fill — and
// the word carries no size or weight class so it inherits whatever weight the
// surrounding copy is set at.
const STATUS_DOT_CLASS = 'h-1.5 w-1.5 shrink-0 rounded-full'

/**
 * @param {{
 *   status?: keyof typeof STATUS_VARIANTS,
 *   label?: string,
 *   className?: string,
 * } & Record<string, unknown>} props
 */
export default function StatusLine({
  status = 'idle',
  label,
  className = '',
  ...rest
}) {
  const variant = STATUS_VARIANTS[status] ?? STATUS_VARIANTS.idle
  const classes = [STATUS_LINE_CLASS, variant.rootClass, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span {...rest} className={classes}>
      <span
        aria-hidden="true"
        data-status-indicator=""
        className={`${STATUS_DOT_CLASS} ${variant.dotClass}`}
      />
      <span>{label ?? variant.label}</span>
    </span>
  )
}
