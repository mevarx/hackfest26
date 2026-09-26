import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeAgentEvent } from '../domain/agentEvents.js'
import { isRecord } from '../lib/guards.js'
import { createSessionSocket, getWebSocketUrl } from '../lib/sessionSocket.js'

const logger = console


export const RECONNECT_BASE_DELAY_MS = 500
export const RECONNECT_MAX_DELAY_MS = 8000
export const SESSION_NOT_FOUND_CLOSE_CODE = 4404
const RECONNECT_JITTER_RATIO = 0.4
/**
 * A TCP connection that is black-holed (server down behind a firewall) fires
 * neither `onopen` nor `onerror` nor `onclose`, so without a deadline the stream
 * would sit in `connecting` forever and never retry.
 */
const CONNECT_TIMEOUT_MS = 10_000

const IDLE_STATUS = 'idle'
const CONNECTING_STATUS = 'connecting'
const OPEN_STATUS = 'open'
const CLOSED_STATUS = 'closed'
const ERROR_STATUS = 'error'
const EMPTY_EVENTS = Array.from({ length: 0 })
const NOOP_SOCKET_HANDLE = {
  send: (_message) => false,
  close: (_code, _reason) => false,
}

function isSessionNotFound(event) {
  return isRecord(event) && event.code === SESSION_NOT_FOUND_CLOSE_CODE
}

function readEventSource(event) {
  if (isRecord(event) && typeof event.source === 'string' && event.source) {
    return event.source
  }

  return ''
}

function createStreamState(connectionKey, sessionId, status) {
  return {
    connectionKey,
    sessionId,
    events: EMPTY_EVENTS,
    lastEventId: 0,
    status,
    reconnectAttempts: 0,
  }
}

export function deriveEventSource(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return 'local'
  }

  const seenSources = new Set()

  for (const event of events) {
    const eventSource = readEventSource(event)

    if (eventSource) {
      seenSources.add(eventSource)
    }
  }

  if (seenSources.size === 0) {
    return 'local'
  }

  if (seenSources.has('live')) {
    return 'live'
  }

  if (seenSources.size === 1 && seenSources.has('simulated')) {
    return 'simulated'
  }

  return 'local'
}

/**
 * Exponential backoff for reconnect attempts, with jitter.
 *
 * The jitter matters: without it every open tab (and every laptop running the
 * demo) reconnects in lockstep, which is a textbook thundering herd against the
 * backend. The spread is proportional to the delay, capped so the backoff curve
 * is preserved.
 */
export function getReconnectDelay(attempts, random = Math.random) {
  const step = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0
  const base = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** step,
    RECONNECT_MAX_DELAY_MS,
  )
  const spread = base * RECONNECT_JITTER_RATIO

  return Math.round(base - spread / 2 + random() * spread)
}

