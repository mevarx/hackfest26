import { useEffect, useRef, useState } from 'react'
import { getDisplacementRadar, rewriteEmployerFilter } from '../api.js'
import {
  controlFieldHintClass,
  dataLabelClass,
  metaRowClass,
  sectionHeadingClass,
  toneHeadingClass,
} from '../styles/classes.js'
import Badge from '../components/Badge.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Field from '../components/Field.jsx'
import Select from '../components/Select.jsx'
import TextInput from '../components/TextInput.jsx'

const KNOWN_JOB_POST_IDS = [
  'post-chennai-qa-analyst-118',
  'post-chennai-support-lead-207',
  'post-chennai-data-quality-311',
]

const KNOWN_RADAR_ROLES = [
  'manual-testing-technician',
  'qa-test-associate',
  'support-operations-lead',
  'data-quality-analyst',
  'qa-analyst',
  'qa-automation-engineer',
  'product-analyst',
  'test-manager',
]

const DEFAULT_JOB_POST_ID = KNOWN_JOB_POST_IDS[0]
const DEFAULT_RADAR_ROLE = 'qa-analyst'
const DEFAULT_RADAR_CITY = 'Chennai'
const EMPTY_RESULT = null

/** @type {Record<string, { cardTone: 'amber' | 'red' | 'neutral', emptyState: boolean, titleClass: string }>} */
const STATUS_CARD_TONE = {
  loading: {
    cardTone: 'amber',
    emptyState: false,
    titleClass: toneHeadingClass.amber,
  },
  error: {
    cardTone: 'red',
    emptyState: false,
    titleClass: toneHeadingClass.red,
  },
  empty: {
    cardTone: 'neutral',
    emptyState: true,
    titleClass: 'text-offwhite/50',
  },
}

function formatErrorMessage(requestError, fallback) {
  if (requestError instanceof Error && requestError.message) {
    return requestError.message
  }

  return fallback
}

function readRadarError(requestError) {
  return formatErrorMessage(
    requestError,
    'The displacement radar could not be read. Check the backend is running.',
  )
}

function readRewriteError(requestError) {
  return formatErrorMessage(
    requestError,
    'The employer rewrite could not be read. Check the backend is running.',
  )
}

function asText(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  return fallback
}

function asCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function asList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : []
}

function readStatusCardTone(tone) {
  return STATUS_CARD_TONE[tone] ?? STATUS_CARD_TONE.loading
}

function DisclaimerNote({ disclaimer, scope }) {
  return (
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-offwhite/50">
      <span aria-hidden="true" className="mt-1 text-amber">
        ▲
      </span>
      <span>
        <strong className="text-offwhite/70">{scope}: </strong>
        {asText(disclaimer, 'Simulated demo data, not an observed ATS connection.')}
      </span>
    </p>
  )
}

function BlockShell({ titleId, eyebrow, title, description, children }) {
  return (
    <Card
      as="section"
      variant="dark"
      eyebrow={eyebrow}
      title={title}
      titleId={titleId}
      description={description}
      actions={<Badge source="simulated" />}
      aria-labelledby={titleId}
      padding="lg"
    >
      {children}
    </Card>
  )
}

function StatusMessage({ tone, title, message, testId }) {
  const details = readStatusCardTone(tone)

  return (
    <Card
      variant="dark"
      tone={details.cardTone}
      emptyState={details.emptyState}
      data-testid={testId}
      role={tone === 'error' ? 'alert' : 'status'}
      padding="lg"
    >
      <p
        className={`text-xs font-bold uppercase tracking-[0.16em] ${details.titleClass}`}
      >
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-offwhite/70">{message}</p>
    </Card>
  )
}

