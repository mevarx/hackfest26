import { useEffect, useRef, useState } from 'react'
import { DEFAULT_BACKEND_BASE_URL, runGhostTwin } from '../api.js'

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

const GENDER_OPTIONS = [
  { value: 'female', label: 'female' },
  { value: 'male', label: 'male' },
  { value: 'non_binary', label: 'non-binary' },
  { value: 'other', label: 'other' },
  { value: 'not_disclosed', label: 'not disclosed' },
]

const COLLEGE_TIER_OPTIONS = [
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
]

const CITY_OPTIONS = ['Chennai', 'Bengaluru', 'Hyderabad', 'Pune']

const EDITABLE_FIELDS = [
  'career_gap',
  'gender',
  'age',
  'college_tier',
  'city',
  'skill_score',
]

const INITIAL_FORM = {
  career_gap: CANDIDATE_PROFILE.career_gap,
  gender: CANDIDATE_PROFILE.gender,
  age: String(CANDIDATE_PROFILE.age),
  college_tier: CANDIDATE_PROFILE.college_tier,
  city: CANDIDATE_PROFILE.city,
  skill_score: String(CANDIDATE_PROFILE.skill_score),
}

const FIELD_LABEL_CLASS =
  'block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/50'

const FIELD_CONTROL_CLASS =
  'mt-2 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-sm text-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber'

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

function readAuditResult(result) {
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

    if (requestError instanceof SyntaxError) {
      return 'The audit service returned malformed JSON. Try again.'
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

function toProfileNumber(raw) {
  const parsed = Number.parseInt(raw, 10)

  return Number.isNaN(parsed) ? raw : parsed
}

function toCandidateProfile(form) {
  return {
    career_gap: form.career_gap,
    gender: form.gender,
    age: toProfileNumber(form.age),
    college_tier: form.college_tier,
    city: form.city,
    skill_score: toProfileNumber(form.skill_score),
  }
}

function getEditedFields(form) {
  return EDITABLE_FIELDS.filter((field) => form[field] !== INITIAL_FORM[field])
}

export default function GhostTwinPanel() {
  const [simulateLegacyAts, setSimulateLegacyAts] = useState(false)
  const [form, setForm] = useState({ ...INITIAL_FORM })
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

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
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
        runGhostTwin(
          {
            role_id: ROLE_ID,
            candidate_profile: toCandidateProfile(form),
            simulate_legacy_ats: simulateLegacyAts,
          },
          { baseUrl: DEFAULT_BACKEND_BASE_URL },
        ),
        waitForAbort(controller.signal),
      ])

      const nextAudit = await readAuditResult(response)

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
  const editedFields = getEditedFields(form)
  const hasPendingEdits = editedFields.length > 0
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
              Kavya · {form.age} · {form.city}
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

        <fieldset
          className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
          disabled={isLoading}
        >
          <legend className="px-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/50">
            Edit the candidate profile
          </legend>
          <p
            id="ghost-twin-editor-description"
            className="text-xs leading-5 text-off-white/50"
          >
            Change any attribute and re-run. The pure-Python engine recomputes
            every twin, so a fair-merit run stays flat and a legacy run moves.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="ghost-twin-career-gap" className={FIELD_LABEL_CLASS}>
                Career gap
              </label>
              <input
                id="ghost-twin-career-gap"
                name="career_gap"
                type="text"
                value={form.career_gap}
                onChange={(event) =>
                  updateField('career_gap', event.target.value)
                }
                aria-describedby="ghost-twin-editor-description"
                className={FIELD_CONTROL_CLASS}
              />
            </div>

            <div>
              <label htmlFor="ghost-twin-gender" className={FIELD_LABEL_CLASS}>
                Gender
              </label>
              <select
                id="ghost-twin-gender"
                name="gender"
                value={form.gender}
                onChange={(event) => updateField('gender', event.target.value)}
                aria-describedby="ghost-twin-editor-description"
                className={FIELD_CONTROL_CLASS}
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ghost-twin-age" className={FIELD_LABEL_CLASS}>
                Age
              </label>
              <input
                id="ghost-twin-age"
                name="age"
                type="number"
                min="18"
                max="100"
                step="1"
                value={form.age}
                onChange={(event) => updateField('age', event.target.value)}
                aria-describedby="ghost-twin-editor-description"
                className={FIELD_CONTROL_CLASS}
              />
            </div>

            <div>
              <label
                htmlFor="ghost-twin-college-tier"
                className={FIELD_LABEL_CLASS}
              >
                College tier
              </label>
              <select
                id="ghost-twin-college-tier"
                name="college_tier"
                value={form.college_tier}
                onChange={(event) =>
                  updateField('college_tier', event.target.value)
                }
                aria-describedby="ghost-twin-editor-description"
                className={FIELD_CONTROL_CLASS}
              >
                {COLLEGE_TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ghost-twin-city" className={FIELD_LABEL_CLASS}>
                City
              </label>
              <select
                id="ghost-twin-city"
                name="city"
                value={form.city}
                onChange={(event) => updateField('city', event.target.value)}
                aria-describedby="ghost-twin-editor-description"
                className={FIELD_CONTROL_CLASS}
              >
                {CITY_OPTIONS.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="ghost-twin-skill-score"
                className={FIELD_LABEL_CLASS}
              >
                Skill score
              </label>
              <input
                id="ghost-twin-skill-score"
                name="skill_score"
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.skill_score}
                onChange={(event) =>
                  updateField('skill_score', event.target.value)
                }
                aria-describedby="ghost-twin-editor-description"
                className={FIELD_CONTROL_CLASS}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-off-white/55" data-testid="edit-summary">
              {hasPendingEdits
                ? `Edited: ${editedFields
                    .map((field) => ATTRIBUTE_LABELS[field] ?? 'Skill score')
                    .join(', ')}`
                : 'No edits yet. The seeded profile is Kavya’s.'}
            </p>
            <button
              type="button"
              onClick={runAudit}
              disabled={isLoading || !hasPendingEdits}
              aria-busy={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal/50 bg-teal/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-teal transition hover:bg-teal/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Re-run audit
            </button>
          </div>
        </fieldset>

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
              Comparing {form.age}-year-old candidates in {form.city} against
              counterfactual twins.
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
                    twins.map((twin, index) => {
                      const attribute = getTwinAttribute(twin)
                      const isEdited =
                        attribute in INITIAL_FORM &&
                        form[attribute] !== INITIAL_FORM[attribute]

                      return (
                        <tr key={`${attribute}-${index}`}>
                          <th scope="row" className="px-4 py-4 font-normal">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-off-white">
                                {getTwinLabel(twin)}
                              </span>
                              {isEdited ? (
                                <span className="rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-amber">
                                  edited
                                </span>
                              ) : null}
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
                      )
                    })
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
