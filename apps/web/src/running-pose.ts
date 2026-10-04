import type { ReplayPlayerMotion } from './replay'

// Upright figures keep their vertical silhouette; only the stride follows the
// projected ground direction. Rotate neither the player nor their name tag.
export function runningPose(motion?: ReplayPlayerMotion) {
  const activity = Math.min(1, Math.max(0, motion?.activity ?? 0))
  const direction = motion?.direction ?? { x: 1, y: 0 }
  const phase = motion?.phase ?? 0
  const swing = Math.sin(phase) * activity * 8
  const facing = motion?.facing ?? 1
  const legs = [-1, 1].map(side => {
    const hip = side * 4
    const reach = swing * side
    const lift = Math.max(0, Math.cos(phase) * side) * activity * 5
    const foot = { x: hip + direction.x * reach, y: -1 + direction.y * reach * 0.65 - lift }
    const knee = {
      x: hip + direction.x * (reach * 0.45 - lift * 0.6),
      y: -8 + direction.y * reach * 0.3 - lift * 0.35,
    }
    const toe = { x: foot.x + facing * (3 + Math.abs(direction.x) * activity * 2), y: foot.y + direction.y * activity * 1.5 }
    return { side, foot, knee, path: `M${hip},-14 L${knee.x},${knee.y} L${foot.x},${foot.y}`,
      boot: `M${foot.x},${foot.y} L${toe.x},${toe.y}` }
  }).sort((a, b) => a.foot.y - b.foot.y)
  const arms = [-1, 1].map(side => {
    const reach = -swing * side * 0.7
    return `M${side * 9},-32 L${side * 12 + direction.x * reach * 0.5},${-25 + direction.y * reach * 0.3} L${side * 11 + direction.x * reach},${-21 + direction.y * reach * 0.55 - activity * 2}`
  }).join(' ')
  return { legs, arms, lean: direction.x * activity * 3, bob: Math.abs(Math.sin(phase * 2)) * activity * 1.2 }
}
