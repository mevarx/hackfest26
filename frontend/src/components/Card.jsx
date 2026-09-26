import {
  panelDescriptionClass,
  panelEyebrowClass,
  panelTitleClass,
} from '../styles/classes.js'

const PADDING_CLASS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
}

// Editorial header: eyebrow, serif title, one measure of description. No border,
// no tinted panel — the page background and whitespace do the separating.
const HEADER_CLASS = 'flex flex-col gap-4 pb-10 sm:flex-row sm:items-start sm:justify-between'
const FOOTER_CLASS = 'pt-6'

/**
 * Editorial Card: plain by default (no border, no shadow, no tinted bg).
 *
 * A visible bordered card is opt-in via `className`, and is reserved for the two
 * things that earn one — the demo persona summary and the two interactive
 * panels (Ghost Twin editor, route builder). Everything else sits directly on
 * the page background, separated by whitespace plus a single 1px rule.
 *
 * `tone`, `surface` and `emptyState` are kept for API compatibility but render
 * monochrome: no teal/red/amber surfaces, no dashed decorative borders. An empty
 * state is plain centered gray text with generous padding.
 *
 * @param {{
 *   as?: import('react').ElementType,
 *   variant?: 'dark' | 'light',
 *   surface?: 'panel' | 'raised',
 *   tone?: 'neutral' | 'amber' | 'teal' | 'red',
 *   padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl',
 *   emptyState?: boolean,
 *   eyebrow?: string,
 *   title?: string,
 *   titleAs?: import('react').ElementType,
 *   titleId?: string,
 *   description?: string,
 *   actions?: import('react').ReactNode,
 *   footer?: import('react').ReactNode,
 *   className?: string,
 *   children?: import('react').ReactNode,
 * } & Record<string, unknown>} props
 */
export default function Card({
  as: Tag = 'div',
  variant = 'dark',
  surface: _surface = 'panel',
  tone: _tone = 'neutral',
  padding = 'lg',
  emptyState = false,
  eyebrow,
  title,
  titleAs: TitleTag = 'h2',
  titleId,
  description,
  actions,
  footer,
  className = '',
  children,
  ...rest
}) {
  // Text colour follows the variant so a charcoal section can invert to
  // white-on-dark, while the default light sections read black-on-white.
  const variantTextClass = variant === 'light' ? 'text-[#0A0A0A]' : 'text-[#FAFAFA]'
  const emptyStateClass = emptyState ? 'px-6 py-16 text-center' : ''

  const classes = ['min-w-0', variantTextClass, emptyStateClass, className]
    .filter(Boolean)
    .join(' ')
  const Root = /** @type {import('react').ElementType} */ (Tag)
  const Heading = /** @type {import('react').ElementType} */ (TitleTag)

  return (
    <Root {...rest} className={classes}>
      {eyebrow === undefined &&
      title === undefined &&
      description === undefined &&
      actions === undefined ? null : (
        <div className={HEADER_CLASS}>
          <div className="min-w-0">
            {eyebrow === undefined ? null : (
              <p className={panelEyebrowClass}>{eyebrow}</p>
            )}
            {title === undefined ? null : (
              <Heading id={titleId} className={panelTitleClass}>
                {title}
              </Heading>
            )}
            {description === undefined ? null : (
              <p className={panelDescriptionClass}>{description}</p>
            )}
          </div>
          {actions === undefined ? null : (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className={PADDING_CLASS[padding] ?? PADDING_CLASS.lg}>{children}</div>
      {footer === undefined ? null : (
        <div className={FOOTER_CLASS}>{footer}</div>
      )}
    </Root>
  )
}
