import { bodyClass, chalkClass, dataLabelClass, metaClass, ruleClass, smokeClass } from '../styles/classes.js'
import Icon from './Icon.jsx'

// 8px, not the 12px `--radius-card`: the Session Card's own spec asks for a
// tighter corner than the general card radius, so this component overrides the
// token rather than redefining a new one.
//
// Horizontal padding is generous and the row is full width, because this card
// is a single record in a 1200px column: a card the width of its own text
// floated in the middle of the row read as stranded rather than composed. The
// content stays centred inside the frame because the card is about one subject,
// but the frame itself now shares the page's left edge.
const CARD_CLASS = 'flex flex-col items-center rounded-[8px] px-6 py-10 text-center'

// The persona is the subject of the card, so it takes Aeonik at the body size;
// the category and the date are metadata about the run, so both take Input at
// the meta scale. The date is a `time` element, and the whole card is one
// article so a screen reader announces the three bits as a single record.
const PERSONA_CLASS = `${bodyClass} ${chalkClass}`
const META_CLASS = `${metaClass} ${smokeClass}`

/**
 * Session Card: a past demo run, replacing the Portfolio Card. Persona, outcome
 * and date, nothing else — no state, no fetching, no invented status.
 *
 * The copy stays descriptive on purpose. Nothing here claims a hire or a pay
 * outcome the backend cannot evidence; it names the persona, what the run was,
 * and when it happened.
 *
 * @param {{
 *   persona?: string,
 *   category?: string,
 *   date?: string,
 *   dateTime?: string,
 *   className?: string,
 * }} props
 */
export default function SessionCard({
  persona = 'Kavya · 29 · Chennai',
  category = 'Manual tester → QA analyst · 10 weeks',
  date = '18 Sep 2026',
  dateTime = '2026-09-18',
  className = '',
}) {
  return (
    <article className={`${CARD_CLASS} border ${ruleClass} ${className}`.trim()}>
      <Icon name="passport" size={24} tone="chalk" className="mb-6" />
      <p className={PERSONA_CLASS}>{persona}</p>
      <p className={`mt-2 ${dataLabelClass}`}>{category}</p>
      <p className={`mt-2 ${META_CLASS}`}>
        <time dateTime={dateTime}>{date}</time>
      </p>
    </article>
  )
}
