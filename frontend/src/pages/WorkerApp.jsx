import { useCallback, useEffect, useRef, useState } from 'react'
import { getSession, scoreWorkSample } from '../api.js'
import { isAbortError } from '../lib/guards.js'
import {
  bodyClass,
  bodyCopyClass,
  chalkClass,
  controlFieldHintClass,
  controlFieldLabelClass,
  dataLabelClass,
  headingSmClass,
  inlineLabelClass,
  labelClass,
  measureClass,
  metaClass,
  ruleDarkClass,
  sectionHeadingClass,
  smokeClass,
} from '../styles/classes.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Field from '../components/Field.jsx'
import Select from '../components/Select.jsx'
import SourceTag from '../components/SourceTag.jsx'
import StatusLine from '../components/StatusLine.jsx'
import Textarea from '../components/Textarea.jsx'

const KAVYA_PERSONA = 'Kavya'

export const KAVYA_TRANSCRIPT = `Hi, I am Kavya. I worked for four years as a manual tester at a product company in Chennai before an eighteen month caregiving break.

Before the break I wrote manual test case design documents in Excel and I owned defect reporting in Jira for the checkout and payments flows. Every release I ran a regression testing pass on the signup journey, and I was the person who did defect reproduction whenever a payment failed in staging. I also kept postman collections for our public API testing, and I wrote the test plan authoring documents before every sprint and the release verification notes after it.

What I do not have is test automation scripting experience. I have never written a Selenium or Playwright test, and I have never configured a ci pipeline. I want to get back into quality work, and I can give ten honest hours a week to learning.`

const PASSPORT_POLL_INTERVAL_MS = 1_500
const SESSION_START_TIMEOUT_MS = 10_000

const EMPTY_EVENTS = []
const EMPTY_SKILLS = []
const EMPTY_CREDENTIALS = []

/** @type {Record<string, { label: string, source: 'live' | 'simulated' | 'local' | 'pending' }>} */
const SOURCE_DETAILS = {
  live: { label: 'Live', source: 'live' },
  simulated: { label: 'Simulated', source: 'simulated' },
  pending: { label: 'Source pending', source: 'pending' },
}

/** @type {Record<string, { label: string, status: 'running' | 'done' | 'waiting' | 'idle' }>} */
const EVENT_STATUS_DETAILS = {
  running: { label: 'Running', status: 'running' },
  done: { label: 'Done', status: 'done' },
  waiting_consent: { label: 'Waiting for consent', status: 'waiting' },
  unknown: { label: 'Unknown status', status: 'waiting' },
}

// One 1px Graphite rule plus 32px of air is what separates this panel's
// sections. Never a shift in background tint between them.
const SECTION_CLASS = `border-t ${ruleDarkClass} pt-8`

// A failure is ordinary body copy in the panel's own ink. The box is the thing
// that used to make these read as status chips rather than as sentences.
const ALERT_CLASS = `mt-4 ${measureClass} text-left ${bodyClass} ${chalkClass}`

// Idle, loading and empty states say so in plain muted copy with room around
// them — no box, no placeholder border.
const EMPTY_STATE_COPY_CLASS =
  `mx-auto mt-3 ${measureClass} text-center ${bodyClass} ${smokeClass}`

// An agent-log message is body-weight copy set at the label size. `labelClass`
// carries the 14px and only the weight drops back to 400, so the type scale
// stays the single source and no new size string is invented here.
const LOG_MESSAGE_CLASS = `${labelClass} ${smokeClass} font-normal leading-6`

// A confidence reading is a number the server returned, not a headline: 6px
// track, square ends. Full pill radius belongs to the one top-level CTA only.
const CONFIDENCE_TRACK_CLASS = 'h-1.5 flex-1 overflow-hidden bg-graphite'
const CONFIDENCE_FILL_CLASS = 'h-full bg-chalk'

