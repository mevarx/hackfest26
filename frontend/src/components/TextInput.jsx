import { controlBaseClass, controlHeightClass } from '../styles/classes.js'

// The whole Form Input rule — 1px Graphite rule, 6px radius, sans body text,
// amber border on focus and nowhere else — lives in `controlBaseClass` so no
// field can drift from it. This component only supplies the horizontal padding
// and the fixed control height; it deliberately has no shadow and no colour of
// its own to override.
const TEXT_INPUT_CLASS = [controlBaseClass, controlHeightClass, 'px-3'].join(' ')

/**
 * @param {{ className?: string } & Record<string, unknown>} props
 */
export default function TextInput({ className = '', ...rest }) {
  const classes = [TEXT_INPUT_CLASS, className].filter(Boolean).join(' ')

  return <input {...rest} type="text" className={classes} />
}
