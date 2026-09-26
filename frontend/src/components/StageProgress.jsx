import { captionClass, chalkClass, metaClass, smokeClass } from '../styles/classes.js'

// The connector is Graphite in every state and every segment, so the row reads as
// one continuous 1px line rather than as per-segment tints of "how far you got".
// Progress is carried by the dots alone; the line is structure.
const CONNECTOR_CLASS = 'bg-graphite'

// 10px. `rounded-full` here is a circle on a 10px dot, not the full-pill radius
// the reference reserves for the badge and the primary button — a card or a
// button never gets it.
const STAGE_DOT_CLASS = 'h-2.5 w-2.5 shrink-0 rounded-full'

/**
 * Dot and label treatment per stage state. Three states, one grammar:
 *
 *   active    — a solid Chalk dot with a Graphite halo, so the current step reads
 *               as the only filled node on the row. Pulse Green is deliberately
 *               NOT used here: the reference confines it to "the single
 *               live-status dot in the badge", and the live run already says so
 *               through the panel's own Status Badge. Spending the one accent the
 *               system allows on a second component would dilute it.
 *   complete  — a Graphite outline: finished, and receded to structure.
 *   upcoming  — a Graphite outline too, so an unstarted step is visually identical
 *               to a finished one. The row is a track, not a progress bar, and
 *               this component has no completion signal to report: the app only
 *               knows whether a session is open and whether its stream is still
 *               settling, so "complete" is never actually driven.
 *
 * The label differentiates by ink, never by weight: the reference bans bold and
 * semibold on display type, and the only available emphasis inside a caption is
 * Chalk against Smoke.
 */
/** @type {Record<'complete' | 'active' | 'upcoming', { dotClass: string, labelClass: string }>} */
const STATUS_DETAILS = {
  complete: {
    dotClass: 'border border-graphite bg-transparent',
    labelClass: smokeClass,
  },
  active: {
    dotClass: 'border border-chalk bg-chalk',
    labelClass: chalkClass,
  },
  upcoming: {
    dotClass: 'border border-graphite bg-transparent',
    labelClass: smokeClass,
  },
}

const DEFAULT_STATUS = 'upcoming'

// 13px Smoke set as body copy rather than as a second caption: the reference gives
// the stage row exactly one label, and a second tracked uppercase line under it
// would compete with the caption above. `leading-body` keeps the caption's
// unusually loose 2.69 off a two-line description.
const DESCRIPTION_CLASS = `mt-1 font-aeonik text-caption font-normal leading-body ${smokeClass}`

// The stage number is metadata about a row's position, not a label, so it is set
// in the Input voice — the system's own Aeonik/Input pairing, as on the Session
// Card. It stays aria-hidden because the row already announces "Step N of M".
const STAGE_NUMBER_CLASS = metaClass

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
