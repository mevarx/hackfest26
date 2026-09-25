import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionSocket, getWebSocketUrl } from './sessionSocket.js'

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

  emit(rawData) {
    this.onmessage?.({ data: rawData })
  }

  emitText(text) {
    this.onmessage?.(text)
  }

  fail(event = { type: 'error' }) {
    this.onerror?.(event)
  }

  remoteClose(event = { code: 1006, wasClean: false }) {
    this.readyState = 3
    this.onclose?.(event)
  }
}

function createHarness(overrides = {}) {
  const onEvent = vi.fn()
  const onStatus = vi.fn()
  const onPong = vi.fn()
  const handle = createSessionSocket({
    url: 'ws://api.example.test/session/demo/stream',
    onEvent,
    onStatus,
    onPong,
    WebSocketImpl: FakeWebSocket,
    ...overrides,
  })

  return {
    handle,
    onEvent,
    onStatus,
    onPong,
    get socket() {
      return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
    },
  }
}

describe('getWebSocketUrl', () => {
  it('builds a same-origin socket url when no base url is configured', () => {
    expect(getWebSocketUrl('session-42')).toBe(
      `${globalThis.location.origin.replace(/^http/, 'ws')}/session/session-42/stream`,
    )
    expect(getWebSocketUrl('session-42', { baseUrl: '' })).toBe(
      `${globalThis.location.origin.replace(/^http/, 'ws')}/session/session-42/stream`,
    )
  })

  it('converts http to ws and https to wss without duplicating slashes', () => {
    expect(getWebSocketUrl('abc', { baseUrl: 'http://127.0.0.1:8000' })).toBe(
      'ws://127.0.0.1:8000/session/abc/stream',
    )
    expect(
      getWebSocketUrl('abc', { baseUrl: 'https://api.example.test/' }),
    ).toBe('wss://api.example.test/session/abc/stream')
    expect(
      getWebSocketUrl('abc', { baseUrl: 'https://api.example.test///' }),
    ).toBe('wss://api.example.test/session/abc/stream')
    expect(
      getWebSocketUrl('abc', { baseUrl: 'wss://api.example.test' }),
    ).toBe('wss://api.example.test/session/abc/stream')
  })

  it('only appends last_event_id for a positive integer sequence', () => {
    expect(getWebSocketUrl('abc', { baseUrl: 'http://a.test', lastEventId: 7 })).toBe(
      'ws://a.test/session/abc/stream?last_event_id=7',
    )
    expect(getWebSocketUrl('abc', { baseUrl: 'http://a.test', lastEventId: 0 })).toBe(
      'ws://a.test/session/abc/stream',
    )
    expect(getWebSocketUrl('abc', { baseUrl: 'http://a.test', lastEventId: -3 })).toBe(
      'ws://a.test/session/abc/stream',
    )
    expect(
      getWebSocketUrl('abc', { baseUrl: 'http://a.test', lastEventId: 1.5 }),
    ).toBe('ws://a.test/session/abc/stream')
    expect(
      getWebSocketUrl('abc', { baseUrl: 'http://a.test', lastEventId: undefined }),
    ).toBe('ws://a.test/session/abc/stream')
    expect(getWebSocketUrl('abc', { baseUrl: 'http://a.test' })).toBe(
      'ws://a.test/session/abc/stream',
    )
  })

  it('escapes the session id so it cannot break the path', () => {
    expect(
      getWebSocketUrl('weird id/../x', { baseUrl: 'http://a.test' }),
    ).toBe('ws://a.test/session/weird%20id%2F..%2Fx/stream')
  })
})

describe('createSessionSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports the lifecycle and routes parsed text frames to onEvent', () => {
    const harness = createHarness()
    const payload = {
      agent: 'ORCHESTRATOR',
      status: 'running',
      message: 'Session started',
      sequence: 1,
    }

    expect(harness.onStatus).toHaveBeenCalledWith('connecting')
    expect(harness.socket.url).toBe('ws://api.example.test/session/demo/stream')

    harness.socket.open()

    expect(harness.onStatus).toHaveBeenLastCalledWith('open')

    harness.socket.emit(JSON.stringify(payload))

    expect(harness.onEvent).toHaveBeenCalledWith(payload)
    expect(harness.onStatus).not.toHaveBeenCalledWith('invalid')
  })

  it('routes pong control frames to onPong and never to onEvent', () => {
    const harness = createHarness()

    harness.socket.open()
    harness.socket.emit('{"type":"pong"}')

    expect(harness.onPong).toHaveBeenCalledWith({ type: 'pong' })
    expect(harness.onEvent).not.toHaveBeenCalled()
  })

  it('surfaces malformed frames through onStatus without throwing', () => {
    const harness = createHarness()

    harness.socket.open()
    harness.socket.emitText('not-json')

    expect(() => harness.socket.emit('[1, 2, 3]')).not.toThrow()
    harness.socket.emit('null')
    harness.socket.emit('{"type":"pong"}')

    expect(harness.onEvent).not.toHaveBeenCalled()
    expect(harness.onPong).toHaveBeenCalledTimes(1)
    expect(
      harness.onStatus.mock.calls.filter(([status]) => status === 'invalid'),
    ).toHaveLength(3)
    expect(console.warn).toHaveBeenCalled()
  })

  it('reports close and error statuses with the originating event', () => {
    const harness = createHarness()

    harness.socket.open()
    harness.socket.fail()
    harness.socket.remoteClose({ code: 4404, wasClean: false })

    expect(harness.onStatus).toHaveBeenCalledWith('error', { type: 'error' })
    expect(harness.onStatus).toHaveBeenLastCalledWith('closed', {
      code: 4404,
      wasClean: false,
    })
  })

  it('guards send on readyState and defaults to a ping frame', () => {
    const harness = createHarness()

    expect(harness.handle.send()).toBe(false)
    expect(harness.socket.sentPayloads).toEqual([])

    harness.socket.open()

    expect(harness.handle.send()).toBe(true)
    expect(harness.handle.send({ type: 'ping' })).toBe(true)
    expect(harness.socket.sentPayloads).toEqual([
      '{"type":"ping"}',
      '{"type":"ping"}',
    ])

    harness.socket.remoteClose()

    expect(harness.handle.send()).toBe(false)
  })

  it('closes cleanly once and stops reporting late frames', () => {
    const harness = createHarness()

    harness.socket.open()
    harness.onStatus.mockClear()

    expect(harness.handle.close()).toBe(true)
    expect(harness.handle.close()).toBe(false)
    expect(harness.socket.closeCalls).toEqual([{ code: 1000, reason: '' }])
    expect(harness.onStatus).not.toHaveBeenCalled()

    expect(() => harness.socket.emit('{"agent":"ORCHESTRATOR"}')).not.toThrow()
    expect(harness.onEvent).not.toHaveBeenCalled()
    expect(harness.handle.send()).toBe(false)
  })

  it('rejects a missing url and reports a constructor failure as an error', () => {
    expect(() => createSessionSocket({ url: '' })).toThrow(TypeError)

    const onStatus = vi.fn()
    const BrokenWebSocket = function BrokenWebSocket() {
      throw new Error('blocked')
    }

    const handle = createSessionSocket({
      url: 'ws://api.example.test/session/demo/stream',
      onStatus,
      WebSocketImpl: BrokenWebSocket,
    })

    expect(onStatus).toHaveBeenNthCalledWith(1, 'connecting')
    expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(Error))
    expect(handle.send()).toBe(false)
    expect(handle.close()).toBe(true)
  })
})
