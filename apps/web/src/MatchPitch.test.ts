import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ReplayPlayer, ReplaySnapshot } from '@footballsimsim/shared'
import { MatchPitch } from './MatchPitch'
import { replayFrame } from './replay'

const player = (key: string, name: string): ReplayPlayer => ({
  key, name, playerId: key, x: 50, y: 50, team: 'HOME', role: 'MID',
  slotId: 'CM', energy: 100, yellowCards: 0,
})
function render(carrierKey?: string) {
  const snapshot: ReplaySnapshot = {
    players: [player('messi', 'Lionel Messi'), player('iniesta', 'Andrés Iniesta')],
    carrierKey, ball: { x: 50, y: 50 }, direction: { HOME: 1, AWAY: -1 },
    possession: 'HOME', status: 'PLAY', phase: 'PROGRESSION', period: 1,
    teamStats: {} as ReplaySnapshot['teamStats'],
  }
  return renderToStaticMarkup(createElement(MatchPitch, {
    snapshot, frame: replayFrame([], snapshot, 0), minute: 0,
    homeName: 'Home', awayName: 'Away',
  }))
}

describe('pitch possession labels', () => {
  it.each([['messi', 'Messi'], ['iniesta', 'Iniesta']])('renders only the carrier name tag for %s', (key, name) => {
    const html = render(key)
    const labels = html.match(/<g class="pitch-name-label"[\s\S]*?<\/g>/g) ?? []
    expect(labels).toHaveLength(1)
    expect(labels[0]).toContain(`>${name}</text>`)
    expect(html).toContain('aria-label="Lionel Messi, home')
    expect(html).toContain('aria-label="Andrés Iniesta, home')
  })

  it('renders no name tags when nobody has possession', () => {
    expect(render()).not.toContain('class="pitch-name-label"')
    expect(render('missing-player')).not.toContain('class="pitch-name-label"')
  })
})
