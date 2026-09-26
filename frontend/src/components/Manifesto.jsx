import {
  chalkClass,
  headingSmClass,
  manifestoClass,
  metaClass,
  smokeClass,
} from '../styles/classes.js'
import Button from './Button.jsx'

// Copy is quoted verbatim by the reference, so the defaults below are the
// spec's own sentences and the props exist only to make the block testable.
const DEFAULT_EYEBROW = 'The Two-Key rule'
const DEFAULT_TITLE = 'Why ReRoute?'
const DEFAULT_BODY =
  'AI proposes, a human decides on every high-stakes step. Rejections, terminations and pay are never automated.'
// The button label is already set in the spec's small-caps form rather than left
// to the button's own `text-transform`, so the rendered text matches the
// reference either way.
const DEFAULT_CTA = 'READ THE TWO-KEY RULE'

// Aeonik 16px in Smoke on 24px of leading, which is the one place the reference
// deliberately overrides the type scale's body leading. The body is a short
// centred statement and 24px is what the spec asks for, so this is a local
// choice and not a missing token.
const BODY_CLASS = `mt-6 font-aeonik text-body font-normal leading-6 ${smokeClass}`

const CTA_CLASS = 'mt-10'

/**
 * Manifesto block: the one place the page stops being full-bleed and reads as a
 * single centred statement.
 *
 * The reference is explicit that this block is centred while everything around
 * it is left-aligned, so the centring is kept — but a centred block hanging
 * under a left-aligned page with no marker read as a mistake rather than as a
 * deliberate refrain. The eyebrow is what makes the shift legible: it carries
 * the same mono label every other section opens with, so the reader sees a
 * normal section that simply chose a different internal alignment.
 *
 * The block brings its own hairline and air rather than sitting inside App's
 * `<Section>`, because that helper emits a left-aligned header and would put the
 * two alignment systems back in conflict inside one block.
 *
 * @param {{
 *   eyebrow?: string,
 *   title?: string,
 *   body?: string,
 *   ctaLabel?: string,
 *   onCtaClick?: () => void,
 *   className?: string,
 * }} props
 */
export default function Manifesto({
  eyebrow = DEFAULT_EYEBROW,
  title = DEFAULT_TITLE,
  body = DEFAULT_BODY,
  ctaLabel = DEFAULT_CTA,
  onCtaClick,
  className = '',
}) {
  return (
    <section
      className={`mt-28 border-t border-graphite pt-20 text-center ${className}`.trim()}
    >
      <div className={`mx-auto ${manifestoClass}`}>
        <p className={`${metaClass} ${smokeClass} uppercase`}>{eyebrow}</p>
        <h2 className={`mt-3 ${headingSmClass} ${chalkClass}`}>{title}</h2>
        <p className={BODY_CLASS}>{body}</p>
        {/* Ghost Outline, and a down arrow: the target is further down the page,
            which is the reference's rule for the arrow glyph. */}
        <Button variant="ghost" arrow="↓" className={CTA_CLASS} onClick={onCtaClick}>
          {ctaLabel}
        </Button>
      </div>
    </section>
  )
}
