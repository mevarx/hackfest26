const STATUS_DETAILS = {
  complete: {
    nodeClass: 'bg-neutral-900',
    connectorClass: 'bg-neutral-900/20',
    labelClass: 'text-gray-400',
  },
  active: {
    nodeClass: 'bg-[#F5A623]',
    connectorClass: 'bg-gray-200',
    labelClass: 'text-black',
  },
  upcoming: {
    nodeClass: 'border border-gray-400 bg-transparent',
    connectorClass: 'bg-gray-200',
    labelClass: 'text-gray-400',
  },
}

const DEFAULT_STATUS = 'upcoming'

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

        return (
          <li
            key={stage.label}
            aria-current={stage.status === 'active' ? 'step' : undefined}
            className="relative flex-1"
          >
            <div className="flex items-center">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${status.nodeClass}`}
              />
              {isLast ? null : (
                <span
                  aria-hidden="true"
                  className={`mx-3 hidden h-px flex-1 lg:block ${status.connectorClass}`}
                />
              )}
            </div>

            {isLast ? null : (
              <span
                aria-hidden="true"
                className={`absolute -bottom-6 left-[3.5px] top-4 w-px lg:hidden ${status.connectorClass}`}
              />
            )}

            <div className="mt-3 lg:pr-6">
              <p
                className={`text-xs font-medium uppercase tracking-[0.12em] ${status.labelClass}`}
              >
                <span className="sr-only">
                  {`Step ${index + 1} of ${stages.length}: `}
                </span>
                {stage.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                {stage.description}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
