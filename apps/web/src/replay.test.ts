import { describe, expect, it } from 'vitest'
import type { ReplaySnapshot } from '@footballsimsim/shared'
import type { MatchEvent, MatchResult } from './types'
import { matchClock, matchTimeline, replayFrame } from './replay'

const result = { durationMinutes:96, regulationMinutes:90, halfTimeMinute:48 } as MatchResult
const snapshot = (x:number,status:ReplaySnapshot['status']='PLAY'):ReplaySnapshot=>({
  ball:{x,y:50}, players:[], status, phase:'PROGRESSION', period:1,
  direction:{HOME:1,AWAY:-1}, possession:'HOME', teamStats:{} as ReplaySnapshot['teamStats'],
})
const event = (minute:number,x:number,type:MatchEvent['type']='pass'):MatchEvent=>({minute,type,team:'home',player:'Player',detail:'Action',snapshot:snapshot(x)})

describe('match playback timing',()=>{
  it('uses the same fraction for clock and progress, including added time',()=>{
    expect(matchTimeline(result,0)).toEqual({minute:0,progress:0,half:0.5})
    expect(matchTimeline(result,30)).toEqual({minute:48,progress:0.5,half:0.5})
    expect(matchTimeline(result,60)).toEqual({minute:96,progress:1,half:0.5})
    expect(matchTimeline(result,100).progress).toBe(1)
  })
  it('displays stoppage time separately in both halves',()=>{
    expect(matchClock(result,7.5,1)).toBe('07:30')
    expect(matchClock(result,47,1)).toBe('45:00 +02:00')
    expect(matchClock(result,48,2)).toBe('45:00')
    expect(matchClock(result,49.5,2)).toBe('46:30')
    expect(matchClock(result,96,2)).toBe('90:00 +03:00')
  })
  it('moves the ball continuously without revealing future event results',()=>{
    const events=[event(0,10),event(1,70)]
    const first=replayFrame(events,snapshot(10),0.49)
    const second=replayFrame(events,snapshot(10),0.5)
    expect(first.visibleCount).toBe(1)
    expect(second.visibleCount).toBe(1)
    expect(second.snapshot!.ball.x).toBeCloseTo(40)
    expect(second.snapshot!.ball.x-first.snapshot!.ball.x).toBeLessThan(2)
    expect(replayFrame(events,snapshot(10),1).snapshot!.ball.x).toBe(70)
  })
  it('resolves a shot and save at the same timestamp to a single ball destination',()=>{
    const events=[event(0,10),event(1,98,'shot'),event(1,93,'save')]
    expect(replayFrame(events,snapshot(10),0.9).path?.to.x).toBe(93)
    expect(replayFrame(events,snapshot(10),1).visibleCount).toBe(3)
  })
  it('holds the half-time pitch until the next kickoff',()=>{
    const half=event(48,20,'half_time');half.snapshot=snapshot(20,'HALF_TIME')
    const kick=event(48.2,50,'kickoff')
    expect(replayFrame([half,kick],snapshot(20),48.1).snapshot!.ball.x).toBe(20)
  })
})
