import { useEffect, useRef, useState } from 'react'
import { runGhostTwin } from '../api.js'
import { isAbortError } from '../lib/guards.js'
import {
  bodyClass,
  bodyCopyClass,
  captionClass,
  chalkClass,
  dataLabelClass,
  headingSmClass,
  inlineLabelClass,
  metaClass,
  metaRowClass,
  ruleClass,
  sectionHeadingClass,
  smokeClass,
} from '../styles/classes.js'
import Button from './Button.jsx'
import Card, { BLEED_BLOCK_CLASS } from './Card.jsx'
import Field from './Field.jsx'
import NumberInput from './NumberInput.jsx'
import Select from './Select.jsx'
import StatusBadge from './StatusBadge.jsx'
import Switch from './Switch.jsx'
import TextInput from './TextInput.jsx'

export const AUDIT_TIMEOUT_MS = 10_000

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

const EMPTY_AUDIT = {
  actual_score: null,
  twins: Array.from({ length: 0 }),
  max_delta: null,
  result: null,
  threshold: null,
  source: null,
}

// The header badge follows the response's own source word instead of assuming
// one. Both audit paths score in-process, so `local` is the settled reading and
// `live` is the exception worth a Pulse Green dot; a run that has not happened
// yet takes the same outlined dot, because absence of a live dot is the signal
// and a third word would only add noise to the header.
/** @type {Record<'live' | 'local' | 'pending', { label: string, live: boolean }>} */
const SOURCE_BADGE = {
  live: { label: 'live', live: true },
  local: { label: 'local', live: false },
  pending: { label: 'no run yet', live: false },
}

// The results table scrolls, so its region is focusable and needs a visible ring:
// an Ash outline, the same shape the form controls use. Never a hue.
const FOCUS_RING_CLASS = 'focus:outline-2 focus:outline-offset-2 focus:outline-ash'

// Loading, failed and empty are one plain shape — centred copy inside the panel's
// own padding, no box, no tint, no banner colour. Only the words differ; what
// separates a failure from a wait is the `role`, not the ink.
const STATE_WRAP_CLASS = 'py-16 text-center'
const STATE_COPY_CLASS = `mx-auto mt-3 max-w-[40rem] ${bodyClass} ${smokeClass}`

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

  if (isAbortError(requestError)) {
    return 'Audit request was cancelled. Try again.'
  }

  if (requestError instanceof Error) {
    if (requestError instanceof SyntaxError) {
      return 'The audit service returned malformed JSON. Try again.'
    }

    if (requestError.message) {
      return requestError.message
    }
  }

  return 'Unable to reach the audit service. Try again.'
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

