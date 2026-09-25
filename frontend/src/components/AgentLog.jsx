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
    adapterLabel: 'Local event adapter',
    className: 'border-amber/45 bg-amber/10 text-amber',
    dotClassName: 'bg-amber',
  },
  live: {
    label: 'Live',
    adapterLabel: 'Live event adapter',
    className: 'border-teal/45 bg-teal/10 text-teal',
    dotClassName: 'bg-teal',
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

  return SOURCE_DETAILS.simulated
}

export default function AgentLog({
  events = EMPTY_EVENTS,
  source = 'simulated',
}) {
  const displayEvents = useMemo(
    () =>
      events.map((event) =>
        normalizeAgentEvent(event, { streamId: 'agent-log' }),
      ),
    [events],
  )
  const sourceDetails = getSourceDetails(source)
  const validEventCount = displayEvents.filter(
    (event) => event.validation === 'valid',
  ).length
  const invalidEventCount = displayEvents.length - validEventCount

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/10 bg-navy shadow-2xl shadow-navy/20"
      aria-labelledby="agent-log-title"
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
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${sourceDetails.className}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${sourceDetails.dotClassName}`}
            aria-hidden="true"
          />
          {sourceDetails.label}
        </span>
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
              const status = getStatusDetails(event.status)

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
                    <span
                      className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${status.className}`}
                    >
                      <span aria-hidden="true">{status.symbol}</span>
                      <span>{status.label}</span>
                    </span>
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

      <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-off-white/45 sm:px-6">
        <span>{sourceDetails.adapterLabel}</span>
        <span>
          {validEventCount} valid events
          {invalidEventCount > 0 ? ` · ${invalidEventCount} invalid` : ''}
        </span>
      </div>
    </section>
  )
}
