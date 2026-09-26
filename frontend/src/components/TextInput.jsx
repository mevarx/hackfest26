import { controlBaseClass, controlHeightClass } from '../styles/classes.js'

/**
 * @param {{ className?: string } & Record<string, unknown>} props
 */
export default function TextInput({ className = '', ...rest }) {
  const classes = [controlBaseClass, controlHeightClass, 'px-3', className]
    .filter(Boolean)
    .join(' ')

  return <input {...rest} type="text" className={classes} />
}
