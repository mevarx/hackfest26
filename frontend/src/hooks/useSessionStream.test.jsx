import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deriveEventSource,
  getReconnectDelay,
  RECONNECT_MAX_DELAY_MS,
  useSessionStream,
} from './useSessionStream.js'

const BASE_URL = 'http://127.0.0.1:8000'

class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sentPayloads = []
    this.closeCalls = []
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.onclose = null
    FakeWebSocket.instances.push(this)
  }

  send(payload) {
    this.sentPayloads.push(payload)
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason })
    this.readyState = 3
  }

  open() {
    this.readyState = 1
    this.onopen?.()
  }

  emit(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  remoteClose(event = { code: 1006, wasClean: false }) {
    this.readyState = 3
    this.onclose?.(event)
  }
}

function agentEvent(overrides = {}) {
  return {
    agent: 'ORCHESTRATOR',
    status: 'running',
    message: 'Session started',
    source: 'live',
    sequence: 1,
    event_id: 'demo:event:1',
    timestamp: '00:00',
    ...overrides,
  }
}

function renderStream(properties = {}) {
  return renderHook(() =>
    useSessionStream({ sessionId: 'demo-session', baseUrl: BASE_URL, ...properties }),
  )
}

describe('deriveEventSource', () => {
  it('prefers live, then simulated, and falls back to local', () => {
    expect(deriveEventSource([])).toBe('local')
    expect(deriveEventSource([{ source: 'simulated' }])).toBe('simulated')
    expect(deriveEventSource([{ source: 'live' }])).toBe('live')
    expect(
      deriveEventSource([{ source: 'simulated' }, { source: 'live' }]),
    ).toBe('live')
    expect(
      deriveEventSource([{ source: 'simulated' }, { source: 'local' }]),
    ).toBe('local')
    expect(deriveEventSource([{ source: '' }, {}])).toBe('local')
  })
})

describe('getReconnectDelay', () => {
  it('backs off exponentially up to the cap', () => {
    expect(getReconnectDelay(0)).toBe(500)
    expect(getReconnectDelay(1)).toBe(1000)
    expect(getReconnectDelay(2)).toBe(2000)
    expect(getReconnectDelay(3)).toBe(4000)
    expect(getReconnectDelay(4)).toBe(RECONNECT_MAX_DELAY_MS)
    expect(getReconnectDelay(12)).toBe(RECONNECT_MAX_DELAY_MS)
  })
})

describe('useSessionStream', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('accumulates events in order, deduplicates them, and tracks the max sequence', () => {
    const { result } = renderStream()

    expect(result.current.status).toBe('connecting')
    expect(FakeWebSocket.instances[0].url).toBe(
      'ws://127.0.0.1:8000/session/demo-session/stream',
    )

    const socket = FakeWebSocket.instances[0]

    act(() => {
      socket.open()
    })

    expect(result.current.status).toBe('open')

    act(() => {
      socket.emit(agentEvent())
      socket.emit(agentEvent())
      socket.emit(
        agentEvent({
          event_id: 'demo:event:5',
          sequence: 5,
          agent: 'SKILLS DISCOVERY',
          status: 'done',
          message: '3 skill claims extracted',
        }),
      )
    })

    expect(result.current.events.map((event) => event.agent)).toEqual([
      'ORCHESTRATOR',
      'SKILLS DISCOVERY',
    ])
    expect(result.current.events[0].id).toBe(
      'session:demo-session:event_id:demo:event:1',
    )
    expect(result.current.lastEventId).toBe(5)
    expect(result.current.source).toBe('live')
  })

  it('reconnects with backoff and resumes from the highest sequence seen', () => {
    const { result } = renderStream()
    const socket = FakeWebSocket.instances[0]

    act(() => {
      socket.open()
      socket.emit(agentEvent())
    })

    act(() => {
      socket.remoteClose({ code: 1006, wasClean: false })
    })

    expect(result.current.status).toBe('closed')
    expect(result.current.reconnectAttempts).toBe(1)
    expect(FakeWebSocket.instances).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(499)
    })

    expect(FakeWebSocket.instances).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(FakeWebSocket.instances[1].url).toBe(
      'ws://127.0.0.1:8000/session/demo-session/stream?last_event_id=1',
    )
    expect(result.current.status).toBe('connecting')
    expect(result.current.reconnectAttempts).toBe(1)

    act(() => {
      FakeWebSocket.instances[1].open()
    })

    expect(result.current.status).toBe('open')
    expect(result.current.reconnectAttempts).toBe(0)

    act(() => {
      FakeWebSocket.instances[1].remoteClose({ code: 1006, wasClean: false })
    })

    act(() => {
      vi.advanceTimersByTime(499)
    })

    expect(FakeWebSocket.instances).toHaveLength(2)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(FakeWebSocket.instances).toHaveLength(3)
    expect(FakeWebSocket.instances[2].url).toBe(
      'ws://127.0.0.1:8000/session/demo-session/stream?last_event_id=1',
    )
  })

  it('reports a missing session as an error without retrying', () => {
    const { result } = renderStream()
    const socket = FakeWebSocket.instances[0]

    act(() => {
      socket.open()
      socket.remoteClose({ code: 4404, wasClean: false })
    })

    expect(result.current.status).toBe('error')

    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('closes the previous socket when the session changes', () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionStream({ sessionId, baseUrl: BASE_URL }),
      { initialProps: { sessionId: 'session-a' } },
    )
    const firstSocket = FakeWebSocket.instances[0]

    act(() => {
      firstSocket.open()
      firstSocket.emit(agentEvent())
    })

    expect(result.current.events).toHaveLength(1)

    rerender({ sessionId: 'session-b' })

    expect(firstSocket.closeCalls).toHaveLength(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(FakeWebSocket.instances[1].url).toBe(
      'ws://127.0.0.1:8000/session/session-b/stream',
    )
    expect(result.current.events).toEqual([])
    expect(result.current.lastEventId).toBe(0)

    act(() => {
      firstSocket.emit(agentEvent({ event_id: 'stale' }))
    })

    expect(result.current.events).toEqual([])
  })

  it('closes the socket on unmount and ignores late frames', () => {
    const { result, unmount } = renderStream()
    const socket = FakeWebSocket.instances[0]

    act(() => {
      socket.open()
    })

    unmount()

    expect(socket.closeCalls).toEqual([{ code: 1000, reason: '' }])
    expect(socket.onmessage).toBeNull()

    expect(() => {
      act(() => {
        socket.emit(agentEvent({ event_id: 'after-unmount' }))
      })
    }).not.toThrow()

    expect(result.current.events).toEqual([])
  })

  it('stays idle without opening a socket when disabled or without a session', () => {
    const disabled = renderStream({ enabled: false })

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(disabled.result.current.status).toBe('idle')
    expect(disabled.result.current.events).toEqual([])

    disabled.unmount()

    const withoutSession = renderStream({ sessionId: '  ' })

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(withoutSession.result.current.status).toBe('idle')
  })

  it('sends a ping on an open socket and reopens on demand', () => {
    const { result } = renderStream()
    const socket = FakeWebSocket.instances[0]

    expect(result.current.sendPing()).toBe(false)

    act(() => {
      socket.open()
    })

    act(() => {
      result.current.sendPing()
    })

    expect(socket.sentPayloads).toEqual(['{"type":"ping"}'])

    act(() => {
      result.current.reconnectNow()
    })

    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(socket.closeCalls).toHaveLength(1)
    expect(result.current.status).toBe('connecting')
    expect(result.current.events).toEqual([])
  })
})
