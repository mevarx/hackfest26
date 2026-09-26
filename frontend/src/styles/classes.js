// Shared class map for ReRoute.
//
// Every string here resolves to a token in `styles/tokens.css`, which is
// transcribed from ReRoute_Style_Reference.md. The rules that hold everywhere:
//
//   * weight 400 for everything except the nav wordmark and inline data labels
//     (500); 700 nowhere — scale and tracking carry hierarchy, never boldness
//   * Inter for all copy, JetBrains Mono for meta/labels/captions; two faces
//   * sections are separated by a 1px Graphite hairline, never by a tint change
//   * the glossy pill is the only filled surface; everything else is outlined
//   * Compass Gold is for icon strokes only — never text, never a background
//   * Pulse Green is the live-status dot and nothing else
//
// Two rules that are about *rhythm* rather than about ink, and that the
// earlier version of this file did not hold to:
//
//   * one size carries exactly one line-height, so two runs of the same size
//     are always the same height
//   * vertical space is quoted from the spacing scale below, never from an
//     arbitrary pixel value chosen at the call site
//
// Views compose these rather than re-deriving type or colour, so a token change
// lands in one place.

/* ── Ink ──────────────────────────────────────────────────────────────── */

export const chalkClass = 'text-chalk'
export const smokeClass = 'text-smoke'

/** 1px structural line — the page's primary border. */
export const ruleClass = 'border-graphite'

/** Reading measure for the hero sub-headline. */
export const readingClass = 'max-w-[38.75rem]'

/** Narrower centered measure for the manifesto block. */
export const manifestoClass = 'max-w-[37.5rem]'

/* ── Vertical rhythm ──────────────────────────────────────────────────────
 *
 * A short named scale rather than a pile of one-off `mt-*` values at the call
 * sites. Every gap on the page is one of these, which is what lets the eye
 * read the page as a stack of the same few intervals instead of a pile of
 * unrelated numbers. The values are 4px-grid multiples.
 */

/** Ties a label to the thing it names. */
export const gapLabelClass = 'mt-2'

/** Ties a heading to the copy that introduces it. */
export const gapHeadingClass = 'mt-3'

/** Separates two blocks of the same kind — a paragraph from a paragraph. */
export const gapBlockClass = 'mt-4'

/** Separates a run of content from a new group inside a panel. */
export const gapGroupClass = 'mt-8'

/** Separates two sibling groups in a panel. The panel's own sections. */
export const gapPanelClass = 'mt-16'

/** A section's air above its hairline and below it. */
export const gapSectionClass = 'mt-28 pt-28'

/** Reading measure + type together, for the hero sub-headline. */
export const measureClass = 'max-w-[38.75rem]'

/* ── Type voices ──────────────────────────────────────────────────────── */

/** caption — Inter 400, 13px. Section labels, helper copy, small annotations. */
export const captionClass = 'font-aeonik text-caption font-normal leading-caption'

/** meta — JetBrains Mono 400, 13px, -0.022em. Timestamps, ids, source and
 *  session tags. Mono is what makes these read as machine output rather than
 *  as prose, so the distinction between the two voices is load-bearing. */
export const metaClass = 'font-input text-caption font-normal leading-caption tracking-meta'

/** body — Inter 400, 16px. The reference's default reading size. */
export const bodyClass = 'font-aeonik text-body font-normal leading-body'

/** heading-xs — Inter 400, 18px. The nav wordmark's scale, reused for card
 *  titles that need more presence than a caption. */
export const headingXsClass = 'font-aeonik text-heading-xs font-normal leading-heading-xs'

/** subheading — Inter 400, 21px. The hero sub-headline. */
export const subheadingClass = 'font-aeonik text-subheading font-normal leading-subheading'

/** heading-sm — Inter 400, 23px. Panel titles, the manifesto title. */
export const headingSmClass = 'font-aeonik text-heading-sm font-normal leading-heading-sm'

/** heading — Inter 400, 34px. Section openers. */
export const headingClass = 'font-aeonik text-heading font-normal leading-heading'

