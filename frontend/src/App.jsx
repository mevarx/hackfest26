import { useCallback, useState } from 'react'
import GhostTwinPanel from './components/GhostTwinPanel.jsx'
import AgentLog from './components/AgentLog.jsx'
import { useDemoMode } from './context/DemoModeContext.jsx'
import { startSession } from './api.js'
import { useSessionStream } from './hooks/useSessionStream.js'
import { useAgentStream } from './hooks/useAgentStream.js'
import HRConsole from './pages/HRConsole.jsx'
import RouteMap from './pages/RouteMap.jsx'
import WorkerApp from './pages/WorkerApp.jsx'

const DEMO_STAGES = [
  ['01', 'Understand', 'Recover durable skills'],
  ['02', 'Plan', 'Build a credible route'],
  ['03', 'Match', 'Compare fair work'],
  ['04', 'Audit', 'Challenge every score'],
]

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

  return (
    <div className="min-h-dvh bg-off-white text-navy">
      <header className="border-b border-white/10 bg-navy text-off-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber font-serif text-xl font-bold text-navy">R</span>
            <div>
              <p className="font-serif text-xl leading-none">ReRoute</p>
              <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.22em] text-off-white/50">Career orchestration</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[0.65rem] font-bold uppercase tracking-[0.16em]">
            <span className="hidden text-off-white/50 sm:inline">Ncrypt · Hackfest demo</span>
            <button
              type="button"
              onClick={toggleDemoMode}
              aria-pressed={demoMode}
              className="rounded-full border border-amber/50 bg-amber/10 px-3 py-1.5 text-amber transition hover:bg-amber/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              Demo mode {demoMode ? 'on' : 'off'}
            </button>
            <span className="rounded-full border border-white/15 px-3 py-1.5 text-off-white/80">Slice 04</span>
          </div>
        </div>
      </header>

      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute -right-28 top-0 -z-10 h-80 w-80 rounded-full bg-amber/15 blur-3xl" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-16 lg:px-10 lg:py-16">
          <section aria-labelledby="demo-title">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-teal">Demo stage · Kavya</p>
            <h1 id="demo-title" className="mt-5 max-w-xl font-serif text-5xl leading-[0.98] tracking-[-0.035em] text-navy sm:text-6xl">
              Every agent, <span className="block italic text-navy/55">in sequence.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-navy/65 sm:text-lg sm:leading-8">
              A transparent view of the orchestration backbone as ReRoute turns a career transition into a fair, evidence-led plan.
            </p>

            <div className="mt-8 border-l-2 border-amber bg-white px-5 py-4 shadow-sm">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-navy/45">Demo persona</p>
              <p className="mt-1 font-serif text-xl">Kavya · 29 · Chennai</p>
              <p className="mt-1 text-sm text-navy/60">Manual tester returning after an 18-month caregiving break</p>
            </div>

            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {DEMO_STAGES.map(([number, title, detail]) => (
                <li key={number} className="flex items-center gap-3 border-t border-navy/15 pt-3">
                  <span className="font-mono text-xs font-bold text-amber">{number}</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">{title}</p>
                    <p className="mt-0.5 text-xs text-navy/50">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 space-y-6">
              <WorkerApp
                baseUrl={backendBaseUrl}
                sessionId={sessionId}
                onSessionStart={handleSessionStart}
                events={events}
                isStreaming={isStarting || (usingLiveTransport && stream.status === 'connecting')}
              />
              {startError ? (
                <p role="alert" className="rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm text-red">{startError}</p>
              ) : null}
              <RouteMap baseUrl={backendBaseUrl} />
            </div>
          </section>

          <div className="lg:sticky lg:top-8 space-y-6">
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
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" aria-hidden="true" />
              <p>Every panel labels its own data source. Simulated results are never presented as SAP results.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}