// A credential is a name, not a state, so it gets no status dot. It is set as a
// plain tag — 4px radius, 1px Graphite rule, no fill — because these are short
// nouns that wrap as a group; a hairline-separated inline list would shatter
// across lines, and the tag radius is the one the reference allows outside a
// card. Nothing here is a status capsule.
const CREDENTIAL_TAG_CLASS =
  `inline-block rounded-tag border ${ruleDarkClass} px-2 py-0.5 ${metaClass} ${smokeClass}`

// Timeline dot geometry: a 6px dot whose centre lands on the 1px Graphite rule
// carried by the list itself. The vocabulary matches the status line so the two
// event lists on this page cannot drift apart.
const TIMELINE_DOT_BASE_CLASS =
  'absolute -left-[3.5px] top-1.5 h-1.5 w-1.5 rounded-full'

function getTimelineDotClass(status) {
  if (status === 'running') {
    return `${TIMELINE_DOT_BASE_CLASS} border border-smoke bg-transparent running-dot`
  }

  if (status === 'done') {
    return `${TIMELINE_DOT_BASE_CLASS} bg-pulse`
  }

  // Waiting and idle are the same shape on purpose. Amber is the one thing this
  // panel must not repeat, and the word beside the dot already says which it is.
  return `${TIMELINE_DOT_BASE_CLASS} border border-graphite bg-transparent`
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

function getEventStatusDetails(status) {
  return EVENT_STATUS_DETAILS[status] ?? EVENT_STATUS_DETAILS.unknown
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'The ReRoute service could not be reached. Try again.'
}

/**
 * Whether a failed session request means "stop asking".
 *
 * 404 and 410 are permanent: the session is gone, so retrying on the poll
 * interval would hammer the API forever. Everything else (5xx, transport
 * failures) may succeed on the next tick.
 *
 * The status is read structurally rather than with `instanceof ApiError`, so the
 * check keeps working when the class crosses a module or bundle boundary.
 */
function isTerminalSessionError(error) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const { status } = /** @type {{ status?: unknown }} */ (error)

  return status === 404 || status === 410
}

function formatConfidence(confidence) {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return '—'
  }

  return confidence.toFixed(2)
}

function toPercent(confidence) {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(confidence * 100)))
}

function optionalValue(value) {
  return value ?? null
}

function getSessionSnapshotKey(session) {
  if (session === null || typeof session !== 'object') {
    return 'no-session'
  }

  return JSON.stringify([
    session.session_id ?? null,
    session.status ?? null,
    session.version ?? null,
    session.skills_source ?? null,
    session.passport ?? null,
    session.route ?? null,
  ])
}

function asConstructor(candidate) {
  return typeof candidate === 'function' ? candidate : null
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') {
    return null
  }

  if ('webkitSpeechRecognition' in window) {
    return asConstructor(window.webkitSpeechRecognition)
  }

  if ('SpeechRecognition' in window) {
    return asConstructor(window.SpeechRecognition)
  }

  return null
}

