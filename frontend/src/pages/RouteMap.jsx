import { useCallback, useState } from 'react'
import { getRoute } from '../api.js'

const DEFAULT_FROM_SKILL = 'Manual testing'
const DEFAULT_TARGET_ROLE = 'qa-analyst'
const DEFAULT_HOURS_PER_WEEK = 10

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

const SOURCE_DETAILS = {
  live: {
    label: 'Live',
    className: 'border-teal/45 bg-teal/10 text-teal',
    dotClassName: 'bg-teal',
    detail: 'Answered by SAP HANA Cloud',
  },
  simulated: {
    label: 'Simulated',
    className: 'border-amber/45 bg-amber/10 text-amber',
    dotClassName: 'bg-amber',
    detail: 'Bundled skills-graph fixture, no SAP HANA call',
  },
  pending: {
    label: 'Source pending',
    className: 'border-white/20 bg-white/5 text-off-white/60',
    dotClassName: 'bg-off-white/40',
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

  return SOURCE_DETAILS.pending
}

function optionalValue(value) {
  return value ?? null
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

export default function RouteMap({
  route,
  source,
  isLoading = false,
  error,
  onFetch,
  fromSkill = DEFAULT_FROM_SKILL,
  targetRole = DEFAULT_TARGET_ROLE,
  hoursPerWeek = DEFAULT_HOURS_PER_WEEK,
  onFromSkillChange,
  onTargetRoleChange,
  onHoursPerWeekChange,
}) {
  const queryKey = `${fromSkill}|${targetRole}|${hoursPerWeek}`
  const [draft, setDraft] = useState({
    fromSkill,
    targetRole,
    hoursPerWeek,
  })
  const [appliedQueryKey, setAppliedQueryKey] = useState(queryKey)
  const [internalRoute, setInternalRoute] = useState(null)
  const [internalSource, setInternalSource] = useState('simulated')
  const [internalLoading, setInternalLoading] = useState(false)
  const [internalError, setInternalError] = useState('')

  if (appliedQueryKey !== queryKey) {
    setAppliedQueryKey(queryKey)
    setDraft({
      fromSkill,
      targetRole,
      hoursPerWeek,
    })
  }

  const isExternallyControlled = typeof onFetch === 'function'
  const payload = optionalValue(route)
  const displayRoute = payload ?? optionalValue(internalRoute)
  const displaySource =
    optionalValue(source) ??
    optionalValue(displayRoute)?.source ??
    internalSource
  const displayLoading = isLoading || internalLoading
  const requestedError = optionalValue(error) ?? ''
  const displayError = requestedError === '' ? internalError : requestedError
  const stations = getStations(displayRoute)
  const bridgeEntries = getBridgeEntries(
    displayRoute === null ? null : displayRoute.paid_bridge,
  )
  const sourceDetails = getSourceDetails(displaySource)
  const canQuery =
    draft.fromSkill.trim() !== '' && draft.targetRole.trim() !== ''

  const runQuery = useCallback(
    async (query) => {
      if (isExternallyControlled) {
        onFetch(query)
        return
      }

      setInternalLoading(true)
      setInternalError('')

      try {
        const response = await getRoute(query)
        setInternalRoute(response)
        setInternalSource(response?.source ?? 'simulated')
      } catch (requestError) {
        setInternalError(getErrorMessage(requestError))
      } finally {
        setInternalLoading(false)
      }
    },
    [isExternallyControlled, onFetch],
  )

  function handleFromSkillChange(event) {
    const value = event.target.value
    setDraft((current) => ({ ...current, fromSkill: value }))

    if (typeof onFromSkillChange === 'function') {
      onFromSkillChange(value)
    }
  }

  function handleTargetRoleChange(event) {
    const value = event.target.value
    setDraft((current) => ({ ...current, targetRole: value }))

    if (typeof onTargetRoleChange === 'function') {
      onTargetRoleChange(value)
    }
  }

  function handleHoursPerWeekChange(event) {
    const parsed = Number(event.target.value)
    const value = Number.isFinite(parsed) ? parsed : 0
    setDraft((current) => ({ ...current, hoursPerWeek: value }))

    if (typeof onHoursPerWeekChange === 'function') {
      onHoursPerWeekChange(value)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (displayLoading || !canQuery) {
      return
    }

    void runQuery({
      fromSkill: draft.fromSkill,
      targetRole: draft.targetRole,
      hoursPerWeek: draft.hoursPerWeek,
    })
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/10 bg-navy text-off-white shadow-2xl shadow-navy/20"
      aria-labelledby="route-map-title"
      aria-busy={displayLoading}
    >
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
            Stage 02 · Learning pathway
          </p>
          <h2 id="route-map-title" className="mt-1 font-serif text-2xl text-off-white">
            Route map
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-off-white/60">
            The cheapest chain of skills from where Kavya is today to the target
            role, priced in hours.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${sourceDetails.className}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${sourceDetails.dotClassName}`}
            aria-hidden="true"
          />
          {sourceDetails.label} route
        </span>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        <form
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
          onSubmit={handleSubmit}
        >
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
            Plan a different route
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="route-from-skill"
                className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-off-white/50"
              >
                From skill
              </label>
              <input
                id="route-from-skill"
                list="route-skill-options"
                value={draft.fromSkill}
                onChange={handleFromSkillChange}
                className="mt-2 w-full rounded-lg border border-white/20 bg-navy px-3 py-2.5 text-sm text-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              />
              <datalist id="route-skill-options">
                {SKILL_OPTIONS.map((skill) => (
                  <option key={skill} value={skill} />
                ))}
              </datalist>
            </div>

            <div>
              <label
                htmlFor="route-target-role"
                className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-off-white/50"
              >
                Target role
              </label>
              <select
                id="route-target-role"
                value={draft.targetRole}
                onChange={handleTargetRoleChange}
                className="mt-2 w-full rounded-lg border border-white/20 bg-navy px-3 py-2.5 text-sm text-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              >
                {TARGET_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="route-hours-per-week"
                className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-off-white/50"
              >
                Hours per week
              </label>
              <input
                id="route-hours-per-week"
                type="number"
                min={1}
                max={40}
                value={draft.hoursPerWeek}
                onChange={handleHoursPerWeekChange}
                className="mt-2 w-full rounded-lg border border-white/20 bg-navy px-3 py-2.5 font-mono text-sm text-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={displayLoading || !canQuery}
            aria-busy={displayLoading}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-navy transition hover:bg-amber/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {displayLoading ? 'Mapping route…' : 'Build route'}
          </button>
        </form>

        {displayError === '' ? null : (
          <div
            className="rounded-xl border border-red/50 bg-red/10 p-5"
            role="alert"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
              Route unavailable
            </p>
            <p className="mt-2 text-sm leading-6 text-off-white/75">{displayError}</p>
            <p className="mt-2 text-xs leading-5 text-off-white/50">
              {sourceDetails.detail}. Ask for the route again once the skills graph
              answers.
            </p>
          </div>
        )}

        {displayLoading ? (
          <div
            className="rounded-xl border border-amber/30 bg-amber/10 p-5"
            role="status"
            aria-live="polite"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber">
              Mapping the least-hours path…
            </p>
            <p className="mt-2 text-sm leading-6 text-off-white/70">
              Walking the skills graph from {draft.fromSkill} to{' '}
              {draft.targetRole} at {draft.hoursPerWeek} hours a week.
            </p>
          </div>
        ) : displayRoute === null ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-off-white/50">
              No route yet
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-off-white/65">
              Build a route to see the skill-by-skill metro line, the hours on
              each hop and the paid bridge at the end.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Route from
                </p>
                <p className="mt-1 text-sm font-semibold text-off-white">
                  {displayRoute.from_skill ?? '—'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Route to
                </p>
                <p className="mt-1 text-sm font-semibold text-off-white">
                  {displayRoute.target_role ?? '—'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Total hours
                </p>
                <p className="mt-1 font-mono text-xl text-amber">
                  {formatHours(displayRoute.total_hours)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Weeks at {formatHours(displayRoute.hours_per_week)}h per week
                </p>
                <p className="mt-1 font-mono text-xl text-off-white">
                  {formatWeeks(displayRoute.weeks)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
                  Metro line · {stations.length} stations
                </p>
                <p className="text-xs text-off-white/45">
                  {sourceDetails.detail}
                </p>
              </div>

              <p className="sr-only">
                Route sequence: {getStationSummary(stations)}.
              </p>

              <ol
                aria-label={`Route stations from ${displayRoute.from_skill ?? 'start'} to ${displayRoute.target_role ?? 'target'}`}
                className="mt-4 flex flex-col sm:flex-row sm:items-start"
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
                          className={`absolute left-2 top-0 w-0.5 -translate-x-1/2 bg-amber/60 sm:hidden ${isLast ? 'h-2' : 'inset-y-0'}`}
                        />
                      )}

                      <div className="relative flex h-4 items-center sm:h-5 sm:w-full sm:justify-center">
                        {isLast ? null : (
                          <span
                            aria-hidden="true"
                            className="absolute left-1/2 top-1/2 hidden h-0.5 w-full -translate-y-1/2 rounded-full bg-amber/60 sm:block"
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className={`relative z-10 h-4 w-4 shrink-0 rounded-full border-2 bg-navy sm:h-5 sm:w-5 ${
                            station.isTarget ? 'border-teal bg-teal' : 'border-amber'
                          }`}
                        />
                      </div>

                      <div className="mt-3 min-w-0 sm:mt-0">
                        <p
                          className={`text-sm font-bold uppercase tracking-[0.1em] ${
                            station.isTarget ? 'text-teal' : 'text-off-white'
                          }`}
                        >
                          {station.skill}
                        </p>
                        <p className="mt-1 font-mono text-xs text-amber">
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
                <p className="mt-4 text-sm leading-6 text-off-white/60">
                  The server returned a route with no stations to draw.
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-teal/30 bg-teal/10 p-5">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-teal">
                Paid bridge
              </p>
              {bridgeEntries.length === 0 ? (
                <p className="mt-2 text-sm leading-6 text-off-white/70">
                  No paid bridge attached to this route. The server returned no
                  bridge block.
                </p>
              ) : (
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {bridgeEntries.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-1.5"
                    >
                      <dt className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-off-white/50">
                        {label}
                      </dt>
                      <dd className="text-right font-mono text-sm text-off-white">
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
    </section>
  )
}
