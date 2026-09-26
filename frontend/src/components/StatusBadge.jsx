import { inlineDotClass, pulseDotClass, smokeClass } from '../styles/classes.js'

// The one bordered pill in the system, reproduced literally from the
// reference's badge block. The two literals it quotes — #1a1a1a surface and
// #212121 border — are held as custom properties in tokens.css; the border
// reuses the Graphite token, which is the same value.
//
// The word is set in Input 400 at 12px: this is meta, not copy, which is the one
// job the secondary face has. Line height is forced to 1 rather than the
// caption's loose 2.69 — the badge is a single line boxed in 6px of padding, and
// the reference's block says `12px/1`.
const BADGE_CLASS = [
  'inline-flex items-center gap-2 rounded-badge border border-graphite',
  'bg-[var(--color-badge-surface)] px-3.5 py-1.5',
  'font-input text-[12px] font-normal uppercase leading-none tracking-badge',
  smokeClass,
].join(' ')

/**
 * Status / scarcity badge.
 *
 * `live` defaults to true because the reference's own ReRoute badge
 * ("SLICE 04 · DEMO MODE ON") is a live mark. A non-live badge keeps the dot but
 * drops it to a Graphite outline: the shape says "not live" without inventing a
 * second accent, and Pulse Green stays confined to the one live dot — which is
 * also the only glow in the system besides the pill's own bevel.
 *
 * @param {{
 *   label?: string,
 *   live?: boolean,
 *   className?: string,
 * } & Record<string, unknown>} props
 */
export default function StatusBadge({
  label,
  live = true,
  className = '',
  ...rest
}) {
  const dotClass = live ? pulseDotClass : `${inlineDotClass} border border-graphite`

  return (
    <span {...rest} className={[BADGE_CLASS, className].filter(Boolean).join(' ')}>
      <span aria-hidden="true" data-status-dot="" className={dotClass} />
      {label}
    </span>
  )
}

export { StatusBadge }
