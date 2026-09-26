import { useCallback, useEffect, useRef, useState } from 'react'
import { getRoute } from '../api.js'
import { isAbortError } from '../lib/guards.js'
import {
  bodyClass,
  bodyCopyClass,
  chalkClass,
  dataLabelClass,
  metaClass,
  readingClass,
  ruleClass,
  sectionHeadingClass,
  smokeClass,
} from '../styles/classes.js'
import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import Field from '../components/Field.jsx'
import NumberInput from '../components/NumberInput.jsx'
import Select from '../components/Select.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import TextInput from '../components/TextInput.jsx'

const DEFAULT_FROM_SKILL = 'Manual testing'
const DEFAULT_TARGET_ROLE = 'qa-analyst'
const DEFAULT_HOURS_PER_WEEK = 10
// Must mirror the API's RouteRequest bounds, or the panel submits values the
// server rejects with a 422.
const MIN_HOURS_PER_WEEK = 1
const MAX_HOURS_PER_WEEK = 40

const SKILL_OPTIONS = [
  'Manual testing',
  'Regression testing',
  'API testing',
  'Test automation',
  'SQL data validation',
  'CI maintenance',
  'QA analytics',
  'Stakeholder communication',
  'Requirements analysis',
  'Defect triage',
  'Release verification',
  'Defect analytics',
]

const TARGET_ROLE_OPTIONS = [
  'qa-analyst',
  'quality-analyst',
  'qa-automation-engineer',
  'sdet',
  'data-quality-analyst',
  'test-manager',
  'business-analyst',
]

const EMPTY_LEGS = []

// One 1px Graphite rule plus 32px of air separates this panel's sections. Space
// and a line, never a shift in background tint.
const SECTION_CLASS = `border-t ${ruleClass} pt-8`

// Loading, empty and error states are plain muted copy in the reading measure
// with room around them. Never a coloured banner box.
const STATE_COPY_CLASS =
  `mx-auto mt-3 ${readingClass} text-center ${bodyClass} ${smokeClass}`

// Provenance line — mono metadata, because "where this came from" is a system
// note and not prose. Inline with a heading it carries no top margin, so the
// baseline row stays flush.
const SOURCE_DETAIL_CLASS = `${metaClass} ${smokeClass}`

// Station track geometry. The connector is a plain 1px Graphite rule: a 1px
// vertical stub on the stacked layout, a 1px horizontal run on the side-by-side
// one. No pill radius, no gradient, no fade.
const CONNECTOR_CLASS = 'bg-graphite'
const STATION_DOT_BASE_CLASS =
  'relative z-10 h-4 w-4 shrink-0 rounded-full border sm:h-5 sm:w-5'

// Every station is a Graphite-outlined circle on the bare canvas, so the line
// reads straight through the track. The target role is the one node the whole
// route exists to reach, so it is the only filled dot — Chalk, the same ink as
// the reference's "path" dots. Compass Gold is reserved for icon strokes and
// Pulse Green for the live-status dot, so neither appears here.
const STATION_DOT_CLASS = `${STATION_DOT_BASE_CLASS} border-graphite bg-obsidian`
const TARGET_STATION_DOT_CLASS = `${STATION_DOT_BASE_CLASS} border-chalk bg-chalk`

// A station name is a name, so it takes the same treatment the reference gives
// the Pipeline Agent Card's heading: Aeonik 14px, weight 400, uppercase, Chalk.
const STATION_LABEL_CLASS = `font-aeonik text-sm font-normal uppercase ${chalkClass}`

/** @type {Record<string, { label: string, source: 'live' | 'simulated' | 'local' | 'pending', detail: string }>} */
const SOURCE_DETAILS = {
  live: {
    label: 'live',
    source: 'live',
    detail: 'Answered by SAP HANA Cloud',
  },
  simulated: {
    label: 'simulated',
    source: 'simulated',
    detail: 'Bundled skills-graph fixture, no SAP HANA call',
  },
  local: {
    label: 'local',
    source: 'local',
    detail: 'Answered from the bundled local fixture',
  },
  pending: {
    label: 'source pending',
    source: 'pending',
    detail: 'No route has been returned yet',
  },
}

function getSourceDetails(source) {
  if (source === 'live') {
    return SOURCE_DETAILS.live
  }

  if (source === 'simulated') {
    return SOURCE_DETAILS.simulated
  }

  if (source === 'local') {
    return SOURCE_DETAILS.local
  }

  return SOURCE_DETAILS.pending
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'The route service could not be reached. Try again.'
}

