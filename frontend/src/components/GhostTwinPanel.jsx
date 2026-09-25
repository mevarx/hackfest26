import { useEffect, useRef, useState } from 'react'

export const AUDIT_TIMEOUT_MS = 10_000
export const AUDIT_URL = 'http://127.0.0.1:8000/audit/ghost-twin'

const ROLE_ID = 'quality-analyst'
const CANDIDATE_PROFILE = {
  career_gap: '18 months',
  gender: 'female',
  age: 29,
  college_tier: 'tier_3',
  city: 'Chennai',
  skill_score: 86,
}

const ATTRIBUTE_LABELS = {
  career_gap: 'Career gap',
  gender: 'Gender',
  age: 'Age',
  college_tier: 'College tier',
  city: 'City',
}

const EMPTY_AUDIT = {
  actual_score: null,
  twins: Array.from({ length: 0 }),
  max_delta: null,
  result: null,
  threshold: null,
  source: null,
}

function formatCounterfactualValue(value) {
  if (value && typeof value === 'object') {
    const hasMonths = value.months !== undefined
    const amount = hasMonths ? value.months : value.years
    const unit = hasMonths ? 'months' : 'years'

    if (typeof amount === 'number') {
      return `${amount} ${unit}`
    }
  }

  if (value === null || value === undefined) {
    return 'unknown'
  }

  return String(value)
}

function getTwinAttribute(twin) {
  if (typeof twin.attribute === 'string') {
    return twin.attribute
  }

  if (typeof twin.variant === 'string') {
    return twin.variant.replace(/_counterfactual$/, '')
  }

  return ''
}

function getTwinLabel(twin) {
  return ATTRIBUTE_LABELS[getTwinAttribute(twin)] ?? 'Twin variant'
}

function formatSignedDelta(delta) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    return '—'
  }

  return delta > 0 ? `+${delta}` : String(delta)
}

function formatScore(score) {
  return typeof score === 'number' ? String(score) : '—'
}

function formatSourceLabel(source) {
  if (source === 'local') {
    return 'Local source'
  }

  if (source === 'live') {
    return 'Live source'
  }

  return 'Source pending'
}

function getScoringMode(simulateLegacyAts) {
  return simulateLegacyAts
    ? 'Simulated legacy ATS'
    : 'Synthetic fair merit'
}

function formatDetail(detail, fallback) {
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }

        if (!item || typeof item !== 'object') {
          return ''
        }

        const message =
          typeof item.msg === 'string'
            ? item.msg
            : typeof item.message === 'string'
              ? item.message
              : ''

        if (!message) {
          return ''
        }

        const location = Array.isArray(item.loc)
          ? item.loc
              .filter((part) => part !== undefined && part !== null)
              .join(' → ')
          : ''

        return location ? `${location}: ${message}` : message
      })
      .filter(Boolean)

    if (messages.length > 0) {
      return messages.join('; ')
    }
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return detail.message.trim()
    }

    if (typeof detail.msg === 'string' && detail.msg.trim()) {
      return detail.msg.trim()
    }
  }

  return fallback
}

async function getResponseErrorMessage(response) {
  const status = response.status ? ` (${response.status})` : ''
  const fallback = `Audit request failed${status}.`
  let body

  try {
    body = await response.json()
  } catch {
    return fallback
  }

  const detail =
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'detail' in body
      ? body.detail
      : body

  return formatDetail(detail, fallback)
}

function isValidAuditResult(result) {
  return (
    result !== null &&
    typeof result === 'object' &&
    typeof result.actual_score === 'number' &&
    Array.isArray(result.twins) &&
    result.twins.every(
      (twin) =>
        twin !== null &&
        typeof twin === 'object' &&
        typeof twin.score === 'number' &&
        typeof twin.delta === 'number',
    ) &&
    typeof result.max_delta === 'number' &&
    (result.result === 'PASS' || result.result === 'FLAGGED') &&
    typeof result.threshold === 'number' &&
    (result.source === 'local' || result.source === 'live')
  )
}

async function parseAuditResult(response) {
  let result

  try {
    result = await response.json()
  } catch {
    throw new Error('The audit service returned malformed JSON. Try again.')
  }

  if (!isValidAuditResult(result)) {
    throw new Error('The audit service returned an invalid audit result. Try again.')
  }

  return result
}

function getRequestErrorMessage(requestError, timedOut) {
  if (timedOut) {
    return 'Audit request timed out. Try again.'
  }

  if (requestError instanceof Error) {
    if (requestError.name === 'AbortError') {
      return 'Audit request was cancelled. Try again.'
    }

    if (requestError.message) {
      return requestError.message
    }
  }

  return 'Unable to reach the audit service. Try again.'
}

