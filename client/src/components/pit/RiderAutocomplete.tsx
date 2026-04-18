import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import type { Rider } from '../../types'

interface Props {
  riders: Rider[]
  value: string
  onChange: (name: string, riderId: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export default function RiderAutocomplete({ riders, value, onChange, placeholder = 'Nom du coureur…', autoFocus }: Props) {
  const [inputValue, setInputValue] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = inputValue.trim().length === 0
    ? riders
    : riders.filter((r) => r.name.toLowerCase().includes(inputValue.toLowerCase()))

  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const selectRider = (rider: Rider) => {
    setInputValue(rider.name)
    onChange(rider.name, rider.id)
    setOpen(false)
  }

  const commitFreeText = () => {
    const trimmed = inputValue.trim()
    if (trimmed) {
      // Use existing rider ID if exact match, else use 'new' placeholder
      const existing = riders.find((r) => r.name.toLowerCase() === trimmed.toLowerCase())
      onChange(trimmed, existing?.id ?? `new:${trimmed}`)
    }
    setOpen(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlightedIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      setHighlightedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered[highlightedIdx]) {
        selectRider(filtered[highlightedIdx])
      } else {
        commitFreeText()
      }
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="autocomplete-wrapper">
      <input
        ref={inputRef}
        type="text"
        className="input-field"
        value={inputValue}
        placeholder={placeholder}
        onChange={(e) => {
          setInputValue(e.target.value)
          setHighlightedIdx(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(commitFreeText, 150)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div ref={dropdownRef} className="autocomplete-dropdown fade-in">
          {filtered.map((rider, idx) => (
            <div
              key={rider.id}
              className={`autocomplete-option${idx === highlightedIdx ? ' highlighted' : ''}`}
              onMouseDown={() => selectRider(rider)}
              onMouseEnter={() => setHighlightedIdx(idx)}
            >
              {rider.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
