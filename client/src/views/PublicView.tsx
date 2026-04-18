import { useRaceState } from '../hooks/useRaceState'
import { useTimer } from '../hooks/useTimer'
import { useClock } from '../hooks/useClock'
import LapGauge from '../components/course/LapGauge'
import type { BikeState, Race, BikeId, PublicViewSettings } from '../types'

const PV_DEFAULTS: Required<PublicViewSettings> = {
  showClock: true,
  showRaceDuration: true,
  showCurrentRider: true,
  showChrono: true,
  showGauge: true,
  showQueue: true,
  queueMaxEntries: 10,
  showBikeStats: true,
  showGlobalStats: true,
}

function BikeCard({ bike, race, pv }: { bike: BikeState; race: Race; pv: Required<PublicViewSettings> }) {
  const racePaused = race.status === 'PAUSED' || race.status === 'FINISHED'

  const pausedFrozenMs = racePaused
    ? bike.pausedLapElapsedMs !== undefined
      ? bike.pausedLapElapsedMs
      : race.pausedAt && bike.currentLapStartTimestamp
        ? Date.parse(race.pausedAt) - Date.parse(bike.currentLapStartTimestamp)
        : undefined
    : undefined

  const pausedTransitionMs = racePaused && race.pausedAt && bike.transitionStartTimestamp
    ? Date.parse(race.pausedAt) - Date.parse(bike.transitionStartTimestamp)
    : undefined

  const lapTimer = useTimer(
    bike.currentLapStartTimestamp,
    bike.status === 'RUNNING' && !racePaused,
    pausedFrozenMs,
  )
  const transitionTimer = useTimer(
    bike.transitionStartTimestamp,
    bike.status === 'TRANSITION' && !racePaused,
    pausedTransitionMs,
  )

  const isRunning = bike.status === 'RUNNING'
  const isTransition = bike.status === 'TRANSITION'
  const bikeLabel = race.settings.bikeLabels?.[bike.id] ?? bike.label
  const upcoming = bike.queue.slice(0, pv.queueMaxEntries)

  const gaugeMode = race.settings.lapGaugeMode?.[bike.id] ?? 'fixed'
  const gaugeFixedMs = race.settings.lapGaugeMs?.[bike.id] ?? race.settings.relayAlertThresholdMs

  const riderLine = bike.currentRiderName
    ? bike.currentRiderName2
      ? `${bike.currentRiderName} & ${bike.currentRiderName2}`
      : bike.currentRiderName
    : isTransition && bike.currentTransition?.incomingRiderName
      ? bike.currentTransition.incomingRiderName
      : null

  const statusColor = isRunning ? 'var(--green)' : isTransition ? 'var(--amber)' : 'var(--text-3)'
  const badgeClass = isRunning ? 'badge-green' : isTransition ? 'badge-amber' : 'badge-slate'
  const statusLabel = isRunning ? 'En piste' : isTransition ? 'Transition' : 'En attente'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

      {/* ── Card header: bike name, status, rider, chrono, gauge ── */}
      <div className="card-header" style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '0.7rem',
        margin: '0.5rem 0.5rem 0',
      }}>
        {/* Bike name + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>{bikeLabel}</span>
          <span className={`badge ${badgeClass}`}>{statusLabel}</span>
        </div>

        {/* Current rider */}
        {pv.showCurrentRider && (
          <div>
            <div className="label" style={{ marginBottom: '0.2rem' }}>
              {isTransition ? 'En transition' : 'Coureur en piste'}
            </div>
            {riderLine ? (
              <div style={{
                fontWeight: 700,
                fontSize: 'clamp(1.4rem, 2.2vw, 2.6rem)',
                color: statusColor,
                textTransform: 'uppercase',
                lineHeight: 1.1,
                letterSpacing: '0.02em',
                wordBreak: 'break-word',
              }}>
                {riderLine}
              </div>
            ) : (
              <div style={{ fontSize: 'clamp(1rem, 1.5vw, 1.4rem)', color: 'var(--text-3)', fontStyle: 'italic' }}>
                Aucun coureur
              </div>
            )}
          </div>
        )}

        {/* Chrono */}
        {pv.showChrono && (
          <div>
            {isRunning && (
              <div style={{
                fontFamily: 'monospace',
                fontSize: 'clamp(2rem, 3.2vw, 3.8rem)',
                fontWeight: 700,
                color: 'var(--green)',
                lineHeight: 1,
                letterSpacing: '0.02em',
              }}>
                {lapTimer}
              </div>
            )}
            {isTransition && (
              <>
                <div className="label" style={{ marginBottom: '0.15rem' }}>Temps de changement</div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: 'clamp(1.5rem, 2.3vw, 2.6rem)',
                  fontWeight: 700,
                  color: 'var(--amber)',
                  lineHeight: 1,
                }}>
                  {transitionTimer}
                </div>
              </>
            )}
            {!isRunning && !isTransition && (
              <div style={{ fontFamily: 'monospace', fontSize: 'clamp(1.5rem, 2vw, 2rem)', color: 'var(--text-3)' }}>
                --:--.--
              </div>
            )}
          </div>
        )}

        {/* Gauge */}
        {pv.showGauge && (
          <LapGauge
            startTs={bike.currentLapStartTimestamp}
            running={isRunning && !racePaused}
            frozenMs={pausedFrozenMs}
            mode={gaugeMode}
            fixedMs={gaugeFixedMs}
            laps={bike.laps}
            large
          />
        )}
      </div>

      {/* ── Upcoming riders ── */}
      {pv.showQueue && (
        <div style={{ flex: 1, padding: '0.6rem 1rem', overflowY: 'auto' }}>
          <div className="label" style={{ marginBottom: '0.4rem' }}>Prochains coureurs</div>
          {upcoming.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 13 }}>
              Aucun coureur prévu
            </div>
          ) : (
            <div>
              {upcoming.map((entry, i) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.35rem 0',
                    borderBottom: i < upcoming.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span style={{
                    fontFamily: 'monospace',
                    color: 'var(--text-3)',
                    fontSize: 12,
                    minWidth: '1.4rem',
                    flexShrink: 0,
                  }}>
                    {i + 1}.
                  </span>
                  <span style={{
                    fontSize: 'clamp(0.85rem, 1.2vw, 1.1rem)',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.01em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {entry.riderName}{entry.riderName2 ? ` & ${entry.riderName2}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bike stats ── */}
      {pv.showBikeStats && (
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          padding: '0.55rem 1rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-3)',
          flexShrink: 0,
        }}>
          <div>
            <div className="label">Tours</div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: 'clamp(1.1rem, 1.8vw, 1.7rem)',
              fontWeight: 700,
              color: 'var(--green)',
              lineHeight: 1.1,
            }}>
              {bike.totalLaps}
            </div>
          </div>
          <div>
            <div className="label">Distance</div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: 'clamp(1.1rem, 1.8vw, 1.7rem)',
              fontWeight: 700,
              color: 'var(--blue)',
              lineHeight: 1.1,
            }}>
              {bike.totalDistanceKm.toFixed(1)}<span style={{ fontSize: '0.6em', marginLeft: '0.2em' }}>km</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PublicView() {
  const { race, loading, error } = useRaceState()
  const raceTimer = useTimer(race?.startTimestamp, race?.status === 'RUNNING')
  const { time, date } = useClock({
    timezone:    race?.settings.timezone ?? 'Europe/Brussels',
    showSeconds: true,
    hourFormat:  '24h',
  })

  if (loading) {
    return (
      <div className="app-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Connexion au serveur…</div>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div className="app-layout" style={{ alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 15 }}>Serveur hors ligne</div>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>{error}</div>
      </div>
    )
  }

  const pv: Required<PublicViewSettings> = { ...PV_DEFAULTS, ...race.settings.publicView }
  const enabledBikes = race.settings.enabledBikes ?? { V1: true, V2: true, V3: true }
  const activeBikeIds = (['V1', 'V2', 'V3'] as BikeId[]).filter(id => enabledBikes[id])
  const count = activeBikeIds.length

  const totalLaps = activeBikeIds.reduce((s, id) => s + race.bikes[id].totalLaps, 0)
  const totalKm = activeBikeIds.reduce((s, id) => s + race.bikes[id].totalDistanceKm, 0).toFixed(1)

  const statusBadgeClass = race.status === 'RUNNING' ? 'badge-green' : race.status === 'PAUSED' ? 'badge-amber' : 'badge-slate'
  const statusLabel = race.status === 'RUNNING' ? 'En cours' : race.status === 'PAUSED' ? '⏸ En pause' : race.status === 'FINISHED' ? 'Terminée' : 'En attente'

  return (
    <div className="app-layout">

      {/* ── Header ── */}
      <div className="app-header" style={{
        padding: '0.6rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        {/* Left: race name + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 160, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
            {race.settings.raceName ?? '24h Vélo'}
          </span>
          <span className={`badge ${statusBadgeClass}`}>{statusLabel}</span>
        </div>

        {/* Center: clock + optional race duration */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          {pv.showClock && (
            <div style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 3.5vw, 3.8rem)',
              letterSpacing: '0.04em',
              lineHeight: 1,
              color: 'var(--text)',
            }}>
              {time}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{date}</div>
          {pv.showRaceDuration && race.status === 'RUNNING' && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, fontFamily: 'monospace' }}>
              Course en cours depuis {raceTimer}
            </div>
          )}
          {race.status === 'PAUSED' && (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 2, fontWeight: 500 }}>Course en pause</div>
          )}
          {race.status === 'FINISHED' && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2, fontWeight: 500 }}>Course terminée</div>
          )}
        </div>

        {/* Right: global stats */}
        {pv.showGlobalStats && (
          <div style={{ textAlign: 'right', minWidth: 120, flexShrink: 0 }}>
            <div className="label" style={{ marginBottom: 2 }}>Total général</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 'clamp(0.9rem, 1.4vw, 1.2rem)', color: 'var(--green)' }}>
              {totalLaps} tours
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 'clamp(0.8rem, 1.1vw, 1rem)', color: 'var(--blue)' }}>
              {totalKm} km
            </div>
          </div>
        )}
      </div>

      {/* ── Bike cards grid ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        padding: '0.75rem',
        display: 'grid',
        gap: '0.75rem',
        gridTemplateColumns: `repeat(${count}, 1fr)`,
      }}>
        {activeBikeIds.map(id => (
          <BikeCard key={id} bike={race.bikes[id]} race={race} pv={pv} />
        ))}
      </div>

    </div>
  )
}