function waitForAbort(signal) {
  return new Promise((_, reject) => {
    const handleAbort = () => {
      const abortError = new Error('aborted')
      abortError.name = 'AbortError'
      reject(abortError)
    }

    if (signal.aborted) {
      handleAbort()
    } else {
      signal.addEventListener('abort', handleAbort, { once: true })
    }
  })
}

export default function GhostTwinPanel() {
  const [simulateLegacyAts, setSimulateLegacyAts] = useState(false)
  const [audit, setAudit] = useState(EMPTY_AUDIT)
  const [hasAudit, setHasAudit] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)
  const activeRequestRef = useRef(new AbortController())

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      activeRequestRef.current.abort()
    }
  }, [])

  function handleToggleChange(event) {
    setSimulateLegacyAts(event.target.checked)
    setAudit(EMPTY_AUDIT)
    setHasAudit(false)
    setError('')
  }

  async function runAudit() {
    if (isLoading || !mountedRef.current) {
      return
    }

    const controller = new AbortController()
    let timedOut = false
    let timeoutId

    activeRequestRef.current = controller
    setIsLoading(true)
    setAudit(EMPTY_AUDIT)
    setHasAudit(false)
    setError('')

    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, AUDIT_TIMEOUT_MS)

    try {
      const response = await Promise.race([
        fetch(AUDIT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role_id: ROLE_ID,
            candidate_profile: CANDIDATE_PROFILE,
            simulate_legacy_ats: simulateLegacyAts,
          }),
          signal: controller.signal,
        }),
        waitForAbort(controller.signal),
      ])

      if (response.ok === false || response.status >= 400) {
        throw new Error(await getResponseErrorMessage(response))
      }

      const nextAudit = await parseAuditResult(response)

      if (!mountedRef.current || activeRequestRef.current !== controller) {
        return
      }

      setAudit(nextAudit)
      setHasAudit(true)
    } catch (requestError) {
      if (mountedRef.current && activeRequestRef.current === controller) {
        setError(getRequestErrorMessage(requestError, timedOut))
      }
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }

      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  const twins = Array.isArray(audit.twins) ? audit.twins : []
  const isPass = hasAudit && audit.result === 'PASS'
  const isFlagged = hasAudit && audit.result === 'FLAGGED'
  const source = hasAudit ? audit.source : null
  const sourceLabel = formatSourceLabel(source)
  const scoringMode = getScoringMode(simulateLegacyAts)
  const sourceBadgeClass = hasAudit
    ? 'border-teal/40 bg-teal/10 text-teal'
    : 'border-amber/40 bg-amber/10 text-amber'

  return (
    <section
      className="mt-4 overflow-hidden rounded-2xl border border-navy/10 bg-navy text-off-white shadow-xl shadow-navy/10"
      aria-labelledby="ghost-twin-title"
      aria-busy={isLoading}
    >
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
            Bias audit · Kavya
          </p>
          <h2
            id="ghost-twin-title"
            className="mt-1 font-serif text-2xl text-off-white"
          >
            Ghost Twin audit
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-off-white/60">
            Compare a candidate with counterfactual twins before making a fair
            role match.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${sourceBadgeClass}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${hasAudit ? 'bg-teal' : 'bg-amber'}`}
            aria-hidden="true"
          />
          {sourceLabel}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
              Candidate
            </p>
            <p className="mt-1 font-serif text-lg text-off-white">
              Kavya · 29 · Chennai
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
              Role context
            </p>
            <p className="mt-1 font-mono text-sm text-amber">{ROLE_ID}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-amber/30 bg-amber/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <label
            htmlFor="simulate-legacy-ats"
            className="flex cursor-pointer items-start gap-3 rounded-lg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal has-disabled:cursor-not-allowed"
          >
            <input
              id="simulate-legacy-ats"
              type="checkbox"
              checked={simulateLegacyAts}
              onChange={handleToggleChange}
              disabled={isLoading}
              aria-label="Simulate Legacy ATS"
              aria-describedby="simulate-legacy-ats-description"
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                simulateLegacyAts ? 'bg-teal' : 'bg-white/20'
              } ${isLoading ? 'opacity-60' : ''}`}
            >
              <span
                className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-off-white transition-transform ${
                  simulateLegacyAts ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
            <span>
              <span className="block text-sm font-bold uppercase tracking-[0.12em] text-off-white">
                Simulate Legacy ATS
              </span>
              <span
                id="simulate-legacy-ats-description"
                className="mt-1 block max-w-md text-sm leading-5 text-off-white/60"
              >
                Add a comparison run for a legacy, biased screening model.
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={runAudit}
            disabled={isLoading}
            aria-busy={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-navy transition hover:bg-amber/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isLoading ? 'Running audit…' : 'Run Audit'}
          </button>
        </div>

        <div
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-off-white/45"
          aria-live="polite"
        >
          <span>{hasAudit ? `Source=${source}` : 'Source=pending'}</span>
          <span aria-hidden="true">·</span>
          <span>{scoringMode}</span>
          <span aria-hidden="true">·</span>
          <span>Pure-Python calculation</span>
        </div>

        {isLoading ? (
          <div
            className="mt-5 rounded-xl border border-amber/30 bg-amber/10 p-5"
            role="status"
            aria-live="polite"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber">
              Loading audit…
            </p>
            <p className="mt-2 text-sm leading-6 text-off-white/70">
              Comparing Kavya with counterfactual twins.
            </p>
          </div>
        ) : error ? (
          <div
            className="mt-5 rounded-xl border border-red/50 bg-red/10 p-5"
            role="alert"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
              Audit unavailable
            </p>
            <p className="mt-2 text-sm leading-6 text-off-white/75">{error}</p>
            <p className="mt-3 text-xs leading-5 text-off-white/50">
              The audit could not be completed. Try the request again.
            </p>
          </div>
        ) : !hasAudit ? (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-off-white/50">
              Ready to audit
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-off-white/65">
              Run the audit to see how each counterfactual changes the base
              score. The server decides the fairness threshold.
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Actual score
                </p>
                <p className="mt-1 font-mono text-xl text-off-white">
                  {formatScore(audit.actual_score)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Max delta
                </p>
                <p className="mt-1 font-mono text-xl text-amber">
                  {formatScore(audit.max_delta)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Threshold
                </p>
                <p className="mt-1 font-mono text-xl text-off-white">
                  {formatScore(audit.threshold)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Source
                </p>
                <p className="mt-1 font-mono text-sm text-teal">
                  {audit.source}
                </p>
              </div>
            </div>

            <div
              className="mt-4 overflow-x-auto rounded-xl border border-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              role="region"
              tabIndex={0}
              aria-label="Scrollable Ghost Twin results table"
            >
              <table className="min-w-[38rem] w-full text-left text-sm">
                <caption className="sr-only">
                  Ghost Twin counterfactual scores for Kavya
                </caption>
                <thead className="bg-white/[0.06] text-off-white/55">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-[0.16em]"
                    >
                      Twin Variant
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-[0.16em]"
                    >
                      Base Score
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-[0.16em]"
                    >
                      Twin Score
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-[0.16em]"
                    >
                      Delta
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {twins.length > 0 ? (
                    twins.map((twin, index) => (
                      <tr key={`${getTwinAttribute(twin)}-${index}`}>
                        <th scope="row" className="px-4 py-4 font-normal">
                          <span className="block font-semibold text-off-white">
                            {getTwinLabel(twin)}
                          </span>
                          <span className="mt-1 block text-xs text-off-white/50">
                            {formatCounterfactualValue(twin.original_value)} →{' '}
                            {formatCounterfactualValue(twin.counterfactual_value)}
                          </span>
                        </th>
                        <td className="px-4 py-4 font-mono text-off-white/75">
                          {formatScore(audit.actual_score)}
                        </td>
                        <td className="px-4 py-4 font-mono text-off-white">
                          {formatScore(twin.score)}
                        </td>
                        <td
                          className={`px-4 py-4 font-mono ${
                            twin.delta > 0
                              ? 'text-amber'
                              : twin.delta < 0
                                ? 'text-red-300'
                                : 'text-off-white/60'
                          }`}
                        >
                          {formatSignedDelta(twin.delta)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-off-white/50"
                      >
                        No counterfactual twins returned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {isPass || isFlagged ? (
              <div
                className={`mt-4 flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
                  isPass
                    ? 'border-teal/50 bg-teal text-navy'
                    : 'border-red/50 bg-red text-off-white'
                }`}
                role="status"
                aria-live="polite"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em]">
                    {isPass ? 'PASS' : 'FLAGGED'}
                  </p>
                  <p className="mt-1 font-serif text-2xl">
                    {isPass
                      ? 'Fairness guardrail passed'
                      : 'Fairness guardrail needs attention'}
                  </p>
                </div>
                <p className="max-w-sm text-sm leading-6 opacity-75">
                  {isPass
                    ? 'The observed score difference stays within the server threshold.'
                    : 'A counterfactual score difference exceeds the server threshold.'}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