export function useSessionStream(options) {
  const { sessionId = '', enabled = true, baseUrl } = options ?? {}
  const resolvedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
  const shouldConnect = enabled !== false && resolvedSessionId !== ''
  const [reconnectToken, setReconnectToken] = useState(0)
  const connectionKey = `${resolvedSessionId}|${shouldConnect ? 'on' : 'off'}|${reconnectToken}`
  const [streamState, setStreamState] = useState(() =>
    createStreamState(
      connectionKey,
      resolvedSessionId,
      shouldConnect ? CONNECTING_STATUS : IDLE_STATUS,
    ),
  )
  const socketHandleRef = useRef(NOOP_SOCKET_HANDLE)

  const sendPing = useCallback(() => {
    const socketHandle = socketHandleRef.current

    if (socketHandle === NOOP_SOCKET_HANDLE) {
      return false
    }

    return socketHandle.send({ type: 'ping' })
  }, [])

  const reconnectNow = useCallback(() => {
    setReconnectToken((token) => token + 1)
  }, [])

  useEffect(() => {
    if (!shouldConnect) {
      socketHandleRef.current = NOOP_SOCKET_HANDLE
      return undefined
    }

    const streamId = `session:${resolvedSessionId}`
    const seenEventKeys = new Set()
    let disposed = false
    let attempts = 0
    let events = EMPTY_EVENTS
    let lastEventId = 0
    let reconnectTimer = 0
    let connectTimer = 0
    let socketHandle = NOOP_SOCKET_HANDLE

    function publish(nextStatus) {
      if (disposed) {
        return
      }

      setStreamState((currentState) => {
        const isUnchanged =
          currentState.connectionKey === connectionKey &&
          currentState.status === nextStatus &&
          currentState.events === events &&
          currentState.lastEventId === lastEventId &&
          currentState.reconnectAttempts === attempts

        if (isUnchanged) {
          return currentState
        }

        return {
          connectionKey,
          sessionId: resolvedSessionId,
          events,
          lastEventId,
          status: nextStatus,
          reconnectAttempts: attempts,
        }
      })
    }

    function handleEvent(rawEvent) {
      if (disposed) {
        return
      }

      const normalizedEvent = normalizeAgentEvent(rawEvent, {
        streamId,
        receivedAt: Date.now(),
      })

      if (seenEventKeys.has(normalizedEvent.deduplicationKey)) {
        return
      }

      seenEventKeys.add(normalizedEvent.deduplicationKey)

      const sequence = normalizedEvent.sequence

      if (
        typeof sequence === 'number' &&
        Number.isFinite(sequence) &&
        sequence > lastEventId
      ) {
        lastEventId = sequence
      }

      events = [
        ...events,
        { ...normalizedEvent, source: readEventSource(rawEvent) },
      ]
      publish(OPEN_STATUS)
    }

    function scheduleReconnect() {
      if (disposed) {
        return
      }

      const delay = getReconnectDelay(attempts)
      attempts += 1
      publish(CLOSED_STATUS)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = 0
        publish(CONNECTING_STATUS)
        connect()
      }, delay)
    }

    function handleStatus(nextStatus, event) {
      if (disposed) {
        return
      }

      if (nextStatus === OPEN_STATUS) {
        attempts = 0
        clearConnectTimeout()
        publish(OPEN_STATUS)
        return
      }

      if (nextStatus === ERROR_STATUS) {
        // A session the server does not have will never appear, so this is the
        // one genuinely terminal case. Every other error -- a failed
        // constructor, an `onerror` with no `onclose` -- is transient and must
        // retry, otherwise the stream dies permanently on a transient blip.
        if (isSessionNotFound(event)) {
          clearConnectTimeout()
          publish(ERROR_STATUS)
          return
        }

        scheduleReconnect()
        return
      }

      if (nextStatus !== CLOSED_STATUS) {
        return
      }

      if (isSessionNotFound(event)) {
        clearConnectTimeout()
        publish(ERROR_STATUS)
        return
      }

      scheduleReconnect()
    }

    function clearConnectTimeout() {
      if (connectTimer) {
        clearTimeout(connectTimer)
        connectTimer = 0
      }
    }

    function connect() {
      if (disposed) {
        return
      }

      const url = getWebSocketUrl(resolvedSessionId, {
        baseUrl,
        lastEventId,
      })

      socketHandle = createSessionSocket({
        url,
        onEvent: handleEvent,
        onStatus: handleStatus,
      })
      socketHandleRef.current = socketHandle

      clearConnectTimeout()
      connectTimer = setTimeout(() => {
        connectTimer = 0

        if (disposed || socketHandleRef.current !== socketHandle) {
          return
        }

        logger.debug('session stream connect timed out; scheduling a reconnect')
        socketHandle.close()
        scheduleReconnect()
      }, CONNECT_TIMEOUT_MS)
    }

    connect()

    return () => {
      disposed = true

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = 0
      }

      clearConnectTimeout()

      if (socketHandleRef.current === socketHandle) {
        socketHandleRef.current = NOOP_SOCKET_HANDLE
      }

      socketHandle.close()
    }
  }, [connectionKey, resolvedSessionId, shouldConnect, baseUrl])

  const stateIsCurrent = streamState.connectionKey === connectionKey
  const events = stateIsCurrent ? streamState.events : EMPTY_EVENTS
  const status = stateIsCurrent
    ? streamState.status
    : shouldConnect
      ? CONNECTING_STATUS
      : IDLE_STATUS
  const lastEventId = stateIsCurrent ? streamState.lastEventId : 0
  const reconnectAttempts = stateIsCurrent ? streamState.reconnectAttempts : 0

  return {
    events,
    status,
    lastEventId,
    reconnectAttempts,
    source: deriveEventSource(events),
    sessionId: resolvedSessionId,
    sendPing,
    reconnectNow,
  }
}

