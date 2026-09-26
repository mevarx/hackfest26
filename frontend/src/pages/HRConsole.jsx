import { useEffect, useRef, useState } from 'react'
import { getDisplacementRadar, rewriteEmployerFilter } from '../api.js'
import {
  bodyClass,
  bodyCopyClass,
  captionClass,
  chalkClass,
  controlFieldHintClass,
  dataLabelClass,
  headingClass,
  headingSmClass,
  metaClass,
  metaRowClass,
  ruleClass,
  sectionHeadingClass,
  smokeClass,
} from '../styles/classes.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Field from '../components/Field.jsx'
import Select from '../components/Select.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
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

/** @type {Record<string, { emptyState: boolean, titleClass: string }>} */
const STATUS_CARD_DETAILS = {
  // A quiet state recedes into Smoke; a failure is the one status here worth
  // reading at full ink. Neither gets a box, a border, or a colour of its own.
  loading: {
    emptyState: false,
    titleClass: smokeClass,
  },
  error: {
    emptyState: false,
    titleClass: chalkClass,
  },
  empty: {
    emptyState: true,
    titleClass: smokeClass,
  },
}

// An aside the reader must not skip: a hairline above it, 13px Smoke below.
// The system has no icon for "read this first", so the rule and the type carry
// it — one paragraph, no glyph, no tinted panel.
const NOTE_CLASS = `max-w-[40rem] border-t ${ruleClass} pt-6 text-left font-aeonik text-caption font-normal leading-6 ${smokeClass}`

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

function readStatusDetails(status) {
  return STATUS_CARD_DETAILS[status] ?? STATUS_CARD_DETAILS.loading
}

function DisclaimerNote({ disclaimer, scope }) {
  return (
    <p className={`mt-8 ${NOTE_CLASS}`}>
      {/* Weight 500 at the note's own size marks the scope word. The reference
          keeps Aeonik 400 for display type; 500 is a half-step, never bold or
          semibold, and a second colour would be a heavier signal than an aside
          warrants. */}
      <span className="font-medium">{scope}: </span>
      {asText(disclaimer, 'Simulated demo data, not an observed ATS connection.')}
    </p>
  )
}

/**
 * One sub-block inside the employer section.
 *
 * These headings are deliberately one step below the section's own h2: the
 * employer console carries two distinct tools (the displacement radar and the
 * shortlist rewriter), and each needs its own name, but neither is a top-level
 * section of the page. Rendering them through `Card`'s default h2 made four
 * h2s compete across one region, so the title is explicitly an h3 and the
 * Card is labelled by it.
 */
function BlockShell({ titleId, eyebrow, title, description, className = '', children }) {
  return (
    <Card
      as="section"
      eyebrow={eyebrow}
      title={title}
      titleAs="h3"
      titleId={titleId}
      description={description}
      // Both blocks are backed by bundled demo fixtures wired to no ATS, so the
      // honest reading of the source is a non-live badge: the Graphite outline
      // dot rather than the Pulse Green live dot.
      actions={<StatusBadge label="simulated" live={false} />}
      aria-labelledby={titleId}
      padding="none"
      className={className}
    >
      {children}
    </Card>
  )
}

function StatusMessage({ tone, title, message, testId }) {
  const details = readStatusDetails(tone)

  return (
    <div
      className={`border-t ${ruleClass} ${details.emptyState ? 'px-6 py-16' : 'pt-8'}`}
      data-testid={testId}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <p className={`${captionClass} ${details.titleClass}`}>{title}</p>
      <p className={`mt-3 max-w-[40rem] text-left ${bodyClass} ${smokeClass}`}>
        {message}
      </p>
    </div>
  )
}

