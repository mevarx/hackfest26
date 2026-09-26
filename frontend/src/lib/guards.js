/**
 * Narrowing helpers shared by the API client, the WebSocket transport and the
 * agent-event normaliser. These four byte-identical copies drifted apart before,
 * so they live here once.
 */

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAbortError(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    /** @type {{ name?: unknown }} */ (error).name === 'AbortError'
  )
}

/**
 * Read a finite number out of an untrusted value, or return `null`.
 *
 * Guards against strings, `NaN`, and infinities, which would otherwise reach
 * the UI as `NaN` or blow up arithmetic downstream.
 */
export function readFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}
