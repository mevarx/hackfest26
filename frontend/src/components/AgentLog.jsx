import { useMemo } from 'react'
import { normalizeAgentEvent } from '../domain/agentEvents.js'
import Badge from './Badge.jsx'
import Button from './Button.jsx'

const EMPTY_EVENTS = Array.from({ length: 0 })

/** @type {Record<string, { label: string, status: 'running' | 'done' | 'waiting' | 'idle' }>} */
const STATUS_DETAILS = {
  running: {
    label: 'Running',
    status: 'running',
  },
  done: {
    label: 'Done',
    status: 'done',
  },
  waiting_consent: {
    label: 'Waiting for consent',
    status: 'waiting',
  },
  error: {
    label: 'Unknown status',
    status: 'waiting',
  },
  invalid: {
    label: 'Invalid event',
    status: 'waiting',
  },
}

/** @type {Record<string, { label: string, token: 'live' | 'simulated' | 'local', adapterLabel: string }>} */
const SOURCE_DETAILS = {
  simulated: {
    label: 'Simulated',
    token: 'simulated',
    adapterLabel: 'Local event adapter',
  },
  live: {
    label: 'Live',
    token: 'live',
    adapterLabel: 'Live event adapter',
  },
  local: {
    label: 'Local',
    token: 'local',
    adapterLabel: 'In-browser event adapter',
  },
}

/** @type {Record<string, { label: string, status: 'running' | 'done' | 'waiting' | 'idle' }>} */
const CONNECTION_DETAILS = {
  idle: {
    label: 'Stream idle',
    status: 'idle',
  },
  connecting: {
    label: 'Connecting',
    status: 'running',
  },
  open: {
    label: 'Stream live',
    status: 'done',
  },
  closed: {
    label: 'Stream closed',
    status: 'running',
  },
  error: {
    label: 'Stream error',
    status: 'waiting',
  },
}

function getStatusDetails(status) {
  if (status === 'running') {
    return STATUS_DETAILS.running
  }

  if (status === 'done') {
    return STATUS_DETAILS.done
  }

  if (status === 'waiting_consent') {
    return STATUS_DETAILS.waiting_consent
  }

  if (status === 'invalid') {
    return STATUS_DETAILS.invalid
  }

  return STATUS_DETAILS.error
}

function getSourceDetails(source) {
  if (source === 'live') {
    return SOURCE_DETAILS.live
  }

  if (source === 'local') {
    return SOURCE_DETAILS.local
  }

  return SOURCE_DETAILS.simulated
}

function getConnectionDetails(status) {
  if (
    status === 'connecting' ||
    status === 'open' ||
    status === 'closed' ||
    status === 'error'
  ) {
    return CONNECTION_DETAILS[status]
  }

  return null
}

const TIMELINE_DOT_BASE_CLASS =
  'absolute -left-[3.5px] top-1.5 h-1.5 w-1.5 rounded-full'

function getTimelineDotClass(status) {
  if (status === 'running') {
    return `${TIMELINE_DOT_BASE_CLASS} running-dot bg-gray-400 dark:bg-gray-400`
  }

  if (status === 'done') {
    return `${TIMELINE_DOT_BASE_CLASS} bg-gray-900 dark:bg-white`
  }

  return `${TIMELINE_DOT_BASE_CLASS} border border-gray-300 bg-transparent dark:border-white/30`
}

function readEventSource(event) {
  if (
    event !== null &&
    typeof event === 'object' &&
    typeof event.source === 'string' &&
    event.source
  ) {
    return event.source
  }

  return ''
}

export default function AgentLog(props) {
  const {
    events = EMPTY_EVENTS,
    source = 'simulated',
    status = null,
    lastEventId = 0,
    reconnectAttempts = 0,
    onReconnect = null,
  } = props
  const displayEvents = useMemo(
    () =>
      events.map((event) => {
        const normalizedEvent = normalizeAgentEvent(event, {
          streamId: 'agent-log',
        })

        return {
          ...normalizedEvent,
          source: readEventSource(event),
        }
      }),
    [events],
  )
  const sourceDetails = getSourceDetails(source)
  const connectionDetails = getConnectionDetails(status)
  const validEventCount = displayEvents.filter(
    (event) => event.validation === 'valid',
  ).length
  const invalidEventCount = displayEvents.length - validEventCount
  const showReconnect = typeof onReconnect === 'function'
  const hasResumeCursor =
    typeof lastEventId === 'number' &&
    Number.isFinite(lastEventId) &&
    lastEventId > 0

  return (
    <section aria-labelledby="agent-log-title" aria-busy={status === 'connecting'}>
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-white/10">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
            Demo backbone
          </p>
          <h2 id="agent-log-title" className="mt-1 font-serif text-2xl text-gray-900 dark:text-white">
            Orchestration stream
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connectionDetails ? (
            <Badge
              key="connection"
              status={connectionDetails.status}
              label={connectionDetails.label}
              role="status"
            />
          ) : null}
          <Badge key="source" source={source} />
          {showReconnect ? (
            <Button key="reconnect" variant="ghost" onClick={onReconnect}>
              <span aria-hidden="true">↻</span> Reconnect
            </Button>
          ) : null}
        </div>
      </div>
      <div
        className="max-h-[34rem] min-h-80 overflow-y-auto py-4 text-sm"
        role="log"
        aria-label="Agent activity"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
      >
        {displayEvents.length === 0 ? (
          <p className="px-3 py-16 text-center text-sm text-gray-400">
            Waiting for orchestration events…
          </p>
        ) : (
          <ol className="relative ml-1 border-l border-gray-200 dark:border-white/10">
            {displayEvents.map((event) => {
              const eventStatus = getStatusDetails(event.status)
              const eventSource = getSourceDetails(event.source || source)

              return (
                <li key={event.id} className="relative pb-6 pl-6 last:pb-0">
                  <span aria-hidden="true" className={getTimelineDotClass(eventStatus.status)} />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {event.agent}
                    </p>
                    <time
                      className="shrink-0 text-xs text-gray-400"
                      // The machine-readable value must be the event's own time, not
                      // the moment this browser happened to receive it.
                      dateTime={event.eventTime ?? event.receivedAt}
                      title={event.eventTime ?? event.receivedAt}
                    >
                      {event.timestamp}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    {event.message}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge status={eventStatus.status} label={eventStatus.label} />
                    <Badge
                      source={eventSource.token}
                      role="img"
                      aria-label={`Event source ${eventSource.token}`}
                      title={`Event source ${eventSource.label}`}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 pt-3 text-xs text-gray-400 dark:border-white/10">
        <span>{sourceDetails.adapterLabel}</span>
        <span>
          {validEventCount} valid events
          {invalidEventCount > 0 ? ` · ${invalidEventCount} invalid` : ''}
        </span>
        {hasResumeCursor || reconnectAttempts > 0 ? (
          <span className="w-full sm:w-auto">
            {hasResumeCursor ? `last_event_id=${lastEventId}` : ''}
            {hasResumeCursor && reconnectAttempts > 0 ? ' · ' : ''}
            {reconnectAttempts > 0
              ? `${reconnectAttempts} reconnect attempt${reconnectAttempts === 1 ? '' : 's'}`
              : ''}
          </span>
        ) : null}
      </div>
    </section>
  )
}
