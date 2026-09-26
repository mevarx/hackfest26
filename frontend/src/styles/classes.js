// Shared class map for ReRoute — Hyperstudio Ditto.
//
// Every string here resolves to a token in `styles/tokens.css`, which is
// transcribed from ReRoute_Style_Reference.md. The rules that hold everywhere:
//
//   * weight 400 for everything except the nav wordmark (500) and 700 nowhere
//     on display type — scale and tracking carry hierarchy, never boldness
//   * Aeonik for all copy, Input for meta/labels/captions; two faces, no serif
//   * sections are separated by a 1px Graphite hairline, never by a tint change
//   * the glossy pill is the only filled surface; everything else is outlined
//   * Compass Gold is for icon strokes only — never text, never a background
//   * Pulse Green is the live-status dot and nothing else
//
// Views compose these rather than re-deriving type or colour, so a token change
// lands in one place.

/* ── Ink ──────────────────────────────────────────────────────────────── */

export const chalkClass = 'text-chalk'
export const smokeClass = 'text-smoke'
export const ashClass = 'text-ash'
export const goldClass = 'text-compass-gold'

/** 1px structural line — the page's primary border. */
export const ruleClass = 'border-graphite'

/** Reading measure for the hero sub-headline. */
export const readingClass = 'max-w-[38.75rem]'

/** Narrower centered measure for the manifesto block. */
export const manifestoClass = 'max-w-[37.5rem]'

/* ── Type voices ──────────────────────────────────────────────────────── */

/** caption — Aeonik 400, 13px, loose leading. Section labels, helper copy. */
export const captionClass =
  'font-aeonik text-caption font-normal leading-caption'

/** meta — Input 400, 13px, -0.022em. Timestamps, ids, source and session tags. */
export const metaClass = 'font-input text-caption font-normal tracking-meta'

/** body — Aeonik 400, 16px/1.25. The reference's default reading size. */
export const bodyClass = 'font-aeonik text-body font-normal leading-body'

/** heading-xs — Aeonik 400, 18px. The nav wordmark's scale, reused for card
 *  titles that need more presence than a caption. */
export const headingXsClass = 'font-aeonik text-heading-xs font-normal leading-heading-xs'

/** subheading — Aeonik 400, 21px. The hero sub-headline. */
export const subheadingClass =
  'font-aeonik text-subheading font-normal leading-subheading'

/** heading-sm — Aeonik 400, 23px. Panel titles, the manifesto title. */
export const headingSmClass =
  'font-aeonik text-heading-sm font-normal leading-heading-sm'

/** heading — Aeonik 400, 34px. Section openers. */
export const headingClass = 'font-aeonik text-heading font-normal leading-heading'

/** heading-lg — Aeonik 400, 44px, -0.31px. The tablet step of the display. */
export const headingLgClass =
  'font-aeonik text-heading-lg font-normal leading-heading-lg tracking-heading-lg'

/** display — Aeonik 400, 63px, -0.69px. The hero headline only. */
export const displayClass =
  'font-aeonik text-display font-normal leading-display tracking-display'

/* ── Shared composites ────────────────────────────────────────────────── */

/** Section eyebrow: a caption in muted ink. */
export const panelEyebrowClass = `${metaClass} ${smokeClass}`

/** Panel title: 23px Aeonik in the surface's own ink. */
export const panelTitleClass = headingSmClass

/** Panel description: one measure of body copy, muted. */
export const panelDescriptionClass = `mt-4 ${bodyClass} ${smokeClass}`

/** Small-caps label that opens a block inside a panel. */
export const sectionHeadingClass = `${captionClass} ${smokeClass} uppercase`

/** Label for a single data value. */
export const dataLabelClass = `${metaClass} ${smokeClass} uppercase`

/** Label set inline with the copy it describes. */
export const inlineLabelClass = `font-aeonik text-body font-medium ${chalkClass}`

