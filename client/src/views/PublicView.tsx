import { useRaceState } from '../hooks/useRaceState'
import { useTimer } from '../hooks/useTimer'
import { useDayNight } from '../hooks/useDayNight'
import type { BikeState, Race } from '../types'

function PublicBikeCard({ bike, alertThresholdMs, bikeLabel }: { bike: BikeState; alertThresholdMs: number; bikeLabel: string }) {
  const lapTimer = useTimer(bike.currentLapStartTimestamp, bike.status === 'RUNNING')
  const transitionTimer = useTimer(bike.transitionStartTimestamp, bike.status === 'TRANSITION')

  const elapsed = bike.currentLapStartTimestamp ? Date.now() - Date.parse(bike.currentLapStartTimestamp) : 0
  const isAlert = bike.status === 'RUNNING' && elapsed > alertThresholdMs

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: `2px solid ${bike.status === 'RUNNING' ? (isAlert ? 'var(--accent-orange)' : 'var(--accent-green-dim)') : bike.status === 'TRANSITION' ? 'var(--accent-yellow)' : 'var(--border)'}`,
      borderRadius: '6px',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      flex: 1,
      minWidth: '280px',
      boxShadow: bike.status === 'RUNNING' ? (isAlert ? 'var(--glow-orange)' : '0 0 20px rgba(0,255,65,0.1)') : bike.status === 'TRANSITION' ? '0 0 20px rgba(240,224,64,0.15)' : 'none',
      animation: isAlert ? 'pulse-orange 2s ease-in-out infinite' : 'none',
    }}>
      {/* Bike label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {bikeLabel}
        </div>
        <span className={`badge badge-${bike.status.toLowerCase()}`} style={{ fontSize: '0.75rem' }}>
          {bike.status === 'RUNNING' ? 'EN PISTE' : bike.status === 'TRANSITION' ? 'TRANSITION' : 'ARRÊT'}
        </span>
      </div>

      {/* Current rider */}
      <div>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
          {bike.status === 'TRANSITION' ? 'DERNIER COUREUR' : 'COUREUR EN PISTE'}
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.8rem',
          fontWeight: 700,
          color: bike.status === 'TRANSITION' ? 'var(--accent-yellow)' : isAlert ? 'var(--accent-orange)' : 'var(--accent-green)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          lineHeight: 1.1,
        }}>
          {bike.status === 'TRANSITION' ? (bike.currentTransition?.incomingRiderName ?? bike.currentRiderName ?? '—') : bike.currentRiderName ?? '—'}
        </div>
      </div>

      {/* Timer */}
      {bike.status === 'RUNNING' && (
        <div style={{ textAlign: 'center' }}>
          {isAlert && (
            <div className="alert-banner" style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>
              ⚠ RELAIS LONG
            </div>
          )}
          <div className={`timer-main${isAlert ? ' text-orange' : ''}`} style={isAlert ? { textShadow: 'var(--glow-orange)', fontSize: '3rem' } : { fontSize: '3rem' }}>
            {lapTimer}
          </div>
        </div>
      )}
      {bike.status === 'TRANSITION' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--accent-yellow)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>Temps de changement</div>
          <div className="timer-transition" style={{ fontSize: '2.5rem' }}>{transitionTimer}</div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem' }}>
        <div className="stat-block">
          <div className="stat-label">Tours</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--accent-green)', textShadow: 'var(--glow-green)' }}>
            {bike.totalLaps}
          </div>
        </div>
        <div className="stat-block">
          <div className="stat-label">Distance</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--accent-yellow)' }}>
            {bike.totalDistanceKm.toFixed(1)}<span style={{ fontSize: '0.9rem', marginLeft: '0.2rem' }}>km</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Leaderboard({ race }: { race: Race }) {
  const allLaps = [...race.bikes.V1.laps, ...race.bikes.V2.laps]
  const byRider = new Map<string, number>()
  for (const lap of allLaps) byRider.set(lap.riderName, (byRider.get(lap.riderName) ?? 0) + 1)

  const ranked = Array.from(byRider.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)

  if (ranked.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.2rem', minWidth: '220px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--text-secondary)', marginBottom: '0.8rem', textTransform: 'uppercase' }}>
        Top Coureurs
      </div>
      {ranked.map(([name, laps], idx) => (
        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: idx < ranked.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontFamily: 'var(--font-display)', color: idx === 0 ? 'var(--accent-yellow)' : idx === 1 ? '#c0c0c0' : 'var(--text-secondary)', fontSize: '0.9rem', minWidth: '20px' }}>
              {idx + 1}
            </span>
            <span style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{name}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)', fontSize: '1rem' }}>{laps}</span>
        </div>
      ))}
    </div>
  )
}

export default function PublicView() {
  const { race, error, loading } = useRaceState()
  const { theme, toggle } = useDayNight()

  const raceTimer = useTimer(race?.startTimestamp, race?.status === 'RUNNING')

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-green)', fontSize: '1.5rem', letterSpacing: '0.3em', animation: 'blink 1s ease-in-out infinite' }}>
          CONNEXION…
        </div>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-red)', fontSize: '1.2rem', letterSpacing: '0.1em' }}>SERVEUR HORS LIGNE</div>
        <div style={{ color: 'var(--text-secondary)' }}>{error}</div>
      </div>
    )
  }

  const totalLaps = race.bikes.V1.totalLaps + race.bikes.V2.totalLaps
  const totalKm = ((race.bikes.V1.totalDistanceKm + race.bikes.V2.totalDistanceKm)).toFixed(1)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', boxSizing: 'border-box' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.25em', color: 'var(--accent-green)', textShadow: 'var(--glow-green)' }}>
          24H VÉLO
        </div>

        {race.status === 'RUNNING' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Durée course</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--accent-yellow)', letterSpacing: '0.08em' }}>{raceTimer}</div>
          </div>
        )}
        {race.status === 'PENDING' && (
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', letterSpacing: '0.2em', fontSize: '0.9rem' }}>EN ATTENTE DE DÉPART</div>
        )}

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent-cyan)' }}>{totalLaps} tours · {totalKm} km</div>
          </div>
          <button className="btn" onClick={toggle} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
            {theme === 'night' ? '☀' : '🌙'}
          </button>
        </div>
      </div>

      {/* Main bikes area */}
      <div style={{ display: 'flex', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
        <PublicBikeCard bike={race.bikes.V1} alertThresholdMs={race.settings.relayAlertThresholdMs} bikeLabel={race.settings.bikeLabels?.V1 ?? race.bikes.V1.label} />
        <PublicBikeCard bike={race.bikes.V2} alertThresholdMs={race.settings.relayAlertThresholdMs} bikeLabel={race.settings.bikeLabels?.V2 ?? race.bikes.V2.label} />
        <Leaderboard race={race} />
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
        {new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Circuit 2.6 km
      </div>
    </div>
  )
}
