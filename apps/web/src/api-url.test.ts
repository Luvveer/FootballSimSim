import { describe, expect, it } from 'vitest'
import { buildApiUrl } from './api-url'

describe('API URL construction', () => {
  it('uses the local API proxy by default', () => {
    expect(buildApiUrl('/players')).toBe('/api/players')
  })

  it('uses an absolute API origin when configured', () => {
    expect(buildApiUrl('/players', 'https://api.example.com')).toBe('https://api.example.com/players')
  })

  it('normalizes slashes around the configured base and request path', () => {
    expect(buildApiUrl('players', 'https://api.example.com/')).toBe('https://api.example.com/players')
    expect(buildApiUrl('players', '/backend/')).toBe('/backend/players')
  })

  it('preserves a path prefix in the configured API URL', () => {
    expect(buildApiUrl('/players/versions', 'https://example.com/services/api/')).toBe(
      'https://example.com/services/api/players/versions',
    )
  })

  it('falls back to the local proxy for empty configuration', () => {
    expect(buildApiUrl('/players', '')).toBe('/api/players')
    expect(buildApiUrl('/players', '   ')).toBe('/api/players')
  })

  it('preserves query strings', () => {
    expect(buildApiUrl('/players?limit=40&position=FWD', '/api/')).toBe(
      '/api/players?limit=40&position=FWD',
    )
  })
})
