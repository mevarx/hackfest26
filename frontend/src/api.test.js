import { describe, expect, it } from 'vitest'
import { getApiBaseUrl, getApiUrl } from './api.js'

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
})
