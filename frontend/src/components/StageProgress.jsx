import { captionClass, chalkClass, smokeClass } from '../styles/classes.js'

// The rule is Graphite for every state and every segment, so the row reads as
// one continuous 1px line rather than per-segment tints of "how far you got".
// Progress is carried by the dots alone; the line is structure.
const CONNECTOR_CLASS = 'bg-graphite'

// 10px. Current is filled Compass Amber — the single accent on this screen.
// Completed is a solid Chalk dot, upcoming is an outline only. Nothing is
// padded, filled or numbered to signal state.
const STAGE_DOT_CLASS = 'h-2.5 w-2.5 shrink-0 rounded-full'

/** @type {Record<'complete' | 'active' | 'upcoming', { dotClass: string, labelClass: string }>} */
const STATUS_DETAILS = {
  complete: {
    dotClass: 'bg-chalk',
    labelClass: smokeClass,
  },
  active: {
    dotClass: 'bg-compass-amber',
    // The only label on the row at full ink and the only one above weight 400.
    labelClass: `font-medium ${chalkClass}`,
  },
  upcoming: {
    dotClass: 'border border-graphite bg-transparent',
    labelClass: smokeClass,
  },
}

const DEFAULT_STATUS = 'upcoming'

// 13px Smoke, set as body copy rather than as a second caption: the style
// reference gives the stage row exactly one label, and a tracked uppercase line
// under it would read as a second one competing with the caption above.
const DESCRIPTION_CLASS = `mt-1 font-utility text-caption font-normal leading-body ${smokeClass}`

// Stage data still carries 01/02/03/04, but the style reference retires those
// as standalone typography, so the number is folded into the caption at 11px —
// a metadata mark beside the label, never a headline of its own. It is hidden
// from assistive tech because the caption already announces "Step N of M".
const STAGE_NUMBER_CLASS = 'text-timestamp'

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
        const status =
          STATUS_DETAILS[stage.status ?? DEFAULT_STATUS] ??
          STATUS_DETAILS[DEFAULT_STATUS]
        const isLast = index === stages.length - 1

        return (
          <li
            key={stage.label}
            aria-current={stage.status === 'active' ? 'step' : undefined}
            className="relative flex-1"
          >
            <div className="flex items-center">
              <span aria-hidden="true" className={`${STAGE_DOT_CLASS} ${status.dotClass}`} />
              {isLast ? null : (
                <span
                  aria-hidden="true"
                  className={`mx-2 hidden h-px flex-1 lg:block ${CONNECTOR_CLASS}`}
                />
              )}
            </div>

            {isLast ? null : (
              <span
                aria-hidden="true"
                className={`absolute -bottom-6 left-[4.5px] top-4 w-px lg:hidden ${CONNECTOR_CLASS}`}
              />
            )}

            <div className="mt-3 lg:pr-6">
              <p className={`${captionClass} ${status.labelClass}`}>
                <span className="sr-only">
                  {`Step ${index + 1} of ${stages.length}: `}
                </span>
                {stage.number ? (
                  <span aria-hidden="true" className={STAGE_NUMBER_CLASS}>
                    {`${stage.number} · `}
                  </span>
                ) : null}
                {stage.label}
              </p>
              <p className={DESCRIPTION_CLASS}>{stage.description}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
