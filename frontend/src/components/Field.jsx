import { controlFieldHintClass, controlFieldLabelClass } from '../styles/classes.js'

/**
 * Label above, control, then one sentence of helper copy below in Slate/Smoke.
 * The hint is a subordinate footnote to the control, not a second label
 * wedged between the label and the thing it describes — no icon, ever.
 *
 * @param {{
 *   id?: string,
 *   label?: string,
 *   hint?: string,
 *   htmlFor?: string,
 *   className?: string,
 *   children?: import('react').ReactNode,
 * } & Record<string, unknown>} props
 */
export default function Field({
  id,
  label,
  hint,
  htmlFor,
  className = '',
  children,
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor ?? id} className={controlFieldLabelClass}>
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint === undefined ? null : <p className={controlFieldHintClass}>{hint}</p>}
    </div>
  )
}
