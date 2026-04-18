import { useCountup } from '../../hooks/useTimer'
import type { Lap, LapGaugeMode } from '../../types'

interface Props {
  startTs?: string
  running: boolean
  mode: LapGaugeMode
  fixedMs: number
  laps: Lap[]
  frozenMs?: number
}

function fmtMs(ms: number): string {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function LapGauge({ startTs, running, mode, fixedMs, laps, frozenMs }: Props) {
  const counted = useCountup(startTs, running && !!startTs)
  const elapsed = !running && frozenMs !== undefined ? frozenMs : counted

  const avgMs = laps.length > 0
    ? laps.reduce((sum, l) => sum + l.durationMs, 0) / laps.length
    : 0

  const targetMs = mode === 'average' && avgMs > 0 ? avgMs : fixedMs

  const active = (running && !!startTs || frozenMs !== undefined) && targetMs > 0

  const pct = Math.min(elapsed / targetMs * 100, 100)
  const overrun = elapsed > targetMs

  const barColor = overrun
    ? 'var(--red, #ef4444)'
    : pct >= 90
    ? '#f59e0b'
    : 'var(--green, #22c55e)'

  const modeLabel = mode === 'average' && avgMs > 0
    ? `moy. ${laps.length} tour${laps.length > 1 ? 's' : ''}`
    : 'fixe'

  return (
    <div style={{ padding: '0 0 0.25rem', visibility: active ? 'visible' : 'hidden' }}>
      <div style={{ height: 5, background: 'var(--surface-2, #e5e7eb)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          borderRadius: 3,
          transition: 'width 0.5s linear',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 10, color: 'var(--text-3, #9ca3af)', fontFamily: 'monospace' }}>
        <span style={{ color: overrun ? 'var(--red, #ef4444)' : 'inherit' }}>{fmtMs(elapsed)}</span>
        <span>{Math.round(pct)}% · {fmtMs(targetMs)} ({modeLabel})</span>
      </div>
    </div>
  )
}
