import { describe, expect, it } from 'vitest';
import { boundaryRestart, cardForChallenge, checkOffside, inPenaltyArea } from '../src/rules.js';

const ball = { x: 60, y: 50 };
const receiver = { playerId: 'forward', x: 81, y: 30 };
const opponents = [{ x: 96, y: 50 }, { x: 80, y: 34 }, { x: 70, y: 70 }];

describe('football rule decisions', () => {
  it('judges a participating receiver against the ball and second-last opponent at the kick', () => {
    expect(checkOffside(ball, receiver, opponents, 1)).toMatchObject({ offside:true, lineX:80 });
    expect(checkOffside(ball, { ...receiver,x:80 }, opponents, 1).offside).toBe(false);
    expect(checkOffside({ ...ball,x:85 }, receiver, opponents, 1).offside).toBe(false);
    expect(checkOffside(ball, { ...receiver,x:50 }, opponents, 1).offside).toBe(false);
    // Goalkeepers are opponents too; sorting positions matters, not role.
    expect(checkOffside(ball, receiver, [...opponents].reverse(), 1).offside).toBe(true);
  });
  it('mirrors the decision when teams change ends', () => {
    const mirror = <T extends {x:number}>(point:T):T=>({ ...point,x:100-point.x });
    expect(checkOffside(mirror(ball), mirror(receiver), opponents.map(mirror), -1)).toMatchObject({ offside:true,lineX:20 });
    expect(checkOffside(mirror(ball), { ...mirror(receiver),x:20 }, opponents.map(mirror), -1).offside).toBe(false);
  });
  it('exempts direct throws, corners and goal kicks, but not free kicks or kickoffs', () => {
    for (const restart of ['THROW_IN','CORNER','GOAL_KICK'] as const) expect(checkOffside(ball,receiver,opponents,1,restart).offside).toBe(false);
    for (const restart of ['FREE_KICK','KICKOFF'] as const) expect(checkOffside(ball,receiver,opponents,1,restart).offside).toBe(true);
  });
  it('awards boundary restarts from the last touch', () => {
    expect(boundaryRestart('TOUCHLINE','ATTACK')).toBe('THROW_IN');
    expect(boundaryRestart('TOUCHLINE','DEFENCE')).toBe('THROW_IN');
    expect(boundaryRestart('GOAL_LINE','ATTACK')).toBe('GOAL_KICK');
    expect(boundaryRestart('GOAL_LINE','DEFENCE')).toBe('CORNER');
  });
  it('distinguishes careless, reckless, second cautions and excessive force', () => {
    expect(cardForChallenge('CARELESS',1)).toBe('NONE');
    expect(cardForChallenge('RECKLESS',0)).toBe('YELLOW');
    expect(cardForChallenge('RECKLESS',1)).toBe('SECOND_YELLOW');
    expect(cardForChallenge('EXCESSIVE',0)).toBe('RED');
  });
  it('limits penalties to the defending penalty area in either direction', () => {
    expect(inPenaltyArea({x:84,y:21},1)).toBe(true);
    expect(inPenaltyArea({x:90,y:20},1)).toBe(false);
    expect(inPenaltyArea({x:80,y:50},1)).toBe(false);
    expect(inPenaltyArea({x:16,y:79},-1)).toBe(true);
    expect(inPenaltyArea({x:20,y:50},-1)).toBe(false);
  });
});