export default function GhostTwinPanel({ baseUrl = '' }) {
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

    // Cancel any request still in flight so a second run cannot be raced by the
    // first one's response, and so unmounting actually stops the HTTP call.
    activeRequestRef.current.abort()

    const controller = new AbortController()
    let timedOut = false

    activeRequestRef.current = controller
    setIsLoading(true)
    setAudit(EMPTY_AUDIT)
    setHasAudit(false)
    setError('')

    const timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, AUDIT_TIMEOUT_MS)

    try {
      const response = await runGhostTwin(
        {
          role_id: ROLE_ID,
          candidate_profile: toCandidateProfile(form),
          simulate_legacy_ats: simulateLegacyAts,
        },
        { baseUrl, signal: controller.signal },
      )

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
  const sourceBadge = SOURCE_BADGE[source ?? 'pending'] ?? SOURCE_BADGE.pending
  const scoringMode = getScoringMode(simulateLegacyAts)
  const editedFields = getEditedFields(form)
  const hasPendingEdits = editedFields.length > 0
  // The verdict is a Status Badge, the one component the reference builds a box
  // for: a full-pill surface whose 6px prefix dot is Pulse Green on a live run
  // and a Graphite outline otherwise. A completed audit inside the threshold is
  // the live reading; FLAGGED takes the outline rather than borrowing a second
  // accent colour for "bad".
  const verdictLabel = isPass ? 'PASS' : 'FLAGGED'
  const verdictLive = isPass

  return (
    <Card
      as="section"
      // The section heading lives in App's <Section>; repeating it here gave
      // the page two competing h2s for the same region. Only the source badge
      // is a Card concern. `data-testid` is the panel's stable identity for
      // tests, which used to anchor on the heading that has now moved up a
      // level — a heading is a label, not a handle.
      data-testid="ghost-twin-panel"
      aria-busy={isLoading}
      // This is the one bordered panel on the page, so it bleeds: the padding
      // moves onto each block and every interior hairline runs edge to edge
      // instead of stopping 48px short of the panel border.
      bleed
      // Carbon is the reference's deepest surface level and this is the one panel
      // that earns it: a value step off Obsidian plus a Card Slate hairline. No
      // shadow — elevation here is the value shift and the border alone.
      className="rounded-card border border-card-slate bg-carbon"
    >
      {/* In bleed mode the Card no longer wraps children in a padded box, so
          the vertical rhythm that padding used to provide is stated here. The
          inline padding lives on each block instead, which is what lets their
          `border-t` rules span the panel's full interior. */}
      <div className="flex flex-col gap-8 py-8 sm:py-12">
      <div className={`${BLEED_BLOCK_CLASS} flex flex-col gap-4 border-t ${ruleClass} pt-8 sm:flex-row sm:items-baseline sm:justify-between`}>
        <div>
          <p className={sectionHeadingClass}>Candidate</p>
          <p className={`mt-2 ${headingSmClass} ${chalkClass}`}>
            Kavya · {form.age} · {form.city}
          </p>
        </div>
        {/* The source badge describes the twins this panel compares, so it sits
            beside the role context they are compared against. It used to be the
            Card's `actions` slot, which orphaned it on its own line above a
            hairline that separated it from nothing. */}
        <div className="sm:text-right">
          <p className={sectionHeadingClass}>Role context</p>
          <p className={`mt-2 ${metaClass} ${smokeClass}`}>{ROLE_ID}</p>
          <div className="mt-3 sm:flex sm:justify-end">
            <StatusBadge label={sourceBadge.label} live={sourceBadge.live} />
          </div>
        </div>
      </div>

      <div className={`${BLEED_BLOCK_CLASS} mt-8 flex flex-col items-start gap-4 border-t ${ruleClass} pt-8 sm:flex-row sm:items-center sm:justify-between`}>
        {/* The nav bar's minimal switch: Graphite outline off, Chalk outline on,
            state carried by the knob's position. A toggle is never a status
            light, so no Pulse Green here either. */}
        <Switch
          id="simulate-legacy-ats"
          checked={simulateLegacyAts}
          onChange={handleToggleChange}
          disabled={isLoading}
          label="Simulate Legacy ATS"
          description="Add a comparison run for a legacy, biased screening model."
        />
        {/* The one filled surface on this screen. */}
        <Button
          variant="glossy"
          onClick={runAudit}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? 'Running audit…' : 'Run Audit'}
        </Button>
      </div>

      <fieldset
        aria-label="Edit the candidate profile"
        disabled={isLoading}
        className={`${BLEED_BLOCK_CLASS} mt-8 border-t ${ruleClass} pt-8`}
      >
        <p className={sectionHeadingClass}>Edit the candidate profile</p>
        <p
          id="ghost-twin-editor-description"
          className={`mt-3 ${bodyCopyClass}`}
        >
          Change any attribute and re-run. The pure-Python engine recomputes
          every twin, so a fair-merit run stays flat and a legacy run moves.
        </p>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="ghost-twin-career-gap" label="Career gap">
            <TextInput
              id="ghost-twin-career-gap"
              name="career_gap"
              value={form.career_gap}
              onChange={(event) =>
                updateField('career_gap', event.target.value)
              }
              aria-describedby="ghost-twin-editor-description"
            />
          </Field>

          <Field id="ghost-twin-gender" label="Gender">
            <Select
              id="ghost-twin-gender"
              name="gender"
              value={form.gender}
              onChange={(event) => updateField('gender', event.target.value)}
              aria-describedby="ghost-twin-editor-description"
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="ghost-twin-age" label="Age">
            <NumberInput
              id="ghost-twin-age"
              name="age"
              min="18"
              max="100"
              step="1"
              value={form.age}
              onChange={(event) => updateField('age', event.target.value)}
              aria-describedby="ghost-twin-editor-description"
            />
          </Field>

          <Field id="ghost-twin-college-tier" label="College tier">
            <Select
              id="ghost-twin-college-tier"
              name="college_tier"
              value={form.college_tier}
              onChange={(event) =>
                updateField('college_tier', event.target.value)
              }
              aria-describedby="ghost-twin-editor-description"
            >
              {COLLEGE_TIER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="ghost-twin-city" label="City">
            <Select
              id="ghost-twin-city"
              name="city"
              value={form.city}
              onChange={(event) => updateField('city', event.target.value)}
              aria-describedby="ghost-twin-editor-description"
            >
              {CITY_OPTIONS.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="ghost-twin-skill-score" label="Skill score">
            <NumberInput
              id="ghost-twin-skill-score"
              name="skill_score"
              min="0"
              max="100"
              step="1"
              value={form.skill_score}
              onChange={(event) => updateField('skill_score', event.target.value)}
              aria-describedby="ghost-twin-editor-description"
            />
          </Field>
        </div>

        <div className={`${BLEED_BLOCK_CLASS} mt-8 flex flex-col items-start gap-4 border-t ${ruleClass} pt-6 sm:flex-row sm:items-center sm:justify-between`}>
          <p className={bodyCopyClass} data-testid="edit-summary">
            {hasPendingEdits
              ? `Edited: ${editedFields
                  .map((field) => ATTRIBUTE_LABELS[field] ?? 'Skill score')
                  .join(', ')}`
              : 'No edits yet. The seeded profile is Kavya’s.'}
          </p>
          {/* The second action on the view is the Ghost Outline, so the panel
              never shows two filled surfaces. */}
          <Button
            variant="ghost"
            onClick={runAudit}
            disabled={isLoading || !hasPendingEdits}
            aria-busy={isLoading}
          >
            Re-run audit
          </Button>
        </div>
      </fieldset>

      <div className={`${BLEED_BLOCK_CLASS} mt-8 border-t ${ruleClass} pt-8 ${metaRowClass}`} aria-live="polite">
        <span>{hasAudit ? `Source=${source}` : 'Source=pending'}</span>
        <span aria-hidden="true">·</span>
        <span>{scoringMode}</span>
        <span aria-hidden="true">·</span>
        <span>Pure-Python calculation</span>
      </div>

      {isLoading ? (
        <div
          className={STATE_WRAP_CLASS}
          role="status"
          aria-live="polite"
        >
          <p className={sectionHeadingClass}>Loading audit…</p>
          <p className={STATE_COPY_CLASS}>
            Comparing {form.age}-year-old candidates in {form.city} against
            counterfactual twins.
          </p>
        </div>
      ) : error ? (
        <div
          className={STATE_WRAP_CLASS}
          role="alert"
        >
          <p className={sectionHeadingClass}>Audit unavailable</p>
          <p className={STATE_COPY_CLASS}>{error}</p>
          <p className={STATE_COPY_CLASS}>
            The audit could not be completed. Try the request again.
          </p>
        </div>
      ) : !hasAudit ? (
        <div className={STATE_WRAP_CLASS}>
          <p className={sectionHeadingClass}>Ready to audit</p>
          <p className={STATE_COPY_CLASS}>
            Run the audit to see how each counterfactual changes the base
            score. The server decides the fairness threshold.
          </p>
        </div>
      ) : (
        <div className="mt-12 space-y-16">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className={`${BLEED_BLOCK_CLASS} border-t ${ruleClass} pt-4`}>
              <p className={dataLabelClass}>Actual score</p>
              <p className={`mt-1 ${metaClass} ${chalkClass}`}>
                {formatScore(audit.actual_score)}
              </p>
            </div>
            <div className={`${BLEED_BLOCK_CLASS} border-t ${ruleClass} pt-4`}>
              <p className={dataLabelClass}>Max delta</p>
              <p className={`mt-1 ${metaClass} ${chalkClass}`}>
                {formatScore(audit.max_delta)}
              </p>
            </div>
            <div className={`${BLEED_BLOCK_CLASS} border-t ${ruleClass} pt-4`}>
              <p className={dataLabelClass}>Threshold</p>
              <p className={`mt-1 ${metaClass} ${chalkClass}`}>
                {formatScore(audit.threshold)}
              </p>
            </div>
            <div className={`${BLEED_BLOCK_CLASS} border-t ${ruleClass} pt-4`}>
              <p className={dataLabelClass}>Source</p>
              <p className={`mt-1 ${metaClass} ${smokeClass}`}>
                {audit.source}
              </p>
            </div>
          </div>

          <div
            role="region"
            tabIndex={0}
            aria-label="Scrollable Ghost Twin results table"
            className={`${BLEED_BLOCK_CLASS} w-full overflow-x-auto border-t ${ruleClass} ${FOCUS_RING_CLASS}`}
          >
            <table className="w-full min-w-[38rem] text-left">
              <caption className="sr-only">
                Ghost Twin counterfactual scores for Kavya
              </caption>
              {/* Column heads are data labels, not display type: Input 13px
                  uppercase Smoke above a 1px Graphite rule. */}
              <thead className={`border-b ${ruleClass}`}>
                <tr>
                  <th scope="col" className={`py-3 pr-4 ${dataLabelClass}`}>
                    Twin Variant
                  </th>
                  <th scope="col" className={`px-4 py-3 ${dataLabelClass}`}>
                    Base Score
                  </th>
                  <th scope="col" className={`px-4 py-3 ${dataLabelClass}`}>
                    Twin Score
                  </th>
                  <th scope="col" className={`py-3 pl-4 ${dataLabelClass}`}>
                    Delta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite">
                {twins.length > 0 ? (
                  twins.map((twin, index) => {
                    const attribute = getTwinAttribute(twin)
                    const isEdited =
                      attribute in INITIAL_FORM &&
                      form[attribute] !== INITIAL_FORM[attribute]

                    return (
                      <tr key={`${attribute}-${index}`}>
                        <th scope="row" className="py-4 pr-4 font-normal">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={inlineLabelClass}>
                              {getTwinLabel(twin)}
                            </span>
                            {/* "Edited" is a fact about how this row was built, not
                                a lifecycle state, and the reference gives rows no
                                status component of their own — a badge on every
                                changed row would rebuild the dashboard-grid feel the
                                system is shedding. So it stays plain caption text:
                                no dot, no box. */}
                            {isEdited ? (
                              <span className={`${captionClass} ${smokeClass}`}>
                                edited
                              </span>
                            ) : null}
                          </span>
                          <span className={`mt-1 block ${metaClass} ${smokeClass}`}>
                            {formatCounterfactualValue(twin.original_value)} →{' '}
                            {formatCounterfactualValue(twin.counterfactual_value)}
                          </span>
                        </th>
                        <td className={`px-4 py-4 ${metaClass} ${smokeClass}`}>
                          {formatScore(audit.actual_score)}
                        </td>
                        <td className={`px-4 py-4 ${metaClass} ${chalkClass}`}>
                          {formatScore(twin.score)}
                        </td>
                        <td
                          className={`py-4 pl-4 ${metaClass} ${
                            twin.delta !== 0 ? chalkClass : smokeClass
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
                      className={`px-4 py-16 text-center ${bodyClass} ${smokeClass}`}
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
              className={`${BLEED_BLOCK_CLASS} flex flex-col gap-4 border-t ${ruleClass} pt-8 sm:flex-row sm:items-start sm:justify-between`}
              role="status"
              aria-live="polite"
            >
              <div>
                {/* The verdict is the one place on this screen the reference
                    builds a box for: the Status Badge's full-pill surface, with a
                    Pulse Green dot when the run passed and a Graphite outline
                    when it did not. The sentence below carries the meaning, so
                    the badge only has to name the state. */}
                <StatusBadge label={verdictLabel} live={verdictLive} />
                <p className={`mt-3 ${headingSmClass} ${chalkClass}`}>
                  {isPass
                    ? 'Fairness guardrail passed'
                    : 'Fairness guardrail needs attention'}
                </p>
              </div>
              <p className={bodyCopyClass}>
                {isPass
                  ? 'The observed score difference stays within the server threshold.'
                  : 'A counterfactual score difference exceeds the server threshold.'}
              </p>
            </div>
          ) : null}
        </div>
      )}
      </div>
    </Card>
  )
}
