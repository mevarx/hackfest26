const MICRO_TEXT_SIZE_CLASS = 'text-[0.65rem]'
const LABEL_TRACKING_CLASS = 'tracking-[0.16em]'
const INLINE_TRACKING_CLASS = 'tracking-[0.12em]'
const EYEBROW_TRACKING_CLASS = 'tracking-[0.22em]'

// Monochrome editorial palette. Three inks only: black for values and titles,
// gray-700 for body copy and labels, gray-400 for captions and empty states.
// The single accent in the system is amber, and only on a focused control.
const INK_CLASS = 'text-[#0A0A0A]'
const SECONDARY_CLASS = 'text-[#4A4A4A]'
const QUIET_CLASS = 'text-[#8A8A8A]'
const RULE_CLASS = 'border-[#E4E4E4]'
const MEASURE_CLASS = 'max-w-[40rem]'

const MICRO_LABEL_BASE_CLASS = `font-bold uppercase ${MICRO_TEXT_SIZE_CLASS} ${LABEL_TRACKING_CLASS}`
const EYEBROW_BASE_CLASS = `font-semibold uppercase ${MICRO_TEXT_SIZE_CLASS} ${EYEBROW_TRACKING_CLASS}`

// Editorial monochrome controls: 1px gray-200 rule, black text on white.
// Amber appears ONLY on :focus / :focus-visible (border + ring), so an unfilled
// control never carries a permanent colour.
export const controlBaseClass =
  'w-full rounded-control border border-[#E4E4E4] bg-white text-sm text-[#0A0A0A] placeholder:text-[#8A8A8A] transition-colors hover:border-[#8A8A8A] focus:border-[#F5A623] focus:outline-2 focus:outline-offset-2 focus:outline-[#F5A623] focus-visible:border-[#F5A623] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623] disabled:opacity-50'

export const controlHeightClass = 'h-control'

export const controlFieldLabelClass = `block ${MICRO_LABEL_BASE_CLASS} ${INK_CLASS}`

export const controlFieldHintClass = `mt-2 text-xs leading-5 ${SECONDARY_CLASS}`

// Panel header classes carry typography only: they inherit the card's ink, so a
// light card reads black-on-white and a charcoal card reads white-on-dark
// without either variant needing a second copy of the same rule.
export const panelEyebrowClass = `${EYEBROW_BASE_CLASS} opacity-60`

export const panelTitleClass = 'mt-2 font-serif text-2xl leading-[1.1] tracking-[-0.02em]'

export const panelDescriptionClass = `mt-3 ${MEASURE_CLASS} text-left text-sm leading-6 opacity-70`

export const sectionHeadingClass = `${MICRO_LABEL_BASE_CLASS} ${SECONDARY_CLASS}`

export const dataLabelClass = `${MICRO_LABEL_BASE_CLASS} ${SECONDARY_CLASS}`

export const inlineLabelClass = `font-bold uppercase ${MICRO_TEXT_SIZE_CLASS} ${INLINE_TRACKING_CLASS} ${INK_CLASS}`

export const metaRowClass = `flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold uppercase ${MICRO_TEXT_SIZE_CLASS} ${INLINE_TRACKING_CLASS} ${QUIET_CLASS}`

export const bodyCopyClass = `${MEASURE_CLASS} text-left text-sm leading-6 ${SECONDARY_CLASS}`

// Tones stay exported so existing `tone="amber" | "teal" | "red"` callers keep
// working, but they all resolve to the same gray editorial treatment: a single
// 1px rule, no tinted surface, no teal/red/amber fill.
export const toneSurfaceClass = {
  neutral: RULE_CLASS,
  amber: RULE_CLASS,
  teal: RULE_CLASS,
  red: RULE_CLASS,
}

export const toneHeadingClass = {
  neutral: SECONDARY_CLASS,
  amber: SECONDARY_CLASS,
  teal: SECONDARY_CLASS,
  red: SECONDARY_CLASS,
}

export const toneTextClass = {
  neutral: SECONDARY_CLASS,
  amber: SECONDARY_CLASS,
  teal: SECONDARY_CLASS,
  red: SECONDARY_CLASS,
}
