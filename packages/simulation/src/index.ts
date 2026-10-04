import type {
  HistoricalPlayer, LineupSlot, MatchConfig, MatchEvent, MatchEventType, MatchResult,
  PlayerAttributes, PlayerMatchStats, ReplaySnapshot, RestartType, PitchPoint, Team, TeamMatchStats, TeamProfile, TeamSide,
} from "@footballsimsim/shared";
import { TEAM_SIZE } from "@footballsimsim/shared";
import { distance, movementTarget, moveToward, teamTactics } from "./movement.js";
import { seededRandom } from "./random.js";
import { boundaryRestart, cardForChallenge, checkOffside, inPenaltyArea } from "./rules.js";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const opponent = (side: TeamSide): TeamSide => side === "HOME" ? "AWAY" : "HOME";
const playerKey = (side: TeamSide, player: HistoricalPlayer) => `${side}:${player.id}`;
const outfield = (team: Team) => team.lineup.filter(slot => slot.role !== "GK");
const keeper = (team: Team) => team.lineup.find(slot => slot.role === "GK")!;
const chance = (attack: number, defence: number, base: number, min: number, max: number) =>
  clamp(1 / (1 + Math.exp(-(Math.log(base / (1 - base)) + (attack - defence) / 35))), min, max);

export function validateMatchConfig(config: MatchConfig): void {
  for (const [label, team] of [["home", config.homeTeam], ["away", config.awayTeam]] as const) {
    if (team.lineup.length !== TEAM_SIZE) throw new Error(`${label} team must contain exactly ${TEAM_SIZE} players`);
    if (team.lineup.filter(slot => slot.role === "GK").length !== 1) throw new Error(`${label} team must assign exactly one player to goalkeeper`);
    if (new Set(team.lineup.map(slot => slot.player.id)).size !== TEAM_SIZE) throw new Error(`${label} team cannot select the same historical player twice`);
  }
  if (!Number.isFinite(config.durationMinutes ?? 90) || (config.durationMinutes ?? 90) <= 0) throw new Error("match duration must be positive");
}

// Use specific attributes, with their broad FIFA attribute as fallback when absent.
function attribute(player: HistoricalPlayer, key: keyof PlayerAttributes, fallback: keyof PlayerAttributes): number {
  const value = player.attributes[key] ?? player.attributes[fallback] ?? 50;
  return clamp(Number.isFinite(value) ? value : 50, 0, 99);
}
function skill(slot: LineupSlot, kind: "passing" | "dribbling" | "defending" | "shooting" | "keeping"): number {
  const p = slot.player;
  const a = (key: keyof PlayerAttributes, fallback: keyof PlayerAttributes = key) => attribute(p, key, fallback);
  const values = {
    passing: slot.role === "GK" && !p.attributes.passing ? [a("goalkeeperKicking", "reactions"), a("goalkeeperKicking", "reactions"), a("composure", "reactions")] : [a("passing"), a("vision", "passing"), a("composure", "passing")],
    dribbling: [a("dribbling"), a("ballControl", "dribbling"), a("agility", "pace"), a("pace")],
    defending: [a("defending"), a("interceptions", "defending"), a("standingTackle", "defending"), a("strength", "physical")],
    shooting: [a("shooting"), a("finishing", "shooting"), a("composure", "shooting")],
    keeping: [a("goalkeeperDiving", "reactions"), a("goalkeeperHandling", "reactions"), a("goalkeeperPositioning", "reactions"), a("goalkeeperReflexes", "reactions")],
  };
  const compatible = slot.player.positions.includes(slot.role);
  return average(values[kind]) * (compatible ? 1 : 0.9);
}
function profile(team: Team): TeamProfile {
  const field = outfield(team);
  const weighted = (kind: "shooting" | "passing" | "defending", role: string) => {
    const weights = field.map(slot => slot.role === role ? 1.6 : 1);
    return Math.round(field.reduce((sum, slot, i) => sum + skill(slot, kind) * weights[i]!, 0) / weights.reduce((s, w) => s + w, 0));
  };
  return { attack: weighted("shooting", "FWD"), control: weighted("passing", "MID"), defence: weighted("defending", "DEF"), goalkeeping: Math.round(skill(keeper(team), "keeping")) };
}
function weightedSelect<T>(items: T[], weight: (item: T) => number, random: () => number): T {
  const weights = items.map(item => Math.max(0.01, weight(item)));
  let roll = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) { roll -= weights[i]!; if (roll <= 0) return items[i]!; }
  return items[items.length - 1]!;
}
const blankTeamStats = (): TeamMatchStats => ({ possession: 0, passesAttempted: 0, passesCompleted: 0, dribblesAttempted: 0, dribblesCompleted: 0, interceptions: 0, shots: 0, shotsOnTarget: 0, goals: 0, saves: 0, expectedGoals: 0, fouls: 0, offsides: 0, corners: 0, yellowCards: 0, redCards: 0, freeKicks: 0, penalties: 0 });
function blankPlayerStats(side: TeamSide, player: HistoricalPlayer): PlayerMatchStats {
  return { key: playerKey(side, player), team: side, playerId: player.id, playerName: player.name,
    passesAttempted: 0, passesCompleted: 0, dribblesAttempted: 0, dribblesCompleted: 0, interceptions: 0,
    shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, saves: 0, rating: 6, fouls: 0, yellowCards: 0, redCards: 0 };
}


