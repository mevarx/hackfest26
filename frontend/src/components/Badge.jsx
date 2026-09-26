/**
 * @typedef {object} BadgeProps
 * @property {'running' | 'done' | 'waiting' | 'idle'} [status]
 * @property {'live' | 'simulated' | 'local' | 'pending'} [source]
 * @property {string} [label]
 * @property {string} [className]
 */

const STATUS_VARIANTS = {
  running: {
    label: 'Running',
    rootClass: 'text-slate',
    dotClassName: 'bg-slate running-dot',
    labelClassName: 'font-medium uppercase tracking-[0.12em]',
  },
  done: {
    label: 'Done',
    rootClass: '',
    dotClassName: 'bg-current',
    labelClassName: 'font-medium uppercase tracking-[0.12em]',
  },
  waiting: {
    label: 'Waiting for consent',
    rootClass: '',
    dotClassName: 'border border-current bg-transparent',
    labelClassName: 'font-medium uppercase tracking-[0.12em]',
  },
  idle: {
    label: 'Idle',
    rootClass: 'text-slate',
    dotClassName: 'border border-current bg-transparent',
    labelClassName: 'font-medium uppercase tracking-[0.12em]',
  },
}

const SOURCE_VARIANTS = {
  live: {
    label: 'Live',
    rootClass: '',
    dotClassName: 'bg-current',
    showDot: true,
    labelClassName: 'font-normal',
    underline: false,
  },
  simulated: {
    label: 'Simulated',
    rootClass: 'text-slate',
    dotClassName: 'border border-current bg-transparent',
    showDot: true,
    labelClassName: 'font-normal',
    underline: false,
  },
  local: {
    label: 'Local',
    rootClass: 'text-slate',
    dotClassName: '',
    showDot: false,
    labelClassName: 'font-normal',
    underline: false,
  },
  pending: {
    label: 'Source pending',
    rootClass: 'text-slate',
    dotClassName: '',
    showDot: false,
    labelClassName: 'font-normal',
    underline: true,
  },
}

const BADGE_BASE_CLASS = 'inline-flex items-center gap-1.5 text-xs leading-5'

const BADGE_DOT_CLASS = 'h-1.5 w-1.5 shrink-0 rounded-full'

/**
 * @param {BadgeProps & Record<string, unknown>} props
 */
export default function Badge({
  status,
  source,
  label,
  className = '',
  ...rest
}) {
  const sourceVariant = source === undefined ? null : (SOURCE_VARIANTS[source] ?? null)
  const statusVariant = status === undefined ? null : (STATUS_VARIANTS[status] ?? null)
  const variant = sourceVariant ?? statusVariant ?? STATUS_VARIANTS.idle
  const dotVariant = statusVariant ?? sourceVariant ?? STATUS_VARIANTS.idle
  const showDot = dotVariant.showDot ?? true
  const dotClassName = dotVariant.dotClassName ?? STATUS_VARIANTS.idle.dotClassName
  const classes = [BADGE_BASE_CLASS, variant.rootClass, className]
    .filter(Boolean)
    .join(' ')
  const labelClasses = [
    variant.labelClassName,
    variant.underline ? 'border-b border-dashed border-current' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span {...rest} className={classes}>
      {showDot ? (
        <span
          aria-hidden="true"
          data-badge-indicator=""
          className={`${BADGE_DOT_CLASS} ${dotClassName}`}
        />
      ) : null}
      <span className={labelClasses}>{label ?? variant.label}</span>
    </span>
  )
}