/** Monospace metadata row: source, adapter, cursor ids. */
export const metaRowClass = `flex flex-wrap items-center gap-x-4 gap-y-1 ${metaClass} ${smokeClass}`

/** Reading-width body paragraph. */
export const bodyCopyClass = `${bodyClass} ${smokeClass}`

/* ── Structural ───────────────────────────────────────────────────────── */

/** Page content column. The reference forbids breaking the 1200px width. */
export const pageColumnClass = 'mx-auto w-full max-w-[75rem] px-6 sm:px-8'

/** A full-content-width 1px Graphite rule. "The line IS the page structure." */
export const dividerClass = 'h-px w-full bg-graphite'

/** Section rhythm, 120px — the low end of the reference's 120–210px band. */
export const sectionGapClass = 'mt-30 pt-30'

/** Block border for cards and grids: Graphite on the sides and bottom, never
 *  the top, so a cell merges with the section divider above it. */
export const cellRuleClass = 'border-x border-b border-graphite'

/* ── Form controls ────────────────────────────────────────────────────── */

/** Form control: 1px Graphite rule, Carbon surface, Aeonik body text. There is
 *  no coloured border anywhere in this system — focus is a Chalk ring, never a
 *  hue. */
export const controlBaseClass =
  'w-full rounded-[6px] border border-graphite bg-carbon text-body text-chalk placeholder:text-smoke transition-colors hover:border-iron focus:border-ash focus:outline-2 focus:outline-offset-2 focus:outline-ash focus-visible:border-ash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ash disabled:opacity-50'

export const controlHeightClass = 'h-11'

/** Field label: Aeonik 14px, Chalk. */
export const controlFieldLabelClass = 'block font-aeonik text-body text-sm font-normal text-chalk'

/** Helper line under a field: 13px Smoke, one sentence, no icon. */
export const controlFieldHintClass = `mt-2 ${captionClass} ${smokeClass}`

/* ── Buttons ──────────────────────────────────────────────────────────── */

/** The glossy pill. This is the single filled surface in the whole system and
 *  the only element permitted a shadow — the inset highlight is the bevel that
 *  makes it read as premium rather than as a flat dark-mode button. */
export const buttonGlossyClass =
  'rounded-button bg-[linear-gradient(180deg,#ffffff_0%,#e9e9e6_100%)] text-obsidian shadow-button hover:brightness-[1.04]'

/** The ghost outline. No fill to speak of, no shadow, and on hover the surface
 *  lightens — the border colour never changes. */
export const buttonGhostClass =
  'rounded-button border border-[#2a2a2a] bg-[rgba(255,255,255,0.03)] text-chalk hover:bg-[rgba(255,255,255,0.06)]'

export const buttonBaseClass =
  'inline-flex items-center gap-2 font-aeonik text-sm font-normal uppercase leading-none tracking-button transition-[background-color,filter,border-color] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ash'

/* ── Status ───────────────────────────────────────────────────────────── */

/** The status badge's Pulse Green dot: 6px, solid, with the reference's
 *  "very subtle glow". This is the only place Pulse Green is used. */
export const pulseDotClass = 'h-1.5 w-1.5 shrink-0 rounded-full bg-pulse-green shadow-pulse'

/** A plain inline status mark for text that is not a badge — a dot plus a word,
 *  never a pill. Used where a value needs a live/done cue without earning the
 *  badge's box. */
export const inlineDotClass = 'h-1.5 w-1.5 shrink-0 rounded-full'

/* ── Icons ────────────────────────────────────────────────────────────── */

/** Icon strokes: 1.5px outlined, Compass Gold. The reference forbids any other
 *  colour for an icon, and forbids icons on any other element type. */
export const iconGoldClass = 'text-compass-gold'

/** Icon strokes in Chalk, for the rare icon that sits on a dark field without
 *  the gold treatment. */
export const iconChalkClass = 'text-chalk'

export const iconStrokeClass =
  'shrink-0 fill-none stroke-current stroke-[1.5px] stroke-linecap-round stroke-linejoin-round'
