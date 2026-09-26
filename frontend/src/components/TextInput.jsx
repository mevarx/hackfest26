import { controlBaseClass, controlHeightClass } from '../styles/classes.js'

// The whole Form Input rule — 1px Graphite rule, Carbon surface, Aeonik body
// text, focus as a Chalk/Ash ring and never a hue — lives in `controlBaseClass`
// so no field can drift from it. This component only supplies the horizontal
// padding and the fixed control height; it deliberately has no shadow and no
// colour of its own to override. No mono here: Input is the meta face, and a
// form field is not meta. The 6px control radius is not a token — the reference
// gives none, so the value stays local to `controlBaseClass`.
const TEXT_INPUT_CLASS = [controlBaseClass, controlHeightClass, 'px-3'].join(' ')

/**
 * @param {{ className?: string } & Record<string, unknown>} props
 */
export default function TextInput({ className = '', ...rest }) {
  const classes = [TEXT_INPUT_CLASS, className].filter(Boolean).join(' ')

  return <input {...rest} type="text" className={classes} />
}
