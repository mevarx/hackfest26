import { useCallback, useMemo, useState } from 'react'
import AgentLog from './components/AgentLog.jsx'
import Badge from './components/Badge.jsx'
import Card from './components/Card.jsx'
import GhostTwinPanel from './components/GhostTwinPanel.jsx'
import Reveal from './components/Reveal.jsx'
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

const RULE_CLASS = 'border-[#E4E4E4]'

/** One small-caps gray label and one 1px rule. No boxed treatment. */
function SectionDivider({ children }) {
  return (
    <div className="flex items-center gap-5 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#8A8A8A]">
      <span className="shrink-0">{children}</span>
      <span className={`h-px flex-1 ${RULE_CLASS}`} aria-hidden="true" />
    </div>
  )
}

/**
 * A major section: 96px of air, one hairline, 96px more. A `label` renders the
 * small-caps divider rule; without one the hairline alone separates the block.
 *
 * @param {{
 *   label?: string,
 *   className?: string,
 *   children?: import('react').ReactNode,
 * }} props
 */
function SectionStack({ label, children, className = '' }) {
  return (
    <section className={`mt-24 border-t ${RULE_CLASS} pt-24 ${className}`.trim()}>
      {label === undefined ? null : (
        <Reveal>
          <SectionDivider>{label}</SectionDivider>
        </Reveal>
      )}
      <div className="mt-16 space-y-24">{children}</div>
    </section>
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
    <div className="min-h-dvh bg-[#FAFAFA] font-sans text-[#0A0A0A]">
      <header className="border-b border-white/10 bg-[#0A0A0A] text-[#FAFAFA]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-control bg-[#FAFAFA] font-serif text-xl font-bold leading-none text-[#0A0A0A]">
              R
            </span>
            <div>
              <p className="font-serif text-xl leading-none">ReRoute</p>
              <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#8A8A8A]">
                Career orchestration
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="hidden text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#8A8A8A] sm:inline">
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

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Hero: the one focal point on first load — a large serif headline, one
            measure of body copy, then the persona summary as the single card. */}
        <section aria-labelledby="demo-title" className="pb-4 pt-20 sm:pt-24 lg:pt-28">
          <Reveal>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#8A8A8A]">
              Demo stage · Kavya
            </p>
          </Reveal>

          <Reveal delay={70}>
            <h1
              id="demo-title"
              className="mt-6 max-w-2xl font-serif text-5xl leading-[0.98] tracking-[-0.04em] text-[#0A0A0A] sm:text-6xl lg:text-7xl"
            >
              Every agent,{' '}
              <span className="block italic text-[#4A4A4A]">in sequence.</span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mt-8 max-w-[40rem] text-left text-base leading-7 text-[#4A4A4A] sm:text-lg sm:leading-8">
              A transparent view of the orchestration backbone as ReRoute turns a
              career transition into a fair, evidence-led plan.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <Card
              variant="light"
              padding="none"
              className="mt-16 max-w-[40rem] rounded-card border border-[#E4E4E4] bg-white p-6 sm:p-8"
            >
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#8A8A8A]">
                Demo persona
              </p>
              <p className="mt-3 font-serif text-2xl leading-tight tracking-[-0.02em] text-[#0A0A0A]">
                Kavya · 29 · Chennai
              </p>
              <p className="mt-3 max-w-[36rem] text-left text-sm leading-6 text-[#4A4A4A]">
                Manual tester returning after an 18-month caregiving break
              </p>
            </Card>
          </Reveal>
        </section>

        <SectionStack label="Intake">
          <Reveal delay={80}>
            <WorkerApp
              baseUrl={backendBaseUrl}
              sessionId={sessionId}
              onSessionStart={handleSessionStart}
              events={events}
              isStreaming={isStreaming}
            />
          </Reveal>
          {startError === '' ? null : (
            <Reveal delay={60}>
              <div role="alert" className={`border-t ${RULE_CLASS} pt-8`}>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#4A4A4A]">
                  Session could not start
                </p>
                <p className="mt-3 max-w-[40rem] text-left text-sm leading-6 text-[#0A0A0A]">
                  {startError}
                </p>
              </div>
            </Reveal>
          )}
        </SectionStack>

        <SectionStack label="Stage progression">
          <Reveal delay={80}>
            <StageProgress stages={stages} />
          </Reveal>
        </SectionStack>

        <SectionStack label="Route">
          <Reveal delay={80}>
            <RouteMap baseUrl={backendBaseUrl} />
          </Reveal>
        </SectionStack>

        <SectionStack label="Orchestration detail">
          <Reveal delay={80}>
            <AgentLog
              events={events}
              source={streamSource}
              status={usingLiveTransport ? stream.status : null}
              lastEventId={usingLiveTransport ? stream.lastEventId : 0}
              reconnectAttempts={usingLiveTransport ? stream.reconnectAttempts : 0}
              onReconnect={usingLiveTransport ? stream.reconnectNow : undefined}
            />
          </Reveal>
        </SectionStack>

        <SectionStack>
          <Reveal>
            <GhostTwinPanel baseUrl={backendBaseUrl} />
          </Reveal>
        </SectionStack>

        <SectionStack>
          <Reveal>
            <HRConsole baseUrl={backendBaseUrl} />
          </Reveal>
        </SectionStack>

        <footer className={`mt-24 border-t ${RULE_CLASS} py-24`}>
          <Reveal>
            <p className="max-w-[40rem] text-left text-sm leading-6 text-[#4A4A4A]">
              Every panel labels its own data source. Simulated results are never
              presented as SAP results.
            </p>
          </Reveal>
        </footer>
      </main>
    </div>
  )
}
