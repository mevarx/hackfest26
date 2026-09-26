/**
 * Narrowing helpers shared by the API client, the WebSocket transport and the
 * agent-event normaliser. These byte-identical copies drifted apart before, so
 * they live here once.
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
