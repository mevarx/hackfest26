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
  headingXsClass,
  metaClass,
  pageColumnClass,
  readingClass,
  ruleClass,
  smokeClass,
  subheadingClass,
  typeDisplayClass,
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
const WORDMARK_SUB_CLASS = `mt-1 block ${metaClass} ${smokeClass}`

// 24px gaps, the reference's stated nav-link interval. The wordmark, the
// divider and the links are one optical group, so the divider sits on the
// group rather than being spaced off it.
const NAV_LINK_CLASS =
  'font-aeonik text-sm font-normal uppercase leading-none text-smoke transition-colors hover:text-chalk'
const NAV_RULE_CLASS = 'text-iron'

/* The nav collapses to a single row on mobile. At 390px the previous version
 * wrapped into four stacked rows — wordmark, divider, links, switch, pill —
 * producing a ~230px sticky header that covered the hero headline and ate a
 * third of the first screen. Three rules fix it:
 *
 *   1. The nav links hide below `md`. They are in-page anchors to sections far
 *      down the page; a phone user scrolls, and the four-row header was worth
 *      more than the shortcuts it offered.
 *   2. The wordmark subtitle, the divider and the switch's state word hide with
 *      the links, so the label shrinks to just "DEMO MODE" and the track keeps
 *      carrying the state by knob position alone.
 *   3. The switch label itself is hidden below `sm`. "ReRoute · [switch] · DEMO
 *      MODE · [pill]" needs about 430px; at 390px the label and the wordmark
 *      collided and overlapped. Below `sm` the switch is the track plus its
 *      accessible name only, which is a control a thumb can actually hit.
 */
const NAV_GROUP_CLASS = 'flex min-w-0 items-center gap-3 sm:gap-4 md:gap-6'
const NAV_LINK_LIST_CLASS = 'hidden items-center gap-6 md:flex'
const NAV_ACTIONS_CLASS = 'flex shrink-0 items-center gap-3 sm:gap-4 md:gap-6'
const NAV_DIVIDER_CLASS = `hidden ${NAV_RULE_CLASS} md:inline`
const WORDMARK_WRAP_CLASS = 'flex min-w-0 flex-col'

// The 24px icon-avatar that sits inside the glossy pill: dark fill, light
// glyph, circular. Specified for the nav CTA and part of the button's own
// description, so the hero CTA carries the same mark.
const LOGOMARK_CLASS =
  'grid h-6 w-6 shrink-0 place-items-center rounded-full bg-obsidian text-[0.625rem] font-medium leading-none text-chalk'

/* ── Hero rhythm ──────────────────────────────────────────────────────────
 *
 * Three values, tightening as the eye moves down the block.
 *
 * The headline, its second line and the sub-headline are one thought, so they
 * share a tight cluster: 20px under the headline and 24px under it again to
 * the sub-headline. The badge is metadata about the page rather than part of
 * that thought, so it stands off by a full 32px. The buttons belong to the
 * badge's group and follow it closely.
 *
 * The previous version used 8 / 32 / 40 / 96 / 120px in an order that put a
 * 122px hole between the headline and its own sub-headline, which read as two
 * separate sections rather than one statement. Fewer values, and chosen so
 * that a gap grows as the content changes register rather than arbitrarily.
 */
const HERO_CLASS = 'pt-8 lg:pt-14'
const HERO_SUBHEAD_GAP_CLASS = 'mt-6'
const HERO_BADGE_GAP_CLASS = 'mt-10'
const HERO_ACTIONS_GAP_CLASS = 'mt-5'

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
    <nav aria-label="Sections" className={NAV_LINK_LIST_CLASS}>
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
 * The 112px of air either side of the rule is the one place the section rhythm
 * is quoted from a token rather than a one-off number, so every section on the
 * page opens at the same distance from the one above it.
 *
 * @param {{
 *   children?: import('react').ReactNode,
 *   className?: string,
 *   id?: string,
 *   eyebrow?: string,
 *   title?: string,
 *   description?: string,
 * }} props
 */
