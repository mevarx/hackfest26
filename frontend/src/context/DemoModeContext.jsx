/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { resolveApiBaseUrl } from '../api.js'

export const DEMO_MODE_STORAGE_KEY = 'reroute:demo-mode'
export const DEMO_MODE_DEFAULT = true

const DETACHED_DEMO_MODE = {
  demoMode: DEMO_MODE_DEFAULT,
  isDemo: DEMO_MODE_DEFAULT,
  setDemoMode: (_value) => {},
  toggleDemoMode: () => {},
  backendBaseUrl: '',
  setBackendBaseUrl: (_value) => {},
}

const DemoModeContext = createContext(DETACHED_DEMO_MODE)

function getDefaultStorage() {
  try {
    if (typeof globalThis.localStorage === 'undefined') {
      return null
    }

    return globalThis.localStorage
  } catch {
    return null
  }
}

function readStoredDemoMode(storage) {
  if (!storage) {
    return null
  }

  let rawValue

  try {
    rawValue = storage.getItem(DEMO_MODE_STORAGE_KEY)
  } catch {
    return null
  }

  if (typeof rawValue !== 'string') {
    return null
  }

  try {
    const parsedValue = JSON.parse(rawValue)

    return typeof parsedValue === 'boolean' ? parsedValue : null
  } catch {
    return null
  }
}

function writeStoredDemoMode(storage, demoMode) {
  if (!storage) {
    return
  }

  try {
    storage.setItem(DEMO_MODE_STORAGE_KEY, JSON.stringify(demoMode))
  } catch {
    return
  }
}

export function DemoModeProvider(props) {
  const { children, initialDemoMode, baseUrl, storage } = props
  const [demoMode, setDemoModeState] = useState(() => {
    if (typeof initialDemoMode === 'boolean') {
      return initialDemoMode
    }

    const storedDemoMode = readStoredDemoMode(
      storage ?? getDefaultStorage(),
    )

    return storedDemoMode ?? DEMO_MODE_DEFAULT
  })
  const [baseUrlOverride, setBaseUrlOverride] = useState(() =>
    typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : null,
  )

  const setDemoMode = useCallback((value) => {
    const nextDemoMode = Boolean(value)

    setDemoModeState(nextDemoMode)
    writeStoredDemoMode(getDefaultStorage(), nextDemoMode)
  }, [])

  const toggleDemoMode = useCallback(() => {
    setDemoMode(!demoMode)
  }, [demoMode, setDemoMode])

  const setBackendBaseUrl = useCallback((value) => {
    setBaseUrlOverride(
      typeof value === 'string' && value.trim() ? value.trim() : null,
    )
  }, [])

  const value = useMemo(() => {
    const configuredBaseUrl = baseUrlOverride ?? baseUrl
    const backendBaseUrl = resolveApiBaseUrl({
      baseUrl: configuredBaseUrl,
      demoMode,
    })

    return {
      demoMode,
      isDemo: demoMode,
      setDemoMode,
      toggleDemoMode,
      backendBaseUrl,
      setBackendBaseUrl,
    }
  }, [
    demoMode,
    baseUrlOverride,
    baseUrl,
    setDemoMode,
    toggleDemoMode,
    setBackendBaseUrl,
  ])

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  )
}

export function useDemoMode() {
  const contextValue = useContext(DemoModeContext)

  if (contextValue === DETACHED_DEMO_MODE) {
    throw new Error('useDemoMode must be used inside a DemoModeProvider')
  }

  return contextValue
}

export function useApiBaseUrl() {
  return useDemoMode().backendBaseUrl
}
