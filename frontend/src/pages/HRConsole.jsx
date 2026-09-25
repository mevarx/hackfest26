import { useEffect, useRef, useState } from 'react'
import { getDisplacementRadar, rewriteEmployerFilter } from '../api.js'

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
const SIMULATED_BADGE_LABEL = 'Simulated'
const SIMULATED_BADGE_CLASS = 'border-amber/45 bg-amber/10 text-amber'
const EMPTY_RESULT = null

function SimulatedTag({ scope }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${SIMULATED_BADGE_CLASS}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
      {SIMULATED_BADGE_LABEL}
      <span className="sr-only"> {scope}</span>
    </span>
  )
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

function DisclaimerNote({ disclaimer, scope }) {
  return (
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-off-white/55">
      <span aria-hidden="true" className="mt-1 text-amber">
        ▲
      </span>
      <span>
        <strong className="text-off-white/80">{scope}: </strong>
        {asText(disclaimer, 'Simulated demo data, not an observed ATS connection.')}
      </span>
    </p>
  )
}

function BlockShell({ titleId, eyebrow, title, description, children }) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-navy/10 bg-navy text-off-white shadow-xl shadow-navy/10"
      aria-labelledby={titleId}
    >
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
            {eyebrow}
          </p>
          <h2 id={titleId} className="mt-1 font-serif text-2xl text-off-white">
            {title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-off-white/60">
            {description}
          </p>
        </div>
        <SimulatedTag scope={title} />
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

function StatusMessage({ tone, title, message, testId }) {
  let containerClass = 'border-amber/30 bg-amber/10'
  let titleClass = 'text-amber'

  if (tone === 'error') {
    containerClass = 'border-red/50 bg-red/10'
    titleClass = 'text-red-300'
  } else if (tone === 'empty') {
    containerClass = 'border-white/10 bg-white/[0.04]'
    titleClass = 'text-off-white/50'
  }

  return (
    <div
      className={`rounded-xl border p-5 ${containerClass}`}
      data-testid={testId}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <p className={`text-xs font-bold uppercase tracking-[0.18em] ${titleClass}`}>
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-off-white/75">{message}</p>
    </div>
  )
}

const SUBMIT_BUTTON_CLASS =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-navy transition hover:bg-amber/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto'

const FIELD_LABEL_CLASS =
  'block text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/50'

const FIELD_CONTROL_CLASS =
  'mt-2 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 font-mono text-sm text-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber'

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
      <form
        className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-end"
        onSubmit={onSubmit}
      >
        <div className="flex-1">
          <label htmlFor="radar-role" className={FIELD_LABEL_CLASS}>
            Role id
          </label>
          <input
            id="radar-role"
            name="role"
            list="radar-role-options"
            value={role}
            onChange={onRoleChange}
            className={FIELD_CONTROL_CLASS}
          />
          <datalist id="radar-role-options">
            {KNOWN_RADAR_ROLES.map((knownRole) => (
              <option key={knownRole} value={knownRole} />
            ))}
          </datalist>
        </div>
        <div className="sm:w-40">
          <label htmlFor="radar-city" className={FIELD_LABEL_CLASS}>
            City
          </label>
          <input
            id="radar-city"
            name="city"
            value={city}
            onChange={onCityChange}
            className={FIELD_CONTROL_CLASS}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className={SUBMIT_BUTTON_CLASS}
        >
          {isLoading ? 'Loading radar…' : 'Check exposure'}
        </button>
      </form>

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
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  Role
                </dt>
                <dd className="mt-1 font-mono text-sm text-off-white">
                  {asText(radar.role, role)}
                </dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                  City
                </dt>
                <dd className="mt-1 font-mono text-sm text-off-white">
                  {asText(radar.city, city)}
                </dd>
              </div>
              <div className="rounded-xl border border-amber/30 bg-amber/10 p-4">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/50">
                  Displacement exposure
                </dt>
                <dd
                  className="mt-1 font-serif text-2xl text-amber"
                  data-testid="radar-exposure"
                >
                  {asText(radar.exposure, 'unknown')}
                </dd>
              </div>
              <div className="rounded-xl border border-teal/30 bg-teal/10 p-4">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/50">
                  Local demand
                </dt>
                <dd
                  className="mt-1 font-serif text-2xl text-teal"
                  data-testid="radar-demand"
                >
                  {asText(radar.demand, 'unknown')}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-off-white/45">
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
  const toneClass =
    tone === 'after' ? 'border-teal/40 bg-teal/10' : 'border-red/40 bg-red/10'

  return (
    <div className={`flex flex-col rounded-xl border p-4 ${toneClass}`}>
      <h3
        id={headingId}
        className="text-xs font-bold uppercase tracking-[0.18em] text-off-white/80"
      >
        {heading}
      </h3>
      <p className="mt-3 text-sm leading-6 text-off-white/80">{text}</p>
      {children}
    </div>
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
      <form
        className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-end"
        onSubmit={onSubmit}
      >
        <div className="flex-1">
          <label htmlFor="job-post-id" className={FIELD_LABEL_CLASS}>
            Job post id
          </label>
          <select
            id="job-post-id"
            name="job_post_id"
            value={jobPostId}
            onChange={onJobPostChange}
            className={FIELD_CONTROL_CLASS}
          >
            {KNOWN_JOB_POST_IDS.map((knownId) => (
              <option key={knownId} value={knownId}>
                {knownId}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-off-white/45">
            The demo bundles three job posts and exposes no listing endpoint, so
            these ids are the whole catalogue.
          </p>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className={SUBMIT_BUTTON_CLASS}
        >
          {isLoading ? 'Rewriting…' : 'Rewrite this post'}
        </button>
      </form>

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
            <div className="flex flex-col gap-4 rounded-2xl border border-amber/40 bg-amber/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber">
                  Hidden by this filter
                </p>
                <p
                  className="mt-1 font-serif text-5xl leading-none text-off-white"
                  data-testid="hidden-talent-count"
                >
                  {hiddenTalentCount === null ? '—' : hiddenTalentCount}
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-off-white/70">
                  {noHiddenTalent
                    ? 'No candidates were hidden by this post, so there is nothing to rewrite.'
                    : 'Candidates this phrasing never reached, in the bundled demo data.'}
                </p>
              </div>
              <dl className="sm:text-right">
                <div>
                  <dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                    Role
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-off-white">
                    {asText(rewrite.role, 'unknown role')}
                  </dd>
                </div>
                <div className="mt-3">
                  <dt className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-off-white/45">
                    City
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-off-white">
                    {asText(rewrite.city, 'unknown city')}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber/30 bg-amber/10 p-4 sm:flex-row sm:items-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber">
                Flagged
                <span aria-hidden="true" className="px-2">
                  →
                </span>
                rewritten
              </p>
              <span
                aria-hidden="true"
                className="hidden h-px flex-1 bg-amber/50 sm:block"
              />
              <p
                className="text-sm leading-6 text-off-white/75"
                data-testid="rewrite-reason"
              >
                {asText(
                  rewrite.rewrite_reason,
                  'No rewrite reason supplied by the demo fixture.',
                )}
              </p>
            </div>

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
                <p className="mt-3 border-t border-white/15 pt-3 text-sm leading-6 text-off-white/80">
                  <span className="block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-red-300">
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
                <p className="mt-3 border-t border-white/15 pt-3 text-sm leading-6 text-off-white/80">
                  <span className="block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-teal">
                    Pedigree wording gone
                  </span>
                  <span className="mt-1 block">
                    {noHiddenTalent
                      ? 'The post was already free of restrictive criteria.'
                      : 'The restrictive phrase and its sibling criteria are gone, replaced by evidence every applicant can show.'}
                  </span>
                </p>
              </FilterPanel>

              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-off-white/50 lg:col-span-2">
                Read top to bottom: the before wording is what an audit flags,
                the after wording is what the employer posts instead.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <h3
                id="removed-criteria-title"
                className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/50"
              >
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
                      className="flex items-start gap-2 rounded-lg border border-white/10 bg-navy px-3 py-2 text-sm leading-5 text-off-white/75"
                    >
                      <span aria-hidden="true" className="mt-0.5 text-red-300">
                        ✕
                      </span>
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-off-white/50">
                  No criteria were removed from this post.
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-off-white/45">
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

export default function HRConsole() {
  const [role, setRole] = useState(DEFAULT_RADAR_ROLE)
  const [city, setCity] = useState(DEFAULT_RADAR_CITY)
  const [jobPostId, setJobPostId] = useState(DEFAULT_JOB_POST_ID)
  const [radar, setRadar] = useState(EMPTY_RESULT)
  const [radarError, setRadarError] = useState('')
  const [isRadarLoading, setIsRadarLoading] = useState(true)
  const [rewrite, setRewrite] = useState(EMPTY_RESULT)
  const [rewriteError, setRewriteError] = useState('')
  const [isRewriteLoading, setIsRewriteLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getDisplacementRadar({
      role: DEFAULT_RADAR_ROLE,
      city: DEFAULT_RADAR_CITY,
    })
      .then((response) => {
        if (!cancelled) {
          setRadar(response)
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setRadarError(readRadarError(requestError))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRadarLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    rewriteEmployerFilter(DEFAULT_JOB_POST_ID)
      .then((response) => {
        if (!cancelled) {
          setRewrite(response)
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setRewriteError(readRewriteError(requestError))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRewriteLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function loadRadar(nextRole, nextCity) {
    setIsRadarLoading(true)
    setRadarError('')
    setRadar(EMPTY_RESULT)

    try {
      const response = await getDisplacementRadar({
        role: nextRole,
        city: nextCity,
      })

      if (mountedRef.current) {
        setRadar(response)
      }
    } catch (requestError) {
      if (mountedRef.current) {
        setRadarError(readRadarError(requestError))
      }
    } finally {
      if (mountedRef.current) {
        setIsRadarLoading(false)
      }
    }
  }

  async function loadRewrite(nextJobPostId) {
    setIsRewriteLoading(true)
    setRewriteError('')
    setRewrite(EMPTY_RESULT)

    try {
      const response = await rewriteEmployerFilter(nextJobPostId)

      if (mountedRef.current) {
        setRewrite(response)
      }
    } catch (requestError) {
      if (mountedRef.current) {
        setRewriteError(readRewriteError(requestError))
      }
    } finally {
      if (mountedRef.current) {
        setIsRewriteLoading(false)
      }
    }
  }

  function handleRadarSubmit(event) {
    event.preventDefault()
    loadRadar(role.trim() || DEFAULT_RADAR_ROLE, city.trim() || DEFAULT_RADAR_CITY)
  }

  function handleRewriteSubmit(event) {
    event.preventDefault()
    loadRewrite(jobPostId)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber">
          Employer readiness · Phase 4C
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-[1.02] tracking-[-0.03em] text-navy sm:text-5xl">
          Rewrite the filter,
          <span className="block italic text-navy/55">
            not the shortlist.
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-navy/65">
          What an employer&rsquo;s own job post does to their shortlist, and the
          evidence-led wording ReRoute swaps in once the audit flags the post.
        </p>
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm leading-6 text-navy/80 sm:max-w-3xl">
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
