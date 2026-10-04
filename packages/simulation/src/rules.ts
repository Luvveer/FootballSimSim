import type { OffsideDecision, PitchPoint, RestartType } from '@footballsimsim/shared';

// Only a participating receiver is checked. Being in an offside position by
// itself is not an offence. All x coordinates describe positions at the kick.
export function checkOffside(ball: PitchPoint, receiver: PitchPoint & { playerId: string }, opponents: PitchPoint[], direction: 1 | -1, restart?: RestartType): OffsideDecision {
  const forward = (x: number) => direction === 1 ? x : 100 - x;
  const defenders = opponents.map(player => forward(player.x)).sort((a, b) => b - a);
  const secondLast = defenders[1] ?? defenders[0] ?? 0;
  const line = Math.max(secondLast, forward(ball.x));
  const exempt = restart === 'THROW_IN' || restart === 'CORNER' || restart === 'GOAL_KICK';
  return { offside: !exempt && forward(receiver.x) > 50 && forward(receiver.x) > line + 0.01,
    lineX: direction === 1 ? line : 100 - line, ball: { ...ball }, receiver: { x: receiver.x, y: receiver.y }, receiverId: receiver.playerId, direction };
}
export function inPenaltyArea(point: PitchPoint, direction: 1 | -1): boolean {
  return (direction === 1 ? point.x >= 84 : point.x <= 16) && point.y >= 21 && point.y <= 79;
}
export function boundaryRestart(boundary: 'TOUCHLINE' | 'GOAL_LINE', lastTouch: 'ATTACK' | 'DEFENCE'): RestartType {
  return boundary === 'TOUCHLINE' ? 'THROW_IN' : lastTouch === 'ATTACK' ? 'GOAL_KICK' : 'CORNER';
}
export function cardForChallenge(severity: 'CARELESS' | 'RECKLESS' | 'EXCESSIVE', priorYellowCards: number): 'NONE' | 'YELLOW' | 'RED' | 'SECOND_YELLOW' {
  return severity === 'EXCESSIVE' ? 'RED' : severity === 'RECKLESS' ? priorYellowCards ? 'SECOND_YELLOW' : 'YELLOW' : 'NONE';
}
