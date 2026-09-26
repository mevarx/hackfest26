import { useCallback, useMemo, useState } from 'react'
import GhostTwinPanel from './components/GhostTwinPanel.jsx'
import AgentLog from './components/AgentLog.jsx'
import Badge from './components/Badge.jsx'
import Card from './components/Card.jsx'
import StageProgress from './components/StageProgress.jsx'
import Switch from './components/Switch.jsx'
import { useDemoMode } from './context/DemoModeContext.jsx'
import { startSession } from './api.js'
import { useSessionStream } from './hooks/useSessionStream.js'
import { useAgentStream } from './hooks/useAgentStream.js'
import HRConsole from './pages/HRConsole.jsx'
import RouteMap from './pages/RouteMap.jsx'
import WorkerApp from './pages/WorkerApp.jsx'

const DEMO_STAGES = [
  { number: '01', label: 'Understand', description: 'Recover durable skills' },
  { number: '02', label: 'Plan', description: 'Build a credible route' },
  { number: '03', label: 'Match', description: 'Compare fair work' },
  { number: '04', label: 'Audit', description: 'Challenge every score' },
]

/** @type {Record<string, ('complete' | 'active' | 'upcoming')[]>} */
const STAGE_STATUS_LABELS = {
  idle: ['active', 'upcoming', 'upcoming', 'upcoming'],
  streaming: ['active', 'upcoming', 'upcoming', 'upcoming'],
  settled: ['complete', 'active', 'upcoming', 'upcoming'],
}

const DIVIDER_CLASS =
  'flex items-center gap-4 border-t border-rule-light pt-6 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-navy/40'

function SectionDivider({ children }) {
  return (
    <div className={DIVIDER_CLASS}>
      <span className="h-px flex-1 bg-rule-light" aria-hidden="true" />
      <span>{children}</span>
      <span className="h-px flex-1 bg-rule-light" aria-hidden="true" />
    </div>
  )
}

export default function App() {
  const { demoMode, toggleDemoMode, backendBaseUrl } = useDemoMode()
  const [sessionId, setSessionId] = useState(null)
  const [startError, setStartError] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  const fallback = useAgentStream()
  const stream = useSessionStream({
    sessionId,
    enabled: Boolean(sessionId) && !demoMode,
    baseUrl: backendBaseUrl,
  })

  const usingLiveTransport = !demoMode && Boolean(sessionId)
  const events = usingLiveTransport ? stream.events : fallback.events
  const streamSource = usingLiveTransport ? stream.source : fallback.source

  const handleSessionStart = useCallback(
    async (payload) => {
      setIsStarting(true)
      setStartError('')
      try {
        const started = await startSession(payload, { baseUrl: backendBaseUrl })
        setSessionId(started.session_id)
      } catch (requestError) {
        setStartError(
          requestError instanceof Error ? requestError.message : 'Could not start the session.',
        )
      } finally {
        setIsStarting(false)
      }
    },
    [backendBaseUrl],
  )

  const isStreaming = isStarting || (usingLiveTransport && stream.status === 'connecting')

  // No per-stage progress signal exists in the session or event payload, so the
  // route line is driven by the two states the app already knows: whether a
  // session is open, and whether its stream is still settling.
  const stages = useMemo(() => {
    const phase = sessionId
      ? isStreaming
        ? 'streaming'
        : 'settled'
      : 'idle'
    const statuses = STAGE_STATUS_LABELS[phase]

    return DEMO_STAGES.map((stage, index) => ({
      ...stage,
      status: statuses[index],
    }))
  }, [isStreaming, sessionId])

  return (
    <div className="min-h-dvh bg-offwhite text-navy">
      <header className="border-b border-rule bg-navy text-offwhite">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-control bg-amber font-serif text-xl font-bold text-navy">
              R
            </span>
            <div>
              <p className="font-serif text-xl leading-none">ReRoute</p>
              <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-offwhite/50">
                Career orchestration
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="hidden text-[0.65rem] font-bold uppercase tracking-[0.16em] text-offwhite/50 sm:inline">
              Re Route · Hackfest demo
            </span>
            <Switch
              id="demo-mode"
              checked={demoMode}
              onChange={toggleDemoMode}
              label="Demo mode"
            />
            <Badge status="idle" label="Slice 04" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section aria-labelledby="demo-title">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal">
            Demo stage · Kavya
          </p>
          <h1
            id="demo-title"
            className="mt-5 max-w-2xl font-serif text-5xl leading-[0.98] tracking-[-0.035em] sm:text-6xl"
          >
            Every agent,{' '}
            <span className="block italic text-navy/50">in sequence.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-navy/70 sm:text-lg sm:leading-8">
            A transparent view of the orchestration backbone as ReRoute turns a
            career transition into a fair, evidence-led plan.
          </p>

          <Card
            variant="light"
            padding="lg"
            className="mt-8 max-w-xl border-l-2 border-l-amber"
          >
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-navy/40">
              Demo persona
            </p>
            <p className="mt-1 font-serif text-xl">Kavya · 29 · Chennai</p>
            <p className="mt-1 text-sm text-navy/50">
              Manual tester returning after an 18-month caregiving break
            </p>
          </Card>
        </section>

        <div className="mt-10 space-y-6">
          <WorkerApp
            baseUrl={backendBaseUrl}
            sessionId={sessionId}
            onSessionStart={handleSessionStart}
            events={events}
            isStreaming={isStreaming}
          />
          {startError === '' ? null : (
            <Card variant="light" tone="red" role="alert" padding="lg">
              <p className="text-sm text-navy/70">{startError}</p>
            </Card>
          )}
        </div>

        <div className="mt-12 space-y-10">
          <SectionDivider>Stage progression</SectionDivider>

          <StageProgress stages={stages} />

          <RouteMap baseUrl={backendBaseUrl} />
        </div>

        <div className="mt-12 space-y-10">
          <SectionDivider>Orchestration detail</SectionDivider>

          <AgentLog
            events={events}
            source={streamSource}
            status={usingLiveTransport ? stream.status : null}
            lastEventId={usingLiveTransport ? stream.lastEventId : 0}
            reconnectAttempts={usingLiveTransport ? stream.reconnectAttempts : 0}
            onReconnect={usingLiveTransport ? stream.reconnectNow : undefined}
          />

          <GhostTwinPanel baseUrl={backendBaseUrl} />

          <HRConsole baseUrl={backendBaseUrl} />

          <div className="flex items-start gap-3 px-1 text-xs leading-5 text-navy/50">
            <span
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-pill bg-teal"
              aria-hidden="true"
            />
            <p>
              Every panel labels its own data source. Simulated results are never
              presented as SAP results.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
