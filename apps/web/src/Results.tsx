import { ArrowLeft, ArrowRight, CircleDot, RotateCcw, Shield, Sparkles, Target, Trophy } from 'lucide-react'
import type { MatchEvent, MatchResult, Side, TeamStats } from './types'
import { Header } from './App'
import './Results.css'
import { matchClock } from './replay'

const initials = (name: string) => name.trim().split(/\s+/).filter(word=>!['da','de','dos','do'].includes(word.toLowerCase())).slice(0,2).map(word=>word[0]).join('')

export function Results({result,onReplay,onReset}:{result:MatchResult;onReplay:()=>void;onReset:()=>void}) {
  const abandoned = result.status === 'ABANDONED'
  const draw = result.home.score === result.away.score
  const winningSide: Side = result.home.score > result.away.score ? 'home' : 'away'
  const winner = result[winningSide]
  const goals = result.events.filter(event=>event.type==='goal')
  const star = result.manOfTheMatch
  const playerName = (playerId: string | undefined, side: Side | undefined, fallback: string) => result.initialSnapshot?.players.find(player=>player.playerId===playerId && player.team===(side==='away'?'AWAY':'HOME'))?.name ?? fallback
  const starName = star ? playerName(star.playerId,star.team,star.player) : 'Player of the match'
  const ratings = [...(result.playerRatings ?? [])].sort((a,b)=>b.rating-a.rating)
  const rows: [string, keyof TeamStats][] = [['Possession','possession'],['Shots','shots'],['On target','shotsOnTarget'],['Expected goals','expectedGoals'],['Pass accuracy','passAccuracy'],['Fouls','fouls'],['Offsides','offsides'],['Corners','corners'],['Yellow cards','yellowCards'],['Red cards','redCards']]
  const formatStat = (key:keyof TeamStats, value:number)=>key==='expectedGoals'?value.toFixed(2):`${value}${key==='possession'||key==='passAccuracy'?'%':''}`
  const homeXg = result.home.stats.expectedGoals ?? 0
  const awayXg = result.away.stats.expectedGoals ?? 0
  const bestChances = homeXg >= awayXg ? result.home : result.away
  const insight = homeXg + awayXg > 0 ? `${bestChances.name} generated ${Math.max(homeXg,awayXg).toFixed(2)} expected goals from ${bestChances.stats.shots} shots.` : 'Every duel, pass and finish shaped the final score.'

  return <div className="results-page report-page"><Header step="result"/><main className="report-main">
    <div className="report-topline"><span><i/>{abandoned?'Abandoned':'Full time'} · {result.regulationMinutes ?? 90} minutes{result.addedTime && ` + ${result.addedTime.firstHalf + result.addedTime.secondHalf} added`}</span><small>Match report / 5-a-side</small></div>
    <section className="report-hero">
      <p className="eyebrow">{abandoned?'Match stopped':draw?'Honours even':'The final whistle'}</p>
      <h1>{abandoned?'The match was abandoned.':draw?'Nothing between them.':`${winner.name} takes it.`}</h1>
      <p className="report-subtitle">{abandoned?'Too few players remained. The score at stoppage is shown below.':draw?'A shared result. Both teams gave everything.':`A ${winner.score}-${result[winningSide==='home'?'away':'home'].score} victory, built one play at a time.`}</p>
      <div className="report-scoreboard" aria-label={`Final score: ${result.home.name} ${result.home.score}, ${result.away.name} ${result.away.score}`}>
        {(['home','away'] as const).map((side,index)=><div className={`report-team ${side} ${!abandoned&&!draw&&winningSide===side?'winner':''}`} key={side}>
          <span className="report-crest"><Shield/></span><b>{result[side].name}</b><small>{side} team</small>{!abandoned&&!draw&&winningSide===side&&<span className="winner-tag"><Trophy size={11}/>Winner</span>}
          {index===0 && <div className="report-final-score"><strong>{result.home.score}</strong><i>:</i><strong>{result.away.score}</strong><span>{abandoned?'STOPPED':'FT'}</span></div>}
        </div>)}
      </div>
    </section>
    <div className="report-grid">
      <aside className="report-star report-panel"><Trophy className="star-watermark"/>
        <div className="star-avatar">{initials(starName)}<span><Trophy size={14}/></span></div>
        <div className="star-info"><div className="star-label"><Trophy size={15}/>Player of the match</div><h2>{starName}</h2>{starName!==star?.player&&<p className="star-full-name">{star?.player}</p>}
          <span className={`star-team ${star?.team ?? ''}`}>{star?.team ? result[star.team].name : 'Match standout'}</span></div>
        <div className="star-note">{star?.team && <span>{result.events.filter(event=>event.type==='goal'&&event.playerId===star.playerId&&event.team===star.team).length} goals</span>}<span>Top rated performance</span></div>
        <div className="star-rating"><strong>{star?.rating.toFixed(1) ?? '—'}</strong><div><b>Match rating</b><span>out of 10</span></div></div>
      </aside>
      <section className="report-stats report-panel"><div className="report-panel-heading"><div><p className="eyebrow">The numbers</p><h2>How the match unfolded</h2></div><Target size={21}/></div>
        <div className="report-stat-teams"><span><i/>{result.home.name}</span><span>{result.away.name}<i/></span></div>
        {rows.map(([label,key])=>{const h=result.home.stats[key]??0,a=result.away.stats[key]??0;return <div className="report-stat-row" key={key}>
          <div><b className={h>a?'stat-leading':''}>{formatStat(key,h)}</b><span>{label}</span><b className={a>h?'stat-leading':''}>{formatStat(key,a)}</b></div>
          <div className="report-stat-track"><span style={{width:`${h+a?h/(h+a)*100:50}%`}}/></div>
        </div>})}
        <div className="report-insight"><Sparkles size={17}/><p>{insight}<small>Expected goals estimate chance quality in this simulation.</small></p></div>
      </section>
    </div>
    <div className="report-details">
      <section className="report-panel report-goals"><div className="report-panel-heading"><div><p className="eyebrow">Decisive moments</p><h2>The goals</h2></div><span>{goals.length} scored</span></div>
        <div className="report-goal-list">{goals.length?goals.map((event,index)=><GoalRow event={event} name={playerName(event.playerId,event.team,event.player)} assist={event.assistId ? playerName(event.assistId,event.team,'') || undefined : undefined} clock={matchClock(result,event.minute,event.snapshot?.period)} key={index}/>):<div className="report-no-goals"><Shield size={22}/><b>A clean sheet at both ends.</b><span>Neither team found the breakthrough.</span></div>}</div>
      </section>
      <section className="report-panel report-ratings"><div className="report-panel-heading"><div><p className="eyebrow">Individual impact</p><h2>Player ratings</h2></div><span>{ratings.length} players</span></div><div className="ratings-list">{ratings.map((player,index)=><div className={`rating-row ${player.team}`} key={`${player.team}:${player.playerId ?? player.player}:${index}`}><span className="rating-rank">{String(index+1).padStart(2,'0')}</span><span className="rating-avatar">{initials(playerName(player.playerId,player.team,player.player))}</span><div><b>{playerName(player.playerId,player.team,player.player)}</b><small>{result[player.team].name}{!!player.redCards&&' · Sent off'}{!player.redCards&&!!player.yellowCards&&' · Yellow card'}</small></div><strong className={player.rating>=8?'high-rating':''}>{player.rating.toFixed(1)}</strong></div>)}</div></section>
    </div>
    <footer className="report-actions"><div><b>Run it back?</b><span>Replay every moment, or build your next matchup.</span></div><button className="report-edit" onClick={onReset}><ArrowLeft size={16}/>Edit teams</button><button className="report-replay" onClick={onReplay}><RotateCcw size={16}/>Watch replay<ArrowRight size={16}/></button></footer>
  </main></div>
}

function GoalRow({event,name,assist,clock}:{event:MatchEvent;name:string;assist?:string;clock:string}) {
  return <article className={`report-goal ${event.team}`}><time>{clock}</time><span className="goal-ball"><CircleDot size={16}/></span><div><b>{name}</b><small>{assist ? `Assist by ${assist}` : 'Unassisted'}</small></div><span className="goal-score">{event.homeScore} <i>:</i> {event.awayScore}</span></article>
}
