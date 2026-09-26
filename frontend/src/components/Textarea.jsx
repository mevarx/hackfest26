import { controlBaseClass } from '../styles/classes.js'

// The transcript is the product's raw material, so it gets noticeably more
// breathing room than a single-line field: 16px all round against the 40px
// single-line control. The native resize handle is left visible — an
// understated grip is a real affordance, and hiding it (`resize-none`) is the
// kind of quiet loss the style reference does not ask for.
const TEXTAREA_CLASS = [controlBaseClass, 'px-4 py-4 leading-6'].join(' ')

/**
 * @param {{ className?: string, rows?: number } & Record<string, unknown>} props
 */
export default function Textarea({ className = '', rows = 4, ...rest }) {
  const classes = [TEXTAREA_CLASS, className].filter(Boolean).join(' ')

  return <textarea {...rest} rows={rows} className={classes} />
}
