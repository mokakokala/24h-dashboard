import { useTimer } from '../../hooks/useTimer'
import { useDayNight } from '../../hooks/useDayNight'
import { useClock } from '../../hooks/useClock'
import type { Race, BikeId } from '../../types'

interface Props { race: Race | null }

const BIKE_IDS: BikeId[] = ['V1', 'V2', 'V3']

export default function Header({ race }: Props) {
  const { theme, toggle, manualOverride, setAuto } = useDayNight()
  const raceTimer = useTimer(race?.startTimestamp, race?.status === 'RUNNING')
  const { time, date } = useClock({
    timezone:    race?.settings.timezone ?? 'Europe/Brussels',
    dateFormat:  race?.settings.clockDateFormat ?? 'long',
    showSeconds: race?.settings.clockShowSeconds ?? true,
    hourFormat:  race?.settings.clockHourFormat ?? '24h',
  })

  const enabled = race?.settings.enabledBikes ?? { V1: true, V2: true, V3: true }
  const bikeLabel = (id: BikeId) => race?.settings.bikeLabels?.[id] ?? race?.bikes[id].label ?? id

  // Defaults: show duration + total laps + total km (original behaviour)
  const cfg = race?.settings.headerStats ?? { showDuration: true, showTotalLaps: true, showTotalKm: true }

  const totalLaps = race ? BIKE_IDS.filter(id => enabled[id]).reduce((s, id) => s + race.bikes[id].totalLaps, 0) : 0
  const totalKm   = race ? BIKE_IDS.filter(id => enabled[id]).reduce((s, id) => s + race.bikes[id].totalDistanceKm, 0).toFixed(1) : '0.0'

  const isRunning = race?.status === 'RUNNING'

  // Build stat items to show
  const items: { label: string; value: string }[] = []

  if (cfg.showDuration && isRunning)
    items.push({ label: 'Durée', value: raceTimer })

  // Total row — combine laps + km if both on to save space
  const wantTotalLaps = cfg.showTotalLaps
  const wantTotalKm   = cfg.showTotalKm
  if (wantTotalLaps && wantTotalKm)
    items.push({ label: 'Total', value: `${totalLaps} tours · ${totalKm} km` })
  else if (wantTotalLaps)
    items.push({ label: 'Total', value: `${totalLaps} tours` })
  else if (wantTotalKm)
    items.push({ label: 'Total', value: `${totalKm} km` })

  // Per-bike
  for (const id of BIKE_IDS) {
    if (!enabled[id]) continue
    const wantLaps = cfg[`show${id}Laps` as keyof typeof cfg]
    const wantKm   = cfg[`show${id}Km`   as keyof typeof cfg]
    if (!wantLaps && !wantKm) continue
    const parts: string[] = []
    if (wantLaps && race) parts.push(`${race.bikes[id].totalLaps} tours`)
    if (wantKm   && race) parts.push(`${race.bikes[id].totalDistanceKm.toFixed(1)} km`)
    items.push({ label: bikeLabel(id), value: parts.join(' · ') })
  }

  return (
    <div style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      {/* Title */}
      <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', flexShrink: 0 }}>
        {race?.settings.raceName ?? '24h Vélo'}
      </div>

      {/* Race status */}
      {race && (
        <span className={`badge ${race.status === 'RUNNING' ? 'badge-green' : race.status === 'PAUSED' ? 'badge-amber' : 'badge-slate'}`} style={{ flexShrink: 0 }}>
          {race.status === 'RUNNING' ? 'En cours' : race.status === 'PAUSED' ? '⏸ En pause' : race.status === 'FINISHED' ? 'Terminée' : 'En attente'}
        </span>
      )}

      {/* Dynamic stat items — only when race is running or finished */}
      {race && race.status !== 'PENDING' && items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <span className="text-muted fs-12">{item.label} :</span>
          <span style={{ fontFamily: item.label === 'Durée' ? 'monospace' : undefined, fontWeight: 600, fontSize: 13 }}>
            {item.value}
          </span>
        </div>
      ))}

      <div style={{ flex: 1 }} />

      {/* Clock */}
      <div style={{ textAlign: 'right', lineHeight: 1.25, flexShrink: 0 }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>{time}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{date}</div>
      </div>

      {/* Theme toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
        {manualOverride && (
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={setAuto} title="Revenir en automatique">
            Auto
          </button>
        )}
        <button className="btn" onClick={toggle} style={{ fontSize: 12 }}>
          {theme === 'night' ? '☀ Jour' : '🌙 Nuit'}
        </button>
      </div>
    </div>
  )
}
