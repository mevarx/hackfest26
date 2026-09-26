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
    className: 'border-amber text-amber',
    dotClassName: 'bg-amber animate-pulse',
  },
  done: {
    label: 'Done',
    className: 'border-teal text-teal',
    dotClassName: 'bg-teal',
  },
  waiting: {
    label: 'Waiting for consent',
    className: 'border-red text-red',
    dotClassName: 'bg-red',
  },
  idle: {
    label: 'Idle',
    className: 'border-slate text-slate',
    dotClassName: 'bg-slate',
  },
}

const SOURCE_VARIANTS = {
  live: {
    label: 'LIVE',
    className: 'border-teal bg-teal text-navy',
    dotClassName: 'bg-navy',
  },
  simulated: {
    label: 'SIMULATED',
    className: 'border-amber text-amber',
    dotClassName: 'bg-amber',
  },
  local: {
    label: 'LOCAL',
    className: 'border-slate text-slate',
    dotClassName: 'bg-slate',
  },
  pending: {
    label: 'SOURCE PENDING',
    className: 'border-dashed border-slate text-slate',
    dotClassName: 'bg-slate',
  },
}

const BADGE_BASE_CLASS =
  'inline-flex h-badge w-fit shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-[0.65rem] font-bold uppercase leading-none tracking-[0.12em]'

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
  const sourceVariant = source === undefined ? null : SOURCE_VARIANTS[source]
  const statusVariant = status === undefined ? null : STATUS_VARIANTS[status]
  const variant = sourceVariant ?? statusVariant ?? STATUS_VARIANTS.idle
  const dotVariant = statusVariant ?? sourceVariant ?? STATUS_VARIANTS.idle
  const classes = [BADGE_BASE_CLASS, variant.className, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span {...rest} className={classes}>
      <span
        aria-hidden="true"
        data-badge-indicator=""
        className={`${BADGE_DOT_CLASS} ${dotVariant.dotClassName}`}
      />
      <span>{label ?? variant.label}</span>
    </span>
  )
}
