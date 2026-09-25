const SOCKET_OPEN_READY_STATE = 1
const SOCKET_CLOSED_READY_STATE = 3
const NORMAL_CLOSURE_CODE = 1000

function noop() {}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveSequence(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    return /^\d+$/.test(trimmed) && Number(trimmed) > 0
  }

  return false
}

function getSameOriginBaseUrl() {
  const location = globalThis.location

  if (isRecord(location) && typeof location.origin === 'string' && location.origin) {
    return location.origin
  }

  return ''
}

function convertToWebSocketScheme(baseUrl) {
  if (/^wss?:\/\//i.test(baseUrl)) {
    return baseUrl
  }

  if (/^https:\/\//i.test(baseUrl)) {
    return `wss://${baseUrl.slice('https://'.length)}`
  }

  if (/^http:\/\//i.test(baseUrl)) {
    return `ws://${baseUrl.slice('http://'.length)}`
  }

  return baseUrl
}

function toWebSocketBaseUrl(baseUrl) {
  const normalized =
    typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : ''

  return convertToWebSocketScheme(normalized || getSameOriginBaseUrl())
}

function readFrameData(frame) {
  if (typeof frame === 'string') {
    return frame
  }

  if (isRecord(frame) && typeof frame.data === 'string') {
    return frame.data
  }

  return null
}

export function getWebSocketUrl(sessionId, options) {
  const { baseUrl, lastEventId } = options ?? {}
  const resolvedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
  const streamPath = `/session/${encodeURIComponent(resolvedSessionId)}/stream`
  const url = `${toWebSocketBaseUrl(baseUrl)}${streamPath}`

  if (isPositiveSequence(lastEventId)) {
    return `${url}?last_event_id=${Number(lastEventId)}`
  }

  return url
}

function constructSocket(SocketConstructor, url) {
  try {
    return { socket: new SocketConstructor(url), error: null }
  } catch (constructionError) {
    console.warn(
      '[reroute] agent event socket could not be opened',
      constructionError,
    )

    return { socket: null, error: constructionError }
  }
}

export function createSessionSocket(options) {
  const { url, onEvent, onStatus, onPong, WebSocketImpl } = options ?? {}

  if (typeof url !== 'string' || !url) {
    throw new TypeError('createSessionSocket requires a socket url')
  }

  const SocketConstructor = WebSocketImpl ?? globalThis.WebSocket

  if (typeof SocketConstructor !== 'function') {
    throw new TypeError('createSessionSocket requires a WebSocket implementation')
  }

  const reportEvent = typeof onEvent === 'function' ? onEvent : noop
  const reportStatus = typeof onStatus === 'function' ? onStatus : noop
  const reportPong = typeof onPong === 'function' ? onPong : noop
  let closed = false

  function detachHandlers(target) {
    if (!target) {
      return
    }

    target.onopen = null
    target.onmessage = null
    target.onerror = null
    target.onclose = null
  }

  function reportInvalidFrame(reason, frame) {
    console.warn(`[reroute] ignoring unusable agent event frame: ${reason}`, frame)
    reportStatus('invalid')
  }

  function handleFrame(frame) {
    if (closed) {
      return
    }

    const rawData = readFrameData(frame)

    if (rawData === null) {
      reportInvalidFrame('frame is not a JSON text frame', frame)
      return
    }

    let payload

    try {
      payload = JSON.parse(rawData)
    } catch {
      reportInvalidFrame('frame is not valid JSON', rawData)
      return
    }

    if (!isRecord(payload)) {
      reportInvalidFrame('frame is not a JSON object', rawData)
      return
    }

    if (payload.type === 'pong') {
      reportPong(payload)
      return
    }

    reportEvent(payload)
  }

  function handleOpen() {
    if (closed) {
      return
    }

    reportStatus('open')
  }

  function handleError(event) {
    if (closed) {
      return
    }

    reportStatus('error', event)
  }

  function handleClose(event) {
    if (closed) {
      return
    }

    closed = true
    reportStatus('closed', event)
    detachHandlers(socket)
  }

  reportStatus('connecting')

  const construction = constructSocket(SocketConstructor, url)
  let socket = construction.socket

  if (construction.error) {
    reportStatus('error', construction.error)
  } else {
    socket.onopen = handleOpen
    socket.onmessage = handleFrame
    socket.onerror = handleError
    socket.onclose = handleClose
  }

  function send(message = { type: 'ping' }) {
    if (closed || !socket) {
      return false
    }

    if (socket.readyState !== SOCKET_OPEN_READY_STATE) {
      return false
    }

    try {
      socket.send(typeof message === 'string' ? message : JSON.stringify(message))
    } catch (sendError) {
      console.warn('[reroute] agent event socket send failed', sendError)
      reportStatus('error', sendError)
      return false
    }

    return true
  }

  function close(code = NORMAL_CLOSURE_CODE, reason = '') {
    if (closed) {
      return false
    }

    closed = true

    if (!socket) {
      return true
    }

    const openSocket = socket
    detachHandlers(openSocket)

    if (openSocket.readyState === SOCKET_CLOSED_READY_STATE) {
      return true
    }

    try {
      openSocket.close(code, reason)
    } catch (closeError) {
      console.warn('[reroute] agent event socket close failed', closeError)
    }

    return true
  }

  return { send, close }
}
