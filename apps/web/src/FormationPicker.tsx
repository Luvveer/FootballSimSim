import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FORMATIONS } from './formations'

const label = (formation: string) => formation.replaceAll('-', '–')

export function FormationPicker({ value, onChange, teamName }: { value: string; onChange: (formation: string) => void; teamName: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="version-filter formation-picker" ref={root}>
    <button className="version-trigger formation-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`${teamName} formation: ${label(value)}`} onClick={() => setOpen(current => !current)}>
      <b>Formation</b><ChevronDown size={14}/>
    </button>
    {open && <div className="version-menu" role="listbox" aria-label={`${teamName} formation`}>
      <div className="version-options">{Object.keys(FORMATIONS).map(formation => <button key={formation} role="option" aria-selected={formation === value} className={`version-option ${formation === value ? 'checked' : ''}`} onClick={() => { onChange(formation); setOpen(false) }}>
        {label(formation)}
      </button>)}</div>
    </div>}
  </div>
}