function RadarBlock({
  role,
  city,
  isLoading,
  error,
  radar,
  onRoleChange,
  onCityChange,
  onSubmit,
}) {
  return (
    <BlockShell
      titleId="displacement-radar-title"
      eyebrow="Market intelligence"
      title="Displacement radar"
      description="How exposed one role is, and whether the local demand behind it is still growing."
    >
      <Card
        as="form"
        variant="dark"
        surface="raised"
        padding="lg"
        onSubmit={onSubmit}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Field id="radar-role" label="Role id">
            <TextInput
              id="radar-role"
              name="role"
              list="radar-role-options"
              value={role}
              onChange={onRoleChange}
            />
          </Field>
          <datalist id="radar-role-options">
            {KNOWN_RADAR_ROLES.map((knownRole) => (
              <option key={knownRole} value={knownRole} />
            ))}
          </datalist>
        </div>
        <Field id="radar-city" label="City" className="sm:w-40">
          <TextInput id="radar-city" name="city" value={city} onChange={onCityChange} />
        </Field>
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? 'Loading radar…' : 'Check exposure'}
        </Button>
      </Card>

      <div
        className="mt-4"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="radar-region"
      >
        {isLoading ? (
          <StatusMessage
            tone="loading"
            title="Loading radar…"
            message={`Reading the simulated displacement radar for ${role} in ${city}.`}
            testId="radar-loading"
          />
        ) : error ? (
          <StatusMessage
            tone="error"
            title="Radar unavailable"
            message={error}
            testId="radar-error"
          />
        ) : !radar ? (
          <StatusMessage
            tone="empty"
            title="No radar row yet"
            message="Pick a bundled role id and city, then check the exposure to load a simulated row."
            testId="radar-empty"
          />
        ) : (
          <div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Card variant="dark" surface="raised" padding="md">
                <dt className={dataLabelClass}>Role</dt>
                <dd className="mt-1 font-mono text-sm text-offwhite">
                  {asText(radar.role, role)}
                </dd>
              </Card>
              <Card variant="dark" surface="raised" padding="md">
                <dt className={dataLabelClass}>City</dt>
                <dd className="mt-1 font-mono text-sm text-offwhite">
                  {asText(radar.city, city)}
                </dd>
              </Card>
              <Card variant="dark" tone="amber" padding="md">
                <dt className={dataLabelClass}>Displacement exposure</dt>
                <dd
                  className="mt-1 font-serif text-2xl text-amber"
                  data-testid="radar-exposure"
                >
                  {asText(radar.exposure, 'unknown')}
                </dd>
              </Card>
              <Card variant="dark" tone="teal" padding="md">
                <dt className={dataLabelClass}>Local demand</dt>
                <dd
                  className="mt-1 font-serif text-2xl text-teal"
                  data-testid="radar-demand"
                >
                  {asText(radar.demand, 'unknown')}
                </dd>
              </Card>
            </dl>
            <div className={`mt-3 ${metaRowClass}`}>
              <span>source=simulated</span>
              <span aria-hidden="true">·</span>
              <span>Demo market fixture</span>
            </div>
            <DisclaimerNote
              disclaimer={radar.disclaimer}
              scope="Displacement radar"
            />
          </div>
        )}
      </div>
    </BlockShell>
  )
}

function FilterPanel({ heading, headingId, text, tone, children }) {
  const cardTone = tone === 'after' ? 'teal' : 'red'

  return (
    <Card variant="dark" tone={cardTone} padding="lg">
      <h3
        id={headingId}
        className="text-xs font-bold uppercase tracking-[0.16em] text-offwhite/70"
      >
        {heading}
      </h3>
      <p className="mt-3 text-sm leading-6 text-offwhite/70">{text}</p>
      {children}
    </Card>
  )
}

