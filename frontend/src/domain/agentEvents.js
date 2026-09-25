const VALID_AGENT_STATUSES = new Set([
  'running',
  'done',
  'waiting_consent',
])
const VALID_STREAM_SOURCES = new Set(['live', 'simulated'])
const VALID_EVENT_VALIDATIONS = new Set([
  'valid',
  'unknown_status',
  'invalid',
])
let nextGeneratedEventId = 0

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNormalizedAgentEvent(event) {
  if (!isRecord(event)) {
    return false
  }

  if (
    typeof event.id !== 'string' ||
    typeof event.streamId !== 'string' ||
    typeof event.agent !== 'string' ||
    typeof event.status !== 'string' ||
    typeof event.message !== 'string' ||
    typeof event.timestamp !== 'string' ||
    typeof event.receivedAt !== 'string' ||
    typeof event.deduplicationKey !== 'string' ||
    !VALID_EVENT_VALIDATIONS.has(event.validation)
  ) {
    return false
  }

  if (event.validation === 'valid') {
    return VALID_AGENT_STATUSES.has(event.status)
  }

  return event.status === 'error' || event.status === 'invalid'
}

function getIdentifier(value) {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function getDeduplicationKey(eventId, sequence) {
  if (eventId !== null) {
    return `event_id:${eventId}`
  }

  if (sequence !== null) {
    return `sequence:${sequence}`
  }

  nextGeneratedEventId += 1
  return `generated:event-${nextGeneratedEventId}`
}

function getReceivedAt(value) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString()
  }

  return date.toISOString()
}

function getDisplayTimestamp(timestamp, receivedAt) {
  if (typeof timestamp === 'string' && timestamp.trim()) {
    return timestamp
  }

  return receivedAt.slice(11, 19)
}

export function normalizeAgentEvent(
  event,
  { streamId = 'agent-log', receivedAt = Date.now() } = {},
) {
  if (isNormalizedAgentEvent(event)) {
    return event
  }

  const rawEvent = isRecord(event) ? event : {}
  const eventId = getIdentifier(rawEvent.event_id)
  const sequence =
    typeof rawEvent.sequence === 'number' &&
    Number.isFinite(rawEvent.sequence)
      ? rawEvent.sequence
      : null
  const deduplicationKey = getDeduplicationKey(eventId, sequence)
  const normalizedReceivedAt = getReceivedAt(receivedAt)
  const timestampIsValid =
    !Object.hasOwn(rawEvent, 'timestamp') ||
    typeof rawEvent.timestamp === 'string'
  const agentIsValid =
    typeof rawEvent.agent === 'string' && rawEvent.agent.trim().length > 0
  const messageIsValid = typeof rawEvent.message === 'string'
  const statusIsValid = typeof rawEvent.status === 'string'
  const coreEventIsValid =
    timestampIsValid && agentIsValid && messageIsValid && statusIsValid
  let status = 'invalid'
  let validation = 'invalid'

  if (coreEventIsValid && VALID_AGENT_STATUSES.has(rawEvent.status)) {
    status = rawEvent.status
    validation = 'valid'
  } else if (coreEventIsValid && statusIsValid) {
    status = 'error'
    validation = 'unknown_status'
  }

  const normalizedStreamId =
    typeof streamId === 'string' && streamId ? streamId : 'agent-log'

  return {
    id: `${normalizedStreamId}:${deduplicationKey}`,
    streamId: normalizedStreamId,
    deduplicationKey,
    eventId,
    sequence,
    agent: agentIsValid ? rawEvent.agent : 'Unknown agent',
    status,
    message: messageIsValid ? rawEvent.message : 'Invalid event received',
    timestamp: getDisplayTimestamp(rawEvent.timestamp, normalizedReceivedAt),
    receivedAt: normalizedReceivedAt,
    validation,
    data: Object.hasOwn(rawEvent, 'data') ? rawEvent.data : null,
  }
}

export function createAgentStreamAdapter({ source, subscribe }) {
  if (!VALID_STREAM_SOURCES.has(source)) {
    throw new TypeError('Agent stream source must be live or simulated')
  }

  if (typeof subscribe !== 'function') {
    throw new TypeError('Agent stream adapter requires a subscribe function')
  }

  return {
    source,
    subscribe,
  }
}

export function getAgentStreamSource(adapter) {
  if (VALID_STREAM_SOURCES.has(adapter?.source)) {
    return adapter.source
  }

  return 'simulated'
}
