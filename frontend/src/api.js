export const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:8000'

function normalizeApiBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') {
    return ''
  }

  return baseUrl.trim().replace(/\/+$/, '')
}

export function getApiBaseUrl(baseUrl = import.meta.env.VITE_API_BASE_URL) {
  return normalizeApiBaseUrl(baseUrl)
}

export function getApiUrl(path, baseUrl = import.meta.env.VITE_API_BASE_URL) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getApiBaseUrl(baseUrl)}${normalizedPath}`
}

export function getApiBaseUrlSafe(baseUrl) {
  try {
    return getApiBaseUrl(baseUrl)
  } catch {
    return ''
  }
}

export function resolveApiBaseUrl(options) {
  const { baseUrl, demoMode = false } = options ?? {}

  if (demoMode) {
    return DEFAULT_BACKEND_BASE_URL
  }

  return getApiBaseUrlSafe(baseUrl)
}

export class ApiError extends Error {
  constructor(message, options) {
    const { status = 0, detail = null, url = '' } = options ?? {}

    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.url = url
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readDetailMessage(item) {
  if (typeof item === 'string') {
    return item.trim()
  }

  if (!isRecord(item)) {
    return ''
  }

  const message =
    typeof item.msg === 'string'
      ? item.msg
      : typeof item.message === 'string'
        ? item.message
        : ''

  if (!message) {
    return ''
  }

  const location = Array.isArray(item.loc)
    ? item.loc
        .filter((part) => part !== undefined && part !== null)
        .map((part) => String(part))
        .join(' -> ')
    : ''

  return location ? `${location}: ${message}` : message
}

export function describeApiDetail(detail, fallback) {
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }

  if (Array.isArray(detail)) {
    const messages = detail.map(readDetailMessage).filter(Boolean)

    if (messages.length > 0) {
      return messages.join('; ')
    }
  }

  if (isRecord(detail)) {
    return readDetailMessage(detail) || fallback
  }

  return fallback
}

async function readErrorDetail(response) {
  let body

  try {
    body = await response.json()
  } catch {
    return null
  }

  if (isRecord(body) && 'detail' in body) {
    return body.detail
  }

  return body ?? null
}

function buildGetInit(method) {
  return { method, headers: { Accept: 'application/json' } }
}

function buildBodyInit(method, body) {
  return {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}

async function requestJson(path, options) {
  const { method = 'GET', body, baseUrl } = options ?? {}

  const url = getApiUrl(path, baseUrl)
  const requestInit = body === undefined ? buildGetInit(method) : buildBodyInit(method, body)

  let response

  try {
    response = await fetch(url, requestInit)
  } catch {
    throw new ApiError(
      `ReRoute could not reach the backend at ${url || 'the same origin'}.`,
      { status: 0, detail: null, url },
    )
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response)

    throw new ApiError(
      describeApiDetail(detail, `Request to ${url} failed (${response.status}).`),
      { status: response.status, detail, url },
    )
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

function withQuery(path, entries) {
  const query = new URLSearchParams()

  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    query.set(key, String(value))
  }

  const queryString = query.toString()

  return queryString ? `${path}?${queryString}` : path
}

export function startSession(payload, options) {
  const { baseUrl } = options ?? {}

  return requestJson('/session/start', {
    method: 'POST',
    body: payload,
    baseUrl,
  })
}

export function getSession(id, options) {
  const { baseUrl } = options ?? {}

  return requestJson(`/session/${encodeURIComponent(String(id ?? ''))}`, {
    baseUrl,
  })
}

export function extractSkills(payload, options) {
  const { baseUrl } = options ?? {}

  return requestJson('/skills/extract', {
    method: 'POST',
    body: payload,
    baseUrl,
  })
}

export function scoreWorkSample(payload, options) {
  const { baseUrl } = options ?? {}

  return requestJson('/skills/work-sample', {
    method: 'POST',
    body: payload,
    baseUrl,
  })
}

export function getRoute(routeOptions, options) {
  const { fromSkill, targetRole, hoursPerWeek } = routeOptions ?? {}
  const { baseUrl } = options ?? {}

  return requestJson(
    withQuery('/route', [
      ['from_skill', fromSkill],
      ['target_role', targetRole],
      ['hours_per_week', hoursPerWeek],
    ]),
    { baseUrl },
  )
}

export function runMatch(payload, options) {
  const { baseUrl } = options ?? {}

  return requestJson('/match', { method: 'POST', body: payload, baseUrl })
}

export function runGhostTwin(payload, options) {
  const { baseUrl } = options ?? {}

  return requestJson('/audit/ghost-twin', {
    method: 'POST',
    body: payload,
    baseUrl,
  })
}

export function getDisplacementRadar(radarOptions, options) {
  const { role, city } = radarOptions ?? {}
  const { baseUrl } = options ?? {}

  return requestJson(
    withQuery('/market/displacement-radar', [
      ['role', role],
      ['city', city],
    ]),
    { baseUrl },
  )
}

export function rewriteEmployerFilter(jobPostId, options) {
  const { baseUrl } = options ?? {}

  return requestJson('/employer/rewrite-filter', {
    method: 'POST',
    body: { job_post_id: String(jobPostId ?? '') },
    baseUrl,
  })
}
