import { useMemo } from 'react'
import { normalizeAgentEvent } from '../domain/agentEvents.js'

const EMPTY_EVENTS = Array.from({ length: 0 })

const STATUS_DETAILS = {
  running: {
    label: 'Running',
    symbol: '↻',
    className: 'border-amber/40 bg-amber/10 text-amber',
  },
  done: {
    label: 'Done',
    symbol: '✓',
    className: 'border-teal/40 bg-teal/10 text-teal',
  },
  waiting_consent: {
    label: 'Waiting for consent',
    symbol: '◇',
    className: 'border-red/50 bg-red/10 text-red-300',
  },
  error: {
    label: 'Unknown status',
    symbol: '!',
    className: 'border-red/50 bg-red/10 text-red-300',
  },
  invalid: {
    label: 'Invalid event',
    symbol: '×',
    className: 'border-red/50 bg-red/10 text-red-300',
  },
}

const SOURCE_DETAILS = {
  simulated: {
    label: 'Simulated',
    token: 'simulated',
    code: 'SIM',
    symbol: '◐',
    adapterLabel: 'Local event adapter',
    className: 'border-amber/45 bg-amber/10 text-amber',
    dotClassName: 'bg-amber',
  },
  live: {
    label: 'Live',
    token: 'live',
    code: 'LIVE',
    symbol: '◉',
    adapterLabel: 'Live event adapter',
    className: 'border-teal/45 bg-teal/10 text-teal',
    dotClassName: 'bg-teal',
  },
  local: {
    label: 'Local',
    token: 'local',
    code: 'LOCAL',
    symbol: '○',
    adapterLabel: 'In-browser event adapter',
    className: 'border-dashed border-red/55 bg-red/10 text-red-300',
    dotClassName: 'bg-red',
  },
}

const CONNECTION_DETAILS = {
  idle: {
    label: 'Stream idle',
    className: 'border-white/20 bg-white/5 text-off-white/55',
    dotClassName: 'bg-white/30',
  },
  connecting: {
    label: 'Connecting',
    className: 'border-amber/40 bg-amber/10 text-amber',
    dotClassName: 'bg-amber',
  },
  open: {
    label: 'Stream live',
    className: 'border-teal/45 bg-teal/10 text-teal',
    dotClassName: 'bg-teal',
  },
  closed: {
    label: 'Stream closed',
    className: 'border-amber/40 bg-amber/10 text-amber',
    dotClassName: 'bg-amber',
  },
  error: {
    label: 'Stream error',
    className: 'border-red/50 bg-red/10 text-red-300',
    dotClassName: 'bg-red',
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
    <section
      className="overflow-hidden rounded-2xl border border-white/10 bg-navy shadow-2xl shadow-navy/20"
      aria-labelledby="agent-log-title"
      aria-busy={status === 'connecting'}
    >
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">
            Demo backbone
          </p>
          <h2
            id="agent-log-title"
            className="mt-1 font-serif text-2xl text-off-white"
          >
            Orchestration stream
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connectionDetails ? (
            <span
              role="status"
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${connectionDetails.className}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${connectionDetails.dotClassName}`}
                aria-hidden="true"
              />
              {connectionDetails.label}
            </span>
          ) : null}
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${sourceDetails.className}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${sourceDetails.dotClassName}`}
              aria-hidden="true"
            />
            {sourceDetails.label}
          </span>
          {showReconnect ? (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-off-white/80 transition-colors hover:border-amber/50 hover:text-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              <span aria-hidden="true">↻</span>
              Reconnect
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="max-h-[34rem] min-h-80 overflow-y-auto px-3 py-3 font-mono text-sm sm:px-4"
        role="log"
        aria-label="Agent activity"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
      >
        {displayEvents.length === 0 ? (
          <p className="px-3 py-8 text-center text-off-white/50">
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
                  className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 rounded-lg border border-transparent px-2 py-3 transition-colors hover:border-white/10 hover:bg-white/[0.04] sm:grid-cols-[4rem_minmax(8rem,11rem)_minmax(0,1fr)] sm:items-start"
                >
                  <time
                    className="pt-1 text-xs text-off-white/45"
                    dateTime={event.receivedAt}
                  >
                    {event.timestamp}
                  </time>
                  <div className="min-w-0 sm:pr-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-off-white/90">
                      {event.agent}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${eventStatus.className}`}
                      >
                        <span aria-hidden="true">{eventStatus.symbol}</span>
                        <span>{eventStatus.label}</span>
                      </span>
                      <span
                        role="img"
                        aria-label={`Event source ${eventSource.token}`}
                        title={`Event source ${eventSource.label}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] ${eventSource.className}`}
                      >
                        <span aria-hidden="true">{eventSource.symbol}</span>
                        <span>{eventSource.code}</span>
                      </span>
                    </div>
                  </div>
                  <p className="col-start-2 mt-2 leading-6 text-off-white/75 sm:col-start-3 sm:mt-0 sm:pt-1">
                    {event.message}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/10 px-5 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-off-white/45 sm:px-6">
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
