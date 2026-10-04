import type { Player } from './types'

export interface PlayerMetric {
  key: string
  label: string
  abbreviation: string
  value: (player: Player) => number | undefined
}

const outfieldMetrics: PlayerMetric[] = [
  { key: 'pace', label: 'Pace', abbreviation: 'PAC', value: player => player.pace },
  { key: 'shooting', label: 'Shooting', abbreviation: 'SHO', value: player => player.shooting },
  { key: 'passing', label: 'Passing', abbreviation: 'PAS', value: player => player.passing },
  { key: 'dribbling', label: 'Dribbling', abbreviation: 'DRI', value: player => player.dribbling },
  { key: 'defending', label: 'Defending', abbreviation: 'DEF', value: player => player.defending },
  { key: 'physical', label: 'Physical', abbreviation: 'PHY', value: player => player.physical },
]

const goalkeeperMetrics: PlayerMetric[] = [
  { key: 'diving', label: 'Diving', abbreviation: 'DIV', value: player => player.gk?.diving },
  { key: 'handling', label: 'Handling', abbreviation: 'HAN', value: player => player.gk?.handling },
  { key: 'kicking', label: 'Kicking', abbreviation: 'KIC', value: player => player.gk?.kicking },
  { key: 'reflexes', label: 'Reflexes', abbreviation: 'REF', value: player => player.gk?.reflexes },
  { key: 'speed', label: 'Speed', abbreviation: 'SPE', value: player => player.gk?.speed },
  { key: 'positioning', label: 'Positioning', abbreviation: 'POS', value: player => player.gk?.positioning },
]

const isGoalkeeper = (player: Player) => player.position === 'GK' || player.positions.includes('GK')

export function comparisonMetrics(first: Player, second: Player): PlayerMetric[] {
  return isGoalkeeper(first) && isGoalkeeper(second) ? goalkeeperMetrics : outfieldMetrics
}

export function formatMetricValue(value: number | undefined): string {
  return value === undefined ? '—' : String(value)
}

export function metricChange(metric: PlayerMetric, first: Player, second: Player): number | undefined {
  const firstValue = metric.value(first)
  const secondValue = metric.value(second)
  return firstValue === undefined || secondValue === undefined ? undefined : secondValue - firstValue
}
