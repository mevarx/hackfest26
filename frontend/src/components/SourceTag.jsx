import { metaClass, smokeClass } from '../styles/classes.js'

/**
 * @typedef {object} SourceVariant
 * @property {string} text
 * @property {string} [dotClass] Omitted entirely for `local` and `pending`.
 * @property {boolean} [showDot]
 * @property {boolean} [separator] Leading "·", hidden from screen readers so
 *   the tag announces "live" rather than "dot live".
 * @property {boolean} [underline] Dotted rule under the words themselves — the
 *   only way this tag gets a line, and it never becomes a box.
 */

/** @type {Record<'live' | 'simulated' | 'local' | 'pending', SourceVariant>} */
const SOURCE_VARIANTS = {
  // Filled means the data is genuinely arriving from upstream.
  live: {
    text: 'live',
    dotClass: 'bg-current',
    showDot: true,
    separator: true,
  },
  // Outlined is the honest mark for a mocked feed: the shape says "not real"
  // without a second colour.
  simulated: {
    text: 'simulated',
    dotClass: 'border border-current bg-transparent',
    showDot: true,
    separator: true,
  },
  // Local needs no dot — absence is the quieter signal.
  local: {
    text: 'local',
    separator: true,
  },
  // Pending is not a state, it is a gap. No dot, no separator, and the dotted
  // underline hangs under the words only, like a to-be-filled field.
  pending: {
    text: 'source pending',
    underline: true,
  },
}

const SOURCE_TAG_CLASS = 'inline-flex items-center gap-1.5'

// 4px, half the status-line dot: source marks sit after body copy and must not
// compete with the state dot two inches to the left.
const SOURCE_DOT_CLASS = 'h-1 w-1 shrink-0 rounded-full'

/**
 * @param {{
 *   source?: keyof typeof SOURCE_VARIANTS,
 *   className?: string,
 * } & Record<string, unknown>} props
 */
export default function SourceTag({
  source = 'local',
  className = '',
  ...rest
}) {
  const variant = SOURCE_VARIANTS[source] ?? SOURCE_VARIANTS.local
  const classes = [SOURCE_TAG_CLASS, metaClass, smokeClass, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span {...rest} className={classes}>
      {variant.showDot && variant.dotClass !== undefined ? (
        <span
          aria-hidden="true"
          data-source-indicator=""
          className={`${SOURCE_DOT_CLASS} ${variant.dotClass}`}
        />
      ) : null}
      {variant.separator ? <span aria-hidden="true">·</span> : null}
      <span className={variant.underline ? 'border-b border-dotted border-current' : undefined}>
        {variant.text}
      </span>
    </span>
  )
}
