import { useCallback, useEffect, useRef, useState } from 'react'
import { getSession, scoreWorkSample } from '../api.js'

const KAVYA_PERSONA = 'Kavya'

export const KAVYA_TRANSCRIPT = `Hi, I am Kavya. I worked for four years as a manual tester at a product company in Chennai before an eighteen month caregiving break.

Before the break I wrote manual test case design documents in Excel and I owned defect reporting in Jira for the checkout and payments flows. Every release I ran a regression testing pass on the signup journey, and I was the person who did defect reproduction whenever a payment failed in staging. I also kept postman collections for our public API testing, and I wrote the test plan authoring documents before every sprint and the release verification notes after it.

What I do not have is test automation scripting experience. I have never written a Selenium or Playwright test, and I have never configured a ci pipeline. I want to get back into quality work, and I can give ten honest hours a week to learning.`

const PASSPORT_POLL_INTERVAL_MS = 1_500
const SESSION_START_TIMEOUT_MS = 10_000

const EMPTY_EVENTS = []
const EMPTY_SKILLS = []
const EMPTY_CREDENTIALS = []

const SOURCE_DETAILS = {
  live: {
    label: 'Live source',
    className: 'border-teal/45 bg-teal/10 text-teal',
    dotClassName: 'bg-teal',
  },
  simulated: {
    label: 'Simulated source',
    className: 'border-amber/45 bg-amber/10 text-amber',
    dotClassName: 'bg-amber',
  },
}

const EVENT_STATUS_DETAILS = {
  running: { label: 'Running', symbol: '↻' },
  done: { label: 'Done', symbol: '✓' },
  waiting_consent: { label: 'Waiting for consent', symbol: '◇' },
}

const SOURCE_PENDING = {
  label: 'Source pending',
  className: 'border-white/20 bg-white/5 text-off-white/60',
  dotClassName: 'bg-off-white/40',
}

function getSourceDetails(source) {
  if (source === 'live') {
    return SOURCE_DETAILS.live
  }

  if (source === 'simulated') {
    return SOURCE_DETAILS.simulated
  }

  return SOURCE_PENDING
}