function Section({
  children,
  className = '',
  id,
  eyebrow,
  title,
  description,
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-heading` : undefined}
      className={`mt-28 border-t pt-16 ${ruleClass} ${className}`.trim()}
    >
      {eyebrow === undefined && title === undefined ? null : (
        <header className="mb-16">
          {eyebrow === undefined ? null : (
            <p className={`${metaClass} ${smokeClass} uppercase`}>{eyebrow}</p>
          )}
          {title === undefined ? null : (
            <h2
              id={id ? `${id}-heading` : undefined}
              className={`mt-3 font-aeonik text-heading font-normal leading-heading ${chalkClass}`}
            >
              {title}
            </h2>
          )}
          {description === undefined ? null : (
            <p className={`mt-4 ${readingClass} ${bodyClass} ${smokeClass}`}>
              {description}
            </p>
          )}
        </header>
      )}
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
      {/* Nav: it floats over the canvas with no bottom border at the very top,
          per the reference, and it earns a hairline only once content scrolls
          underneath. Because it has to read over whatever is passing beneath, it
          gets a scrim rather than the drop shadow the reference forbids — and
          the scrim is fully opaque rather than translucent, because at 80% the
          hero headline was visibly showing through the bar as it scrolled past,
          which is exactly the collision the scrim exists to prevent. */}
      <header className="sticky top-0 z-50">
        <div className="bg-obsidian">
          <div
            className={`${pageColumnClass} flex items-center justify-between gap-4 py-4 md:py-5`}
          >
            <div className={NAV_GROUP_CLASS}>
              <div className={WORDMARK_WRAP_CLASS}>
                <span className={WORDMARK_CLASS}>ReRoute</span>
                <span className={`${WORDMARK_SUB_CLASS} hidden md:block`}>
                  Career orchestration
                </span>
              </div>
              <span aria-hidden="true" className={NAV_DIVIDER_CLASS}>
                |
              </span>
              <NavLinks />
            </div>

            <div className={NAV_ACTIONS_CLASS}>
              {/* The label is hidden below `sm`: "ReRoute · [switch] · DEMO MODE
                  · [pill]" needs about 430px, so at 390px the label collided
                  with the wordmark. The track is still a 44px touch target and
                  the checkbox keeps `aria-label`, so the control is announced by
                  name and is operable by thumb either way. */}
              <Switch
                id="demo-mode"
                checked={demoMode}
                onChange={toggleDemoMode}
                label="Demo mode"
                stateClassName="hidden md:inline"
                labelClassName="hidden sm:inline"
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
          {/* The hairline the reference says the nav earns once content scrolls
              under it. This is the only place on the page a border sits on the
              header. */}
          <div aria-hidden="true" className="h-px bg-graphite" />
        </div>
      </header>

      <main>
        {/* Hero, left-aligned: the reference is explicit that a working tool
            does not take the source's centred marketing hero.
            Display steps 32 → 44 → 63px on the same leading and tracking.

            The base step is 32px, not the scale's 34px. At 34px "Every agent,"
            overflowed the 390px content measure and the headline broke into four
            ragged lines — "Every / agent, / in / sequence." — which destroyed
            the two-line shape the whole composition is built on. 32px holds the
            first line as one unit, so the block is two lines on a phone and two
            lines on a desktop, which is the point of the line break. The 34px
            scale entry is still used by section headings. */}
        <div className={`${pageColumnClass} ${HERO_CLASS}`}>
          <Reveal>
            <h1
              id="demo-title"
              // `typeDisplayClass` is the display voice with no size of its own.
              // The old `displayClass` carried `text-display` (63px), and since
              // both land in the same cascade layer the token won at every width
              // below `lg` — the headline was still 63px at 390px and broke into
              // four ragged lines. The size is claimed here instead.
              className={`${typeDisplayClass} ${chalkClass} text-[2rem] sm:text-heading-lg lg:text-display`}
            >
              Every agent,
              <span className={`block italic ${smokeClass}`}>in sequence.</span>
            </h1>
          </Reveal>

          <Reveal delay={70} className={HERO_SUBHEAD_GAP_CLASS}>
            <p className={`${subheadingClass} ${readingClass} ${smokeClass}`}>
              A transparent view of the orchestration backbone as ReRoute turns a
              career transition into a fair, evidence-led plan.
            </p>
          </Reveal>

          {/* The reference's own example prompt orders this block headline →
              sub-headline → badge → buttons, which is what is built here; the
              summary list in the build instructions puts the badge first, and
              the component spec is the more specific of the two. */}
          <Reveal delay={140} className={HERO_BADGE_GAP_CLASS}>
            <StatusBadge
              live={!demoMode}
              label={`SLICE 04 · DEMO MODE ${demoMode ? 'ON' : 'OFF'}`}
            />
          </Reveal>

          <Reveal delay={210} className={HERO_ACTIONS_GAP_CLASS}>
            <div className="flex flex-wrap items-center gap-4">
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
            sits: full-bleed, bleeding off the bottom of the hero. The 64px
            under the CTA row is deliberate — the graphic is the thing the
            reader is meant to arrive at, and the graphic itself supplies the
            air below the copy. A bigger gap here just made an empty band.
            A negative inline start pulls the graphic out to the true page
            edges, because the content column's 32px gutter is not part of the
            illustration. */}
        <Reveal delay={280} className="mt-16">
          <DotMapRoute className="-mx-6 sm:-mx-8" />
        </Reveal>

        <div className={pageColumnClass}>
          <Section
            eyebrow="The pipeline"
            title="Six agents, one ordered run."
            description="Each agent takes the previous one's output and narrows the decision. The seventh node in the graph is the human gate, not an agent — which is why the count here is six."
          >
            <Reveal>
              <PipelineAgentGrid />
            </Reveal>
          </Section>

          <Section
            eyebrow="A recorded run"
            title="What a finished run looks like."
            description="One session end to end, with the persona, the pivot and the date it happened. Nothing here claims an outcome the backend cannot evidence."
          >
            <Reveal>
              <SessionCard />
            </Reveal>
          </Section>

          {/* The Manifesto brings its own hairline and centred layout, so it is
              not wrapped in <Section> — a left-aligned header above a centred
              block put two alignment systems in one section. */}
          <Reveal>
            <Manifesto />
          </Reveal>

          <Section
            id="pipeline"
            eyebrow="Stage 01 · Skills discovery"
            title="Worker intake & skill passport."
            description="Speak or paste what Kavya actually did, then let the pipeline recover durable skills instead of keywords."
          >
            {/* The Stage track belongs to this section's header block rather
                than being a separate module, so it follows the description at
                the header's own 64px rhythm instead of at a second, larger gap. */}
            <Reveal className="mt-16">
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
                  <p className={`${metaClass} ${smokeClass} uppercase`}>
                    Session could not start
                  </p>
                  <p className={`${readingClass} ${bodyClass} ${chalkClass}`}>
                    {startError}
                  </p>
                </div>
              </Reveal>
            )}
          </Section>

          <Section
            id="route"
            eyebrow="Stage 02 · Market intelligence"
            title="Displacement and demand, before you commit."
            description="How exposed the current role is, and whether the local demand behind it is still growing."
          >
            <Reveal>
              <RouteMap baseUrl={backendBaseUrl} />
            </Reveal>
          </Section>

          <Section
            id="audit"
            eyebrow="Stage 06 · Bias audit"
            title="Rewrite the filter, not the shortlist."
            description="What an employer's own job post does to their shortlist, and the evidence-led wording ReRoute swaps in once the audit flags the post."
          >
            <Reveal>
              <GhostTwinPanel baseUrl={backendBaseUrl} />
            </Reveal>
          </Section>

          <Section
            id="employer"
            eyebrow="Stage 05 · Employer readiness"
            title="The employer's side of the same run."
            description="A simulated shortlist rewrite showing how many candidates a filter would otherwise hide."
          >
            <Reveal>
              <HRConsole baseUrl={backendBaseUrl} />
            </Reveal>
          </Section>
        </div>
      </main>

      {/* Footer: 1px Graphite top border, transparent, 32px of vertical air. No
          fill. */}
      <footer className={`mt-28 border-t py-8 ${ruleClass}`}>
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
