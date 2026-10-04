const DEFAULT_API_BASE_URL = '/api'

export function buildApiUrl(path: string, configuredBaseUrl?: string): string {
  const baseUrl = configuredBaseUrl?.trim() || DEFAULT_API_BASE_URL
  const normalizedBaseUrl = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '')
  const normalizedPath = `/${path.replace(/^\/+/, '')}`

  return `${normalizedBaseUrl}${normalizedPath}`
}

export function apiUrl(path: string): string {
  return buildApiUrl(path, import.meta.env.VITE_API_BASE_URL)
}
