// Shared class map for ReRoute.
//
// Every string here resolves to a token in `styles/tokens.css`, which is itself
// transcribed from ReRoute_Style_Reference.md. Rules that hold everywhere:
//
//   * weight 400 for body and every headline, 500 for labels — never 600/700
//   * hierarchy comes from hairlines and whitespace, never from tinted panels
//   * Compass Amber appears on exactly one element per screen
//   * status and source are a dot plus plain inline text, never a boxed pill
//
// Views compose these instead of re-deriving type or colour, so a token change
// lands in one place.

/* ── Ink ──────────────────────────────────────────────────────────────── */

export const chalkClass = 'text-chalk'
export const inkClass = 'text-ink'
export const smokeClass = 'text-smoke'
export const slateClass = 'text-slate'

/** 1px structural line. Graphite on dark surfaces, Fog on Paper. */
export const ruleDarkClass = 'border-graphite'
export const ruleLightClass = 'border-fog'

/** Reading measure for manifesto-style paragraphs. */
export const measureClass = 'max-w-[40rem]'

/* ── Type voices ──────────────────────────────────────────────────────── */

/** caption — sans 400, 13px, uppercase, tracked 0.04em. Section and field labels. */
export const captionClass =
  'font-utility text-caption font-normal uppercase leading-caption tracking-caption'

/** meta — mono 400, 12px. Timestamps, session ids, source tags, build info. */
export const metaClass = 'font-mono text-meta font-normal leading-meta tracking-meta'

/** body — sans 400, 16px/1.5. */
export const bodyClass = 'font-utility text-body font-normal leading-body'

/** label — sans 500, 14px/1.3. Form labels, agent names, button text. */
export const labelClass = 'font-utility text-label font-medium leading-label'

/** heading-sm — serif 400, 23px. Panel titles and the persona name line. */
export const headingSmClass =
  'font-editorial text-heading-sm font-normal leading-heading-sm'

/** heading — serif 400, 34px. */
export const headingClass = 'font-editorial text-heading font-normal leading-heading'

/** display — serif 400, 63px. Hero headline only. */
export const displayClass =
  'font-editorial text-display font-normal leading-display tracking-display'

/* ── Shared composites ────────────────────────────────────────────────── */

/** Section eyebrow: a caption that defers to the smoke ink. */
export const panelEyebrowClass = `${captionClass} ${smokeClass}`

/** Panel title: serif 400 at heading-sm, in whatever ink the panel carries. */
export const panelTitleClass = `mt-2 ${headingSmClass}`

/** Panel description: one measure of body copy at 70% of the panel's ink. */
export const panelDescriptionClass =
  `mt-3 ${measureClass} text-left ${bodyClass} opacity-70`

/** Small-caps label that opens a block inside a panel. */
export const sectionHeadingClass = `${captionClass} ${smokeClass}`

/** Label for a single data value. */
export const dataLabelClass = `${captionClass} ${smokeClass}`

/** Label set inline with the copy it describes. */
export const inlineLabelClass = `${labelClass} ${chalkClass}`

/** Monospace metadata row: source, adapter, cursor ids. */
export const metaRowClass = `flex flex-wrap items-center gap-x-3 gap-y-1 ${metaClass} ${smokeClass}`

/** Reading-width body paragraph. */
export const bodyCopyClass = `${measureClass} text-left ${bodyClass} ${smokeClass}`

/* ── Form controls ────────────────────────────────────────────────────── */

/** Dark-surface form control: 1px Graphite rule, 6px radius, Chalk text.
 *  Amber is the focus border and nothing else — no control carries a permanent
 *  colour, and hover only deepens the rule. */
export const controlBaseClass =
  'w-full rounded-input border border-graphite bg-carbon text-body text-chalk placeholder:text-smoke transition-colors hover:border-smoke focus:border-compass-amber focus:outline-2 focus:outline-offset-2 focus:outline-compass-amber focus-visible:border-compass-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-compass-amber disabled:opacity-50'

export const controlHeightClass = 'h-control'

/** Field label: sans 500, 14px, in the surface's own ink. */
export const controlFieldLabelClass = `block ${labelClass} ${chalkClass}`

/** Helper line under a field: one sentence, Smoke, no icon. Set at the caption
 *  size directly rather than by layering an override over `bodyClass` — two
 *  competing font-size utilities in one class list resolve by stylesheet order,
 *  not by the order they are written here. */
export const controlFieldHintClass = `mt-2 font-utility text-caption font-normal leading-6 ${smokeClass}`

/* ── Buttons ──────────────────────────────────────────────────────────── */

/** Exactly two button styles exist in the product.
 *  `primary` is a filled Ink block with Chalk text, 6-8px radius, uppercase —
 *  one per screen. `ghost` is a transparent 1px outline in the current text
 *  colour, where hover only raises the border's opacity. There is no third. */
export const buttonPrimaryClass =
  'border border-ink bg-ink text-chalk hover:border-chalk hover:bg-chalk hover:text-ink'

export const buttonGhostClass =
  'border border-current/60 bg-transparent text-current hover:border-current'

export const focusRingClass =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-compass-amber'
