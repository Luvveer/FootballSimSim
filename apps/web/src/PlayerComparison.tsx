import { useEffect, useRef, useState } from 'react'
import { GitCompareArrows, X } from 'lucide-react'
import { fetchPlayerVersions } from './api'
import type { Player } from './types'

const stats = [
  ['Pace', 'pace'], ['Shooting', 'shooting'], ['Passing', 'passing'],
  ['Dribbling', 'dribbling'], ['Defending', 'defending'], ['Physical', 'physical'],
] as const

export function PlayerComparison({player,onClose}:{player:Player;onClose:()=>void}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [versions,setVersions] = useState<Player[]>([])
  const [firstIndex,setFirstIndex] = useState(0)
  const [secondIndex,setSecondIndex] = useState(0)
  const [error,setError] = useState<string|null>(null)
  const [loading,setLoading] = useState(true)

  useEffect(() => { const dialog=dialogRef.current; dialog?.showModal(); return()=>dialog?.close() }, [])
  useEffect(() => {
    const controller=new AbortController()
    fetchPlayerVersions(player.playerId,controller.signal).then(items=>{setVersions(items);setFirstIndex(0);setSecondIndex(Math.max(0,items.length-1))}).catch(value=>{if(!(value instanceof DOMException&&value.name==='AbortError'))setError(value instanceof Error?value.message:'Could not load player history.')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[player.playerId])

  const first=versions[firstIndex], second=versions[secondIndex]
  return <dialog className="comparison-dialog" ref={dialogRef} onCancel={onClose} onClose={onClose} aria-labelledby="comparison-title"><div className="comparison-head"><div><p className="eyebrow">Player evolution</p><h2 id="comparison-title">{player.name} through the years</h2><p>Pick two FIFA editions and see how the ratings changed.</p></div><button className="dialog-close" onClick={onClose} aria-label="Close player comparison"><X/></button></div>{loading&&<div className="comparison-status" role="status">Loading FIFA history…</div>}{error&&<div className="comparison-status error" role="alert">{error}</div>}{!loading&&!error&&versions.length<2&&<div className="comparison-status">Only one FIFA edition is available for this player.</div>}{first&&second&&<><div className="version-pickers"><VersionPicker label="Earlier edition" versions={versions} value={firstIndex} onChange={setFirstIndex}/><GitCompareArrows aria-hidden="true"/><VersionPicker label="Later edition" versions={versions} value={secondIndex} onChange={setSecondIndex}/></div><div className="comparison-body"><RadarChart first={first} second={second}/><div className="comparison-table" role="table" aria-label={`${player.name} attribute comparison`}><div className="comparison-row header" role="row"><span role="columnheader">Attribute</span><b role="columnheader">{formatVersion(first.version)}</b><b role="columnheader">{formatVersion(second.version)}</b><span role="columnheader">Change</span></div>{stats.map(([label,key])=>{const change=second[key]-first[key];return <div className="comparison-row" role="row" key={key}><span role="cell">{label}</span><b role="cell">{first[key]}</b><b role="cell">{second[key]}</b><span role="cell" className={change>0?'up':change<0?'down':''}>{change>0?`+${change}`:change}</span></div>})}</div></div><div className="comparison-summary"><span><b>{first.rating}</b> overall in {formatVersion(first.version)}</span><span aria-hidden="true">→</span><span><b>{second.rating}</b> overall in {formatVersion(second.version)}</span></div></>}</dialog>
}

function VersionPicker({label,versions,value,onChange}:{label:string;versions:Player[];value:number;onChange:(value:number)=>void}) {
  return <label><span>{label}</span><select value={value} onChange={event=>onChange(Number(event.target.value))}>{versions.map((item,index)=><option value={index} key={item.version}>{formatVersion(item.version)} · {item.club}</option>)}</select></label>
}

function RadarChart({first,second}:{first:Player;second:Player}) {
  const center=150,radius=102
  const point=(index:number,value:number)=>{const angle=-Math.PI/2+index*Math.PI*2/stats.length,distance=radius*value/100;return`${center+Math.cos(angle)*distance},${center+Math.sin(angle)*distance}`}
  const ring=(value:number)=>stats.map((_,index)=>point(index,value)).join(' ')
  return <figure className="radar"><svg viewBox="0 0 300 300" role="img" aria-labelledby="radar-title radar-desc"><title id="radar-title">Radar chart comparing {first.name} in {formatVersion(first.version)} and {formatVersion(second.version)}</title><desc id="radar-desc">Exact values are listed beside the chart.</desc>{[25,50,75,100].map(value=><polygon className="radar-grid" points={ring(value)} key={value}/>)}{stats.map((_,index)=><line className="radar-axis" x1={center} y1={center} x2={point(index,100).split(',')[0]} y2={point(index,100).split(',')[1]} key={index}/>)}<polygon className="radar-shape first" points={stats.map(([,key],index)=>point(index,first[key])).join(' ')}/><polygon className="radar-shape second" points={stats.map(([,key],index)=>point(index,second[key])).join(' ')}/>{stats.map(([label],index)=>{const[x,y]=point(index,118).split(',');return<text x={x} y={y} textAnchor="middle" dominantBaseline="middle" key={label}>{label.slice(0,3).toUpperCase()}</text>})}</svg><figcaption><span className="legend-first">{formatVersion(first.version)}</span><span className="legend-second">{formatVersion(second.version)}</span></figcaption></figure>
}

const formatVersion=(version:string)=>version.toUpperCase().startsWith('FIFA')?version:`FIFA ${version}`
