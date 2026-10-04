import type { LineupSlot, PitchPoint, Team, TeamTactics } from '@footballsimsim/shared';

const clamp = (n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const mean = (items:number[])=>items.reduce((a,b)=>a+b,0)/items.length;
export const distance = (a:PitchPoint,b:PitchPoint)=>Math.hypot(a.x-b.x,(a.y-b.y)*0.65);

export function teamTactics(team:Team,goalsFor:number,goalsAgainst:number,minute:number,regulation:number):TeamTactics {
  const field=team.lineup.filter(p=>p.role!=='GK');
  const control=mean(field.map(p=>(p.player.attributes.passing+(p.player.attributes.vision??p.player.attributes.passing))/2));
  const pace=mean(field.map(p=>p.player.attributes.pace));
  const defending=mean(field.map(p=>p.player.attributes.defending));
  const stamina=mean(field.map(p=>p.player.attributes.stamina??p.player.attributes.physical));
  const style=control>pace+5?'POSSESSION':pace>control+5?'DIRECT':'BALANCED';
  const late=clamp((minute/regulation-0.4)/0.6,0,1);
  const mentality=goalsFor<goalsAgainst?'CHASE_GAME':goalsFor>goalsAgainst&&late>0?'PROTECT_LEAD':'BALANCED';
  const urgency=mentality==='CHASE_GAME'?0.35+late*0.65:mentality==='PROTECT_LEAD'?-late:0;
  return {style,mentality,
    tempo:clamp(0.95+(pace-control)/220+urgency*0.18,0.75,1.25),
    lineHeight:clamp(34+(defending-70)/8+urgency*13,20,53),
    width:clamp(23+(pace-70)/10+urgency*5,18,32),
    pressing:clamp(0.35+(defending+stamina-140)/220+urgency*0.2,0.2,0.8),
    risk:clamp(0.5+urgency*0.3+(style==='DIRECT'?0.05:0),0.15,0.85)};
}

// A destination is a tactical intention, not a teleport. The engine walks the
// persistent positions toward these points, capped by pace and current energy.
export function movementTarget(slot:LineupSlot,index:number,ball:PitchPoint,attacking:boolean,tactics:TeamTactics,minute:number,defensiveLine:number,isCarrier:boolean):PitchPoint {
  const a=slot.player.attributes;
  const positioning=a.positioning??a.composure??70;
  const vision=a.vision??a.passing;
  const lane=slot.slotId==='LM'?-1:slot.slotId==='RM'?1:slot.role==='GK'||slot.role==='FWD'?0:index%2?-0.6:0.6;
  const phase=minute*(0.55+a.pace/200)+index*1.9;
  const run=Math.sin(phase)*(2+positioning/35);
  if(slot.role==='GK') return {x:clamp(5+ball.x/18+(attacking?1:0),5,12),y:clamp(50+(ball.y-50)*0.4+Math.sin(phase)*1.5,29,71)};
  if(isCarrier) return {x:clamp(ball.x+(attacking?2+tactics.risk*3:0),8,94),y:clamp(ball.y+Math.sin(phase)*2,8,92)};
  let x:number,y:number;
  if(attacking) {
    x=slot.role==='DEF'?ball.x-24+tactics.risk*8:slot.role==='FWD'?ball.x+16+positioning/14:ball.x+(slot.slotId==='CAM'?9:4)+vision/20;
    x+=run;
    if(slot.role==='FWD') {
      // Good positioning times the run to stay level. Poor timing can put the
      // participating receiver beyond the line when the pass is actually made.
      x=Math.min(x,Math.max(ball.x,defensiveLine)-3+(80-positioning)/18+Math.sin(phase)*3);
    } else if(slot.role==='MID') {
      x=Math.min(x,Math.max(ball.x,defensiveLine)-3);
    }
    y=50+lane*tactics.width+(ball.y-50)*(slot.role==='FWD'?0.2:0.3)+Math.cos(phase)*4;
  } else {
    const base=slot.role==='DEF'?tactics.lineHeight:slot.role==='FWD'?tactics.lineHeight+24:tactics.lineHeight+12;
    x=Math.min(base,ball.x-(slot.role==='DEF'?10:2))+run*0.6;
    y=50+lane*tactics.width*0.75+(ball.y-50)*(0.25+tactics.pressing*0.25)+Math.cos(phase)*3;
  }
  return {x:clamp(x,10,94),y:clamp(y,8,92)};
}

export function moveToward(point:PitchPoint,target:PitchPoint,pace:number,energy:number,elapsed:number):PitchPoint {
  const gap=distance(point,target);
  const allowance=(3.5+pace/13)*(0.55+energy/220)*elapsed;
  const fraction=gap?Math.min(1,allowance/gap):1;
  return {x:point.x+(target.x-point.x)*fraction,y:point.y+(target.y-point.y)*fraction};
}
