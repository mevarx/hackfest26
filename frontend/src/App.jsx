import { useCallback, useMemo, useState } from 'react'
import DotMapRoute from './components/DotMapRoute.jsx'
import GhostTwinPanel from './components/GhostTwinPanel.jsx'
import Manifesto from './components/Manifesto.jsx'
import PipelineAgentGrid from './components/PipelineAgentGrid.jsx'
import Reveal from './components/Reveal.jsx'
import SessionCard from './components/SessionCard.jsx'
import StageProgress from './components/StageProgress.jsx'
import StatusBadge from './components/StatusBadge.jsx'
import Switch from './components/Switch.jsx'
import { Button } from './components/Button.jsx'
import { useDemoMode } from './context/DemoModeContext.jsx'
import { startSession } from './api.js'
import { useSessionStream } from './hooks/useSessionStream.js'
import { useAgentStream } from './hooks/useAgentStream.js'
import HRConsole from './pages/HRConsole.jsx'
import RouteMap from './pages/RouteMap.jsx'
import WorkerApp from './pages/WorkerApp.jsx'
import {
  bodyClass,
  chalkClass,
  displayClass,
  headingXsClass,
  metaClass,
  pageColumnClass,
  readingClass,
  ruleClass,
  smokeClass,
  subheadingClass,
} from './styles/classes.js'

const DEMO_STAGES = [
  { label: 'Understand', description: 'Recover durable skills' },
  { label: 'Plan', description: 'Build a credible route' },
  { label: 'Match', description: 'Compare fair work' },
  { label: 'Audit', description: 'Challenge every score' },
]

/** @type {Record<string, ('complete' | 'active' | 'upcoming')[]>} */
const STAGE_STATUS_LABELS = {
  idle: ['active', 'upcoming', 'upcoming', 'upcoming'],
  streaming: ['active', 'upcoming', 'upcoming', 'upcoming'],
  settled: ['complete', 'active', 'upcoming', 'upcoming'],
}

// The nav links the reference specifies. They are in-page anchors: the grid
// above them is the agent catalogue, but PIPELINE has to land on the live run
// the nav pill starts.
const NAV_LINKS = [
  { href: '#pipeline', label: 'Pipeline', isNew: false },
  { href: '#route', label: 'Route map', isNew: false },
  { href: '#audit', label: 'Audit', isNew: true },
]

/** The reference's nav: the wordmark carries the subtitle underneath. */
const WORDMARK_CLASS = `${headingXsClass} font-medium ${chalkClass}`
const WORDMARK_SUB_CLASS = `${metaClass} uppercase ${smokeClass}`
const NAV_LINK_CLASS =
  'font-aeonik text-sm font-normal uppercase leading-none text-smoke transition-colors hover:text-chalk'
const NAV_RULE_CLASS = 'text-iron'

// The 24px icon-avatar that sits inside the glossy pill: dark fill, light
// glyph, circular. Specified for the nav CTA and part of the button's own
// description, so the hero CTA carries the same mark.
const LOGOMARK_CLASS =
  'grid h-6 w-6 shrink-0 place-items-center rounded-full bg-obsidian text-[0.625rem] font-medium leading-none text-chalk'

function Logomark() {
  return (
    <span aria-hidden="true" className={LOGOMARK_CLASS}>
      R
    </span>
  )
}

/**
 * The nav links the reference specifies, as real anchors so the page's own
 * sections are reachable without scripting.
 */
function NavLinks() {
  return (
    <nav aria-label="Sections" className="flex items-center gap-6">
      {NAV_LINKS.map((link) => (
        <a key={link.href} href={link.href} className={NAV_LINK_CLASS}>
          {link.label}
          {link.isNew ? (
            <sup className="ml-1 font-input text-[0.625rem] tracking-normal text-compass-gold">
              new
            </sup>
          ) : null}
        </a>
      ))}
    </nav>
  )
}

/**
 * A full-content-width 1px Graphite rule. The reference calls this "the single
 * most repeated visual element — it IS the page structure", so sections are
 * separated by the line and by air, never by a change of background.
 *
 * @param {{
 *   children?: import('react').ReactNode,
 *   className?: string,
 *   id?: string,
 * }} props
 */
function Section({ children, className = '', id }) {
  return (
    <section id={id} className={`mt-30 border-t pt-30 ${ruleClass} ${className}`.trim()}>
      {children}
    </section>
  )
}

