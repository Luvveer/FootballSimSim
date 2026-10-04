import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { versionLabel } from './version-label'

export const formatVersionLabel = versionLabel

export function VersionFilter({ available, selected, onChange }: { available: string[]; selected: string[]; onChange: (versions: string[]) => void }) {
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
  const toggle = (version: string) => onChange(selected.includes(version) ? selected.filter(item => item !== version) : [...selected, version])
  const label = selected.length === 0 ? 'All Versions' : selected.length === 1 ? formatVersionLabel(selected[0]!) : `${selected.length} versions`
  return <div className="version-filter" ref={root}>
    <button className={`version-trigger ${selected.length ? 'filtered' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>{label}</span><ChevronDown size={14}/>
    </button>
    {open && <div className="version-menu" role="listbox" aria-multiselectable="true" aria-label="FIFA versions">
      <button className={`version-clear ${selected.length === 0 ? 'active' : ''}`} aria-pressed={selected.length === 0} onClick={() => onChange([])}>All Versions</button>
      <div className="version-options">{available.map(version => {
        const checked = selected.includes(version)
        return <button key={version} role="option" aria-selected={checked} className={`version-option ${checked ? 'checked' : ''}`} onClick={() => toggle(version)}>
          <span className="version-box">{checked && <Check size={12}/>}</span>{formatVersionLabel(version)}
        </button>
      })}</div>
    </div>}
  </div>
}
