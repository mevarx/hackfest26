import { useCallback, useEffect, useRef, useState } from 'react'
import { getSession, scoreWorkSample } from '../api.js'
import { isAbortError } from '../lib/guards.js'
import {
  controlFieldHintClass,
  controlFieldLabelClass,
  dataLabelClass,
  sectionHeadingClass,
} from '../styles/classes.js'
import Badge from '../components/Badge.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Field from '../components/Field.jsx'
import Select from '../components/Select.jsx'
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
      variant="light"
      eyebrow="Stage 01 · Skills discovery"
      title="Worker intake & skill passport"
      titleId="worker-app-title"
      description="Speak or paste what Kavya actually did, then let the pipeline recover durable skills instead of keywords."
      actions={<Badge source={passportSource ?? 'pending'} />}
      aria-labelledby="worker-app-title"
      aria-busy={isBusy}
      padding="none"
    >
      <div className="space-y-16">
        <div
          className="border-t border-[#E4E4E4] pt-8"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className={sectionHeadingClass}>{statusHeading}</p>
          <p className="mt-3 max-w-[40rem] text-left text-sm leading-6 text-[#4A4A4A]">
            {statusDetail}
          </p>
          {latestEvent === null ? null : (
            <p className="mt-2 max-w-[40rem] text-left text-xs leading-5 text-[#4A4A4A]">
              <span className="font-bold uppercase tracking-[0.12em] text-[#0A0A0A]">
                {latestEvent.agent}
              </span>
              {': '}
              {latestEvent.message}
            </p>
          )}
        </div>

        {hasSession ? null : (
          <div className="px-6 py-16 text-center" role="status">
            <p className={`text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#8A8A8A]`}>
              Idle · no session open
            </p>
            <p className="mx-auto mt-3 max-w-[40rem] text-center text-sm leading-6 text-[#4A4A4A]">
              The transcript below is prefilled with the Kavya demo. Press Run
              pipeline to open a session — the orchestrator fills the skill
              passport in the background.
            </p>
          </div>
        )}

        <form
          className="border-t border-[#E4E4E4] pt-8"
          onSubmit={(event) => {
            event.preventDefault()
            handleRunPipeline()
          }}
        >
          <div>
            <Field id="worker-transcript" label="Session transcript">
              <p id="worker-transcript-hint" className={controlFieldHintClass}>
                Plain speech, the way Kavya would say it. No CV formatting
                needed.
              </p>
              <Textarea
                id="worker-transcript"
                rows={6}
                value={transcript}
                onChange={handleTranscriptChange}
                aria-describedby="worker-transcript-hint"
                className="mt-3"
              />
            </Field>
          </div>

          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="submit"
              variant="accent"
              disabled={isBusy || transcript.trim() === ''}
              aria-busy={isBusy}
            >
              {isBusy ? 'Starting session…' : 'Run pipeline'}
            </Button>

            {speechSupported ? (
              <Button
                type="button"
                variant="secondary"
                onClick={isListening ? handleVoiceStop : handleVoiceStart}
                aria-pressed={isListening}
              >
                {isListening ? 'Stop voice input' : 'Start voice input'}
              </Button>
            ) : (
              <p className="max-w-[28rem] text-xs leading-5 text-[#4A4A4A]">
                Voice input is unavailable in this browser. Paste or type the
                transcript instead.
              </p>
            )}
          </div>

          {voiceError === '' ? null : (
            <p className="mt-4 max-w-[40rem] text-left text-sm leading-6 text-[#0A0A0A]" role="alert">
              {voiceError}
            </p>
          )}

          {sessionError === '' ? null : (
            <p className="mt-4 max-w-[40rem] text-left text-sm leading-6 text-[#0A0A0A]" role="alert">
              {sessionError}
            </p>
          )}
        </form>

        <div className="border-t border-[#E4E4E4] pt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className={sectionHeadingClass}>Skill passport</p>
              <h3 className="mt-2 font-serif text-xl leading-tight text-[#0A0A0A]">
                {passport === null ? 'Passport pending' : passport.owner}
              </h3>
            </div>
            {passport === null ? null : (
              <p className="font-mono text-xs text-[#8A8A8A]">
                {passport.passport_id}
              </p>
            )}
          </div>

          {passport === null ? (
            <p className="mt-4 max-w-[40rem] text-left text-sm leading-6 text-[#4A4A4A]">
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
                    <li key={skill.name} className="border-t border-[#E4E4E4] pt-4">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#0A0A0A]">
                            {skill.name}
                          </p>
                          <Badge
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
                            className="h-1.5 flex-1 overflow-hidden rounded-pill bg-[#E4E4E4]"
                          >
                            <div
                              className="h-full rounded-pill bg-[#0A0A0A]"
                              style={{
                                width: `${toPercent(skill.confidence)}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs text-[#4A4A4A]">
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
                <p className="mt-3 max-w-[40rem] text-left text-sm leading-6 text-[#4A4A4A]">
                  No credentials yet. Score a work sample below to earn one.
                </p>
              ) : (
                <ul
                  aria-label="Issued credentials"
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {credentials.map((credential) => (
                    <li key={credential}>
                      <Badge status="done" label={credential} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <form
          className="border-t border-[#E4E4E4] pt-8"
          onSubmit={handleWorkSampleSubmit}
        >
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#8A8A8A]">
            Proof · work sample
          </p>
          <h3 className="mt-2 font-serif text-xl leading-tight text-[#0A0A0A]">
            Turn a claim into a credential
          </h3>
          <p className="mt-3 max-w-[40rem] text-left text-sm leading-6 text-[#4A4A4A]">
            Pick one skill from the passport and paste the evidence. The server
            scores it and decides whether a credential is issued.
          </p>

          {skills.length === 0 ? (
            <p className="mt-6 max-w-[40rem] text-left text-sm leading-6 text-[#4A4A4A]">
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
                    className="mt-3 border-b border-[#E4E4E4] pb-2 font-mono text-sm text-[#0A0A0A]"
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
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isScoring || submission.trim() === ''}
                  aria-busy={isScoring}
                >
                  {isScoring ? 'Scoring sample…' : 'Score work sample'}
                </Button>

                {sample === null ? null : (
                  <Badge
                    source={sampleSource.source}
                    role="img"
                    aria-label={`Work sample source: ${sampleSource.label}`}
                    title={`Work sample source: ${sampleSource.label}`}
                  />
                )}
              </div>

              {sample === null ? null : (
                <p className="mt-4 max-w-[40rem] text-left text-sm leading-6 text-[#4A4A4A]">
                  {sample.credential_issued
                    ? 'Credential issued and recorded on the passport.'
                    : 'No credential issued. The score is below the server threshold.'}
                </p>
              )}

              {workSampleError === '' ? null : (
                <p className="mt-4 max-w-[40rem] text-left text-sm leading-6 text-[#0A0A0A]" role="alert">
                  {workSampleError}
                </p>
              )}
            </>
          )}
        </form>

        {events.length === 0 ? null : (
          <div className="border-t border-[#E4E4E4] pt-8">
            <p className={sectionHeadingClass}>Pipeline agents</p>
            <ul
              aria-label="Pipeline agent events"
              className="mt-6 space-y-4"
            >
              {events.map((event, index) => {
                const status = getEventStatusDetails(event.status)

                return (
                  <li
                    key={event.eventId ?? `${event.agent}-${index}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#E4E4E4] pb-4 text-sm text-[#4A4A4A] last:border-0 last:pb-0"
                  >
                    <span className="font-mono text-xs text-[#8A8A8A]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="font-bold uppercase tracking-[0.12em] text-[#0A0A0A]">
                      {event.agent}
                    </span>
                    <Badge status={status.status} label={status.label} />
                    <span className="max-w-[40rem] leading-6">{event.message}</span>
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
