import { iconChalkClass, iconGoldClass, iconStrokeClass } from '../styles/classes.js'

// The reference sanctions icons as "the only other graphic motif: 1.5px outlined
// strokes in Compass Gold or Chalk, geometric and minimal", and assigns each
// pipeline agent a subject in the Pipeline Agent Card spec. One map, one
// component: every glyph is the same 24-unit outline drawn with strokes only, so
// a new icon can never introduce a third colour, a fill, or a new visual voice.
const ICON_GLYPHS = {
  // Skills Discovery — "a checklist mark": a rounded box with two ticks inside.
  'skills-discovery': (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M7.5 10 9.5 12 13 7.5" />
      <path d="M7.5 16 9.5 18 13 13.5" />
    </>
  ),
  // Market Intelligence — "a radar sweep": concentric arcs off one corner and a
  // single radial, which is the whole reading of a sweep in outline form.
  'market-intelligence': (
    <>
      <path d="M4 20a4 4 0 0 1 4-4" />
      <path d="M4 20a8.5 8.5 0 0 1 8.5-8.5" />
      <path d="M4 20a13 13 0 0 1 13-13" />
      <path d="M4 20 20.5 3.5" />
    </>
  ),
  // Learning Pathway — "a compass": the ring plus a slim needle. Straight
  // segments only, so the two other curved glyphs stay the only curves here.
  'learning-pathway': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5 14.8 12 12 20.5 9.2 12Z" />
    </>
  ),
  // Inclusive Matching — "a handshake": two arms meeting on a clasp, kept
  // angular because at 24–32px an illustrated handshake turns to mush.
  'inclusive-matching': (
    <>
      <path d="M3 9.5H8l4 4" />
      <path d="M21 9.5h-5l-4 4" />
      <path d="M8 9.5v6l4 3 4-3V9.5" />
      <path d="M12 13.5v5" />
    </>
  ),
  // Employer Readiness — "a building": a facade of three window strokes over a
  // base line, which is the whole subject at this size.
  'employer-readiness': (
    <>
      <path d="M5.5 20.5v-16h13v16" />
      <path d="M9 8.5h2.5" />
      <path d="M13 8.5h2.5" />
      <path d="M9 13h7" />
      <path d="M3 20.5h18" />
    </>
  ),
  // Bias Audit — "a ghost/twin silhouette": the same rounded outline twice,
  // offset, with the ghost copy dashed so the pair reads as a comparison.
  'bias-audit': (
    <>
      <rect x="5" y="6.5" width="12" height="15" rx="3" />
      <rect x="7.5" y="2.5" width="12" height="15" rx="3" strokeDasharray="3 3" />
    </>
  ),
  // Passport — the Session Card's "document/passport glyph": a page with text
  // lines ruled across it.
  passport: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 8.5h7" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15.5h4.5" />
    </>
  ),
}

/**
 * @typedef {keyof typeof ICON_GLYPHS} IconName
 */

/** Icon strokes live in Compass Gold unless a caller explicitly asks for Chalk;
 *  the reference forbids every other colour and forbids icons as decoration. */
const TONE_CLASS = {
  gold: iconGoldClass,
  chalk: iconChalkClass,
}

const DEFAULT_TONE = 'gold'

/**
 * The sanctioned icon motif: a 1.5px outlined stroke glyph in Compass Gold or
 * Chalk. `size` is set in px through an inline style so a caller gets an exact
 * box at any number without a matching width/height utility pair; `className`
 * merges over it.
 *
 * @param {{
 *   name?: IconName,
 *   size?: number,
 *   tone?: keyof typeof TONE_CLASS,
 *   label?: string,
 *   className?: string,
 *   style?: import('react').CSSProperties,
 * }} props
 */
export default function Icon({
  name,
  size = 24,
  tone = DEFAULT_TONE,
  label,
  className = '',
  style,
  ...rest
}) {
  const glyph = name === undefined ? undefined : ICON_GLYPHS[name]

  // An unknown name renders nothing rather than a broken box: the glyph map is
  // the contract, and a missing entry is a caller bug, not a reason to draw ink.
  if (glyph === undefined) {
    return null
  }

  const toneClass = TONE_CLASS[tone] ?? TONE_CLASS[DEFAULT_TONE]
  const classes = [iconStrokeClass, toneClass, className].filter(Boolean).join(' ')

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label === undefined ? 'true' : undefined}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      focusable="false"
      {...rest}
      className={classes}
      style={{ width: size, height: size, ...style }}
    >
      {glyph}
    </svg>
  )
}
