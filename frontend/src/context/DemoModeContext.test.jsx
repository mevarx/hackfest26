import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEMO_MODE_STORAGE_KEY,
  DemoModeProvider,
  useApiBaseUrl,
  useDemoMode,
} from './DemoModeContext.jsx'

function renderDemoModeHook(properties = {}) {
  return renderHook(() => useDemoMode(), {
    wrapper: ({ children }) => (
      <DemoModeProvider {...properties}>{children}</DemoModeProvider>
    ),
  })
}

describe('DemoModeContext', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.localStorage.clear()
  })

  it('defaults to demo mode and the local backend', () => {
    const { result } = renderDemoModeHook()

    expect(result.current.demoMode).toBe(true)
    expect(result.current.isDemo).toBe(true)
    expect(result.current.backendBaseUrl).toBe('http://127.0.0.1:8000')
  })

  it('exposes the configured base url when demo mode is off', () => {
    const { result } = renderDemoModeHook({
      initialDemoMode: false,
      baseUrl: 'https://api.example.test/',
    })

    expect(result.current.demoMode).toBe(false)
    expect(result.current.isDemo).toBe(false)
    expect(result.current.backendBaseUrl).toBe('https://api.example.test')
  })

  it('persists the flag to localStorage and hydrates it back', () => {
    const { result, unmount } = renderDemoModeHook()

    act(() => {
      result.current.setDemoMode(false)
    })

    expect(globalThis.localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe('false')
    expect(result.current.backendBaseUrl).toBe('')

    unmount()

    const { result: hydrated } = renderDemoModeHook()

    expect(hydrated.current.demoMode).toBe(false)
    expect(hydrated.current.backendBaseUrl).toBe('')
  })

  it('ignores a malformed stored value and keeps the demo-safe default', () => {
    globalThis.localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'not-json{')
    const { result } = renderDemoModeHook()

    expect(result.current.demoMode).toBe(true)

    globalThis.localStorage.setItem(DEMO_MODE_STORAGE_KEY, '"nope"')

    const { result: second } = renderDemoModeHook()

    expect(second.current.demoMode).toBe(true)
  })

  it('toggles demo mode and the runtime base url override', () => {
    const { result } = renderDemoModeHook()

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.demoMode).toBe(false)
    expect(result.current.backendBaseUrl).toBe('')

    act(() => {
      result.current.setBackendBaseUrl('http://192.168.0.5:8000/')
    })

    expect(result.current.backendBaseUrl).toBe('http://192.168.0.5:8000')

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.demoMode).toBe(true)
    expect(result.current.backendBaseUrl).toBe('http://127.0.0.1:8000')

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.backendBaseUrl).toBe('http://192.168.0.5:8000')
  })

  it('survives a missing or throwing localStorage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })

    const { result } = renderDemoModeHook()

    expect(result.current.demoMode).toBe(true)

    act(() => {
      result.current.setDemoMode(false)
    })

    expect(result.current.demoMode).toBe(false)

    vi.stubGlobal('localStorage', undefined)

    const { result: withoutStorage } = renderDemoModeHook()

    expect(withoutStorage.current.demoMode).toBe(true)
  })

  it('throws when the hook is used outside the provider', () => {
    expect(() => renderHook(() => useDemoMode())).toThrow(
      /DemoModeProvider/,
    )
  })

  it('renders children and shares the base url through useApiBaseUrl', () => {
    function BaseUrlProbe() {
      const baseUrl = useApiBaseUrl()

      return <p>base:{baseUrl || 'same-origin'}</p>
    }

    render(
      <DemoModeProvider>
        <BaseUrlProbe />
      </DemoModeProvider>,
    )

    expect(screen.getByText('base:http://127.0.0.1:8000')).toBeInTheDocument()
  })
})
