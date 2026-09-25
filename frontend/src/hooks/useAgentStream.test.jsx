import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOCK_AGENT_EVENTS } from '../data/mockAgentEvents.js'
import { createAgentStreamAdapter } from '../domain/agentEvents.js'
import {
  createMockAgentAdapter,
  useAgentStream,
} from './useAgentStream.js'

const AGENT_EVENT = {
  agent: 'ORCHESTRATOR',
  status: 'running',
  message: 'Session started',
}

describe('useAgentStream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits mock events incrementally in deterministic order', () => {
    const receivedEvents = []
    const expectedEvents = MOCK_AGENT_EVENTS.slice(0, 3)
    const adapter = createMockAgentAdapter({
      events: expectedEvents,
      intervalMs: 500,
    })
    const unsubscribe = adapter.subscribe((event) => receivedEvents.push(event))

    vi.advanceTimersByTime(0)
    expect(receivedEvents).toEqual([expectedEvents[0]])

    vi.advanceTimersByTime(499)
    expect(receivedEvents).toHaveLength(1)

    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(500)
    expect(receivedEvents).toEqual(expectedEvents)

    unsubscribe()
    vi.advanceTimersByTime(2000)
    expect(receivedEvents).toEqual(expectedEvents)
  })

  it('normalizes missing timestamps and retains event data and identity', () => {
    vi.setSystemTime(new Date('2026-09-25T12:34:56.000Z'))
    const data = { score: 91, evidence: ['sample-1'] }
    const adapter = createAgentStreamAdapter({
      source: 'live',
      subscribe: (onEvent) => {
        onEvent({
          ...AGENT_EVENT,
          event_id: 'event-42',
          sequence: 7,
          data,
        })
        return vi.fn()
      },
    })
    const { result } = renderHook(() =>
      useAgentStream({ adapter, sessionId: 'session-live' }),
    )
    const [event] = result.current.events

    expect(result.current.source).toBe('live')
    expect(event.timestamp).toBe('12:34:56')
    expect(event.receivedAt).toBe('2026-09-25T12:34:56.000Z')
    expect(event.data).toBe(data)
    expect(event.eventId).toBe('event-42')
    expect(event.sequence).toBe(7)
    expect(event.id).toBe('live:session-live:event_id:event-42')
    expect(event.validation).toBe('valid')
  })

  it('deduplicates events by event_id or sequence when available', () => {
    const adapter = createAgentStreamAdapter({
      source: 'live',
      subscribe: (onEvent) => {
        onEvent({ ...AGENT_EVENT, event_id: 'duplicate' })
        onEvent({ ...AGENT_EVENT, event_id: 'duplicate' })
        onEvent({ ...AGENT_EVENT, sequence: 3 })
        onEvent({ ...AGENT_EVENT, sequence: 3 })
        onEvent({ ...AGENT_EVENT, sequence: 4 })
        return vi.fn()
      },
    })
    const { result } = renderHook(() =>
      useAgentStream({ adapter, sessionId: 'dedupe-session' }),
    )

    expect(result.current.events.map((event) => event.id)).toEqual([
      'live:dedupe-session:event_id:duplicate',
      'live:dedupe-session:sequence:3',
      'live:dedupe-session:sequence:4',
    ])
  })

  it('resets events when source, adapter, or session changes', () => {
    const firstCallbacks = []
    const secondCallbacks = []
    const firstAdapter = createAgentStreamAdapter({
      source: 'simulated',
      subscribe: (onEvent) => {
        firstCallbacks.push(onEvent)
        return vi.fn()
      },
    })
    const secondAdapter = createAgentStreamAdapter({
      source: 'live',
      subscribe: (onEvent) => {
        secondCallbacks.push(onEvent)
        return vi.fn()
      },
    })
    const { result, rerender } = renderHook(
      ({ adapter, sessionId }) => useAgentStream({ adapter, sessionId }),
      {
        initialProps: {
          adapter: firstAdapter,
          sessionId: 'session-a',
        },
      },
    )

    act(() => {
      firstCallbacks[0]({ ...AGENT_EVENT, event_id: 'first' })
    })
    expect(result.current.events).toHaveLength(1)

    rerender({ adapter: secondAdapter, sessionId: 'session-b' })
    expect(result.current.events).toEqual([])
    expect(result.current.source).toBe('live')

    act(() => {
      firstCallbacks[0]({ ...AGENT_EVENT, event_id: 'stale' })
      secondCallbacks[0]({ ...AGENT_EVENT, event_id: 'second' })
    })
    expect(result.current.events.map((event) => event.eventId)).toEqual([
      'second',
    ])

    rerender({ adapter: secondAdapter, sessionId: 'session-c' })
    expect(result.current.events).toEqual([])

    act(() => {
      secondCallbacks[1]({ ...AGENT_EVENT, event_id: 'third' })
    })
    expect(result.current.events[0].id).toBe(
      'live:session-c:event_id:third',
    )
  })

  it('unsubscribes from the stream adapter on unmount', () => {
    const unsubscribe = vi.fn()
    const adapter = createAgentStreamAdapter({
      source: 'simulated',
      subscribe: vi.fn(() => unsubscribe),
    })
    const { unmount } = renderHook(() => useAgentStream({ adapter }))

    expect(adapter.subscribe).toHaveBeenCalledOnce()

    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