function RadarBlock({
  role,
  city,
  isLoading,
  error,
  radar,
  className = '',
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
      className={className}
    >
      <form
        className={`flex flex-col items-start gap-8 border-t ${ruleClass} pt-8 sm:flex-row sm:items-end`}
        onSubmit={onSubmit}
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
        {/* One forward action per block, and the blocks are a screen apart, so
            each earns the single filled Glossy Pill. `↗` is the reference's
            glyph for a forward action. */}
        <Button
          type="submit"
          variant="glossy"
          arrow="↗"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? 'Loading radar…' : 'Check exposure'}
        </Button>
      </form>

      <div
        className="mt-12"
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
            <dl className="grid gap-8 sm:grid-cols-2">
              <div className={`border-t ${ruleClass} pt-4`}>
                <dt className={dataLabelClass}>Role</dt>
                <dd className={`mt-2 ${metaClass} ${chalkClass}`}>
                  {asText(radar.role, role)}
                </dd>
              </div>
              <div className={`border-t ${ruleClass} pt-4`}>
                <dt className={dataLabelClass}>City</dt>
                <dd className={`mt-2 ${metaClass} ${chalkClass}`}>
                  {asText(radar.city, city)}
                </dd>
              </div>
              <div className={`border-t ${ruleClass} pt-4`}>
                <dt className={dataLabelClass}>Displacement exposure</dt>
                <dd
                  className={`mt-2 ${headingSmClass} ${chalkClass}`}
                  data-testid="radar-exposure"
                >
                  {asText(radar.exposure, 'unknown')}
                </dd>
              </div>
              <div className={`border-t ${ruleClass} pt-4`}>
                <dt className={dataLabelClass}>Local demand</dt>
                <dd
                  className={`mt-2 ${headingSmClass} ${chalkClass}`}
                  data-testid="radar-demand"
                >
                  {asText(radar.demand, 'unknown')}
                </dd>
              </div>
            </dl>
            {/* Meta row, not a badge: this line is data about the fetch, and the
                reference gives a source word no badge of its own here — plain
                mono Smoke with a "·" separator and no box. */}
            <div className={`mt-8 ${metaRowClass}`}>
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

function FilterPanel({ heading, headingId, text, children }) {
  return (
    <div className={`border-t ${ruleClass} pt-6`}>
      <h3 id={headingId} className={sectionHeadingClass}>
        {heading}
      </h3>
      <p className={`mt-3 ${bodyCopyClass}`}>{text}</p>
      {children}
    </div>
  )
}

function RewriteBlock({
  jobPostId,
  isLoading,
  error,
  rewrite,
  className = '',
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
      className={className}
    >
      <form
        className={`flex flex-col items-start gap-8 border-t ${ruleClass} pt-8 sm:flex-row sm:items-end`}
        onSubmit={onSubmit}
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
          variant="glossy"
          arrow="↗"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? 'Rewriting…' : 'Rewrite this post'}
        </Button>
      </form>

      <div
        className="mt-12"
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
            <div className={`flex flex-col gap-6 border-t ${ruleClass} pt-8 sm:flex-row sm:items-start sm:justify-between`}>
              <div>
                <p className={sectionHeadingClass}>Hidden by this filter</p>
                {/* The block's one hero figure, at the heading size. It stays a
                    number the reader has to parse, not display typography. */}
                <p
                  className={`mt-3 ${headingClass} ${chalkClass}`}
                  data-testid="hidden-talent-count"
                >
                  {hiddenTalentCount === null ? '—' : hiddenTalentCount}
                </p>
                <p className={`mt-4 ${bodyCopyClass}`}>
                  {noHiddenTalent
                    ? 'No candidates were hidden by this post, so there is nothing to rewrite.'
                    : 'Candidates this phrasing never reached, in the bundled demo data.'}
                </p>
              </div>
              <dl className="sm:text-right">
                <div>
                  <dt className={dataLabelClass}>Role</dt>
                  <dd className={`mt-2 ${metaClass} ${chalkClass}`}>
                    {asText(rewrite.role, 'unknown role')}
                  </dd>
                </div>
                <div className="mt-4">
                  <dt className={dataLabelClass}>City</dt>
                  <dd className={`mt-2 ${metaClass} ${chalkClass}`}>
                    {asText(rewrite.city, 'unknown city')}
                  </dd>
                </div>
              </dl>
            </div>

            <div className={`mt-12 flex flex-col gap-3 border-t ${ruleClass} pt-8 sm:flex-row sm:items-center`}>
              {/* The words and the hairline do the work an arrow used to: the
                  "·" is the same separator the meta rows use. */}
              <p className={sectionHeadingClass}>Flagged · rewritten</p>
              <span
                aria-hidden="true"
                className={`hidden h-px flex-1 bg-graphite sm:block`}
              />
              <p
                className={`${bodyCopyClass}`}
                data-testid="rewrite-reason"
              >
                {asText(
                  rewrite.rewrite_reason,
                  'No rewrite reason supplied by the demo fixture.',
                )}
              </p>
            </div>

            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              <FilterPanel
                heading="Before · would be flagged"
                headingId="filter-text-before"
                text={asText(
                  rewrite.filter_text_before,
                  'No before text supplied.',
                )}
              >
                <p className={`mt-4 border-t ${ruleClass} pt-4`}>
                  <span className={`block ${dataLabelClass}`}>
                    Restrictive phrase removed
                  </span>
                  <q
                    className={`mt-2 block text-left italic ${headingSmClass} ${chalkClass}`}
                    data-testid="restrictive-phrase"
                  >
                    {asText(rewrite.restrictive_phrase, 'no phrase reported')}
                  </q>
                </p>
              </FilterPanel>

              <FilterPanel
                heading="After · rewritten post"
                headingId="filter-text-after"
                text={asText(rewrite.filter_text_after, 'No after text supplied.')}
              >
                <p className={`mt-4 border-t ${ruleClass} pt-4`}>
                  <span className={`block ${dataLabelClass}`}>
                    Pedigree wording gone
                  </span>
                  <span className={`mt-2 block ${bodyCopyClass}`}>
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

            <div className={`mt-12 border-t ${ruleClass} pt-8`}>
              <h3 id="removed-criteria-title" className={sectionHeadingClass}>
                Criteria removed ({removedCriteria.length})
              </h3>
              {removedCriteria.length > 0 ? (
                <ul
                  aria-labelledby="removed-criteria-title"
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  {/* A hairline-separated list, nothing more: the words already
                      say what was dropped, so there is no marker glyph. */}
                  {removedCriteria.map((criterion, index) => (
                    <li
                      key={`${criterion}-${index}`}
                      className={`border-t ${ruleClass} pt-3 text-left ${bodyClass} ${smokeClass}`}
                    >
                      {criterion}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`mt-3 ${bodyCopyClass}`}>
                  No criteria were removed from this post.
                </p>
              )}
            </div>

            <div className={`mt-8 ${metaRowClass}`}>
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
    <div>
      <header className="pb-12">
        <p className={sectionHeadingClass}>Employer readiness · Phase 4C</p>
        {/* An h2, not a second h1: this panel renders inside App's page column,
            which already owns the document's only h1. The reference's Headline
            Display Block: line one at full weight in Chalk, line two the same
            size in italic one step quieter, both left-aligned. "not the
            shortlist" reads as the aside it is precisely because it is not
            louder than the line above it. */}
        <h2 className={`mt-4 max-w-2xl ${headingClass} ${chalkClass}`}>
          Rewrite the filter,
          <span className={`block italic ${smokeClass}`}>
            not the shortlist.
          </span>
        </h2>
        <p className={`mt-6 ${bodyCopyClass}`}>
          What an employer&rsquo;s own job post does to their shortlist, and the
          evidence-led wording ReRoute swaps in once the audit flags the post.
        </p>
        <p className={`mt-8 ${NOTE_CLASS}`}>
          Every number on this page is simulated. Both endpoints serve bundled
          demo fixtures and are wired to no applicant tracking system, job board
          or SAP service, so nothing here should be read as observed hiring data.
        </p>
      </header>

      <div>
        <RadarBlock
          role={role}
          city={city}
          radar={radar}
          error={radarError}
          isLoading={isRadarLoading}
          className={`mt-24 border-t ${ruleClass} pt-24`}
          onRoleChange={(event) => setRole(event.target.value)}
          onCityChange={(event) => setCity(event.target.value)}
          onSubmit={handleRadarSubmit}
        />

        <RewriteBlock
          jobPostId={jobPostId}
          rewrite={rewrite}
          error={rewriteError}
          isLoading={isRewriteLoading}
          className={`mt-24 border-t ${ruleClass} pt-24`}
          onJobPostChange={(event) => setJobPostId(event.target.value)}
          onSubmit={handleRewriteSubmit}
        />
      </div>
    </div>
  )
}
