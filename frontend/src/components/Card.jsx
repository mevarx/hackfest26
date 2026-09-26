const DARK_TONE_SURFACE_CLASS = {
  neutral: {
    panel: 'border-rule bg-navy',
    raised: 'border-rule bg-navy-raised',
  },
  amber: 'border-amber/40 bg-amber/10',
  teal: 'border-teal/40 bg-teal/10',
  red: 'border-red/50 bg-red/10',
}

const LIGHT_TONE_SURFACE_CLASS = {
  neutral: 'border-rule-light bg-white',
  amber: 'border-amber/40 bg-amber/10',
  teal: 'border-teal/40 bg-teal/10',
  red: 'border-red/50 bg-red/10',
}

const DARK_TONE_RULE_CLASS = {
  neutral: 'border-rule',
  amber: 'border-amber/40',
  teal: 'border-teal/40',
  red: 'border-red/50',
}

const LIGHT_TONE_RULE_CLASS = {
  neutral: 'border-rule-light',
  amber: 'border-amber/40',
  teal: 'border-teal/40',
  red: 'border-red/50',
}

const DARK_EMPTY_STATE_CLASS = 'border-dashed border-slate/50 bg-transparent'
const LIGHT_EMPTY_STATE_CLASS = 'border-dashed border-rule-light bg-transparent'

const PADDING_CLASS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
}

const HEADER_CLASS =
  'flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between'
const FOOTER_CLASS = 'border-t px-5 py-3'

function getSurfaceClass(isLight, surface, tone, emptyState) {
  if (emptyState) {
    return isLight ? LIGHT_EMPTY_STATE_CLASS : DARK_EMPTY_STATE_CLASS
  }

  if (isLight) {
    return LIGHT_TONE_SURFACE_CLASS[tone] ?? LIGHT_TONE_SURFACE_CLASS.neutral
  }

  if (tone !== 'neutral') {
    return DARK_TONE_SURFACE_CLASS[tone]
  }

  return DARK_TONE_SURFACE_CLASS.neutral[surface] ?? DARK_TONE_SURFACE_CLASS.neutral.panel
}

/**
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
  surface = 'panel',
  tone = 'neutral',
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
  const isLight = variant === 'light'
  const hasHeader =
    eyebrow !== undefined ||
    title !== undefined ||
    description !== undefined ||
    actions !== undefined
  const surfaceClass = getSurfaceClass(isLight, surface, tone, emptyState)
  const toneRuleClass = isLight
    ? (LIGHT_TONE_RULE_CLASS[tone] ?? LIGHT_TONE_RULE_CLASS.neutral)
    : (DARK_TONE_RULE_CLASS[tone] ?? DARK_TONE_RULE_CLASS.neutral)
  const ruleClass = emptyState
    ? isLight
      ? 'border-rule-light'
      : 'border-slate/50'
    : toneRuleClass
  const classes = [
    'rounded-card border shadow-card',
    surfaceClass,
    isLight ? 'text-navy' : 'text-offwhite',
    emptyState && !isLight ? 'text-offwhite/70' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const Root = /** @type {import('react').ElementType} */ (Tag)
  const Heading = /** @type {import('react').ElementType} */ (TitleTag)

  return (
    <Root {...rest} className={classes}>
      {hasHeader ? (
        <div className={`${HEADER_CLASS} ${ruleClass}`}>
          <div className="min-w-0">
            {eyebrow === undefined ? null : (
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
                {eyebrow}
              </p>
            )}
            {title === undefined ? null : (
              <Heading id={titleId} className="mt-1 font-serif text-2xl">
                {title}
              </Heading>
            )}
            {description === undefined ? null : (
              <p className="mt-2 max-w-xl text-sm leading-6 opacity-60">
                {description}
              </p>
            )}
          </div>
          {actions === undefined ? null : (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      ) : null}
      <div className={PADDING_CLASS[padding] ?? PADDING_CLASS.lg}>{children}</div>
      {footer === undefined ? null : (
        <div className={`${FOOTER_CLASS} ${ruleClass}`}>{footer}</div>
      )}
    </Root>
  )
}