function RewriteBlock({
  jobPostId,
  isLoading,
  error,
  rewrite,
  onJobPostChange,
  onSubmit,
}) {
  const hiddenTalentCount = rewrite ? asCount(rewrite.hidden_talent_count) : null
  const removedCriteria = rewrite ? asList(rewrite.removed_criteria) : []
  const noHiddenTalent = Boolean(rewrite) && hiddenTalentCount === 0

  return (
    <BlockShell
      titleId="employer-rewrite-title"
      eyebrow="Employer readiness"
      title="Job post filter rewrite"
      description="The restrictive phrase an employer wrote, the criteria ReRoute drops, and the wording that replaces them."
    >
      <Card
        as="form"
        variant="dark"
        surface="raised"
        padding="lg"
        onSubmit={onSubmit}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Field id="job-post-id" label="Job post id">
            <Select
              id="job-post-id"
              name="job_post_id"
              value={jobPostId}
              onChange={onJobPostChange}
            >
              {KNOWN_JOB_POST_IDS.map((knownId) => (
                <option key={knownId} value={knownId}>
                  {knownId}
                </option>
              ))}
            </Select>
          </Field>
          <p className={controlFieldHintClass}>
            The demo bundles three job posts and exposes no listing endpoint, so
            these ids are the whole catalogue.
          </p>
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? 'Rewriting…' : 'Rewrite this post'}
        </Button>
      </Card>

      <div
        className="mt-4"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="rewrite-region"
      >
        {isLoading ? (
          <StatusMessage
            tone="loading"
            title="Rewriting the filter…"
            message={`Simulating a rewrite for ${jobPostId}.`}
            testId="rewrite-loading"
          />
        ) : error ? (
          <StatusMessage
            tone="error"
            title="Rewrite unavailable"
            message={error}
            testId="rewrite-error"
          />
        ) : !rewrite ? (
          <StatusMessage
            tone="empty"
            title="No rewrite yet"
            message="Choose a bundled job post and rewrite it to see how many candidates the restrictive phrase had hidden."
            testId="rewrite-empty"
          />
        ) : (
          <div>
            <Card
              variant="dark"
              tone="amber"
              padding="lg"
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p
                  className={`text-xs font-bold uppercase tracking-[0.16em] ${toneHeadingClass.amber}`}
                >
                  Hidden by this filter
                </p>
                <p
                  className="mt-1 font-serif text-5xl leading-none text-offwhite"
                  data-testid="hidden-talent-count"
                >
                  {hiddenTalentCount === null ? '—' : hiddenTalentCount}
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-offwhite/70">
                  {noHiddenTalent
                    ? 'No candidates were hidden by this post, so there is nothing to rewrite.'
                    : 'Candidates this phrasing never reached, in the bundled demo data.'}
                </p>
              </div>
              <dl className="sm:text-right">
                <div>
                  <dt className={dataLabelClass}>Role</dt>
                  <dd className="mt-1 font-mono text-sm text-offwhite">
                    {asText(rewrite.role, 'unknown role')}
                  </dd>
                </div>
                <div className="mt-3">
                  <dt className={dataLabelClass}>City</dt>
                  <dd className="mt-1 font-mono text-sm text-offwhite">
                    {asText(rewrite.city, 'unknown city')}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card
              variant="dark"
              tone="amber"
              padding="md"
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber">
                Flagged
                <span aria-hidden="true" className="mx-2">
                  →
                </span>
                rewritten
              </p>
              <span
                aria-hidden="true"
                className="hidden h-px flex-1 bg-amber/50 sm:block"
              />
              <p
                className="text-sm leading-6 text-offwhite/70"
                data-testid="rewrite-reason"
              >
                {asText(
                  rewrite.rewrite_reason,
                  'No rewrite reason supplied by the demo fixture.',
                )}
              </p>
            </Card>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <FilterPanel
                heading="Before · would be flagged"
                headingId="filter-text-before"
                tone="before"
                text={asText(
                  rewrite.filter_text_before,
                  'No before text supplied.',
                )}
              >
                <p className="mt-3 border-t border-rule pt-3 text-sm leading-6 text-offwhite/70">
                  <span
                    className={`block text-[0.65rem] font-bold uppercase tracking-[0.16em] ${toneHeadingClass.red}`}
                  >
                    Restrictive phrase removed
                  </span>
                  <q
                    className="mt-1 block font-serif text-lg"
                    data-testid="restrictive-phrase"
                  >
                    {asText(rewrite.restrictive_phrase, 'no phrase reported')}
                  </q>
                </p>
              </FilterPanel>

              <FilterPanel
                heading="After · rewritten post"
                headingId="filter-text-after"
                tone="after"
                text={asText(rewrite.filter_text_after, 'No after text supplied.')}
              >
                <p className="mt-3 border-t border-rule pt-3 text-sm leading-6 text-offwhite/70">
                  <span
                    className={`block text-[0.65rem] font-bold uppercase tracking-[0.16em] ${toneHeadingClass.teal}`}
                  >
                    Pedigree wording gone
                  </span>
                  <span className="mt-1 block">
                    {noHiddenTalent
                      ? 'The post was already free of restrictive criteria.'
                      : 'The restrictive phrase and its sibling criteria are gone, replaced by evidence every applicant can show.'}
                  </span>
                </p>
              </FilterPanel>

              <p
                className={`lg:col-span-2 ${sectionHeadingClass}`}
              >
                Read top to bottom: the before wording is what an audit flags,
                the after wording is what the employer posts instead.
              </p>
            </div>

            <Card
              variant="dark"
              surface="raised"
              padding="lg"
              className="mt-4"
            >
              <h3 id="removed-criteria-title" className={sectionHeadingClass}>
                Criteria removed ({removedCriteria.length})
              </h3>
              {removedCriteria.length > 0 ? (
                <ul
                  aria-labelledby="removed-criteria-title"
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                >
                  {removedCriteria.map((criterion, index) => (
                    <li
                      key={`${criterion}-${index}`}
                      className="flex items-start gap-2 rounded-control border border-rule bg-navy px-3 py-2 text-sm leading-5 text-offwhite/70"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 ${toneHeadingClass.red}`}
                      >
                        ✕
                      </span>
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-offwhite/50">
                  No criteria were removed from this post.
                </p>
              )}
            </Card>

            <div className={`mt-3 ${metaRowClass}`}>
              <span>source=simulated</span>
              <span aria-hidden="true">·</span>
              <span>{asText(rewrite.job_post_id, jobPostId)}</span>
            </div>
            <DisclaimerNote
              disclaimer={rewrite.disclaimer}
              scope="Job post rewrite"
            />
          </div>
        )}
      </div>
    </BlockShell>
  )
}

export default function HRConsole({ baseUrl = '' }) {
  const [role, setRole] = useState(DEFAULT_RADAR_ROLE)
  const [city, setCity] = useState(DEFAULT_RADAR_CITY)
  const [jobPostId, setJobPostId] = useState(DEFAULT_JOB_POST_ID)
  const [radar, setRadar] = useState(EMPTY_RESULT)
  const [radarError, setRadarError] = useState('')
  const [isRadarLoading, setIsRadarLoading] = useState(true)
  const [rewrite, setRewrite] = useState(EMPTY_RESULT)
  const [rewriteError, setRewriteError] = useState('')
  const [isRewriteLoading, setIsRewriteLoading] = useState(true)

  // Each panel keeps the in-flight request so a newer submit cancels the older
  // one. Without this, two quick submits can resolve out of order and the stale
  // response wins. React StrictMode remounts these effects in development, so
  // this is also what stops the mount fetch from being issued twice.
  const radarRequestRef = useRef(/** @type {AbortController | null} */ (null))
  const rewriteRequestRef = useRef(/** @type {AbortController | null} */ (null))

  useEffect(
    () => () => {
      radarRequestRef.current?.abort()
      rewriteRequestRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    void loadRadar(DEFAULT_RADAR_ROLE, DEFAULT_RADAR_CITY)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount fetch only
  }, [])

  useEffect(() => {
    void loadRewrite(DEFAULT_JOB_POST_ID)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount fetch only
  }, [])

  async function loadRadar(nextRole, nextCity) {
    radarRequestRef.current?.abort()

    const controller = new AbortController()
    radarRequestRef.current = controller
    setIsRadarLoading(true)
    setRadarError('')
    setRadar(EMPTY_RESULT)

    try {
      const response = await getDisplacementRadar(
        { role: nextRole, city: nextCity },
        { baseUrl, signal: controller.signal },
      )

      if (radarRequestRef.current === controller) {
        setRadar(response)
      }
    } catch (requestError) {
      if (radarRequestRef.current === controller) {
        setRadarError(readRadarError(requestError))
      }
    } finally {
      if (radarRequestRef.current === controller) {
        setIsRadarLoading(false)
      }
    }
  }

  async function loadRewrite(nextJobPostId) {
    rewriteRequestRef.current?.abort()

    const controller = new AbortController()
    rewriteRequestRef.current = controller
    setIsRewriteLoading(true)
    setRewriteError('')
    setRewrite(EMPTY_RESULT)

    try {
      const response = await rewriteEmployerFilter(nextJobPostId, {
        baseUrl,
        signal: controller.signal,
      })

      if (rewriteRequestRef.current === controller) {
        setRewrite(response)
      }
    } catch (requestError) {
      if (rewriteRequestRef.current === controller) {
        setRewriteError(readRewriteError(requestError))
      }
    } finally {
      if (rewriteRequestRef.current === controller) {
        setIsRewriteLoading(false)
      }
    }
  }

  function handleRadarSubmit(event) {
    event.preventDefault()
    void loadRadar(role.trim() || DEFAULT_RADAR_ROLE, city.trim() || DEFAULT_RADAR_CITY)
  }

  function handleRewriteSubmit(event) {
    event.preventDefault()
    void loadRewrite(jobPostId)
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-rule-light pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber">
          Employer readiness · Phase 4C
        </p>
        {/* An h2, not a second h1: this panel renders inside App's page column,
            which already owns the document's only h1. */}
        <h2 className="mt-3 font-serif text-3xl leading-[1.05] tracking-[-0.03em] text-navy sm:text-4xl">
          Rewrite the filter,
          <span className="block italic text-navy/50">
            not the shortlist.
          </span>
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-7 text-navy/70">
          What an employer&rsquo;s own job post does to their shortlist, and the
          evidence-led wording ReRoute swaps in once the audit flags the post.
        </p>
        <p className="mt-4 flex items-start gap-2 rounded-card border border-amber/40 bg-amber/10 px-4 py-3 text-sm leading-6 text-navy/70 sm:max-w-3xl">
          <span aria-hidden="true" className="mt-1 text-amber">
            ▲
          </span>
          <span>
            Every number on this page is simulated. Both endpoints serve bundled
            demo fixtures and are wired to no applicant tracking system, job board
            or SAP service, so nothing here should be read as observed hiring data.
          </span>
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <RadarBlock
          role={role}
          city={city}
          radar={radar}
          error={radarError}
          isLoading={isRadarLoading}
          onRoleChange={(event) => setRole(event.target.value)}
          onCityChange={(event) => setCity(event.target.value)}
          onSubmit={handleRadarSubmit}
        />

        <RewriteBlock
          jobPostId={jobPostId}
          rewrite={rewrite}
          error={rewriteError}
          isLoading={isRewriteLoading}
          onJobPostChange={(event) => setJobPostId(event.target.value)}
          onSubmit={handleRewriteSubmit}
        />
      </div>
    </div>
  )
}
