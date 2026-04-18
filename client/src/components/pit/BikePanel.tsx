import { useState } from 'react'
import type { BikeState, Rider, Race } from '../../types'
import { pitTour, pitStop, pitStart, createRider } from '../../api'
import TimerDisplay from './TimerDisplay'
import RiderAutocomplete from './RiderAutocomplete'

interface Props {
  bike: BikeState
  riders: Rider[]
  settings: Race['settings']
  onUpdate: () => void
}

export default function BikePanel({ bike, riders, settings, onUpdate }: Props) {
  const [pendingRiderName, setPendingRiderName] = useState('')
  const [pendingRiderId, setPendingRiderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const isRunning = bike.status === 'RUNNING'
  const isTransition = bike.status === 'TRANSITION'
  const isIdle = bike.status === 'IDLE'

  const currentRider = bike.currentRiderName ?? '—'

  // Check relay alert
  const elapsed = bike.currentLapStartTimestamp ? Date.now() - Date.parse(bike.currentLapStartTimestamp) : 0
  const isAlert = isRunning && elapsed > settings.relayAlertThresholdMs

  // Resolve or create rider ID before pit action
  const resolveRider = async (name: string, id: string): Promise<{ name: string; id: string }> => {
    if (id.startsWith('new:')) {
      // Auto-create rider
      const res = await createRider(name)
      if (res.success && res.data) return { name: res.data.name, id: res.data.id }
    }
    return { name, id }
  }

  const handleTour = async () => {
    if (!isRunning || loading) return
    setLoading(true)
    setLastError(null)
    try {
      const res = await pitTour({
        bikeId: bike.id,
        riderId: bike.currentRiderId ?? 'unknown',
        riderName: bike.currentRiderName ?? 'Inconnu',
      })
      if (!res.success) setLastError(res.error ?? 'Erreur')
      else onUpdate()
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    if (!isRunning || loading) return
    setLoading(true)
    setLastError(null)
    try {
      const res = await pitStop({ bikeId: bike.id })
      if (!res.success) setLastError(res.error ?? 'Erreur')
      else onUpdate()
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async () => {
    if (!isTransition || loading) return
    if (!pendingRiderName.trim()) {
      setLastError('Nom du coureur requis')
      return
    }
    setLoading(true)
    setLastError(null)
    try {
      const resolved = await resolveRider(pendingRiderName, pendingRiderId)
      const res = await pitStart({
        bikeId: bike.id,
        riderId: resolved.id,
        riderName: resolved.name,
      })
      if (!res.success) setLastError(res.error ?? 'Erreur')
      else {
        setPendingRiderName('')
        setPendingRiderId('')
        onUpdate()
      }
    } finally {
      setLoading(false)
    }
  }

  const panelStatusClass = isRunning ? (isAlert ? 'alert-relay' : 'status-running') : isTransition ? 'status-transition' : 'status-idle'

  return (
    <div className={`panel bike-panel ${panelStatusClass}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {bike.label}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
            {bike.id === 'V1' ? 'PERFORMANCE' : 'PARTICIPATION'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`badge badge-${bike.status.toLowerCase()}`}>
            {bike.status === 'RUNNING' ? 'EN PISTE' : bike.status === 'TRANSITION' ? 'TRANSITION' : 'ARRÊT'}
          </span>
        </div>
      </div>

      {/* Current rider */}
      {!isIdle && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '3px', padding: '0.5rem 0.8rem' }}>
          <div className="panel-label">COUREUR ACTUEL</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: isTransition ? 'var(--accent-yellow)' : 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isTransition ? (bike.currentTransition?.incomingRiderName ?? currentRider) : currentRider}
          </div>
        </div>
      )}

      {/* Timer */}
      <TimerDisplay
        lapStartTimestamp={bike.currentLapStartTimestamp}
        transitionStartTimestamp={bike.transitionStartTimestamp}
        status={bike.status}
        alertThresholdMs={settings.relayAlertThresholdMs}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div className="stat-block">
          <div className="stat-label">Tours</div>
          <div className="stat-value neon">{bike.totalLaps}</div>
        </div>
        <div className="stat-block">
          <div className="stat-label">Distance</div>
          <div className="stat-value" style={{ color: 'var(--accent-yellow)' }}>{bike.totalDistanceKm.toFixed(1)} km</div>
        </div>
      </div>

      {/* Error display */}
      {lastError && (
        <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'rgba(255,26,26,0.1)', borderRadius: '2px', border: '1px solid var(--accent-red)' }}>
          {lastError}
        </div>
      )}

      {/* Rider input for START */}
      {isTransition && (
        <div>
          <div className="panel-label" style={{ marginBottom: '0.4rem', color: 'var(--accent-yellow)' }}>PROCHAIN COUREUR</div>
          <RiderAutocomplete
            riders={riders}
            value={pendingRiderName}
            onChange={(name, id) => { setPendingRiderName(name); setPendingRiderId(id) }}
            autoFocus={true}
          />
        </div>
      )}

      {/* Pit buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.3rem' }}>
        <button
          className="btn-pit btn-tour"
          disabled={!isRunning || loading}
          onClick={handleTour}
          title="Même coureur — nouveau tour"
        >
          {loading ? '…' : '[ TOUR ]'}
        </button>
        <button
          className="btn-pit btn-stop"
          disabled={!isRunning || loading}
          onClick={handleStop}
          title="Fin de relais — démarrer transition"
        >
          {loading ? '…' : '[ STOP ]'}
        </button>
        <button
          className="btn-pit btn-start"
          disabled={!isTransition || loading}
          onClick={handleStart}
          title="Nouveau coureur — démarrer"
        >
          {loading ? '…' : '[ START ]'}
        </button>
      </div>
    </div>
  )
}
