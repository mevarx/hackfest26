import { cellRuleClass, chalkClass, ruleClass, smokeClass } from '../styles/classes.js'
import Icon from './Icon.jsx'

/**
 * @typedef {import('./Icon.jsx').IconName} IconName
 * @typedef {{ id: string, name: string, description: string, icon: IconName }} PipelineAgent
 */

/**
 * The six agents, in the orchestrator's own node order (`orchestrator.py`:
 * skills_discovery → market_intelligence → learning_pathway →
 * inclusive_matching → employer_readiness → bias_audit). The grid is a map of
 * the pipeline, not a feature list, so it reads in run order.
 *
 * The descriptions say what each agent does *in this build*. Market Intelligence
 * and Employer Readiness read static fixtures and the backend labels every event
 * they emit `simulated`; the PRD makes that distinction a requirement, so the
 * card copy does not pretend otherwise. Exported so a parent can reference the
 * same list (a live log, a route summary) without this module's markup.
 */
// The data is deliberately part of this module's public surface — a parent needs
// the same six entries the grid renders — so the fast-refresh rule is waived here
// rather than moving the list somewhere a page cannot reach.
// eslint-disable-next-line react-refresh/only-export-components
export const PIPELINE_AGENTS = /** @type {PipelineAgent[]} */ ([
  {
    id: 'skills-discovery',
    name: 'Skills Discovery',
    description: 'Reads the transcript and files each claim as a skill with a confidence and a proof gap.',
    icon: 'skills-discovery',
  },
  {
    id: 'market-intelligence',
    name: 'Market Intelligence',
    description: 'Simulated displacement radar: where the role is thinning out and what paid bridge work is open.',
    icon: 'market-intelligence',
  },
  {
    id: 'learning-pathway',
    name: 'Learning Pathway',
    description: 'Walks the skills graph from where you are to the target role, with hours and a paid bridge attached.',
    icon: 'learning-pathway',
  },
  {
    id: 'inclusive-matching',
    name: 'Inclusive Matching',
    description: 'Ranks roles against your passport and your constraints, and blocks any that breach the pay guardrail.',
    icon: 'inclusive-matching',
  },
  {
    id: 'employer-readiness',
    name: 'Employer Readiness',
    description: 'Simulated shortlist rewrite showing how many candidates your filters would otherwise hide.',
    icon: 'employer-readiness',
  },
  {
    id: 'bias-audit',
    name: 'Bias Audit',
    description: 'Re-runs the match against Ghost Twins that differ in one attribute, and freezes it if any score moves.',
    icon: 'bias-audit',
  },
])

const COLUMNS = 2
const LAST_ROW_START = PIPELINE_AGENTS.length - COLUMNS

// Transparent, 48px of padding, icon top-left, then the name and one line of
// description. The 20–24px element gap the reference specifies separates the
// icon from the text; the name sits closer to the line it introduces.
const CELL_CLASS = `flex flex-col p-12 ${cellRuleClass}`
const ICON_CLASS = 'mb-6'
const NAME_CLASS = `font-aeonik text-sm font-normal uppercase leading-body ${chalkClass}`
const DESCRIPTION_CLASS = `mt-3 font-aeonik text-sm font-normal leading-body ${smokeClass}`

/**
 * The frame draws the outside of the grid, so a cell may only paint the edges
 * that are interior — otherwise every shared edge renders 2px wide and the six
 * cells read as six floating boxes instead of one grid. The two arrangements
 * share no positions, so each breakpoint gets its own set of edge removals.
 *
 * At `md` the index parity is the column — the first, third and fifth cells are
 * the left column — so a cell drops the border on the frame side of its parity.
 * Below `md` the grid is one column and every cell touches both frame sides.
 *
 * @param {number} index
 */
function interiorEdgeClass(index) {
  const isFirstColumn = index % COLUMNS === 0
  const isLastRow = index >= LAST_ROW_START

  return [
    'border-r-0',
    index === 0 ? 'border-l-0' : '',
    isLastRow ? 'border-b-0' : '',
    isFirstColumn ? 'md:border-l-0' : '',
    isFirstColumn ? '' : 'md:border-r-0',
    isLastRow ? 'md:border-b-0' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Pipeline Agent grid: the 2×3 replacement for the service-card grid, six cells
 * in a bordered frame. Two columns on desktop, one on mobile.
 *
 * @param {{ className?: string }} props
 */
export default function PipelineAgentGrid({ className = '' }) {
  return (
    <ul
      className={`grid grid-cols-1 overflow-hidden rounded-card border md:grid-cols-2 ${ruleClass} ${className}`.trim()}
    >
      {PIPELINE_AGENTS.map((agent, index) => (
        <li key={agent.id} className={`${CELL_CLASS} ${interiorEdgeClass(index)}`}>
          <Icon name={agent.icon} size={32} tone="gold" className={ICON_CLASS} />
          <p className={NAME_CLASS}>{agent.name}</p>
          <p className={DESCRIPTION_CLASS}>{agent.description}</p>
        </li>
      ))}
    </ul>
  )
}