/** display — Inter 400, 63px, -0.69px. The hero headline only.
 *  Note that this carries a *size*, so a caller that also sets a responsive
 *  size (e.g. `text-8 lg:text-display`) will see the token's `text-display`
 *  win below `lg`, because both land in the same cascade layer and the token is
 *  emitted later. Prefer `type-display` (below) when a responsive size is
 *  needed. */
export const displayClass = 'font-aeonik text-display font-normal leading-display tracking-display'

/** display without a size — the same voice, no size claim. Paired with a
 *  responsive size at the call site, which is the only way to step the hero
 *  headline 32 → 44 → 63px without the token's own size overriding it.
 *  `leading-display` is 1.05, which clips ascenders and descenders at the small
 *  steps, so the base step pairs this with `leading-tight` and the token takes
 *  over only at `lg`, where the 63px size it was tuned for actually applies. */
export const typeDisplayClass = 'font-aeonik font-normal leading-tight lg:leading-display tracking-display'

/* ── Shared composites ────────────────────────────────────────────────── */

/** Section eyebrow: a mono caption in muted ink. */
export const panelEyebrowClass = `${metaClass} ${smokeClass}`

/** Panel title: 23px Inter in the surface's own ink. */
export const panelTitleClass = headingSmClass

/** Panel description: one measure of body copy, muted. */
export const panelDescriptionClass = `mt-3 ${bodyClass} ${smokeClass} ${measureClass}`

/** Small-caps label that opens a block inside a panel. */
export const sectionHeadingClass = `${metaClass} ${smokeClass} uppercase`

/** Label for a single data value. */
export const dataLabelClass = `${metaClass} ${smokeClass} uppercase`

/** Label set inline with the copy it describes. */
export const inlineLabelClass = `font-aeonik text-body font-medium ${chalkClass}`

/** Monospace metadata row: source, adapter, cursor ids. */
export const metaRowClass = `flex flex-wrap items-center gap-x-4 gap-y-1 ${metaClass} ${smokeClass}`

/** Reading-width body paragraph. */
export const bodyCopyClass = `${bodyClass} ${smokeClass} ${measureClass}`

/* ── Structural ───────────────────────────────────────────────────────── */

/** Page content column. The reference forbids breaking the 1200px width. */
export const pageColumnClass = 'mx-auto w-full max-w-[75rem] px-6 sm:px-8'

/** A full-content-width 1px Graphite rule. "The line IS the page structure." */
export const dividerClass = 'h-px w-full bg-graphite'

/** Block border for cards and grids: Graphite on the sides and bottom, never
 *  the top, so a cell merges with the section divider above it. */
export const cellRuleClass = 'border-x border-b border-graphite'

/* ── Form controls ────────────────────────────────────────────────────── */

/** Form control: 1px Graphite rule, Carbon surface, Inter body text. There is
 *  no coloured border anywhere in this system — focus is an Ash ring, never a
 *  hue. The focus ring is applied through :focus-visible only, so a mouse click
 *  does not leave a ring behind but a keyboard tab does. */
export const controlBaseClass =
  'w-full rounded-[6px] border border-graphite bg-carbon px-3 text-body leading-body text-chalk placeholder:text-smoke transition-colors hover:border-iron focus:border-ash focus-visible:border-ash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ash disabled:opacity-50'

/** Every control is exactly 44px tall. One height for every field on the page
 *  is what makes a form read as a form; a select that is 40px next to a text
 *  input at 44px reads as two different systems. */
export const controlHeightClass = 'h-11'

/** Field label: Inter 14px, Chalk. One step below the 16px control it names,
 *  which is what makes the label read as subordinate to the field rather than
 *  as a second heading. */
export const controlFieldLabelClass = 'block font-aeonik text-sm font-normal leading-body text-chalk'

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

/** Every button is 44px tall, matching every form control, so a button sitting
 *  inline with a field lines up with it. */
export const buttonHeightClass = 'h-11'

export const buttonBaseClass =
  'inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-aeonik text-sm font-normal uppercase leading-none tracking-button transition-[background-color,filter,border-color,color] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ash'

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
