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
