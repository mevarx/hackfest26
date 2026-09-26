import { controlBaseClass } from '../styles/classes.js'

/**
 * @param {{ className?: string, rows?: number } & Record<string, unknown>} props
 */
export default function Textarea({ className = '', rows = 4, ...rest }) {
  const classes = [controlBaseClass, 'px-3 py-2.5 leading-6', className]
    .filter(Boolean)
    .join(' ')

  return <textarea {...rest} rows={rows} className={classes} />
}
