import {
  chalkClass,
  headingSmClass,
  manifestoClass,
  smokeClass,
} from '../styles/classes.js'
import Button from './Button.jsx'

// Copy is quoted verbatim by the reference, so the defaults below are the
// spec's own sentences and the props exist only to make the block testable.
const DEFAULT_TITLE = 'Why ReRoute?'
const DEFAULT_BODY =
  'AI proposes, a human decides on every high-stakes step. Rejections, terminations and pay are never automated.'
// The button label is already set in the spec's small-caps form rather than left
// to the button's own `text-transform`, so the rendered text matches the
// reference either way.
const DEFAULT_CTA = 'READ THE TWO-KEY RULE'

// Aeonik 16px in Smoke, but on 24px of leading rather than the type scale's 1.25
// (20px). The manifesto is the one place the reference overrides the scale: the
// body is a short centred statement, and 24px is what the spec asks for, so this
// is a deliberate `leading-6` and not a missing token.
const BODY_CLASS = `mt-6 font-aeonik text-body font-normal leading-6 ${smokeClass}`

const CTA_CLASS = 'mt-10'

/**
 * Manifesto block: the centred 600px column that states the Two-Key Rule and
 * links to the write-up. Narrow by design — it is the one place the page stops
 * being full-bleed and reads as a single statement.
 *
 * @param {{
 *   title?: string,
 *   body?: string,
 *   ctaLabel?: string,
 *   onCtaClick?: () => void,
 *   className?: string,
 * }} props
 */
export default function Manifesto({
  title = DEFAULT_TITLE,
  body = DEFAULT_BODY,
  ctaLabel = DEFAULT_CTA,
  onCtaClick,
  className = '',
}) {
  return (
    <section className={`text-center ${manifestoClass} ${className}`.trim()}>
      <h2 className={`${headingSmClass} ${chalkClass}`}>{title}</h2>
      <p className={BODY_CLASS}>{body}</p>
      {/* Ghost Outline, and a down arrow: the target is further down the page,
          which is the reference's rule for the arrow glyph. */}
      <Button variant="ghost" arrow="↓" className={CTA_CLASS} onClick={onCtaClick}>
        {ctaLabel}
      </Button>
    </section>
  )
}
