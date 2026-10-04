import { describe, expect, it } from 'vitest'
import type { ReplayPlayer, ReplaySnapshot } from '@footballsimsim/shared'
import type { MatchEvent, MatchResult } from './types'
import { advanceReplayElapsed, matchClock, matchTimeline, playbackRemaining, replayFrame, replayTiming } from './replay'

const result = { durationMinutes:96, regulationMinutes:90, halfTimeMinute:48 } as MatchResult
const snapshot = (x:number,status:ReplaySnapshot['status']='PLAY'):ReplaySnapshot=>({
  ball:{x,y:50}, players:[], status, phase:'PROGRESSION', period:1,
  direction:{HOME:1,AWAY:-1}, possession:'HOME', teamStats:{} as ReplaySnapshot['teamStats'],
})
const event = (minute:number,x:number,type:MatchEvent['type']='pass'):MatchEvent=>({minute,type,team:'home',player:'Player',detail:'Action',snapshot:snapshot(x)})
const player = (key:string,x:number):ReplayPlayer=>({key,x,y:48,playerId:key,name:key,team:'HOME',slotId:'CM',role:'MID',energy:100,yellowCards:0})

describe('match playback timing',()=>{
  it('plays one minute per second, freezing the clock for a five-second interval',()=>{
    expect(matchTimeline(result,0)).toMatchObject({minute:0,progress:0,half:0.5})
    expect(matchTimeline(result,30)).toMatchObject({minute:30,progress:0.5*(30/45),inHalfTime:false})
    expect(matchTimeline(result,48)).toMatchObject({minute:48,progress:0.5,inHalfTime:true,breakRemaining:5,period:1})
    expect(matchTimeline(result,52)).toMatchObject({minute:48,progress:0.5,inHalfTime:true,breakRemaining:1})
    expect(matchTimeline(result,53)).toMatchObject({minute:48,inHalfTime:false,period:2})
    expect(matchTimeline(result,101)).toMatchObject({minute:96,progress:1,complete:true})
    expect(replayTiming(result).totalSeconds).toBe(101)
  })
  it('keeps the half-time marker in the middle and holds the bar during added time',()=>{
    // First half runs to 48 (3 minutes added), the match to 96.
    expect(matchTimeline(result,0).half).toBe(0.5)
    expect(matchTimeline(result,45).progress).toBe(0.5)
    expect(matchTimeline(result,46.5)).toMatchObject({minute:46.5,progress:0.5,half:0.5})
    expect(matchTimeline(result,48)).toMatchObject({progress:0.5,inHalfTime:true})
    expect(matchTimeline(result,53)).toMatchObject({minute:48,progress:0.5,period:2})
    expect(matchTimeline(result,53+22.5).progress).toBe(0.75)
    expect(matchTimeline(result,53+45).progress).toBe(1)
    expect(matchTimeline(result,53+47)).toMatchObject({progress:1,minute:95})
  })
  it('takes exactly 45 seconds per half and keeps the break at five real seconds at any speed',()=>{
    const regulation={durationMinutes:90,regulationMinutes:90,halfTimeMinute:45} as MatchResult
    expect(matchTimeline(regulation,45).breakRemaining).toBe(5)
    expect(matchTimeline(regulation,50)).toMatchObject({minute:45,period:2})
    expect(matchTimeline(regulation,95).complete).toBe(true)
    expect(advanceReplayElapsed(regulation,0,22.5,2)).toBe(45)
    expect(advanceReplayElapsed(regulation,0,25,2)).toBe(47.5)
    expect(advanceReplayElapsed(regulation,0,27.5,2)).toBe(50)
    expect(advanceReplayElapsed(regulation,0,50,2)).toBe(95)
    expect(playbackRemaining(regulation,47.5,2)).toBe(25)
  })
  it('does not insert a half-time break for a first-half abandonment',()=>{
    const stopped={durationMinutes:20,halfTimeMinute:45,status:'ABANDONED',events:[]} as unknown as MatchResult
    expect(replayTiming(stopped).totalSeconds).toBe(20)
    expect(advanceReplayElapsed(stopped,19,2,1)).toBe(20)
    expect(matchTimeline(stopped,20)).toMatchObject({minute:20,complete:true,inHalfTime:false})
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
    const first=replayFrame(events,snapshot(10),0.675-0.001)
    const second=replayFrame(events,snapshot(10),0.675)
    expect(first.visibleCount).toBe(1)
    expect(second.visibleCount).toBe(1)
    expect(second.snapshot!.ball.x).toBeCloseTo(40)
    expect(second.snapshot!.ball.x-first.snapshot!.ball.x).toBeLessThan(2)
    expect(replayFrame(events,snapshot(10),1).snapshot!.ball.x).toBe(70)
  })
  it('bounds pass travel even when there is a long gap between events',()=>{
    const short=[event(0,10),event(4,20)]
    const long=[event(0,10),event(4,90)]
    // Short passes stay with the passer longer and travel faster than long ones.
    expect(replayFrame(short,snapshot(10),3.6).snapshot!.ball.x).toBe(10)
    expect(replayFrame(short,snapshot(10),3.85).snapshot!.ball.x).toBeGreaterThan(14)
    expect(replayFrame(long,snapshot(10),3.34).snapshot!.ball.x).toBe(10)
    expect(replayFrame(long,snapshot(10),3.675).snapshot!.ball.x).toBeCloseTo(50)
    // Identical passes have identical flight timing regardless of event cadence.
    const quick=replayFrame([event(0,10),event(1,90)],snapshot(10),0.675).snapshot!.ball
    const delayed=replayFrame(long,snapshot(10),3.675).snapshot!.ball
    expect(quick.x).toBeCloseTo(delayed.x)
    expect(quick.y).toBeCloseTo(delayed.y)
    expect(replayFrame(long,snapshot(10),4).snapshot!.ball.x).toBe(90)
  })
  it('keeps the ball with a moving passer until release and lands at the receiver without a snap',()=>{
    const start=event(0,10),end=event(4,70)
    start.snapshot!.players=[player('passer',10),player('receiver',50)]
    start.snapshot!.carrierKey='passer'
    end.snapshot!.players=[player('passer',20),player('receiver',70)]
    end.snapshot!.carrierKey='receiver'
    const holding=replayFrame([start,end],start.snapshot,2)
    expect(holding.snapshot!.ball.x).toBe(holding.snapshot!.players[0]!.x)
    expect(holding.path).toBeUndefined()
    expect(holding.rotation).toBeGreaterThan(0)
    expect(replayFrame([start,end],start.snapshot,2.1).rotation).toBeGreaterThan(holding.rotation)
    const beforeKick=replayFrame([start,end],start.snapshot,3.35-0.0001)
    const afterKick=replayFrame([start,end],start.snapshot,3.35+0.0001)
    expect(Math.abs(afterKick.snapshot!.ball.x-beforeKick.snapshot!.ball.x)).toBeLessThan(0.05)
    const arrival=replayFrame([start,end],start.snapshot,3.9999)
    expect(arrival.snapshot!.carrierKey).toBe('passer')
    expect(arrival.snapshot!.teamStats).toEqual(start.snapshot!.teamStats)
    expect(arrival.visibleCount).toBe(1)
    expect(arrival.snapshot!.ball.x).toBeCloseTo(70,1)
    expect(replayFrame([start,end],start.snapshot,4).snapshot!.carrierKey).toBe('receiver')
    expect(arrival.rotation).toBeCloseTo(replayFrame([start,end],start.snapshot,4).rotation, 0)
  })
  it('does not rotate a stationary ball while waiting for a pass',()=>{
    const events=[event(0,10),event(4,70)]
    expect(replayFrame(events,snapshot(10),2).rotation).toBe(0)
    expect(replayFrame(events,snapshot(10),3).rotation).toBe(0)
  })
  it('uses brisk passing motion for an interception without revealing the turnover early',()=>{
    const start=event(0,10),pass=event(4,90),interception=event(4,70,'interception')
    interception.snapshot!.possession='AWAY'
    const frame=replayFrame([start,pass,interception],start.snapshot,3.675)
    expect(frame.snapshot!.ball.x).toBeCloseTo(40)
    expect(frame.snapshot!.possession).toBe('HOME')
    expect(frame.path!.to.x).toBe(70)
    expect(frame.visibleCount).toBe(1)
    expect(replayFrame([start,pass,interception],start.snapshot,4).snapshot!.possession).toBe('AWAY')
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
  it('does not reveal a second-half kickoff at the same timestamp during the break',()=>{
    const half=event(48,20,'half_time');half.snapshot=snapshot(20,'HALF_TIME')
    const kick=event(48,50,'kickoff');kick.snapshot!.period=2
    const breakFrame=replayFrame([half,kick],snapshot(20),48,true)
    expect(breakFrame.visibleCount).toBe(1)
    expect(breakFrame.snapshot!.status).toBe('HALF_TIME')
    expect(replayFrame([half,kick],snapshot(20),48,false).snapshot!.period).toBe(2)
    const before=event(47,20)
    expect(replayFrame([before,half,kick],snapshot(20),47.5).snapshot!.ball.x).toBe(20)
    expect(replayFrame([before,half,kick],snapshot(20),47.5).snapshot!.period).toBe(1)
  })
  it('keeps the ball at the throw-in spot during setup, then lofts it to a teammate',()=>{
    const setup=event(0,30,'restart_setup');setup.snapshot=snapshot(30,'STOPPAGE');setup.snapshot.ball.y=0
    const ready=event(2,30,'throw_in');ready.snapshot=snapshot(30,'STOPPAGE');ready.snapshot.ball.y=0
    const receive=event(3.2,50);receive.ballMotion={kind:'THROW_IN',from:{x:30,y:0},to:{x:50,y:50}}
    expect(replayFrame([setup,ready,receive],setup.snapshot,1).snapshot!.ball).toEqual({x:30,y:0})
    expect(replayFrame([setup,ready,receive],setup.snapshot,2.3).snapshot!.ball).toEqual({x:30,y:0})
    const flight=replayFrame([setup,ready,receive],setup.snapshot,2.9)
    expect(flight.snapshot!.ball.x).toBeGreaterThan(30)
    expect(flight.snapshot!.ball.x).toBeLessThan(50)
    expect(flight.loft).toBeGreaterThan(0)
    // Height is presentation data, not a sideways bend on the pitch.
    expect(flight.snapshot!.ball.y).toBeCloseTo((flight.snapshot!.ball.x-30)/20*50)
    expect(replayFrame([setup,ready,receive],setup.snapshot,3.2).snapshot!.ball).toEqual({x:50,y:50})
  })
  it('uses replay position to drive deterministic movement poses and holds them at breaks', () => {
    const start = event(0, 10), end = event(4, 70)
    start.snapshot!.players = [player('runner', 10)]
    end.snapshot!.players = [player('runner', 45)]
    const frame = replayFrame([start, end], start.snapshot, 2)
    expect(frame.playerMotion.runner.activity).toBeGreaterThan(0)
    expect(frame.playerMotion.runner.facing).toBe(1)
    expect(replayFrame([start, end], start.snapshot, 2).playerMotion).toEqual(frame.playerMotion)
    start.snapshot!.status = 'HALF_TIME'
    expect(replayFrame([start, end], start.snapshot, 2).playerMotion).toEqual({})
  })
})
