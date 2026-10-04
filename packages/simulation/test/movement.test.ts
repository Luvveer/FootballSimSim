import { describe, expect, it } from 'vitest';
import type { Team } from '@footballsimsim/shared';
import { simulateMatch } from '../src/index.js';
import { distance, movementTarget, moveToward, teamTactics } from '../src/movement.js';

const team = (id:string,pace=80,passing=80):Team=>({id,name:id,formation:'1-2-1',lineup:
  (['GK','MID','MID','MID','FWD'] as const).map((role,index)=>({slotId:['GK','LM','RM','CAM','ST'][index]!,role,player:{
    id:`${id}-${index}`,playerId:`${id}-${index}`,name:`${id}-${index}`,fifaVersion:'24',positions:[role],overall:80,
    attributes:{pace,passing,vision:passing,shooting:80,dribbling:80,defending:80,physical:80,positioning:80,stamina:80,
      goalkeeperDiving:80,goalkeeperHandling:80,goalkeeperPositioning:80,goalkeeperReflexes:80},
  }}))});

describe('player movement and game plans',()=>{
  it('chases a deficit and protects a late lead, rather than giving every score the same shape',()=>{
    const lineup=team('home');
    const balanced=teamTactics(lineup,0,0,75,90),chasing=teamTactics(lineup,0,1,75,90),leading=teamTactics(lineup,1,0,75,90);
    expect(chasing.mentality).toBe('CHASE_GAME');expect(leading.mentality).toBe('PROTECT_LEAD');
    expect(chasing.lineHeight).toBeGreaterThan(balanced.lineHeight);
    expect(chasing.width).toBeGreaterThan(balanced.width);
    expect(chasing.tempo).toBeGreaterThan(balanced.tempo);
    expect(leading.lineHeight).toBeLessThan(balanced.lineHeight);
    expect(leading.risk).toBeLessThan(balanced.risk);
    const defender=lineup.lineup[1]!;
    expect(movementTarget(defender,1,{x:70,y:50},false,chasing,75,80,false).x).toBeGreaterThan(movementTarget(defender,1,{x:70,y:50},false,leading,75,80,false).x);
  });
  it('derives possession and direct styles from attributes while overall stays unchanged',()=>{
    const possession=teamTactics(team('passing',60,92),0,0,10,90),direct=teamTactics(team('pace',92,60),0,0,10,90);
    expect(possession.style).toBe('POSSESSION');expect(direct.style).toBe('DIRECT');
    expect(direct.tempo).toBeGreaterThan(possession.tempo);
  });
  it('limits movement using pace and remaining energy',()=>{
    const start={x:10,y:30},target={x:80,y:70};
    const fast=moveToward(start,target,95,100,1),slow=moveToward(start,target,30,100,1),tired=moveToward(start,target,95,50,1);
    expect(distance(start,fast)).toBeGreaterThan(distance(start,slow));
    expect(distance(start,fast)).toBeGreaterThan(distance(start,tired));
    expect(distance(start,fast)).toBeLessThan(distance(start,target));
  });
  it('moves every player, including goalkeepers, and keeps the ball with the actual receiver',()=>{
    const result=simulateMatch({homeTeam:team('home'),awayTeam:team('away'),seed:'persistent-movement'});
    for(const player of result.initialSnapshot.players) {
      const points=result.events.flatMap(event=>event.snapshot.players.filter(p=>p.key===player.key));
      const span=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
      expect(span,`${player.key} should move`).toBeGreaterThan(player.role==='GK'?2:10);
    }
    for(const event of result.events.filter(e=>e.type==='PASS'&&e.successful)) {
      expect(event.snapshot.carrierKey).toBe(`${event.team}:${event.secondaryPlayerId}`);
      const receiver=event.snapshot.players.find(p=>p.key===event.snapshot.carrierKey)!;
      expect(event.snapshot.ball.x).toBe(receiver.x);
      expect(event.snapshot.ball.y).toBe(receiver.y+2);
    }
  });
  it('walks a taker to the touchline and delivers each throw toward a teammate',()=>{
    let throws=0,setups=0;
    for(let seed=0;seed<80;seed++) {
      const match=simulateMatch({homeTeam:team('home'),awayTeam:team('away'),seed:`throw-${seed}`});
      for(const [index,event] of match.events.entries()) {
        if(event.type==='RESTART_SETUP'&&event.restart==='THROW_IN') {
          setups++;expect(event.snapshot.restart?.ready).toBe(false);
        }
        if(event.type!=='THROW_IN') continue;
        throws++;
        const restart=event.snapshot.restart!;
        const taker=event.snapshot.players.find(p=>p.key===restart.takerKey)!;
        expect(restart.ready).toBe(true);
        expect([0,100]).toContain(taker.y);
        expect(taker.x).toBe(event.snapshot.ball.x);
        const delivery=match.events.slice(index+1).find(e=>['PASS','HALF_TIME','FULL_TIME'].includes(e.type));
        if(delivery?.type==='PASS') {
          expect(delivery.team).toBe(event.team);
          expect(delivery.playerId).toBe(event.playerId);
          expect(delivery.ballMotion?.kind).toBe('THROW_IN');
          expect(delivery.offside?.offside??false).toBe(false);
          if(delivery.successful) expect(delivery.secondaryPlayerId).not.toBe(event.playerId);
        }
      }
    }
    expect(setups).toBeGreaterThan(0);expect(throws).toBeGreaterThan(0);
  });
  it('gives ordinary passes at least about a second of visible travel at normal speed',()=>{
    const match=simulateMatch({homeTeam:team('home'),awayTeam:team('away'),seed:'slower-passes'});
    const intervals=match.events.flatMap((event,index)=>event.type==='PASS'&&index>0?[event.minute-match.events[index-1]!.minute]:[]).sort((a,b)=>a-b);
    expect(intervals.length).toBeGreaterThan(10);
    expect(intervals[Math.floor(intervals.length/2)]).toBeGreaterThanOrEqual(1);
    // A pass should not be squeezed into a few frames at a half's boundary.
    expect(Math.min(...intervals)).toBeGreaterThan(0.8);
  });
});
