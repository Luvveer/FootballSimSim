import { describe, expect, it } from 'vitest'
import { comparisonMetrics, formatMetricValue, metricChange } from './player-metrics'
import type { Player } from './types'

const player = (position: Player['position'], gk?: Player['gk']): Player => ({
  id: `1:${position}`,
  playerId: '1',
  name: 'Player',
  version: '20',
  rating: 80,
  position,
  positions: [position],
  club: 'Club',
  nationality: 'Country',
  pace: 71,
  shooting: 72,
  passing: 73,
  dribbling: 74,
  defending: 75,
  physical: 76,
  gk,
})

describe('player comparison metrics', () => {
  it('uses outfield attributes for outfield players', () => {
    expect(comparisonMetrics(player('FWD'), player('FWD')).map(metric => metric.label)).toEqual([
      'Pace', 'Shooting', 'Passing', 'Dribbling', 'Defending', 'Physical',
    ])
  })

  it('uses goalkeeper attributes for goalkeepers', () => {
    expect(comparisonMetrics(player('GK'), player('GK')).map(metric => metric.label)).toEqual([
      'Diving', 'Handling', 'Kicking', 'Reflexes', 'Speed', 'Positioning',
    ])
  })

  it('does not invent values or changes for missing goalkeeper data', () => {
    const first = player('GK', { diving: 80 })
    const second = player('GK', { diving: 85, kicking: 0 })
    const metrics = comparisonMetrics(first, second)

    expect(metricChange(metrics[0]!, first, second)).toBe(5)
    expect(metricChange(metrics[2]!, first, second)).toBeUndefined()
    expect(formatMetricValue(metrics[2]!.value(first))).toBe('—')
    expect(formatMetricValue(metrics[2]!.value(second))).toBe('0')
  })
})
