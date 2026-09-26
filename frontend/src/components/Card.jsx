import {
  chalkClass,
  panelDescriptionClass,
  panelEyebrowClass,
  panelTitleClass,
  smokeClass,
} from '../styles/classes.js'

// Card padding runs 32–48px, so the two large steps land on the two ends of that
// band and only the upper one waits for room. `sm` and `md` are kept for the
// tight framings that wrap a field group rather than a panel.
//
// The radius is the card token (12px) and nothing more: the reference's Don't
// list rules full pill radius out for cards, and 9999px is the badge's alone.
const PADDING_CLASS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-8',
  xl: 'p-8 sm:p-12',
}

// Header: eyebrow, 23px title, one measure of description. The separating space
// below it is 32px — the low end of the padding band — which is what lets the
// header sit on bare background with no rule of its own.
const HEADER_CLASS = 'flex flex-col gap-4 pb-8 sm:flex-row sm:items-start sm:justify-between'
const FOOTER_CLASS = 'pt-6'

// An empty panel says so in plain muted copy with room around it. No dashed
// placeholder border, no illustration, no "no data yet" box.
const EMPTY_STATE_CLASS = `px-6 py-16 text-center ${smokeClass}`

/**
 * Card: plain by default — no border, no fill, no shadow. The glossy pill's
 * bevel is the only shadow in the system, so a card that lifted itself would be
 * the one element in the page breaking the rule.
 *
 * Most content on this site sits directly on the Obsidian canvas and is
 * separated by whitespace plus a single 1px Graphite rule. A visible surface or
 * a hairline border is opt-in via `className`. The ink is always Chalk: this
 * system is dark-only, so there is no light variant to pick.
 *
 * @param {{
 *   as?: import('react').ElementType,
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
  const emptyStateClass = emptyState ? EMPTY_STATE_CLASS : ''

  const classes = [
    'min-w-0 rounded-card',
    chalkClass,
    emptyStateClass,
    className,
  ]
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

export { Card }