export default function App() {
  const { demoMode, toggleDemoMode, backendBaseUrl } = useDemoMode()
  const [sessionId, setSessionId] = useState(null)
  const [startError, setStartError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [runSignal, setRunSignal] = useState(0)

  const fallback = useAgentStream()
  const stream = useSessionStream({
    sessionId,
    enabled: Boolean(sessionId) && !demoMode,
    baseUrl: backendBaseUrl,
  })

  const usingLiveTransport = !demoMode && Boolean(sessionId)
  const events = usingLiveTransport ? stream.events : fallback.events

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

  // The reference puts two glossy pills on this page — the nav CTA and the hero
  // CTA — and both are the same primary action, so both raise the same signal.
  // The form is the only thing that knows the transcript, hence the counter
  // rather than a duplicated request.
  const requestRun = useCallback(() => {
    setRunSignal((current) => current + 1)
  }, [])

  // No per-stage progress signal exists in the session or event payload, so the
  // stage track is driven by the two states the app already knows: whether a
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

  const isBusy = isStreaming || (isStarting && !sessionId)

  // "VIEW ROUTE ↓" is the reference's reveal/scroll action, so it moves to the
  // route section rather than doing anything to the session. Anchors already
  // cover the nav links; this is the only button that has to reach for one.
  const scrollToRoute = useCallback(() => {
    document.getElementById('route')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="min-h-dvh bg-obsidian font-aeonik text-chalk">
      {/* Nav: transparent over the canvas with no bottom border at the very top,
          per the reference. The hairline it earns appears only once content
          scrolls underneath it. */}
      <header className="bg-transparent">
        <div
          className={`${pageColumnClass} flex flex-wrap items-center justify-between gap-6 py-6`}
        >
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col">
              <span className={WORDMARK_CLASS}>ReRoute</span>
              <span className={`mt-1 ${WORDMARK_SUB_CLASS}`}>Career orchestration</span>
            </div>
            <span aria-hidden="true" className={NAV_RULE_CLASS}>
              |
            </span>
            <NavLinks />
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <Switch
              id="demo-mode"
              checked={demoMode}
              onChange={toggleDemoMode}
              label="Demo mode"
            />
            <Button
              variant="glossy"
              onClick={requestRun}
              disabled={isBusy}
              aria-busy={isBusy}
            >
              <Logomark />
              Run pipeline
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero, left-aligned: the reference is explicit that a working tool
            does not take the source's centred marketing hero. Display steps
            63 → 44 → 34px, the same line-height and tracking throughout. */}
        <div className={pageColumnClass}>
          <Reveal>
            <h1
              id="demo-title"
              className={`${displayClass} ${chalkClass} text-[2.125rem] sm:text-heading-lg lg:text-display`}
            >
              Every agent,
              <span className={`block italic ${smokeClass}`}>in sequence.</span>
            </h1>
          </Reveal>

          <Reveal delay={70}>
            <p className={`mt-8 ${subheadingClass} ${readingClass} ${smokeClass}`}>
              A transparent view of the orchestration backbone as ReRoute turns a career
              transition into a fair, evidence-led plan.
            </p>
          </Reveal>

          {/* The reference's own example prompt orders this block headline →
              sub-headline → badge → buttons, which is what is built here; the
              summary list in the build instructions puts the badge first, and
              the component spec is the more specific of the two. */}
          <Reveal delay={140}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <StatusBadge
                live={!demoMode}
                label={`SLICE 04 · DEMO MODE ${demoMode ? 'ON' : 'OFF'}`}
              />
            </div>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                variant="glossy"
                onClick={requestRun}
                disabled={isBusy}
                aria-busy={isBusy}
                arrow="↗"
              >
                <Logomark />
                Run pipeline
              </Button>
              <Button variant="ghost" arrow="↓" onClick={scrollToRoute}>
                View route
              </Button>
            </div>
          </Reveal>
        </div>

        {/* The dot-density route graphic sits exactly where the source's globe
            sits: full-bleed, bleeding off the bottom of the hero. */}
        <Reveal delay={280}>
          <DotMapRoute className="mt-24" />
        </Reveal>

        <div className={pageColumnClass}>
          <Section>
            <Reveal>
              <PipelineAgentGrid />
            </Reveal>
          </Section>

          <Section>
            <Reveal>
              <SessionCard />
            </Reveal>
          </Section>

          <Section>
            <Reveal>
              <Manifesto />
            </Reveal>
          </Section>

          <Section id="pipeline">
            <Reveal>
              <StageProgress stages={stages} />
            </Reveal>
            <div className="mt-16">
              <WorkerApp
                baseUrl={backendBaseUrl}
                sessionId={sessionId}
                onSessionStart={handleSessionStart}
                events={events}
                isStreaming={isStreaming}
                runSignal={runSignal}
              />
            </div>
            {startError === '' ? null : (
              <Reveal delay={60}>
                <div role="alert" className="mt-12 space-y-3">
                  <p className={`font-aeonik text-caption uppercase ${smokeClass}`}>
                    Session could not start
                  </p>
                  <p className={`${readingClass} ${bodyClass} ${chalkClass}`}>{startError}</p>
                </div>
              </Reveal>
            )}
          </Section>

          <Section id="route">
            <Reveal>
              <RouteMap baseUrl={backendBaseUrl} />
            </Reveal>
          </Section>

          <Section id="audit">
            <Reveal>
              <GhostTwinPanel baseUrl={backendBaseUrl} />
            </Reveal>
          </Section>

          <Section id="employer">
            <Reveal>
              <HRConsole baseUrl={backendBaseUrl} />
            </Reveal>
          </Section>
        </div>
      </main>

      {/* Footer: 1px Graphite top border, transparent, 32px of vertical air. No
          fill. */}
      <footer className={`mt-30 border-t py-8 ${ruleClass}`}>
        <div className={pageColumnClass}>
          <p className={`font-aeonik text-sm font-normal ${chalkClass}`}>
            Team ReRoute · SRM University AP
          </p>
          <p className={`mt-2 ${metaClass} ${smokeClass}`}>
            github.com/mevarx/hackfest26 · SAP Hackfest 2026
          </p>
        </div>
      </footer>
    </div>
  )
}
