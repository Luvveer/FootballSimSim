import type { PitchPoint } from '@footballsimsim/shared'
import { projectPitch } from './pitch-geometry'

export const BALL_RADIUS = 7
type Vector = [number, number, number]
const normalize = (v: Vector): Vector => {
  const length = Math.hypot(...v)
  return v.map(value => value / length) as Vector
}
const cross = (a: Vector, b: Vector): Vector => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
const phi = (1 + Math.sqrt(5)) / 2
// Twelve pentagonal patches around a sphere, not a flat pattern spinning in
// place. Hidden panels rotate into view as visible panels cross the surface.
const patches: Vector[][] = []
for (const a of [-1, 1]) for (const b of [-phi, phi]) {
  for (const center of [[0,a,b], [a,b,0], [b,0,a]] as Vector[]) {
    const n = normalize(center)
    const tangent = normalize(cross(n, [0,0,1]))
    const bitangent = cross(n, tangent)
    patches.push(Array.from({ length: 5 }, (_, index) => {
      const angle = index * Math.PI * 2 / 5
      return n.map((value, i) => value * Math.cos(0.32) +
        (tangent[i] * Math.cos(angle) + bitangent[i] * Math.sin(angle)) * Math.sin(0.32)) as Vector
    }))
  }
}

export function ballRollDegrees(from: PitchPoint, to: PitchPoint) {
  const a = projectPitch(from), b = projectPitch(to)
  return Math.hypot(b.x-a.x, b.y-a.y) / ((a.scale+b.scale)/2 * BALL_RADIUS) * 180 / Math.PI
}

export function rollingBallPanels(rotation: number, direction: PitchPoint) {
  const length = Math.hypot(direction.x, direction.y) || 1
  const axis: Vector = [-direction.y/length, direction.x/length, 0]
  const angle = (rotation % 360) * Math.PI / 180
  const cosine = Math.cos(angle), sine = Math.sin(angle)
  return patches.flatMap(patch => {
    const rotated = patch.map(point => {
      const perpendicular = cross(axis, point)
      const dot = axis.reduce((sum, value, i) => sum + value * point[i], 0)
      return point.map((value, i) => value*cosine + perpendicular[i]*sine + axis[i]*dot*(1-cosine)) as Vector
    })
    const visible: Vector[] = []
    for (let index = 0; index < rotated.length; index++) {
      const a = rotated[index], b = rotated[(index+1)%rotated.length]
      if (a[2] >= 0) visible.push(a)
      if ((a[2] >= 0) !== (b[2] >= 0)) {
        const amount = a[2] / (a[2]-b[2])
        visible.push(a.map((value, i) => value + (b[i]-value)*amount) as Vector)
      }
    }
    return visible.length >= 3 ? [visible.map(point => `${point[0]*BALL_RADIUS},${point[1]*BALL_RADIUS}`).join(' ')] : []
  })
}
