import {
  buttonBaseClass,
  buttonGhostClass,
  buttonGlossyClass,
} from '../styles/classes.js'

// Two buttons exist, and only two. `glossy` is the primary action; `ghost` is
// everything else. There is no third style, no alias and no accent variant —
// Compass Gold is an icon-stroke colour, never a button colour, and the fill on
// `glossy` is the single filled surface the style reference permits.
//
// Radius: the reference's prose calls the primary a "full pill", but the CSS
// block it ships alongside gives `border-radius: 14px` and the radius table
// calls buttons "rounded rect, NOT full pill". The literal CSS wins, so both
// variants use the shared `rounded-button` token (14px); the badge is the only
// 9999px pill in the system.
//
// The ghost block in the reference asks for 12px while `buttonGhostClass` shares
// the same 14px button token. 14px is inside the reference's stated 12–14px
// button band, so the shared token stands rather than reintroducing a
// duplicate radius at the call site.
const VARIANT_CLASS = {
  glossy: `${buttonGlossyClass} py-2.5 pl-2.5 pr-5`,
  // Asymmetric on purpose: the reference's `10px 20px 10px 10px` pulls the
  // leading edge in so the 24px logomark circle sits flush inside the pill. A
  // caller with no icon inherits the same padding — that is the spec, not a
  // bug to be tidied away.
  ghost: `${buttonGhostClass} py-2.5 px-5`,
}

// `buttonBaseClass` already carries the Aeonik 400 14px/1 uppercase voice, the
// 0.02em tracking, the 8px gap, the Ash focus ring and the disabled state, so
// nothing here re-states the type.

/**
 * The two reference buttons.
 *
 * `arrow` is the reference's trailing glyph slot: "↗" for a forward action, "↓"
 * for a reveal/scroll action. It is decorative, so it is hidden from assistive
 * tech and the button keeps announcing its label alone.
 *
 * The icon-avatar circle (24px, dark fill, light glyph — the "R" logomark on the
 * nav pill and the hero CTA) is not a prop: callers pass their own element as the
 * first child, so the button draws no artwork of its own and the 8px base gap
 * does the spacing.
 *
 * @param {{
 *   variant?: 'glossy' | 'ghost',
 *   type?: 'button' | 'submit' | 'reset',
 *   arrow?: string,
 *   className?: string,
 *   disabled?: boolean,
 *   children?: import('react').ReactNode,
 * } & Record<string, unknown>} props
 */
export default function Button({
  variant = 'glossy',
  type = 'button',
  arrow,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    buttonBaseClass,
    VARIANT_CLASS[variant] ?? VARIANT_CLASS.glossy,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button {...rest} type={type} className={classes}>
      {children}
      {arrow === undefined ? null : (
        <span aria-hidden="true" className="leading-none">
          {arrow}
        </span>
      )}
    </button>
  )
}

export { Button }