export function simulateMatch(config: MatchConfig): MatchResult {
  validateMatchConfig(config);
  const regulation = config.durationMinutes ?? 90;
  const random = seededRandom(config.seed);
  const teams: Record<TeamSide, Team> = { HOME: config.homeTeam, AWAY: config.awayTeam };
  const teamProfiles = { HOME: profile(teams.HOME), AWAY: profile(teams.AWAY) };
  const teamStats = { HOME: blankTeamStats(), AWAY: blankTeamStats() };
  const stats = new Map<string, PlayerMatchStats>();
  const dismissed = new Set<string>();
  for (const teamSide of ["HOME", "AWAY"] as const) for (const slot of teams[teamSide].lineup) stats.set(playerKey(teamSide, slot.player), blankPlayerStats(teamSide, slot.player));
  const field = (teamSide: TeamSide) => outfield(teams[teamSide]).filter(slot => !dismissed.has(playerKey(teamSide, slot.player)));
  const abilities = (teamSide: TeamSide) => {
    const active = { ...teams[teamSide], lineup: teams[teamSide].lineup.filter(slot => !dismissed.has(playerKey(teamSide, slot.player))) };
    const strength = profile(active), numericalStrength = field(teamSide).length / 4;
    return { ...strength, attack: strength.attack * numericalStrength ** 0.3, control: strength.control * numericalStrength ** 0.35, defence: strength.defence * numericalStrength ** 0.5 };
  };
  const events: MatchEvent[] = [];
  const score = { home: 0, away: 0 };
  const possessionTime = { HOME: 0, AWAY: 0 };
  const addedTime = { firstHalf: 0, secondHalf: 0 };
  const startingSide: TeamSide = random() < 0.5 ? "HOME" : "AWAY";
  let side = startingSide;
  let progress = 0.35;
  let minute = 0;
  let period: 1 | 2 = 1;
  let halfTimeMinute = regulation / 2;
  let periodEnd = regulation / 2;
  let addedAnnounced = false;
  let lostSeconds = 0;
  let abandoned = false;
  let carrier = weightedSelect(field(side), slot => slot.role === "MID" ? 2 : 1, random);
  let lastPasser: LineupSlot | undefined;
  let mustPass = false;
  let directRestart: RestartType | undefined;
  let pending: { type: RestartType; team: TeamSide; spot: PitchPoint; indirect: boolean; ready: boolean } | undefined = { type: "KICKOFF", team: side, spot: { x: 50, y: 50 }, indirect: false, ready: true };
  let deliverySpot: PitchPoint | undefined;
  const direction = (teamSide: TeamSide): 1 | -1 => (teamSide === "HOME") === (period === 1) ? 1 : -1;
  const ownX = (x: number, teamSide = side) => direction(teamSide) === 1 ? x : 100 - x;
  const worldX = (x: number, teamSide = side) => direction(teamSide) === 1 ? x : 100 - x;
  const name = (slot: LineupSlot) => slot.player.shortName || slot.player.name;
  const playerStatsFor = (teamSide: TeamSide, slot: LineupSlot) => stats.get(playerKey(teamSide, slot.player))!;
  const energy = (slot: LineupSlot) => clamp(100 - minute * (0.15 + (100 - attribute(slot.player, "stamina", "physical")) / 200), 50, 100);
  const effective = (slot: LineupSlot, kind: Parameters<typeof skill>[1]) => skill(slot, kind) * (0.8 + energy(slot) / 500);
  const positions = new Map<string, PitchPoint>();
  const activeTeam = (teamSide: TeamSide) => ({ ...teams[teamSide], lineup: teams[teamSide].lineup.filter(slot => !dismissed.has(playerKey(teamSide, slot.player))) });
  const tactics = (teamSide: TeamSide) => teamTactics(activeTeam(teamSide), teamSide === "HOME" ? score.home : score.away, teamSide === "HOME" ? score.away : score.home, minute, regulation);
  const position = (teamSide: TeamSide, slot: LineupSlot) => positions.get(playerKey(teamSide, slot.player))!;
  const resetShape = () => {
    for (const teamSide of ["HOME", "AWAY"] as const) teams[teamSide].lineup.forEach((slot,index)=> {
      const x=slot.role === "GK" ? 7 : slot.role === "DEF" ? 27 : slot.role === "FWD" ? 45 : 37;
      const y=slot.slotId === "LM" ? 25 : slot.slotId === "RM" ? 75 : slot.role === "GK" || slot.role === "FWD" ? 50 : index%2 ? 35 : 65;
      positions.set(playerKey(teamSide,slot.player),{x:worldX(x,teamSide),y});
    });
  };
  resetShape();
  positions.set(playerKey(side,carrier.player),{x:50,y:48});
  const ballPosition = ():PitchPoint => pending ? {...pending.spot} : deliverySpot && mustPass ? {...deliverySpot} : {x:position(side,carrier).x,y:clamp(position(side,carrier).y+2,0,100)};
  const updateProgress = () => { progress=clamp((ownX(ballPosition().x)/100-0.12)/0.78,0.08,0.98); };
  const restartTarget = (teamSide:TeamSide,slot:LineupSlot,target:PitchPoint):PitchPoint => {
    if (!pending) return target;
    if (teamSide===side && slot.player.id===carrier.player.id) return {x:pending.spot.x,y:pending.type==="THROW_IN"?pending.spot.y:clamp(pending.spot.y-2,0,100)};
    if(pending.type==="KICKOFF" && slot.role!=="GK") target.x=worldX(Math.min(ownX(target.x,teamSide),46),teamSide);
    if(pending.type==="PENALTY") {
      if(teamSide!==side && slot.role==="GK") return {x:worldX(100),y:50};
      target.x=worldX(Math.min(ownX(target.x),78));
    } else if(teamSide!==side && ["KICKOFF","FREE_KICK","CORNER","THROW_IN"].includes(pending.type)) {
      const minimum=pending.type==="THROW_IN"?2:9.15;
      const dx=(target.x-pending.spot.x)*1.05,dy=(target.y-pending.spot.y)*0.68;
      if(Math.hypot(dx,dy)<minimum) target.y=clamp(pending.spot.y+(pending.spot.y<14?1:pending.spot.y>86?-1:dy<0?-1:1)*Math.sqrt(minimum**2-dx**2)/0.68,2,98);
    } else if(pending.type==="GOAL_KICK" && teamSide!==side && ownX(target.x)<17 && target.y>=21 && target.y<=79) target.x=worldX(18);
    return target;
  };
  const movePlayers = (elapsed:number) => {
    const ball=ballPosition(), next=new Map(positions);
    const opponentLine=field(opponent(side)).concat(keeper(teams[opponent(side)])).map(slot=>ownX(position(opponent(side),slot).x)).sort((a,b)=>b-a)[1] ?? 80;
    for(const teamSide of ["HOME","AWAY"] as const) {
      const plan=tactics(teamSide), attacking=teamSide===side;
      const coveringPlayer=[...field(teamSide)].filter(slot=>slot.role!=="FWD").sort((a,b)=>effective(b,"defending")-effective(a,"defending"))[0];
      const pressingPlayer=[...field(teamSide)].sort((a,b)=>distance(position(teamSide,a),ball)/(10+effective(a,"defending"))-distance(position(teamSide,b),ball)/(10+effective(b,"defending")))[0];
      activeTeam(teamSide).lineup.forEach((slot,index)=> {
        const holder=attacking && slot.player.id===carrier.player.id;
        const localBall={x:ownX(ball.x,teamSide),y:ball.y};
        const movementRole=!attacking && slot===coveringPlayer && slot.role==="MID"?{...slot,role:"DEF" as const}:slot;
        let target=movementTarget(movementRole,index,localBall,attacking,plan,minute,opponentLine,holder);
        if(!attacking && slot===pressingPlayer && !pending) {
          target={x:clamp(localBall.x-2-plan.pressing*2,8,92),y:localBall.y};
        } else if(!attacking && slot.role!=="GK") {
          const threats=field(side).filter(p=>p!==carrier).sort((a,b)=>ownX(position(side,a).x,teamSide)-ownX(position(side,b).x,teamSide));
          const mark=threats[(index-1)%Math.max(1,threats.length)];
          if(mark) target.y=target.y*0.55+position(side,mark).y*0.45;
        }
        target={x:worldX(target.x,teamSide),y:target.y};
        target=restartTarget(teamSide,slot,target);
        if(holder && mustPass && deliverySpot && !pending) target={...position(teamSide,slot)};
        next.set(playerKey(teamSide,slot.player),moveToward(position(teamSide,slot),target,attribute(slot.player,"pace","physical"),energy(slot),elapsed));
      });
    }
    for(const [key,point] of next) positions.set(key,point);
    // Support players hold separate passing lanes instead of piling up on the
    // carrier. The nearest pressing opponent may still close to tackle.
    for(const teamSide of ["HOME","AWAY"] as const) {
      const players=field(teamSide);
      for(let i=0;i<players.length;i++) for(let j=i+1;j<players.length;j++) {
        const a=position(teamSide,players[i]!),b=position(teamSide,players[j]!);
        if(distance(a,b)<5 && !pending) {
          const shift=(a.y<=b.y?-1:1)*1.6;
          if(players[i]!==carrier) a.y=clamp(a.y+shift,8,92);
          if(players[j]!==carrier) b.y=clamp(b.y-shift,8,92);
        }
      }
    }
    if(!pending) updateProgress();
  };
  const snapshot = (phase: ReplaySnapshot["phase"] = pending ? "RESTART" : progress > 0.7 ? "ATTACK" : progress > 0.4 ? "PROGRESSION" : "BUILDUP"): ReplaySnapshot => {
    const players=(["HOME","AWAY"] as const).flatMap(teamSide=>activeTeam(teamSide).lineup.map(slot=>({
      key:playerKey(teamSide,slot.player),playerId:slot.player.id,name:name(slot),team:teamSide,slotId:slot.slotId,role:slot.role,
      ...position(teamSide,slot),energy:Math.round(energy(slot)),yellowCards:playerStatsFor(teamSide,slot).yellowCards,
    })));
    const total=possessionTime.HOME+possessionTime.AWAY;
    const homePossession=total?Math.round(possessionTime.HOME/total*100):50;
    return {players,ball:ballPosition(),possession:side,phase,period,direction:{HOME:direction("HOME"),AWAY:direction("AWAY")},status:pending?"STOPPAGE":"PLAY",
      carrierKey:playerKey(side,carrier.player),tactics:{HOME:tactics("HOME"),AWAY:tactics("AWAY")},
      restart:pending?{type:pending.type,team:side,takerKey:playerKey(side,carrier.player),spot:{...pending.spot},ready:pending.ready}:undefined,
      teamStats:{HOME:{...teamStats.HOME,possession:homePossession},AWAY:{...teamStats.AWAY,possession:100-homePossession}}};
  };
  const initialSnapshot = snapshot();
  const emit = (type: MatchEventType, eventSide: TeamSide, actor: LineupSlot, successful: boolean, description: string,
    explanation: string, secondary?: LineupSlot, probability?: number, expectedGoals?: number): MatchEvent => {
    const state = snapshot(type === "GOAL" ? "GOAL" : type === "SHOT" || type === "SAVE" ? "SHOT" : type === "HALF_TIME" ? "HALF_TIME" : type === "FULL_TIME" || type === "MATCH_ABANDONED" ? "FULL_TIME" : undefined);
    if (type === "SHOT" || type === "GOAL") state.ball = { x: worldX(98, eventSide), y: successful ? 50 : 25 };
    if (type === "SAVE") state.ball = { x: worldX(7, eventSide), y: 50 };
    if (type === "HALF_TIME") state.status = "HALF_TIME";
    if (type === "FULL_TIME") state.status = "FULL_TIME";
    if (type === "MATCH_ABANDONED") state.status = "ABANDONED";
    const event: MatchEvent = { id: `event-${events.length + 1}`, minute: Math.round(minute * 100) / 100, type, team: eventSide,
      playerId: actor.player.id, secondaryPlayerId: secondary?.player.id, successful, description, explanation, probability, expectedGoals, score: { ...score }, snapshot: state };
    events.push(event);
    return event;
  };
  const turnover = (newSide: TeamSide, holder?: LineupSlot) => {
    side = newSide;
    carrier = holder ?? weightedSelect(field(side), slot => (slot.role === "MID" ? 1.5 : 1) * Math.max(10, skill(slot, "passing")), random);
    deliverySpot=undefined;
    updateProgress();
    lastPasser = undefined; mustPass = false; directRestart = undefined;
  };
  const queueRestart = (type: RestartType, restartSide: TeamSide, spot: PitchPoint, indirect = false) => {
    turnover(restartSide);
    if (type === "PENALTY") spot = { x: worldX(89, restartSide), y: 50 };
    if (type === "GOAL_KICK") carrier = keeper(teams[side]);
    else carrier=weightedSelect(field(side),slot=> {
      const takingSkill=type==="PENALTY"?effective(slot,"shooting"):effective(slot,"passing");
      return Math.max(5,takingSkill)/(5+distance(position(side,slot),spot));
    },random);
    progress = clamp((ownX(spot.x) / 100 - 0.12) / 0.78, 0.15, 0.95);
    pending = { type, team: restartSide, spot, indirect, ready:false };
    if (type === "CORNER") teamStats[side].corners++;
    if (type === "FREE_KICK") teamStats[side].freeKicks++;
    if (type === "PENALTY") teamStats[side].penalties++;
    if(type!=="KICKOFF") {
      const setup=emit("RESTART_SETUP",side,carrier,true,`${name(carrier)} moves into position for the ${type.toLowerCase().replaceAll("_"," ")}.`,"The ball stays at the restart spot while teammates find space and opponents organise.");
      setup.restart=type;
    }
  };
  const ballOut = (boundary: "TOUCHLINE" | "GOAL_LINE", lastTouch: "ATTACK" | "DEFENCE", attackingSide: TeamSide, actor: LineupSlot) => {
    const type = boundaryRestart(boundary, lastTouch);
    const restartSide = lastTouch === "ATTACK" ? opponent(attackingSide) : attackingSide;
    const point = boundary === "TOUCHLINE" ? { x: snapshot().ball.x, y: random() < 0.5 ? 0 : 100 } : { x: worldX(100, attackingSide), y: 25 };
    const out = emit("BALL_OUT", lastTouch === "ATTACK" ? attackingSide : opponent(attackingSide), actor, false,
      `The ball crosses the ${boundary === "TOUCHLINE" ? "touchline" : "goal line"}.`, `${type.replaceAll("_", " ")} to ${teams[restartSide].name}; awarded from the last touch.`);
    out.snapshot.ball = point; out.snapshot.status = "STOPPAGE"; out.restart = type;
    queueRestart(type, restartSide, type === "CORNER" ? { x: worldX(96, attackingSide), y: random() < 0.5 ? 4 : 96 } : type === "GOAL_KICK" ? { x: worldX(7, restartSide), y: 50 } : { ...point });
  };
  const shoot = (kind: "OPEN_PLAY" | "PENALTY" | "FREE_KICK" = "OPEN_PLAY") => {
    const attackingSide = side, defendingSide = opponent(side), actor = carrier;
    const actorStats = playerStatsFor(side, actor), goalie = keeper(teams[defendingSide]);
    const shooting = kind === "PENALTY" ? average([attribute(actor.player, "penalties", "shooting"), attribute(actor.player, "composure", "shooting")]) : effective(actor, "shooting");
    const keeping = effective(goalie, "keeping");
    const ball=ballPosition(), goalDistance=distance({x:worldX(100),y:50},ball), angle=Math.abs(ball.y-50)/50;
    const shotProgress=clamp(1-goalDistance/100,0.2,0.98);
    const targetProbability = kind === "PENALTY" ? clamp(0.72 + shooting / 650, 0.72, 0.94) : clamp(0.38 + (shooting - 50) / 150 + (shotProgress - 0.6) * 0.3 - angle * 0.15 - (kind === "FREE_KICK" ? 0.08 : 0), 0.22, 0.82);
    const goalGivenTarget = chance(shooting, keeping, kind === "PENALTY" ? 0.82 : 0.15 + (shotProgress - 0.5) * 0.55 - angle * 0.1 - (kind === "FREE_KICK" ? 0.06 : 0), 0.06, 0.94);
    const blockProbability = kind === "PENALTY" ? 0 : clamp(0.08 + (abilities(defendingSide).defence - shooting) / 550, 0.03, 0.2);
    const xg = Math.round((1 - blockProbability) * targetProbability * goalGivenTarget * 1000) / 1000;
    const blocked = random() < blockProbability;
    const onTarget = !blocked && random() < targetProbability;
    actorStats.shots++; teamStats[side].shots++;
    teamStats[side].expectedGoals = Math.round((teamStats[side].expectedGoals + xg) * 1000) / 1000;
    if (onTarget) { actorStats.shotsOnTarget++; teamStats[side].shotsOnTarget++; }
    const location = kind === "PENALTY" ? "from the penalty spot" : kind === "FREE_KICK" ? "from the free kick" : progress > 0.78 ? "inside the area" : "from distance";
    emit("SHOT", side, actor, onTarget, `${name(actor)} shoots ${location}${blocked ? " — blocked." : onTarget ? "." : " — wide of the goal."}`,
      `Finishing ${Math.round(shooting)} vs keeper ${Math.round(keeping)} · distance ${Math.round(goalDistance)} pitch units · ${Math.round(xg * 100)}% goal chance.`, undefined, targetProbability, xg);
    if (blocked) {
      const blocker = weightedSelect(field(defendingSide), slot => Math.max(5, effective(slot, "defending")), random);
      emit("BLOCK", defendingSide, blocker, true, `${name(blocker)} blocks the shot.`, "The defender gets between the shot and the goal.", actor);
      if (random() < 0.55) ballOut("GOAL_LINE", "DEFENCE", attackingSide, blocker);
      else turnover(defendingSide, blocker);
    } else if (onTarget && random() < goalGivenTarget) {
      actorStats.goals++; teamStats[side].goals++;
      if (side === "HOME") score.home++; else score.away++;
      const assister = kind === "OPEN_PLAY" && lastPasser && lastPasser.player.id !== actor.player.id ? lastPasser : undefined;
      if (assister) playerStatsFor(side, assister).assists++;
      emit("GOAL", side, actor, true, `${name(actor)} scores ${location}!`, assister ? `Created by ${name(assister)}; the finish beats the goalkeeper.` : "The ball crosses the goal line between the posts.", assister, goalGivenTarget, xg);
      queueRestart("KICKOFF", defendingSide, { x: 50, y: 50 });
    } else if (onTarget) {
      playerStatsFor(defendingSide, goalie).saves++; teamStats[defendingSide].saves++;
      turnover(defendingSide, goalie); mustPass = true;
      emit("SAVE", defendingSide, goalie, true, `${name(goalie)} keeps it out.`, `Goalkeeping ${Math.round(keeping)} contests finishing ${Math.round(shooting)}.`, actor, 1 - goalGivenTarget);
      if (random() < 0.2) ballOut("GOAL_LINE", "DEFENCE", attackingSide, goalie);
    } else ballOut("GOAL_LINE", "ATTACK", attackingSide, actor);
  };
  const pass = () => {
    const actor = carrier, attackingSide = side, defendingSide = opponent(side);
    const attack = abilities(side), defence = abilities(defendingSide);
    const defender = weightedSelect(field(defendingSide), slot => Math.max(5, effective(slot, "defending"))/(6+distance(position(defendingSide,slot),ballPosition())), random);
    const plan=tactics(side), release=ballPosition(), restart=directRestart;
    const opponentsAtKick=activeTeam(defendingSide).lineup.map(slot=>position(defendingSide,slot));
    const receiver = weightedSelect(field(side).filter(slot => slot.player.id !== actor.player.id), slot => {
      const point=position(side,slot);
      const advancing=ownX(point.x)>ownX(release.x)+3;
      const roleWeight=slot.role==="FWD"?1.8:slot.role==="MID"?1.4:0.7;
      const styleWeight=plan.style==="DIRECT"&&advancing?1.6:plan.style==="POSSESSION"&&!advancing?1.5:1;
      const intentWeight=advancing?0.6+plan.risk:1.4-plan.risk;
      const nearestOpponent=Math.min(...field(defendingSide).map(p=>distance(position(defendingSide,p),point)));
      const space=clamp(nearestOpponent/10,0.5,1.6);
      const flagged=checkOffside(release,{...point,playerId:slot.player.id},opponentsAtKick,direction(side),restart).offside;
      const awareness=flagged?clamp(0.02+(100-attribute(actor.player,"vision","passing"))**2/25000,0.02,0.5):1;
      return roleWeight*styleWeight*intentWeight*space*awareness*Math.max(10,attribute(slot.player,"ballControl","dribbling"))/(10+distance(release,point)*0.25);
    }, random);
    const passing = effective(actor, "passing") * 0.7 + attack.control * 0.3;
    const pressure = effective(defender, "defending") * 0.65 + defence.defence * 0.35;
    const forward = ownX(position(side,receiver).x)>ownX(release.x)+3;
    const range=distance(release,position(side,receiver));
    const probability = chance(passing, pressure, clamp((forward ? 0.83 : 0.91)-Math.max(0,range-20)/280,0.6,0.94), 0.25, 0.97);
    const kick = snapshot();
    const target = { ...kick.players.find(player => player.key === playerKey(side, receiver.player))! };
    const opponents = kick.players.filter(player => player.team === defendingSide);
    const decision = checkOffside(kick.ball, target, opponents, direction(side), directRestart);
    const offside = decision.offside;
    const success = !offside && random() < probability;
    playerStatsFor(side, actor).passesAttempted++; teamStats[side].passesAttempted++;
    directRestart = undefined; deliverySpot=undefined;
    if (success) {
      playerStatsFor(side, actor).passesCompleted++; teamStats[side].passesCompleted++;
      carrier = receiver; lastPasser = actor; mustPass = false;
      updateProgress();
    }
    const passingEvent = emit("PASS", side, actor, success, offside ? `${name(actor)} looks for ${name(receiver)} — the flag goes up.` : success ? `${name(actor)} ${forward ? "plays forward to" : "recycles possession with"} ${name(receiver)}.` : `${name(actor)}'s pass is cut out.`,
      `Passing / control ${Math.round(passing)} vs pressure ${Math.round(pressure)} · ${Math.round(probability * 100)}% completion.`, success ? receiver : undefined, probability);
    passingEvent.ballMotion={kind:restart==="THROW_IN"?"THROW_IN":"PASS",from:release,to:{x:target.x,y:target.y+2}};
    if(restart==="THROW_IN") {
      passingEvent.restart=restart;
      passingEvent.description=success?`${name(actor)} throws to teammate ${name(receiver)}.`:`${name(actor)}'s throw-in is contested by ${name(defender)}.`;
    }
    if (forward && receiver.role === "FWD") passingEvent.offside = decision;
    if (offside) {
      teamStats[side].offsides++;
      const flagged = emit("OFFSIDE", side, receiver, false, `${name(receiver)} is offside.`, "At the pass, the receiver is in the opponent's half and beyond both the ball and second-last opponent.", actor);
      flagged.offside = decision;
      flagged.snapshot.players = kick.players.map(player => player.key === target.key ? target : player);
      flagged.snapshot.ball = { ...decision.receiver }; flagged.snapshot.status = "STOPPAGE";
      queueRestart("FREE_KICK", defendingSide, decision.receiver, true);
    } else if (!success && (receiver.slotId === "LM" || receiver.slotId === "RM") && random() < 0.15) ballOut("TOUCHLINE", "ATTACK", attackingSide, actor);
    else if (!success) {
      playerStatsFor(defendingSide, defender).interceptions++; teamStats[defendingSide].interceptions++;
      turnover(defendingSide, defender);
      emit("INTERCEPTION", defendingSide, defender, true, `${name(defender)} intercepts and breaks forward.`, "Defensive reading stops the buildup; possession changes.", actor);
    }
  };
  const takeRestart = () => {
    const restart = pending!;
    restart.ready=true;
    for(const teamSide of ["HOME","AWAY"] as const) for(const slot of activeTeam(teamSide).lineup) positions.set(playerKey(teamSide,slot.player),restartTarget(teamSide,slot,{...position(teamSide,slot)}));
    const event = emit(restart.type, side, carrier, true,
      restart.type === "THROW_IN" ? `${name(carrier)} is at the touchline, ready to throw to a teammate.` : restart.type === "KICKOFF" ? `${teams[side].name} kick off.` : `${name(carrier)} takes the ${restart.type.toLowerCase().replaceAll("_", " ")}.`,
      restart.type === "FREE_KICK" ? `${restart.indirect ? "Indirect" : "Direct"} free kick. ${restart.indirect ? "Another player must touch the ball before a goal can count." : "A goal can be scored directly."}` : restart.type === "PENALTY" ? "A direct-free-kick offence occurred inside the defending penalty area." : ["CORNER", "THROW_IN", "GOAL_KICK"].includes(restart.type) ? "No offside offence from receiving this restart directly." : "The ball is placed on the centre spot; opponents start in their own half.");
    event.restart = restart.type;
    pending = undefined;
    if (restart.type === "PENALTY") { lastPasser = undefined; shoot("PENALTY"); }
    else if (restart.type === "FREE_KICK" && !restart.indirect && progress > 0.7 && random() < 0.35) { lastPasser = undefined; shoot("FREE_KICK"); }
    else {
      mustPass = true;
      directRestart = restart.type; deliverySpot={...restart.spot};
      if (restart.type === "KICKOFF") progress = 0.35;
    }
  };
  takeRestart();

  while (!abandoned) {
    if (minute >= periodEnd) {
      if (!addedAnnounced) {
        const added = Math.ceil(lostSeconds / 60);
        addedTime[period === 1 ? "firstHalf" : "secondHalf"] = added;
        addedAnnounced = true;
        periodEnd += added;
        if (added) { emit("ADDED_TIME", side, carrier, true, `${added} minute${added === 1 ? "" : "s"} of added time.`, "Allowance for time lost to restarts and disciplinary decisions."); continue; }
      }
      const additional = Math.ceil(lostSeconds / 60) - addedTime[period === 1 ? "firstHalf" : "secondHalf"];
      if (additional > 0) {
        addedTime[period === 1 ? "firstHalf" : "secondHalf"] += additional;
        periodEnd += additional;
        continue;
      }
      // Extend either half to complete a penalty awarded before its whistle.
      if (pending?.type === "PENALTY") takeRestart();
      if (period === 1) {
        halfTimeMinute = minute;
        emit("HALF_TIME", side, carrier, true, "Half time. The teams change ends.", "The team that did not take the opening kickoff starts the second half.");
        period = 2; periodEnd = minute + regulation / 2; addedAnnounced = false; lostSeconds = 0;
        resetShape();
        queueRestart("KICKOFF", opponent(startingSide), { x: 50, y: 50 });
        takeRestart();
        continue;
      }
      emit("FULL_TIME", side, carrier, true, "Full time. The final whistle blows.", "The final score includes both halves and added time.");
      break;
    }
    const setupTime=pending?0.5+distance(position(side,carrier),pending.spot)/((3.5+attribute(carrier.player,"pace","physical")/13)*(0.55+energy(carrier)/220)):0;
    // At 1×, an ordinary action has roughly one second of visible movement.
    // Fast/direct teams play quicker; leading possession teams take more time.
    const step = pending ? Math.max(0.75,setupTime) : (1.05+random()*0.35)/tactics(side).tempo;
    const elapsed = Math.min(step, periodEnd - minute);
    // Ordinary dead-ball time is part of the match clock. Add an allowance
    // for the modelled restart delay, rather than every second of animation.
    if (pending) {
      const allowance=pending.type==="THROW_IN"?6:pending.type==="GOAL_KICK"?12:pending.type==="KICKOFF"?25:pending.type==="PENALTY"?30:18;
      lostSeconds += Math.min(elapsed*60,allowance);
    } else possessionTime[side] += elapsed;
    minute += elapsed;
    movePlayers(elapsed);
    if(elapsed<step-0.00001) continue;
    if (pending) { takeRestart(); continue; }
    const actor = carrier, attackingSide = side, defendingSide = opponent(side);
    const attack = abilities(side), defence = abilities(defendingSide);
    const defender = weightedSelect(field(defendingSide), slot => Math.max(5, effective(slot, "defending")) * (slot.role === "DEF" ? 1.6 : 1)/(6+distance(position(defendingSide,slot),ballPosition())), random);
    const actorStats = playerStatsFor(side, actor), defenderStats = playerStatsFor(defendingSide, defender);
    const aggression = attribute(defender.player, "aggression", "physical");
    const foulProbability = clamp(0.018 + (aggression - 50) / 2500 + (80 - effective(defender, "defending")) / 3000 + (100 - energy(defender)) / 2500, 0.008, 0.065);
    if (!mustPass && actor.role !== "GK" && random() < foulProbability) {
      defenderStats.fouls++; teamStats[defendingSide].fouls++;
      const severityRoll = random();
      const severity = severityRoll < 0.015 ? "EXCESSIVE" : severityRoll < 0.32 ? "RECKLESS" : "CARELESS";
      const handball = random() < 0.06;
      // A handball is not a reckless tackle. Here it stops a promising attack
      // and receives a caution, rather than a random excessive-force red.
      const card = cardForChallenge(handball ? "RECKLESS" : severity, defenderStats.yellowCards);
      const spot = snapshot().ball;
      const penalty = inPenaltyArea(spot, direction(side));
      emit("FOUL", defendingSide, defender, false, handball ? `${name(defender)} handles the ball.` : `${name(defender)} fouls ${name(actor)}.`, handball ? "A deliberate handball offence is penalised." : `${severity.toLowerCase()} challenge; a restart is awarded.`, actor);
      if (card === "NONE" && !handball && !penalty && progress > 0.6 && random() < 0.25) {
        emit("ADVANTAGE", side, actor, true, "Advantage — the attack continues.", "The attacking side retains a promising opportunity after a careless foul.");
      } else {
        lostSeconds += card === "NONE" ? 4 : 12;
        if (card === "YELLOW" || card === "SECOND_YELLOW") {
          defenderStats.yellowCards++; teamStats[defendingSide].yellowCards++;
          emit("YELLOW_CARD", defendingSide, defender, false, `${name(defender)} receives ${card === "SECOND_YELLOW" ? "a second yellow card" : "a yellow card"}.`, handball ? "Deliberate handball stops a promising attack and is cautioned." : "A reckless challenge is cautioned.");
        }
        if (card === "RED" || card === "SECOND_YELLOW") {
          defenderStats.redCards++; teamStats[defendingSide].redCards++;
          dismissed.add(playerKey(defendingSide, defender.player));
          emit("RED_CARD", defendingSide, defender, false, `${name(defender)} is sent off.`, card === "RED" ? "Excessive force: direct red card. The team plays with one fewer player." : "A second caution results in a red card. The player cannot be replaced.");
          if (field(defendingSide).length < 2) {
            abandoned = true;
            emit("MATCH_ABANDONED", defendingSide, defender, false, "Match abandoned: too few players remain.", "This custom five-a-side format requires at least three players, including a goalkeeper.");
            break;
          }
        }
        queueRestart(penalty ? "PENALTY" : "FREE_KICK", attackingSide, spot);
        continue;
      }
    }
    const shotWeight = mustPass || actor.role === "GK" || progress < 0.52 ? 0 : clamp(0.08+(progress - 0.48) * (actor.role === "FWD" ? 1.55 : 0.95) + (effective(actor, "shooting") - 60) / 500 + (tactics(side).risk-0.5)*0.16, 0.02, 0.65);
    const dribbleWeight = mustPass || actor.role === "GK" ? 0 : clamp(0.12 + (effective(actor, "dribbling") - effective(actor, "passing")) / 250 + (progress > 0.5 ? 0.08 : 0), 0.05, 0.32);
    const roll = random();
    if (roll < shotWeight) shoot();
    else if (roll < shotWeight + dribbleWeight) {
      const attackingSkill = effective(actor, "dribbling") * 0.8 + attack.control * 0.2;
      const defendingSkill = effective(defender, "defending") * 0.8 + defence.defence * 0.2;
      const probability = chance(attackingSkill, defendingSkill, 0.62 - progress * 0.1, 0.12, 0.92);
      const success = random() < probability;
      actorStats.dribblesAttempted++; teamStats[side].dribblesAttempted++;
      if (success) { actorStats.dribblesCompleted++; teamStats[side].dribblesCompleted++; const point=position(side,actor); point.x=worldX(clamp(ownX(point.x)+5+attribute(actor.player,"pace","pace")/20,8,94)); updateProgress(); }
      emit("DRIBBLE", side, actor, success, `${name(actor)} ${success ? "drives past" : "is stopped by"} ${name(defender)}.`,
        `Dribbling / pace ${Math.round(attackingSkill)} vs pressure ${Math.round(defendingSkill)} · ${Math.round(probability * 100)}% success.`, defender, probability);
      if (!success) { defenderStats.interceptions++; teamStats[defendingSide].interceptions++; turnover(defendingSide, defender); emit("INTERCEPTION", defendingSide, defender, true, `${name(defender)} wins the duel and starts a counter.`, "The failed dribble turns possession over.", actor); }
    } else pass();
    if (attackingSide !== side) lastPasser = undefined;
  }
  const finalSnapshot = snapshot();
  teamStats.HOME.possession = finalSnapshot.teamStats.HOME.possession; teamStats.AWAY.possession = 100 - teamStats.HOME.possession;
  const playerStats = [...stats.values()].map(player => ({ ...player,
    rating: clamp(Math.round((6 + player.goals * 1.2 + player.assists * 0.6 + player.saves * 0.1 + player.interceptions * 0.08 + player.passesCompleted * 0.01 + player.dribblesCompleted * 0.04 - (player.passesAttempted - player.passesCompleted) * 0.025 - (player.shots - player.shotsOnTarget) * 0.06 - player.yellowCards * 0.2 - player.redCards * 0.8) * 10) / 10, 5, 10) }));
  playerStats.sort((a,b)=>b.rating-a.rating || b.goals-a.goals || a.key.localeCompare(b.key));
  const best = playerStats[0]!;
  return { seed: String(config.seed), regulationMinutes: regulation, durationMinutes: Math.round(minute * 100) / 100, halfTimeMinute, addedTime,
    ruleset: "CUSTOM_FIVE_A_SIDE_FOOTBALL", status: abandoned ? "ABANDONED" : "COMPLETED", initialSnapshot, teamProfiles,
    finalState: { minute: Math.round(minute * 100) / 100, possession: side, score: { ...score } }, events, teamStats, playerStats,
    manOfTheMatch: { playerId: best.playerId, playerName: best.playerName, team: best.team, rating: best.rating } };
}
export type { MatchConfig, MatchResult } from "@footballsimsim/shared";
