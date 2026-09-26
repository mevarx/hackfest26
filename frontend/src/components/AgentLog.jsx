import { useMemo } from 'react'
import { normalizeAgentEvent } from '../domain/agentEvents.js'
import { metaRowClass } from '../styles/classes.js'
import Badge from './Badge.jsx'
import Button from './Button.jsx'
import Card from './Card.jsx'

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
    <Card
      as="section"
      variant="dark"
      eyebrow="Demo backbone"
      title="Orchestration stream"
      titleId="agent-log-title"
      aria-labelledby="agent-log-title"
      aria-busy={status === 'connecting'}
      padding="none"
      actions={
        <>
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
        </>
      }
      footer={
        <div className={`${metaRowClass} justify-between gap-x-4`}>
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
      }
    >
      <div
        className="max-h-[34rem] min-h-80 overflow-y-auto px-3 py-3 font-mono text-sm sm:px-4"
        role="log"
        aria-label="Agent activity"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
      >
        {displayEvents.length === 0 ? (
          <p className="px-3 py-8 text-center text-offwhite/50">
            Waiting for orchestration events…
          </p>
        ) : (
          <ol className="space-y-1">
            {displayEvents.map((event) => {
              const eventStatus = getStatusDetails(event.status)
              const eventSource = getSourceDetails(event.source || source)

              return (
                <li
                  key={event.id}
                  className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 rounded-control border border-transparent px-2 py-3 transition-colors hover:border-rule hover:bg-navy-raised sm:grid-cols-[4rem_minmax(8rem,11rem)_minmax(0,1fr)] sm:items-start"
                >
                  <time
                    className="pt-1 text-xs text-offwhite/40"
                    // The machine-readable value must be the event's own time, not
                    // the moment this browser happened to receive it.
                    dateTime={event.eventTime ?? event.receivedAt}
                    title={event.eventTime ?? event.receivedAt}
                  >
                    {event.timestamp}
                  </time>
                  <div className="min-w-0 sm:pr-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-offwhite">
                      {event.agent}
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
                  </div>
                  <p className="col-start-2 mt-2 leading-6 text-offwhite/70 sm:col-start-3 sm:mt-0 sm:pt-1">
                    {event.message}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Card>
  )
}
