const STATUS_DETAILS = {
  complete: {
    nodeClass: 'border-teal bg-teal text-navy',
    connectorClass: 'bg-teal/50',
    labelClass: 'text-teal',
  },
  active: {
    nodeClass: 'border-amber bg-amber text-navy',
    connectorClass: 'bg-amber/50',
    labelClass: 'text-amber',
  },
  upcoming: {
    nodeClass: 'border-slate bg-navy text-slate',
    connectorClass: 'bg-slate/30',
    labelClass: 'text-offwhite/70',
  },
}

const DEFAULT_STATUS = 'upcoming'

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      fill="none"
      className="h-3 w-3"
    >
      <path
        d="M4.5 10.5 8.5 14.5 15.5 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * @param {{
 *   stages?: {
 *     number?: string,
 *     label: string,
 *     description: string,
 *     status?: 'complete' | 'active' | 'upcoming',
 *   }[],
 *   className?: string,
 * }} props
 */
export default function StageProgress({ stages = [], className = '' }) {
  if (stages.length === 0) {
    return null
  }

  return (
    <ol className={`flex flex-col gap-6 lg:flex-row lg:gap-0 ${className}`.trim()}>
      {stages.map((stage, index) => {
        const status = STATUS_DETAILS[stage.status] ?? STATUS_DETAILS[DEFAULT_STATUS]
        const isLast = index === stages.length - 1
        const number = stage.number ?? String(index + 1).padStart(2, '0')

        return (
          <li
            key={stage.label}
            aria-current={stage.status === 'active' ? 'step' : undefined}
            className="relative flex-1"
          >
            <div className="flex items-center">
              <span
                aria-hidden="true"
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${status.nodeClass}`}
              >
                {stage.status === 'complete' ? <CheckIcon /> : null}
              </span>
              {isLast ? null : (
                <span
                  aria-hidden="true"
                  className={`mx-2 hidden h-0.5 flex-1 rounded-full lg:block ${status.connectorClass}`}
                />
              )}
            </div>

            {isLast ? null : (
              <span
                aria-hidden="true"
                className={`absolute -bottom-6 left-2 top-6 w-0.5 rounded-full lg:hidden ${status.connectorClass}`}
              />
            )}

            <div className="mt-3 lg:pr-6">
              <p className="font-mono text-[0.65rem] font-bold text-amber">
                {number}
              </p>
              <p
                className={`mt-1 text-sm font-bold uppercase tracking-[0.12em] ${status.labelClass}`}
              >
                {stage.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-offwhite/50">
                {stage.description}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
