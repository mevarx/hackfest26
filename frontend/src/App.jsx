import { useCallback, useMemo, useState } from 'react'
import AgentLog from './components/AgentLog.jsx'
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
import {
  bodyClass,
  bodyCopyClass,
  captionClass,
  chalkClass,
  displayClass,
  headingSmClass,
  inkClass,
  measureClass,
  metaClass,
  ruleDarkClass,
  sectionHeadingClass,
  slateClass,
  smokeClass,
} from './styles/classes.js'

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

/** Content column. The style reference caps the page at 1120px. */
const PAGE_COLUMN_CLASS = 'mx-auto max-w-[70rem] px-5 sm:px-8'

/** One small-caps caption, then a 1px Graphite hairline across the full content
 *  width — the divider the system uses instead of a background-color change.
 *  A filled 1px box, not a border: the hairline spans the whole width with no
 *  side edges, so a border would draw verticals where none belong. */
function SectionDivider({ children }) {
  return (
    <div className="space-y-6">
      <p className={sectionHeadingClass}>{children}</p>
      <div className="h-px w-full bg-graphite" aria-hidden="true" />
    </div>
  )
}

/**
 * A major section: 96px of air, one hairline, 96px more. A `label` renders the
 * small-caps divider; without one the hairline alone separates the block.
 *
 * @param {{
 *   label?: string,
 *   className?: string,
 *   children?: import('react').ReactNode,
 * }} props
 */
function SectionStack({ label, children, className = '' }) {
  return (
    <section className={`mt-24 border-t ${ruleDarkClass} pt-24 ${className}`.trim()}>
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
    <div className="min-h-dvh bg-obsidian font-utility text-chalk">
      {/* Nav bar: Obsidian with a 1px Graphite bottom border and no shadow —
          depth comes from the hairline, never from elevation. */}
      <header className={`border-b ${ruleDarkClass} bg-obsidian`}>
        <div
          className={`${PAGE_COLUMN_CLASS} flex flex-wrap items-center justify-between gap-4 py-4`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid h-9 w-9 place-items-center rounded-tag border ${ruleDarkClass} bg-obsidian font-editorial text-[1.125rem] leading-none ${chalkClass}`}
            >
              R
            </span>
            <div>
              <p className={`font-editorial text-[1.125rem] leading-none ${chalkClass}`}>
                ReRoute
              </p>
              <p className={`mt-1 ${captionClass} ${smokeClass}`}>Career orchestration</p>
            </div>
          </div>
          {/* Right rail is plain metadata text: a mono meta line, the demo switch,
              then the slice indicator as bare text — no bordered pill. */}
          <div className="flex flex-wrap items-center gap-6">
            <span className={`hidden sm:inline ${metaClass} ${smokeClass}`}>
              Re Route · Hackfest demo
            </span>
            <Switch
              id="demo-mode"
              checked={demoMode}
              onChange={toggleDemoMode}
              label="Demo mode"
            />
            <span className={`${metaClass} ${smokeClass}`}>Slice 04</span>
          </div>
        </div>
      </header>

      <main className={PAGE_COLUMN_CLASS}>
        {/* Hero: left-aligned (this is a working tool, not a landing-page
            manifesto) — one serif display line, one measure of body copy, then
            the persona card, the single bordered card on the page. */}
        <section aria-labelledby="demo-title" className="pb-4 pt-20 sm:pt-24 lg:pt-28">
          <Reveal>
            <p className={`${captionClass} ${smokeClass}`}>Demo stage · Kavya</p>
          </Reveal>

          <Reveal delay={70}>
            <h1 id="demo-title" className={`mt-6 ${displayClass} ${chalkClass}`}>
              Every agent,{' '}
              {/* Same size, italic, one step quieter than the line above it. */}
              <span className={`block italic ${smokeClass}`}>in sequence.</span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className={`mt-8 ${bodyCopyClass}`}>
              A transparent view of the orchestration backbone as ReRoute turns a career
              transition into a fair, evidence-led plan.
            </p>
          </Reveal>

          {/* Demo persona: the one card allowed to invert. Paper surface, Fog
              hairline, 8px radius, and a single 2px amber stroke on the left
              edge — capped at the reading width so it breaks out of the column
              directly below the headline. */}
          <Reveal delay={210}>
            <div className="relative mt-16 max-w-[40rem] overflow-hidden rounded-card border border-fog bg-paper p-8">
              <span
                className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-compass-amber"
                aria-hidden="true"
              />
              <div className="pl-4">
                <p className={`${captionClass} ${slateClass}`}>Demo persona</p>
                <p className={`mt-3 ${headingSmClass} ${inkClass}`}>Kavya · 29 · Chennai</p>
                <p className={`mt-3 text-left ${bodyClass} ${slateClass}`}>
                  Manual tester returning after an 18-month caregiving break
                </p>
              </div>
            </div>
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
          {/* Plain text, no second hairline and no alert box — the section
              divider already separates this from the form above it. */}
          {startError === '' ? null : (
            <Reveal delay={60}>
              <div role="alert" className="space-y-3">
                <p className={`${captionClass} ${smokeClass}`}>Session could not start</p>
                <p className={`${measureClass} text-left ${bodyClass} ${chalkClass}`}>
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

        {/* Footer: 1px Graphite top border, transparent, 40px of vertical air.
            No fill, no shadow. */}
        <footer className={`mt-24 border-t ${ruleDarkClass} py-10`}>
          <Reveal>
            <p
              className={`${measureClass} text-left font-utility text-label font-normal leading-body ${smokeClass}`}
            >
              Every panel labels its own data source. Simulated results are never presented as
              SAP results.
            </p>
            <p className={`mt-6 ${metaClass} ${smokeClass}`}>
              Re Route · Hackfest demo build · Slice 04
            </p>
          </Reveal>
        </footer>
      </main>
    </div>
  )
}
