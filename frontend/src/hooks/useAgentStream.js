import { useEffect, useMemo, useState } from 'react'
import { MOCK_AGENT_EVENTS } from '../data/mockAgentEvents.js'
import {
  createAgentStreamAdapter,
  getAgentStreamSource,
  normalizeAgentEvent,
} from '../domain/agentEvents.js'

const EMPTY_EVENTS = Array.from({ length: 0 })

function createMockSubscription({
  events = MOCK_AGENT_EVENTS,
  intervalMs = 900,
} = {}) {
  return (onEvent) => {
    let eventIndex = 0
    let timerId
    let stopped = false

    const emitNextEvent = () => {
      if (stopped || eventIndex >= events.length) {
        return
      }

      onEvent(events[eventIndex])
      eventIndex += 1

      if (!stopped && eventIndex < events.length) {
        timerId = setTimeout(emitNextEvent, intervalMs)
      }
    }

    timerId = setTimeout(emitNextEvent, 0)

    return () => {
      stopped = true
      clearTimeout(timerId)
    }
  }
}

export function createMockAgentAdapter(options = {}) {
  return createAgentStreamAdapter({
    source: 'simulated',
    subscribe: createMockSubscription(options),
  })
}

const defaultMockAdapter = createMockAgentAdapter()

export function useAgentStream({
  adapter = defaultMockAdapter,
  sessionId = 'demo-session',
} = {}) {
  const source = getAgentStreamSource(adapter)
  const streamId = `${source}:${sessionId}`
  const streamIdentity = useMemo(
    () => ({ adapter, sessionId, streamId }),
    [adapter, sessionId, streamId],
  )
  const [streamState, setStreamState] = useState(() => ({
    streamIdentity,
    events: EMPTY_EVENTS,
  }))
  const stateIsCurrent = streamState.streamIdentity === streamIdentity

  useEffect(() => {
    let active = true
    const unsubscribe = adapter.subscribe((event) => {
      if (!active) {
        return
      }

      setStreamState((currentState) => {
        const normalizedEvent = normalizeAgentEvent(event, {
          streamId,
          receivedAt: Date.now(),
        })

        if (currentState.streamIdentity !== streamIdentity) {
          return {
            streamIdentity,
            events: [normalizedEvent],
          }
        }

        const duplicateExists = currentState.events.some(
          (currentEvent) =>
            currentEvent.deduplicationKey === normalizedEvent.deduplicationKey,
        )

        if (duplicateExists) {
          return currentState
        }

        return {
          ...currentState,
          events: [...currentState.events, normalizedEvent],
        }
      })
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [adapter, sessionId, streamId, streamIdentity])

  return {
    events: stateIsCurrent ? streamState.events : EMPTY_EVENTS,
    source,
  }
}
