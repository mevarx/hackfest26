const MICRO_TEXT_SIZE_CLASS = 'text-[0.65rem]'
const LABEL_TRACKING_CLASS = 'tracking-[0.16em]'
const INLINE_TRACKING_CLASS = 'tracking-[0.12em]'
const EYEBROW_TRACKING_CLASS = 'tracking-[0.22em]'

const MICRO_LABEL_BASE_CLASS = `font-bold uppercase ${MICRO_TEXT_SIZE_CLASS} ${LABEL_TRACKING_CLASS}`
const EYEBROW_BASE_CLASS = `font-semibold uppercase ${MICRO_TEXT_SIZE_CLASS} ${EYEBROW_TRACKING_CLASS}`

export const controlBaseClass =
  'w-full rounded-control border border-rule bg-navy-raised text-sm text-offwhite placeholder:text-offwhite/40 transition-colors focus:border-amber focus:outline-2 focus:outline-offset-2 focus:outline-amber disabled:opacity-50'

export const controlHeightClass = 'h-control'

export const controlFieldLabelClass = `block ${MICRO_LABEL_BASE_CLASS} text-offwhite/50`

export const controlFieldHintClass = 'mt-2 text-xs leading-5 text-offwhite/40'

export const panelEyebrowClass = EYEBROW_BASE_CLASS

export const panelTitleClass = 'mt-1 font-serif text-2xl'

export const panelDescriptionClass = 'mt-2 max-w-xl text-sm leading-6 text-offwhite/70'

export const sectionHeadingClass = `${MICRO_LABEL_BASE_CLASS} text-offwhite/50`

export const dataLabelClass = `${MICRO_LABEL_BASE_CLASS} text-offwhite/40`

export const inlineLabelClass = `font-bold uppercase ${MICRO_TEXT_SIZE_CLASS} ${INLINE_TRACKING_CLASS}`

export const metaRowClass = `flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold uppercase ${MICRO_TEXT_SIZE_CLASS} ${INLINE_TRACKING_CLASS} text-offwhite/40`

export const bodyCopyClass = 'text-sm leading-6 text-offwhite/70'

export const toneSurfaceClass = {
  neutral: 'border-rule bg-navy-raised',
  amber: 'border-amber/40 bg-amber/10',
  teal: 'border-teal/40 bg-teal/10',
  red: 'border-red/50 bg-red/10',
}

export const toneHeadingClass = {
  neutral: 'text-offwhite/50',
  amber: 'text-amber',
  teal: 'text-teal',
  red: 'text-red',
}

export const toneTextClass = {
  neutral: 'text-offwhite/70',
  amber: 'text-amber',
  teal: 'text-teal',
  red: 'text-red',
}