function getEventStatusDetails(status) {
  return EVENT_STATUS_DETAILS[status] ?? { label: 'Unknown status', symbol: '!' }
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'The ReRoute service could not be reached. Try again.'
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

function SourceBadge({ source }) {
  const details = getSourceDetails(source)

  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${details.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${details.dotClassName}`}
        aria-hidden="true"
      />
      <span>{details.label}</span>
    </span>
  )
}

export default function WorkerApp({
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
      applySession(await getSession(activeSessionId))
    } catch (requestError) {
      setSessionError(getErrorMessage(requestError))
    }
  }, [activeSessionId, applySession])

  useEffect(() => {
    if (!activeSessionId || passport !== null) {
      return undefined
    }

    let cancelled = false
    let timerId

    const poll = async () => {
      try {
        const next = await getSession(activeSessionId)

        if (!cancelled) {
          applySession(next)
          setSessionError('')
        }
      } catch (requestError) {
        if (!cancelled) {
          setSessionError(getErrorMessage(requestError))
        }
      } finally {
        if (!cancelled) {
          timerId = setTimeout(poll, PASSPORT_POLL_INTERVAL_MS)
        }
      }
    }

    timerId = setTimeout(poll, 0)

    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [activeSessionId, applySession, passport])

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
        setTranscript(spoken)
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
        await scoreWorkSample({
          skill_id: activeSkill,
          submission: submission.trim(),
          session_id: activeSessionId,
        }),
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
    <section
      className="overflow-hidden rounded-2xl border border-white/10 bg-navy text-off-white shadow-2xl shadow-navy/20"
      aria-labelledby="worker-app-title"
      aria-busy={isBusy}
    >
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
            Stage 01 · Skills discovery
          </p>
          <h2 id="worker-app-title" className="mt-1 font-serif text-2xl text-off-white">
            Worker intake &amp; skill passport
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-off-white/60">
            Speak or paste what Kavya actually did, then let the pipeline recover
            durable skills instead of keywords.
          </p>
        </div>
        <SourceBadge source={passportSource} />
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
        <div
          className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
            {statusHeading}
          </p>
          <p className="mt-1.5 text-sm leading-6 text-off-white/75">
            {statusDetail}
          </p>
          {latestEvent === null ? null : (
            <p className="mt-2 text-xs leading-5 text-off-white/50">
              <span className="font-bold uppercase tracking-[0.14em] text-amber">
                {latestEvent.agent}
              </span>
              {': '}
              {latestEvent.message}
            </p>
          )}
        </div>

        {hasSession ? null : (
          <div className="rounded-2xl border border-dashed border-amber/40 bg-amber/10 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber">
              Idle · no session open
            </p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-off-white/75">
              <li>1. The transcript below is prefilled with the Kavya demo.</li>
              <li>2. Press Run pipeline to open a session for Kavya.</li>
              <li>
                3. The orchestrator fills the skill passport in the background, so
                the passport appears a moment later.
              </li>
            </ol>
          </div>
        )}

        <form
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          onSubmit={(event) => {
            event.preventDefault()
            handleRunPipeline()
          }}
        >
          <label
            htmlFor="worker-transcript"
            className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/50"
          >
            Session transcript
          </label>
          <p id="worker-transcript-hint" className="mt-2 text-sm leading-6 text-off-white/60">
            Plain speech, the way Kavya would say it. No CV formatting needed.
          </p>
          <textarea
            id="worker-transcript"
            value={transcript}
            onChange={handleTranscriptChange}
            rows={8}
            aria-describedby="worker-transcript-hint"
            className="mt-3 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-sm leading-6 text-off-white placeholder:text-off-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="submit"
              disabled={isBusy || transcript.trim() === ''}
              aria-busy={isBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-navy transition hover:bg-amber/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isBusy ? 'Starting session…' : 'Run pipeline'}
            </button>

            {speechSupported ? (
              <button
                type="button"
                onClick={isListening ? handleVoiceStop : handleVoiceStart}
                aria-pressed={isListening}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-off-white transition hover:border-teal/60 hover:text-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isListening ? 'Stop voice input' : 'Start voice input'}
              </button>
            ) : (
              <p className="text-xs leading-5 text-off-white/50 sm:w-full">
                Voice input is unavailable in this browser. Paste or type the
                transcript instead.
              </p>
            )}
          </div>

          {voiceError === '' ? null : (
            <p className="mt-3 text-sm leading-6 text-red-300" role="alert">
              {voiceError}
            </p>
          )}

          {sessionError === '' ? null : (
            <p className="mt-3 text-sm leading-6 text-red-300" role="alert">
              {sessionError}
            </p>
          )}
        </form>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
                Skill passport
              </p>
              <h3 className="mt-1 font-serif text-xl text-off-white">
                {passport === null ? 'Passport pending' : passport.owner}
              </h3>
            </div>
            {passport === null ? null : (
              <p className="font-mono text-xs text-off-white/45">
                {passport.passport_id}
              </p>
            )}
          </div>

          {passport === null ? (
            <p className="mt-3 text-sm leading-6 text-off-white/60">
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
                className="mt-4 grid gap-3 sm:grid-cols-2"
              >
                {skills.map((skill) => {
                  const confidenceLabel = formatConfidence(skill.confidence)

                  return (
                    <li
                      key={skill.name}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-bold uppercase tracking-[0.12em] text-off-white">
                          {skill.name}
                        </p>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] ${
                            skill.verified
                              ? 'border-teal/45 bg-teal/10 text-teal'
                              : 'border-amber/45 bg-amber/10 text-amber'
                          }`}
                        >
                          <span aria-hidden="true">{skill.verified ? '✓' : '○'}</span>
                          <span>{skill.verified ? 'Verified' : 'Unverified'}</span>
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div
                          role="progressbar"
                          aria-label={`${skill.name} confidence`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={toPercent(skill.confidence)}
                          aria-valuetext={`Confidence ${confidenceLabel}`}
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                        >
                          <div
                            className="h-full rounded-full bg-amber"
                            style={{ width: `${toPercent(skill.confidence)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-off-white/70">
                          {confidenceLabel}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-off-white/40">
                        Confidence
                      </p>
                    </li>
                  )
                })}
              </ul>

              <p className="mt-5 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
                Credentials
              </p>
              {credentials.length === 0 ? (
                <p className="mt-1.5 text-sm leading-6 text-off-white/60">
                  No credentials yet. Score a work sample below to earn one.
                </p>
              ) : (
                <ul aria-label="Issued credentials" className="mt-2 flex flex-wrap gap-2">
                  {credentials.map((credential) => (
                    <li
                      key={credential}
                      className="inline-flex items-center gap-1.5 rounded-full border border-teal/45 bg-teal/10 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-teal"
                    >
                      <span aria-hidden="true">✓</span>
                      <span>{credential}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <form
          className="rounded-2xl border border-amber/30 bg-amber/10 p-5"
          onSubmit={handleWorkSampleSubmit}
        >
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-amber">
            Proof · work sample
          </p>
          <h3 className="mt-1 font-serif text-xl text-off-white">
            Turn a claim into a credential
          </h3>
          <p className="mt-2 text-sm leading-6 text-off-white/65">
            Pick one skill from the passport and paste the evidence. The server
            scores it and decides whether a credential is issued.
          </p>

          {skills.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-off-white/60">
              A skill is needed before a work sample can be scored. The passport
              has not landed yet.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="worker-sample-skill"
                    className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-off-white/50"
                  >
                    Skill to prove
                  </label>
                  <select
                    id="worker-sample-skill"
                    value={activeSkill}
                    onChange={handleSkillChange}
                    className="mt-2 w-full rounded-lg border border-white/20 bg-navy px-3 py-2.5 text-sm text-off-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                  >
                    {skillNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="worker-sample-score"
                    className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-off-white/50"
                  >
                    Work sample score
                  </label>
                  <p
                    id="worker-sample-score"
                    className="mt-2 rounded-lg border border-white/10 bg-navy px-3 py-2.5 font-mono text-sm text-off-white/70"
                  >
                    {sample === null ? 'No score yet' : `${sample.score} out of 100`}
                  </p>
                </div>
              </div>

              <label
                htmlFor="worker-sample-submission"
                className="mt-4 block text-[0.65rem] font-bold uppercase tracking-[0.16em] text-off-white/50"
              >
                Evidence submission
              </label>
              <textarea
                id="worker-sample-submission"
                value={submission}
                onChange={handleSubmissionChange}
                rows={4}
                placeholder="Paste the script, collection or pipeline you built."
                className="mt-2 w-full rounded-lg border border-white/15 bg-navy px-4 py-3 text-sm leading-6 text-off-white placeholder:text-off-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              />

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={isScoring || submission.trim() === ''}
                  aria-busy={isScoring}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-navy transition hover:bg-teal/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isScoring ? 'Scoring sample…' : 'Score work sample'}
                </button>

                {sample === null ? null : (
                  <span
                    className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] ${getSourceDetails(sample.source).className}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${getSourceDetails(sample.source).dotClassName}`}
                      aria-hidden="true"
                    />
                    {getSourceDetails(sample.source).label} score
                  </span>
                )}
              </div>

              {sample === null ? null : (
                <p className="mt-3 text-sm leading-6 text-off-white/75">
                  {sample.credential_issued
                    ? 'Credential issued and recorded on the passport.'
                    : 'No credential issued. The score is below the server threshold.'}
                </p>
              )}

              {workSampleError === '' ? null : (
                <p className="mt-3 text-sm leading-6 text-red-300" role="alert">
                  {workSampleError}
                </p>
              )}
            </>
          )}
        </form>

        {events.length === 0 ? null : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-off-white/45">
              Pipeline agents
            </p>
            <ul
              aria-label="Pipeline agent events"
              className="mt-3 space-y-1.5"
            >
              {events.map((event, index) => {
                const status = getEventStatusDetails(event.status)

                return (
                  <li
                    key={event.eventId ?? `${event.agent}-${index}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-off-white/70"
                  >
                    <span className="font-mono text-xs text-off-white/40">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="font-bold uppercase tracking-[0.12em] text-off-white/90">
                      {event.agent}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] ${getSourceDetails(event.source).className}`}
                    >
                      <span aria-hidden="true">{status.symbol}</span>
                      <span>{status.label}</span>
                    </span>
                    <span className="leading-6">{event.message}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