export default function WorkerApp({
  baseUrl = '',
  sessionId,
  onSessionStart,
  events = EMPTY_EVENTS,
  isStreaming = false,
}) {
  const [transcript, setTranscript] = useState(KAVYA_TRANSCRIPT)
  const [session, setSession] = useState(null)
  const [sessionError, setSessionError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [selectedSkill, setSelectedSkill] = useState('')
  const [submission, setSubmission] = useState('')
  const [workSampleResult, setWorkSampleResult] = useState(null)
  const [workSampleError, setWorkSampleError] = useState('')
  const [isScoring, setIsScoring] = useState(false)
  const recognitionRef = useRef(null)
  const activeSessionId = optionalValue(sessionId)

  const speechSupported = getSpeechRecognitionConstructor() !== null

  const isBusy = isStreaming || (isStarting && !activeSessionId)
  const sessionPayload = optionalValue(session)
  const passport = sessionPayload?.passport ?? null
  const skills =
    passport === null ? EMPTY_SKILLS : (passport.skills ?? EMPTY_SKILLS)
  const credentials =
    passport === null
      ? EMPTY_CREDENTIALS
      : (passport.credentials ?? EMPTY_CREDENTIALS)
  const skillNames = skills.map((skill) => skill.name)
  const activeSkill = skillNames.includes(selectedSkill)
    ? selectedSkill
    : (skillNames[0] ?? '')
  const passportSource = passport === null ? null : (passport.source ?? null)
  const sessionStatus = sessionPayload?.status ?? null
  const sample = optionalValue(workSampleResult)
  const sampleSource = getSourceDetails(sample?.source)
  const latestEvent = events.length === 0 ? null : events[events.length - 1]
  const hasSession = activeSessionId !== null && activeSessionId !== ''

  useEffect(() => {
    if (!isStarting) {
      return undefined
    }

    const timerId = setTimeout(() => {
      setIsStarting(false)
    }, SESSION_START_TIMEOUT_MS)

    return () => {
      clearTimeout(timerId)
    }
  }, [isStarting])

  useEffect(() => {
    return () => {
      const recognition = optionalValue(recognitionRef.current)

      if (recognition !== null) {
        recognition.stop()
        recognitionRef.current = null
      }
    }
  }, [])

  const applySession = useCallback((next) => {
    setSession((current) => {
      if (getSessionSnapshotKey(current) === getSessionSnapshotKey(next)) {
        return current
      }

      return next
    })
  }, [])

  const refreshSession = useCallback(async () => {
    if (!activeSessionId) {
      return
    }

    try {
      applySession(await getSession(activeSessionId, { baseUrl }))
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setSessionError(getErrorMessage(requestError))
      }
    }
  }, [activeSessionId, applySession, baseUrl])

  useEffect(() => {
    if (!activeSessionId || passport !== null) {
      return undefined
    }

    let cancelled = false
    let timerId
    const controller = new AbortController()

    const poll = async () => {
      // `return` inside a try/catch still runs `finally`, so the reschedule is
      // driven by this flag rather than by a finally block.
      let keepPolling = true

      try {
        const next = await getSession(activeSessionId, {
          baseUrl,
          signal: controller.signal,
        })

        if (!cancelled) {
          applySession(next)
          setSessionError('')
        }
      } catch (requestError) {
        if (cancelled || isAbortError(requestError)) {
          return
        }

        setSessionError(getErrorMessage(requestError))
        // A session that is gone will never come back, so stop polling instead of
        // re-requesting it every 1.5s for the life of the page.
        keepPolling = !isTerminalSessionError(requestError)
      }

      if (!cancelled && keepPolling) {
        timerId = setTimeout(poll, PASSPORT_POLL_INTERVAL_MS)
      }
    }

    timerId = setTimeout(poll, 0)

    return () => {
      cancelled = true
      clearTimeout(timerId)
      controller.abort()
    }
  }, [activeSessionId, applySession, baseUrl, passport])

  function handleTranscriptChange(event) {
    setTranscript(event.target.value)
  }

  function handleRunPipeline() {
    if (isBusy || transcript.trim() === '') {
      return
    }

    setSessionError('')

    if (typeof onSessionStart === 'function') {
      setIsStarting(true)
      onSessionStart({
        input_type: 'text',
        content: transcript,
        persona: KAVYA_PERSONA,
      })
    }
  }

  function handleVoiceStart() {
    const Recognition = getSpeechRecognitionConstructor()

    if (Recognition === null || isListening) {
      return
    }

    setVoiceError('')

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-IN'
    recognition.onresult = (event) => {
      const results = Array.from(event?.results ?? [])
      const spoken = results
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()

      if (spoken !== '') {
        // Append rather than replace: the transcript is usually pre-filled with a
        // demo and may hold typed edits, and consecutive voice sessions each add
        // to it.
        setTranscript((current) => (current.trim() === '' ? spoken : `${current.trim()} ${spoken}`))
      }
    }
    recognition.onerror = (event) => {
      setVoiceError(
        `Voice input stopped: ${event?.error ?? 'unknown error'}. Type the transcript instead.`,
      )
      setIsListening(false)
    }
    recognition.onend = () => {
      setIsListening(false)
    }

    try {
      recognition.start()
    } catch (startError) {
      setVoiceError(getErrorMessage(startError))
      // Record it before returning, so unmount cleanup stops this instance
      // rather than a stale one from an earlier voice session.
      recognitionRef.current = null
      return
    }

    recognitionRef.current = recognition
    setIsListening(true)
  }

  function handleVoiceStop() {
    const recognition = optionalValue(recognitionRef.current)

    if (recognition !== null) {
      recognition.stop()
      recognitionRef.current = null
    }

    setIsListening(false)
  }

  function handleSkillChange(event) {
    setSelectedSkill(event.target.value)
  }

  function handleSubmissionChange(event) {
    setSubmission(event.target.value)
  }

  async function handleWorkSampleSubmit(event) {
    event.preventDefault()

    if (isScoring || activeSkill === '' || submission.trim() === '') {
      return
    }

    setIsScoring(true)
    setWorkSampleError('')
    setWorkSampleResult(null)

    try {
      setWorkSampleResult(
        await scoreWorkSample(
          {
            skill_id: activeSkill,
            submission: submission.trim(),
            session_id: activeSessionId,
          },
          { baseUrl },
        ),
      )
    } catch (requestError) {
      setWorkSampleError(getErrorMessage(requestError))
    } finally {
      setIsScoring(false)
    }

    void refreshSession()
  }

  const statusHeading = isStreaming
    ? 'Streaming agent events'
    : hasSession
      ? 'Session open'
      : 'No session yet'
  const statusDetail = hasSession
    ? `Session ${activeSessionId} · ${sessionStatus ?? 'status pending'} · ${events.length} agent events received`
    : 'Press Run pipeline to open a session for Kavya. The seven agents fill the skill passport in the background.'

  return (
    <Card
      as="section"
      eyebrow="Stage 01 · Skills discovery"
      title="Worker intake & skill passport"
      titleId="worker-app-title"
      description="Speak or paste what Kavya actually did, then let the pipeline recover durable skills instead of keywords."
      actions={<SourceTag source={passportSource ?? 'pending'} />}
      aria-labelledby="worker-app-title"
      aria-busy={isBusy}
      padding="none"
    >
      <div className="space-y-16">
        <div
          className={SECTION_CLASS}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className={sectionHeadingClass}>{statusHeading}</p>
          <p className={`mt-3 ${bodyCopyClass}`}>
            {statusDetail}
          </p>
          {latestEvent === null ? null : (
            <p className={`mt-2 ${bodyCopyClass}`}>
              <span className={inlineLabelClass}>
                {latestEvent.agent}
              </span>
              {': '}
              {latestEvent.message}
            </p>
          )}
        </div>

        {hasSession ? null : (
          <div className="px-6 py-16 text-center" role="status">
            <p className={sectionHeadingClass}>
              Idle · no session open
            </p>
            <p className={EMPTY_STATE_COPY_CLASS}>
              The transcript below is prefilled with the Kavya demo. Press Run
              pipeline to open a session — the orchestrator fills the skill
              passport in the background.
            </p>
          </div>
        )}

        <form
          className={SECTION_CLASS}
          onSubmit={(event) => {
            event.preventDefault()
            handleRunPipeline()
          }}
        >
          <Field id="worker-transcript" label="Session transcript">
            <Textarea
              id="worker-transcript"
              rows={6}
              value={transcript}
              onChange={handleTranscriptChange}
              aria-describedby="worker-transcript-hint"
            />
            {/* The helper is a footnote to the control, so it sits below the
                textarea and the textarea points back at it. */}
            <p id="worker-transcript-hint" className={controlFieldHintClass}>
              Plain speech, the way Kavya would say it. No CV formatting
              needed.
            </p>
          </Field>

          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center">
            {/* The one filled action this page is allowed. Voice input is a
                secondary gesture and stays an outline. */}
            <Button
              type="submit"
              variant="primary"
              disabled={isBusy || transcript.trim() === ''}
              aria-busy={isBusy}
            >
              {isBusy ? 'Starting session…' : 'Run pipeline'}
            </Button>

            {speechSupported ? (
              <Button
                type="button"
                variant="ghost"
                onClick={isListening ? handleVoiceStop : handleVoiceStart}
                aria-pressed={isListening}
              >
                {isListening ? 'Stop voice input' : 'Start voice input'}
              </Button>
            ) : (
              <p className={bodyCopyClass}>
                Voice input is unavailable in this browser. Paste or type the
                transcript instead.
              </p>
            )}
          </div>

          {voiceError === '' ? null : (
            <p className={ALERT_CLASS} role="alert">
              {voiceError}
            </p>
          )}

          {sessionError === '' ? null : (
            <p className={ALERT_CLASS} role="alert">
              {sessionError}
            </p>
          )}
        </form>

        <div className={SECTION_CLASS}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className={sectionHeadingClass}>Skill passport</p>
              <h3 className={`mt-2 ${headingSmClass} ${chalkClass}`}>
                {passport === null ? 'Passport pending' : passport.owner}
              </h3>
            </div>
            {passport === null ? null : (
              <p className={`${metaClass} ${smokeClass}`}>
                {passport.passport_id}
              </p>
            )}
          </div>

          {passport === null ? (
            <p className={`mt-4 ${bodyCopyClass}`}>
              {isStreaming
                ? 'The skills agent is still reading the transcript. The passport lands here as soon as the orchestrator writes it.'
                : hasSession
                  ? 'No passport yet. ReRoute polls the session until the skills agent writes the passport.'
                  : 'Start a session to recover a passport from this transcript.'}
            </p>
          ) : (
            <>
              <ul
                aria-label="Recovered skills"
                className="mt-8 grid gap-8 sm:grid-cols-2"
              >
                {skills.map((skill) => {
                  const confidenceLabel = formatConfidence(skill.confidence)

                  return (
                    <li key={skill.name} className={`border-t ${ruleDarkClass} pt-4`}>
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <p className={inlineLabelClass}>
                            {skill.name}
                          </p>
                          <StatusLine
                            status={skill.verified ? 'done' : 'idle'}
                            label={skill.verified ? 'Verified' : 'Unverified'}
                          />
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <div
                            role="progressbar"
                            aria-label={`${skill.name} confidence`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={toPercent(skill.confidence)}
                            aria-valuetext={`Confidence ${confidenceLabel}`}
                            className={CONFIDENCE_TRACK_CLASS}
                          >
                            <div
                              className={CONFIDENCE_FILL_CLASS}
                              style={{
                                width: `${toPercent(skill.confidence)}%`,
                              }}
                            />
                          </div>
                          <span className={`${metaClass} ${smokeClass}`}>
                            {confidenceLabel}
                          </span>
                        </div>
                        <p className={`mt-1.5 ${dataLabelClass}`}>
                          Confidence
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <p className={`mt-12 ${sectionHeadingClass}`}>Credentials</p>
              {credentials.length === 0 ? (
                <p className={`mt-3 ${bodyCopyClass}`}>
                  No credentials yet. Score a work sample below to earn one.
                </p>
              ) : (
                <ul
                  aria-label="Issued credentials"
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {credentials.map((credential) => (
                    <li key={credential}>
                      <span className={CREDENTIAL_TAG_CLASS}>{credential}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <form
          className={SECTION_CLASS}
          onSubmit={handleWorkSampleSubmit}
        >
          <p className={sectionHeadingClass}>
            Proof · work sample
          </p>
          <h3 className={`mt-2 ${headingSmClass} ${chalkClass}`}>
            Turn a claim into a credential
          </h3>
          <p className={`mt-3 ${bodyCopyClass}`}>
            Pick one skill from the passport and paste the evidence. The server
            scores it and decides whether a credential is issued.
          </p>

          {skills.length === 0 ? (
            <p className={`mt-6 ${bodyCopyClass}`}>
              A skill is needed before a work sample can be scored. The passport
              has not landed yet.
            </p>
          ) : (
            <>
              <div className="mt-8 grid gap-8 sm:grid-cols-2">
                <Field id="worker-sample-skill" label="Skill to prove">
                  <Select
                    id="worker-sample-skill"
                    value={activeSkill}
                    onChange={handleSkillChange}
                  >
                    {skillNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  {/* Not a <label htmlFor>: the score is an output, not a form
                      control, so it is associated with aria-labelledby instead. */}
                  <p id="worker-sample-score" className={controlFieldLabelClass}>
                    Work sample score
                  </p>
                  <p
                    aria-labelledby="worker-sample-score"
                    className={`mt-3 border-b ${ruleDarkClass} pb-2 ${metaClass} ${chalkClass}`}
                  >
                    {sample === null
                      ? 'No score yet'
                      : `${sample.score} out of 100`}
                  </p>
                </div>
              </div>

              <Field
                id="worker-sample-submission"
                label="Evidence submission"
                className="mt-8"
              >
                <Textarea
                  id="worker-sample-submission"
                  rows={4}
                  value={submission}
                  onChange={handleSubmissionChange}
                  placeholder="Paste the script, collection or pipeline you built."
                />
              </Field>

              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {/* Second action on this view, so it is an outline: the filled
                    Run pipeline above owns the viewport's single fill. */}
                <Button
                  type="submit"
                  variant="ghost"
                  disabled={isScoring || submission.trim() === ''}
                  aria-busy={isScoring}
                >
                  {isScoring ? 'Scoring sample…' : 'Score work sample'}
                </Button>

                {sample === null ? null : (
                  <SourceTag
                    source={sampleSource.source}
                    role="img"
                    aria-label={`Work sample source: ${sampleSource.label}`}
                    title={`Work sample source: ${sampleSource.label}`}
                  />
                )}
              </div>

              {sample === null ? null : (
                <p className={`mt-4 ${bodyCopyClass}`}>
                  {sample.credential_issued
                    ? 'Credential issued and recorded on the passport.'
                    : 'No credential issued. The score is below the server threshold.'}
                </p>
              )}

              {workSampleError === '' ? null : (
                <p className={ALERT_CLASS} role="alert">
                  {workSampleError}
                </p>
              )}
            </>
          )}
        </form>

        {events.length === 0 ? null : (
          <div className={SECTION_CLASS}>
            <p className={sectionHeadingClass}>Pipeline agents</p>
            {/* The vertical rule and the dots carry the structure: no row
                numbering, no per-row border, no per-row background. */}
            <ul
              aria-label="Pipeline agent events"
              className={`mt-6 ml-1 border-l ${ruleDarkClass}`}
            >
              {events.map((event, index) => {
                const status = getEventStatusDetails(event.status)

                return (
                  <li
                    key={event.eventId ?? `${event.agent}-${index}`}
                    className="relative pb-6 pl-6 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className={getTimelineDotClass(status.status)}
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className={inlineLabelClass}>
                        {event.agent}
                      </p>
                      <StatusLine
                        status={status.status}
                        label={status.label}
                      />
                    </div>
                    <p className={`mt-1 ${measureClass} ${LOG_MESSAGE_CLASS}`}>
                      {event.message}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
