import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  DEFAULT_BACKEND_BASE_URL,
  describeApiDetail,
  extractSkills,
  getApiBaseUrl,
  getApiBaseUrlSafe,
  getApiUrl,
  getDisplacementRadar,
  getRoute,
  getSession,
  resolveApiBaseUrl,
  rewriteEmployerFilter,
  runGhostTwin,
  runMatch,
  scoreWorkSample,
  startSession,
} from './api.js'

const BASE_URL = 'http://127.0.0.1:8000'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

function fetchCalls() {
  return fetchMock.mock.calls
}

function lastRequest() {
  const [url, init] = fetchCalls().at(-1)

  return { url, init }
}

let fetchMock

function stubFetch(impl) {
  fetchMock = impl
  vi.stubGlobal('fetch', impl)
}

describe('API URL helpers', () => {
  it('keeps relative paths relative when no base is configured', () => {
    expect(getApiUrl('/audit/ghost-twin', '')).toBe('/audit/ghost-twin')
    expect(getApiBaseUrl('')).toBe('')
  })

  it('joins a split-hosting base without duplicate slashes', () => {
    expect(getApiUrl('/audit/ghost-twin', 'https://api.example.test/')).toBe(
      'https://api.example.test/audit/ghost-twin',
    )
    expect(getApiUrl('session', 'https://api.example.test/v1/')).toBe(
      'https://api.example.test/v1/session',
    )
  })

  it('resolves a safe base url and the demo-safe local backend', () => {
    expect(getApiBaseUrlSafe(' https://api.example.test// ')).toBe(
      'https://api.example.test',
    )
    expect(getApiBaseUrlSafe(42)).toBe('')
    expect(resolveApiBaseUrl({ baseUrl: '' })).toBe('')
    expect(resolveApiBaseUrl({ baseUrl: '', demoMode: true })).toBe(
      DEFAULT_BACKEND_BASE_URL,
    )
    expect(
      resolveApiBaseUrl({ baseUrl: 'https://api.example.test', demoMode: true }),
    ).toBe(DEFAULT_BACKEND_BASE_URL)
  })
})

describe('API request helpers', () => {
  beforeEach(() => {
    stubFetch(vi.fn(async () => jsonResponse({ ok: true })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts JSON bodies with the json content type', async () => {
    await startSession(
      { input_type: 'text', content: 'hi', persona: 'Kavya' },
      { baseUrl: BASE_URL },
    )

    expect(lastRequest()).toEqual({
      url: 'http://127.0.0.1:8000/session/start',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input_type: 'text',
          content: 'hi',
          persona: 'Kavya',
        }),
      },
    })

    await extractSkills({ transcript: 'hi' }, { baseUrl: BASE_URL })
    expect(lastRequest().url).toBe('http://127.0.0.1:8000/skills/extract')

    await scoreWorkSample(
      { skill_id: 'manual-testing', submission: 'evidence' },
      { baseUrl: BASE_URL },
    )
    expect(lastRequest().url).toBe('http://127.0.0.1:8000/skills/work-sample')

    await runMatch({ passport_id: 'passport-1' }, { baseUrl: BASE_URL })
    expect(lastRequest().url).toBe('http://127.0.0.1:8000/match')

    await runGhostTwin(
      { role_id: 'quality-analyst' },
      { baseUrl: BASE_URL },
    )
    expect(lastRequest().url).toBe('http://127.0.0.1:8000/audit/ghost-twin')

    await rewriteEmployerFilter('post-chennai-qa-analyst-118', {
      baseUrl: BASE_URL,
    })
    expect(lastRequest()).toEqual({
      url: 'http://127.0.0.1:8000/employer/rewrite-filter',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_post_id: 'post-chennai-qa-analyst-118' }),
      },
    })
  })

  it('builds get requests without a body and encodes query parameters', async () => {
    await getSession('session 42', { baseUrl: BASE_URL })

    expect(lastRequest()).toEqual({
      url: 'http://127.0.0.1:8000/session/session%2042',
      init: { method: 'GET', headers: { Accept: 'application/json' } },
    })

    await getRoute(
      {
        fromSkill: 'Manual testing',
        targetRole: 'quality-analyst',
        hoursPerWeek: 8,
      },
      { baseUrl: BASE_URL },
    )

    expect(lastRequest().url).toBe(
      'http://127.0.0.1:8000/route?from_skill=Manual+testing&target_role=quality-analyst&hours_per_week=8',
    )

    await getDisplacementRadar(
      { role: 'quality-analyst', city: 'Chennai' },
      { baseUrl: BASE_URL },
    )

    expect(lastRequest().url).toBe(
      'http://127.0.0.1:8000/market/displacement-radar?role=quality-analyst&city=Chennai',
    )

    await getDisplacementRadar({ role: 'quality-analyst' })

    expect(lastRequest().url).toBe(
      '/market/displacement-radar?role=quality-analyst',
    )
  })

  it('returns the parsed json payload', async () => {
    stubFetch(vi.fn(async () =>
      jsonResponse({ session_id: 'session-1', source: 'simulated' }),
    ))

    await expect(startSession({}, { baseUrl: BASE_URL })).resolves.toEqual({
      session_id: 'session-1',
      source: 'simulated',
    })
  })

  it('throws a typed ApiError carrying a string detail', async () => {
    stubFetch(vi.fn(async () =>
      jsonResponse({ detail: 'Session not found' }, { ok: false, status: 404 }),
    ))

    const request = getSession('missing', { baseUrl: BASE_URL })

    await expect(request).rejects.toThrowError(ApiError)
    await expect(request).rejects.toThrow('Session not found')

    const error = await request.catch((thrown) => thrown)

    expect(error.status).toBe(404)
    expect(error.detail).toBe('Session not found')
    expect(error.url).toBe('http://127.0.0.1:8000/session/missing')
  })

  it('flattens a fastapi 422 validation array into the message', async () => {
    stubFetch(vi.fn(async () =>
      jsonResponse(
        {
          detail: [
            {
              loc: ['query', 'hours_per_week'],
              msg: 'Input should be less than or equal to 40',
              type: 'less_than_equal',
            },
          ],
        },
        { ok: false, status: 422 },
      ),
    ))

    const request = getRoute(
      { fromSkill: 'a', targetRole: 'b', hoursPerWeek: 90 },
      { baseUrl: BASE_URL },
    )

    await expect(request).rejects.toThrow(
      'query -> hours_per_week: Input should be less than or equal to 40',
    )
    expect(describeApiDetail(undefined, 'fallback')).toBe('fallback')
  })

  it('reports a network failure as an ApiError without a status', async () => {
    stubFetch(vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    const error = await getSession('session-1', { baseUrl: BASE_URL }).catch(
      (thrown) => thrown,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toContain('http://127.0.0.1:8000/session/session-1')
  })
})
