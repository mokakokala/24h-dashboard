import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import type { Rider } from '../../types'

interface Props {
  riders: Rider[]
  value: string
  onChange: (name: string) => void
  onSubmit?: (name?: string) => void
  onCancel?: () => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  animéOnly?: boolean
}

export default function RiderInput({ riders, value, onChange, onSubmit, onCancel, placeholder = 'Nom du coureur…', autoFocus, className, animéOnly }: Props) {
  const eligibleRiders = animéOnly ? riders.filter(r => r.type === 'animé') : riders
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [dropUp, setDropUp] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  const checkPosition = () => {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    setDropUp(spaceBelow < 270 && spaceAbove > spaceBelow)
  }

  const filtered = value.trim()
    ? eligibleRiders.filter(r => r.name.toLowerCase().includes(value.toLowerCase()))
    : eligibleRiders

  const select = (name: string) => { onChange(name); setOpen(false); onSubmit?.(name) }

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown') { checkPosition(); setOpen(true); e.preventDefault() }
      else if (e.key === 'Escape') { onCancel?.() }
      return
    }
    if (e.key === 'ArrowDown') { setHi(i => Math.min(i + 1, filtered.length - 1)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setHi(i => Math.max(i - 1, 0)); e.preventDefault() }
    else if (e.key === 'Enter') {
      if (filtered[hi]) select(filtered[hi].name)
      else if (value.trim()) { setOpen(false); onSubmit?.() }
      e.preventDefault()
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const dropStyle: React.CSSProperties = dropUp
    ? { bottom: '100%', top: 'auto', borderRadius: '6px 6px 0 0', borderBottom: 'none', borderTop: '1px solid var(--border-strong)' }
    : { top: '100%', bottom: 'auto', borderRadius: '0 0 6px 6px', borderTop: 'none' }

  return (
    <div ref={wrapRef} className={`autocomplete-wrap${className ? ' ' + className : ''}`}>
      <input
        ref={ref}
        className="input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setHi(0); checkPosition(); setOpen(true) }}
        onFocus={() => { checkPosition(); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && filtered.length > 0 && (
        <div
          className="autocomplete-drop fade-in"
          style={{
            position: 'absolute',
            left: 0, right: 0,
            zIndex: 200,
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            maxHeight: 270,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-md)',
            ...dropStyle,
          }}
        >
          {filtered.map((r, i) => (
            <div
              key={r.id}
              className={`autocomplete-opt${i === hi ? ' hi' : ''}`}
              onMouseDown={() => select(r.name)}
              onMouseEnter={() => setHi(i)}
            >
              {r.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
