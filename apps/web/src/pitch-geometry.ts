import type { PitchPoint } from '@footballsimsim/shared'

// Trim the unused surround: the playing surface is about 8% larger, while
// exterior nets, throw-in takers, and event labels stay inside the camera.
export const PITCH_VIEW = { x: 35, y: 0, width: 930, height: 575 }
export const GOAL = { halfWidth: 10, depth: 5, height: 31 }

// A fixed perspective camera. x/y remain engine coordinates (0..100);
// out-of-field coordinates are intentional for nets and throw-in takers.
export function projectPitch(point: PitchPoint, elevation = 0) {
  const depth = point.y / 100
  const perspective = 1.25 - depth * 0.25
  return {
    x: 500 + (point.x - 50) * 8.5 / perspective,
    y: 112 + 356 * depth / perspective - elevation / perspective,
    scale: 1.05 / perspective,
  }
}

export function pitchPolygon(points: PitchPoint[], elevation = 0) {
  return points.map(point => {
    const projected = projectPitch(point, elevation)
    return `${projected.x},${projected.y}`
  }).join(' ')
}

export function pitchCircle(center: PitchPoint, radiusX: number, radiusY = radiusX * 105 / 68) {
  return pitchPolygon(Array.from({ length: 65 }, (_, index) => {
    const angle = index / 64 * Math.PI * 2
    return { x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY }
  }))
}

export function goalGeometry(end: 0 | 100) {
  const outward = end === 0 ? -1 : 1
  const mouth = [{ x: end, y: 50 - GOAL.halfWidth }, { x: end, y: 50 + GOAL.halfWidth }]
  const back = mouth.map(point => ({ ...point, x: end + outward * GOAL.depth }))
  return { mouth, back, footprint: [mouth[0], back[0], back[1], mouth[1]], outward }
}

// A presentation-only finish, applied exclusively after a goal is revealed.
export function goalBallPosition(ball: PitchPoint, direction: number, secondsSinceGoal: number): PitchPoint {
  const progress = Math.min(1, Math.max(0, secondsSinceGoal / 0.25))
  const start = direction === 1 ? 98 : 2
  return { x: start + direction * 5 * (1 - (1 - progress) ** 3), y: ball.y }
}
