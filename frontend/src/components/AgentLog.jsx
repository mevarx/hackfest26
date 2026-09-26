import { useMemo } from 'react'
import { normalizeAgentEvent } from '../domain/agentEvents.js'
import {
  bodyClass,
  chalkClass,
  labelClass,
  metaRowClass,
  panelEyebrowClass,
  panelTitleClass,
  ruleDarkClass,
  smokeClass,
} from '../styles/classes.js'
import Button from './Button.jsx'
import SourceTag from './SourceTag.jsx'
import StatusLine from './StatusLine.jsx'

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

// The line's three states, and only three: outline is still to come, filled
// Pulse is finished, and a pulsing outline is in flight. The 1.5s breath in
// index.css is the only motion in this panel. The running outline strokes in
// `current` so it takes the muted Smoke it is set beside rather than reading
// as a second filled dot; the amber ring for a blocked row belongs to the
// Status Line below it, and repeating it here would double the one accent
// this screen is allowed.
function getTimelineDotClass(status) {
  if (status === 'running') {
    return `${TIMELINE_DOT_BASE_CLASS} border border-current bg-transparent text-smoke running-dot`
  }

  if (status === 'done') {
    return `${TIMELINE_DOT_BASE_CLASS} bg-pulse`
  }

  return `${TIMELINE_DOT_BASE_CLASS} border border-graphite bg-transparent`
}

// The message is set at 14px — the label size — but at body weight, so the
// agent name can stay 500 and the two read as name-then-sentence rather than
// two headings. The scale has no 14px/400 step, so it is composed here instead
// of inventing a size.
const MESSAGE_CLASS = `font-utility text-label font-normal leading-body ${smokeClass}`

// 11px, one step under the 12px meta token and the size the timeline spec asks
// for. Set outright rather than as an override layered on `metaClass`: two
// font-size utilities in one class list resolve by stylesheet order, not by
// the order they are written here.
const TIMESTAMP_CLASS = `shrink-0 font-mono text-timestamp font-normal tracking-meta ${smokeClass}`

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
      <div
        className={`flex flex-col gap-4 border-b ${ruleDarkClass} pb-4 sm:flex-row sm:items-start sm:justify-between`}
      >
        <div className="min-w-0">
          <p className={panelEyebrowClass}>Demo backbone</p>
          <h2 id="agent-log-title" className={`${panelTitleClass} ${chalkClass}`}>
            Orchestration stream
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connectionDetails ? (
            <StatusLine
              key="connection"
              status={connectionDetails.status}
              label={connectionDetails.label}
              role="status"
            />
          ) : null}
          <SourceTag key="source" source={source} />
          {/* Ghost outline, never filled — the filled primary action already
              lives above this section, and two solids in one viewport is out. */}
          {showReconnect ? (
            <Button key="reconnect" variant="ghost" onClick={onReconnect}>
              Reconnect
            </Button>
          ) : null}
        </div>
      </div>
      <div
        className="max-h-[34rem] min-h-80 overflow-y-auto py-4"
        role="log"
        aria-label="Agent activity"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
      >
        {displayEvents.length === 0 ? (
          <p className={`px-3 py-16 text-center ${bodyClass} ${smokeClass}`}>
            Waiting for orchestration events…
          </p>
        ) : (
          <ol className={`relative ml-1 border-l ${ruleDarkClass}`}>
            {displayEvents.map((event) => {
              const eventStatus = getStatusDetails(event.status)
              const eventSource = getSourceDetails(event.source || source)

              return (
                <li key={event.id} className="relative pb-6 pl-6 last:pb-0">
                  <span aria-hidden="true" className={getTimelineDotClass(eventStatus.status)} />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`${labelClass} ${chalkClass}`}>{event.agent}</p>
                    <time
                      className={TIMESTAMP_CLASS}
                      // The machine-readable value must be the event's own time, not
                      // the moment this browser happened to receive it.
                      dateTime={event.eventTime ?? event.receivedAt}
                      title={event.eventTime ?? event.receivedAt}
                    >
                      {event.timestamp}
                    </time>
                  </div>
                  <p className={`mt-1 ${MESSAGE_CLASS}`}>{event.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusLine status={eventStatus.status} label={eventStatus.label} />
                    <SourceTag
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
      <div className={`border-t ${ruleDarkClass} pt-3 ${metaRowClass}`}>
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