function formatHours(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return String(value)
}

function formatWeeks(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return String(Math.round(value * 10) / 10)
}

function humanizeKey(key) {
  return key.replace(/[_-]+/g, ' ').trim()
}

function formatBridgeValue(value) {
  if (value === null || value === undefined) {
    return 'Not supplied'
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? 'None'
      : value.map((item) => formatBridgeValue(item)).join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * @typedef {object} RouteLeg
 * @property {string} [skill]
 * @property {number} [hours]
 *
 * @typedef {object} RouteResponse
 * @property {RouteLeg[]} [legs]
 * @property {Record<string, unknown> | null} [paid_bridge]
 * @property {string} [source]
 * @property {string} [from_skill]
 * @property {string} [target_role]
 * @property {number} [total_hours]
 * @property {number} [hours_per_week]
 * @property {number} [weeks]
 *
 * @typedef {object} DraftState
 * @property {string} fromSkill
 * @property {string} targetRole
 * @property {number | ''} hoursPerWeek
 */

function getBridgeEntries(paidBridge) {
  if (
    paidBridge === null ||
    paidBridge === undefined ||
    typeof paidBridge !== 'object' ||
    Array.isArray(paidBridge)
  ) {
    return []
  }

  return Object.entries(paidBridge).map(([key, value]) => [
    humanizeKey(key),
    formatBridgeValue(value),
  ])
}

function getStations(route) {
  if (route === null || typeof route !== 'object') {
    return []
  }

  const legs = Array.isArray(route.legs) ? route.legs : EMPTY_LEGS
  const stations = legs
    .filter((leg) => leg !== null && typeof leg === 'object')
    .map((leg, index) => ({
      key: `${leg.skill ?? 'leg'}-${index}`,
      skill: typeof leg.skill === 'string' ? leg.skill : 'Unnamed skill',
      hours: leg.hours,
      isTarget: false,
    }))

  const targetRole = route.target_role

  if (typeof targetRole === 'string' && targetRole !== '') {
    stations.push({
      key: `target-${targetRole}`,
      skill: targetRole,
      hours: null,
      isTarget: true,
    })
  }

  return stations
}

function getStationSummary(stations) {
  return stations
    .map((station) =>
      station.isTarget
        ? `${station.skill} (target role)`
        : `${station.skill} (${formatHours(station.hours)} hours)`,
    )
    .join(', then ')
}

/**
 * Stage 02 panel: solve the least-hours skill pathway on demand.
 *
 * The panel owns its request. An earlier version also accepted `route`/`source`/
 * `error`/`onFetch` props for a parent-controlled mode, but the only caller never
 * fed results back through them, so the map rendered "No route yet" forever and a
 * failed request surfaced as an unhandled promise rejection. There is now one
 * path: submit, await, render.
 */
export default function RouteMap({
  baseUrl = '',
  initialFromSkill = DEFAULT_FROM_SKILL,
  initialTargetRole = DEFAULT_TARGET_ROLE,
  initialHoursPerWeek = DEFAULT_HOURS_PER_WEEK,
}) {
  // `hoursPerWeek` is `number | ''`: an emptied number input must stay empty
  // rather than silently becoming 0, which the API rejects.
  const [draft, setDraft] = useState(/** @type {DraftState} */ ({
    fromSkill: initialFromSkill,
    targetRole: initialTargetRole,
    hoursPerWeek: initialHoursPerWeek,
  }))
  const [route, setRoute] = useState(/** @type {RouteResponse | null} */ (null))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const activeRequestRef = useRef(/** @type {AbortController | null} */ (null))

  useEffect(
    () => () => {
      activeRequestRef.current?.abort()
    },
    [],
  )

  const canQuery =
    draft.fromSkill.trim() !== '' &&
    draft.targetRole.trim() !== '' &&
    typeof draft.hoursPerWeek === 'number' &&
    draft.hoursPerWeek >= MIN_HOURS_PER_WEEK &&
    draft.hoursPerWeek <= MAX_HOURS_PER_WEEK

  const runQuery = useCallback(
    async (query) => {
      // Cancel any route still in flight, so two quick submits cannot resolve out
      // of order and let the stale route win.
      activeRequestRef.current?.abort()

      const controller = new AbortController()
      activeRequestRef.current = controller
      setIsLoading(true)
      setError('')

      try {
        const response = await getRoute(query, {
          baseUrl,
          signal: controller.signal,
        })

        if (activeRequestRef.current === controller) {
          setRoute(response ?? null)
        }
      } catch (requestError) {
        if (activeRequestRef.current === controller && !isAbortError(requestError)) {
          setError(getErrorMessage(requestError))
        }
      } finally {
        if (activeRequestRef.current === controller) {
          setIsLoading(false)
        }
      }
    },
    [baseUrl],
  )

  function handleFromSkillChange(event) {
    const value = event.target.value
    setDraft((current) => ({ ...current, fromSkill: value }))
  }

  function handleTargetRoleChange(event) {
    const value = event.target.value
    setDraft((current) => ({ ...current, targetRole: value }))
  }

  function handleHoursPerWeekChange(event) {
    // An empty field must stay empty. Coercing it to 0 submits hours_per_week=0,
    // which the API rejects with a 422, so the panel could only ever show an error.
    const raw = event.target.value
    if (raw.trim() === '') {
      setDraft((current) => ({ ...current, hoursPerWeek: '' }))
      return
    }
    const parsed = Number(raw)
    setDraft((current) => ({
      ...current,
      hoursPerWeek: Number.isFinite(parsed) ? parsed : '',
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (isLoading || !canQuery) {
      return
    }

    void runQuery({
      fromSkill: draft.fromSkill,
      targetRole: draft.targetRole,
      hoursPerWeek: draft.hoursPerWeek,
    })
  }

  const stations = getStations(route)
  const bridgeEntries = getBridgeEntries(route === null ? null : route.paid_bridge)
  const sourceDetails = getSourceDetails(route?.source)

  return (
    <Card
      as="section"
      eyebrow="Stage 02 · Learning pathway"
      title="Route map"
      titleId="route-map-title"
      description="The cheapest chain of skills from where Kavya is today to the target role, priced in hours."
      actions={
        <StatusBadge
          live={sourceDetails.source === 'live'}
          label={sourceDetails.label}
        />
      }
      aria-labelledby="route-map-title"
      aria-busy={isLoading}
      padding="none"
      // The Route Builder is a form plus a reading list, so it caps narrower
      // than the 1200px page column. 52rem (832px) sits a little wider than the
      // 620px reading measure because the station track needs the room, and
      // well inside the column so the three fields do not stretch. The panel
      // itself takes no border and no fill — the reference reserves both for the
      // badge and the glossy pill.
      className="max-w-[52rem]"
    >
      <div className="space-y-16">
        <form className={SECTION_CLASS} onSubmit={handleSubmit}>
          <p className={sectionHeadingClass}>Plan a different route</p>

          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            <Field id="route-from-skill" label="From skill">
              <TextInput
                id="route-from-skill"
                list="route-skill-options"
                value={draft.fromSkill}
                onChange={handleFromSkillChange}
              />
              <datalist id="route-skill-options">
                {SKILL_OPTIONS.map((skill) => (
                  <option key={skill} value={skill} />
                ))}
              </datalist>
            </Field>

            <Field id="route-target-role" label="Target role">
              <Select
                id="route-target-role"
                value={draft.targetRole}
                onChange={handleTargetRoleChange}
              >
                {TARGET_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="route-hours-per-week" label="Hours per week">
              <NumberInput
                id="route-hours-per-week"
                min={MIN_HOURS_PER_WEEK}
                max={MAX_HOURS_PER_WEEK}
                value={draft.hoursPerWeek}
                onChange={handleHoursPerWeekChange}
              />
            </Field>
          </div>

          {/* The one button in this panel, and the one the reference names for
              it, so it holds the viewport's single fill. The ↗ is the
              reference's forward-action arrow. */}
          <Button
            type="submit"
            variant="glossy"
            arrow="↗"
            disabled={isLoading || !canQuery}
            aria-busy={isLoading}
            className="mt-8"
          >
            {isLoading ? 'Mapping route…' : 'Build route'}
          </Button>
        </form>

        {error === '' ? null : (
          <div
            role="alert"
            className={SECTION_CLASS}
          >
            <p className={sectionHeadingClass}>Route unavailable</p>
            <p className={`mt-3 ${bodyCopyClass}`}>{error}</p>
            <p className={`mt-2 ${readingClass} text-left ${SOURCE_DETAIL_CLASS}`}>
              {sourceDetails.detail}. Ask for the route again once the skills graph
              answers.
            </p>
          </div>
        )}

        {isLoading ? (
          <div
            className="px-6 py-16 text-center"
            role="status"
            aria-live="polite"
          >
            <p className={sectionHeadingClass}>
              Mapping the least-hours path…
            </p>
            <p className={STATE_COPY_CLASS}>
              Walking the skills graph from {draft.fromSkill} to{' '}
              {draft.targetRole} at {draft.hoursPerWeek} hours a week.
            </p>
          </div>
        ) : route === null ? (
          <div className="px-6 py-16 text-center">
            <p className={sectionHeadingClass}>
              No route yet
            </p>
            <p className={STATE_COPY_CLASS}>
              Build a route to see the skill-by-skill metro line, the hours on
              each hop and the paid bridge at the end.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {/* Each value is server data — a skill name, a role id, a count —
                  so all four read as mono metadata under a caption label. */}
              <div className={`border-t ${ruleClass} pt-4`}>
                <p className={dataLabelClass}>Route from</p>
                <p className={`mt-2 ${metaClass} ${chalkClass}`}>
                  {route.from_skill ?? '—'}
                </p>
              </div>
              <div className={`border-t ${ruleClass} pt-4`}>
                <p className={dataLabelClass}>Route to</p>
                <p className={`mt-2 ${metaClass} ${chalkClass}`}>
                  {route.target_role ?? '—'}
                </p>
              </div>
              <div className={`border-t ${ruleClass} pt-4`}>
                <p className={dataLabelClass}>Total hours</p>
                <p className={`mt-2 ${metaClass} ${chalkClass}`}>
                  {formatHours(route.total_hours)}
                </p>
              </div>
              <div className={`border-t ${ruleClass} pt-4`}>
                <p className={dataLabelClass}>
                  Weeks at {formatHours(route.hours_per_week)}h per week
                </p>
                <p className={`mt-2 ${metaClass} ${chalkClass}`}>
                  {formatWeeks(route.weeks)}
                </p>
              </div>
            </div>

            <div className={SECTION_CLASS}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <p className={sectionHeadingClass}>
                  Metro line · {stations.length} stations
                </p>
                <p className={SOURCE_DETAIL_CLASS}>{sourceDetails.detail}</p>
              </div>

              <p className="sr-only">
                Route sequence: {getStationSummary(stations)}.
              </p>

              <ol
                aria-label={`Route stations from ${route.from_skill ?? 'start'} to ${route.target_role ?? 'target'}`}
                className="mt-8 flex flex-col sm:flex-row sm:items-start"
              >
                {stations.map((station, index) => {
                  const isFirst = index === 0
                  const isLast = index === stations.length - 1

                  return (
                    <li
                      key={station.key}
                      className="relative flex gap-x-4 pb-6 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-x-0 sm:pb-0 sm:text-center"
                    >
                      {isFirst ? null : (
                        <span
                          aria-hidden="true"
                          className={`absolute left-2 top-0 w-px -translate-x-1/2 sm:hidden ${CONNECTOR_CLASS} ${isLast ? 'h-2' : 'inset-y-0'}`}
                        />
                      )}

                      <div className="relative flex h-4 items-center sm:h-5 sm:w-full sm:justify-center">
                        {isLast ? null : (
                          <span
                            aria-hidden="true"
                            className={`absolute left-1/2 top-1/2 hidden h-px w-full -translate-y-1/2 sm:block ${CONNECTOR_CLASS}`}
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className={station.isTarget ? TARGET_STATION_DOT_CLASS : STATION_DOT_CLASS}
                        />
                      </div>

                      <div className="min-w-0 sm:mt-3">
                        <p className={STATION_LABEL_CLASS}>
                          {station.skill}
                        </p>
                        <p className={`mt-1 ${SOURCE_DETAIL_CLASS}`}>
                          {station.isTarget
                            ? 'Target role'
                            : `${formatHours(station.hours)} hours on this hop`}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>

              {stations.length === 0 ? (
                <p className={`mt-4 ${bodyCopyClass}`}>
                  The server returned a route with no stations to draw.
                </p>
              ) : null}
            </div>

            <div className={SECTION_CLASS}>
              <p className={sectionHeadingClass}>Paid bridge</p>
              {bridgeEntries.length === 0 ? (
                <p className={`mt-3 ${bodyCopyClass}`}>
                  No paid bridge attached to this route. The server returned no
                  bridge block.
                </p>
              ) : (
                <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {bridgeEntries.map(([label, value]) => (
                    <div
                      key={label}
                      className={`flex items-baseline justify-between gap-4 border-b ${ruleClass} pb-2`}
                    >
                      <dt className={dataLabelClass}>{label}</dt>
                      <dd className={`text-right ${metaClass} ${chalkClass}`}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
