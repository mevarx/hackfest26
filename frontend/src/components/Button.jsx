const VARIANT_CLASS = {
  primary:
    'border border-transparent bg-amber text-navy hover:bg-amber/85 active:bg-amber/75',
  secondary:
    'border border-slate/60 bg-transparent text-offwhite hover:border-teal hover:text-teal',
  ghost:
    'border border-transparent bg-transparent text-offwhite/70 hover:text-amber',
}

const BUTTON_BASE_CLASS =
  'inline-flex h-control items-center justify-center gap-2 rounded-control px-4 text-sm font-bold uppercase leading-none tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:pointer-events-none disabled:opacity-50'

/**
 * @param {{
 *   variant?: 'primary' | 'secondary' | 'ghost',
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
