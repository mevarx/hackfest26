const VARIANT_CLASS = {
  // Primary: solid black fill, white label. On a charcoal surface the same
  // treatment is read as white-on-dark, so the fill always carries the action.
  primary:
    'border border-[#0A0A0A] bg-[#0A0A0A] text-[#FAFAFA] hover:bg-[#1A1A1A] hover:border-[#1A1A1A] active:bg-[#1A1A1A]',
  // Secondary: plain text, underline on hover only.
  secondary:
    'h-auto border-0 bg-transparent px-0 py-1 text-sm font-semibold normal-case tracking-[0.04em] text-[#0A0A0A] underline-offset-4 hover:underline hover:opacity-70',
  ghost:
    'h-auto border-0 bg-transparent px-0 py-1 text-sm font-semibold normal-case tracking-[0.04em] text-[#4A4A4A] underline-offset-4 hover:text-[#0A0A0A] hover:underline',
  // The one accent allowed per screen (e.g. "Run pipeline" only). Every other
  // action in the app is black or plain text.
  accent:
    'border border-[#F5A623] bg-[#F5A623] text-[#0A0A0A] hover:bg-[#e0951a] hover:border-[#e0951a] active:bg-[#d18616]',
}

const BUTTON_BASE_CLASS =
  'inline-flex h-control items-center justify-center gap-2 rounded-control px-5 text-sm font-bold uppercase leading-none tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623] disabled:pointer-events-none disabled:opacity-50'

/**
 * @param {{
 *   variant?: 'primary' | 'secondary' | 'ghost' | 'accent',
 *   type?: 'button' | 'submit' | 'reset',
 *   className?: string,
 *   children?: import('react').ReactNode,
 * } & Record<string, unknown>} props
 */
export default function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...rest
}) {
  const classes = [
    BUTTON_BASE_CLASS,
    VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <button {...rest} type={type} className={classes} />
}
