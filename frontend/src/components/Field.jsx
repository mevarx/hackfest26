import { controlFieldHintClass, controlFieldLabelClass } from '../styles/classes.js'

/**
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
      <label
        htmlFor={htmlFor ?? id}
        className={controlFieldLabelClass}
      >
        {label}
      </label>
      {hint === undefined ? null : (
        <p className={controlFieldHintClass}>{hint}</p>
      )}
      <div className="mt-2">{children}</div>
    </div>
  )
}
