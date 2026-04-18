import { useState, useEffect } from 'react'
import type { Race, Lap, BikeState, BikeId } from '../../types'
import { formatMs } from '../../hooks/useTimer'
import ChartBuilder from './ChartBuilder'

interface Props { race: Race }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildBikeStats = (bike: BikeState) => {
  const laps = bike.laps
  if (!laps.length) return null
  const totalMs = laps.reduce((s, l) => s + l.durationMs, 0)
  const avgSpeed = totalMs > 0 ? parseFloat((bike.totalDistanceKm / (totalMs / 3_600_000)).toFixed(2)) : 0
  const durations = laps.map(l => l.durationMs)
  const fastestLap = laps.reduce((best, l) => l.durationMs < best.durationMs ? l : best, laps[0])
  const slowestLap = laps.reduce((worst, l) => l.durationMs > worst.durationMs ? l : worst, laps[0])
  const transitions = bike.transitions.filter(t => t.durationMs != null)
  const avgTransitionMs = transitions.length ? transitions.reduce((s, t) => s + t.durationMs!, 0) / transitions.length : 0
  return {
    totalLaps: bike.totalLaps,
    totalKm: bike.totalDistanceKm,
    avgSpeed,
    fastestMs: Math.min(...durations),
    fastestLap,
    slowestMs: Math.max(...durations),
    slowestLap,
    totalTransitions: transitions.length,
    avgTransitionMs,
    totalLostMs: transitions.reduce((s, t) => s + (t.durationMs ?? 0), 0),
  }
}

interface RiderStat {
  name: string; laps: Lap[]
  totalLaps: number; totalKm: number; avgSpeed: number
  fastestMs: number; slowestMs: number; totalMs: number
}

const buildRiderStats = (race: Race, enabledIds: BikeId[]): RiderStat[] => {
  const dist = race.settings.circuitDistanceKm
  const allLaps = enabledIds.flatMap(id => race.bikes[id].laps)
  // M19: Key by riderId so two riders with the same display name stay separate
  const map = new Map<string, { name: string; laps: Lap[] }>()
  for (const lap of allLaps) {
    const key = lap.riderId || lap.riderName
    if (!map.has(key)) map.set(key, { name: lap.riderName, laps: [] })
    map.get(key)!.laps.push(lap)
  }
  return Array.from(map.values()).map(({ name, laps }) => {
    const totalMs = laps.reduce((s, l) => s + l.durationMs, 0)
    const avgSpeed = totalMs > 0 ? parseFloat(((laps.length * dist) / (totalMs / 3_600_000)).toFixed(2)) : 0
    const durations = laps.map(l => l.durationMs)
    return { name, laps, totalLaps: laps.length, totalKm: parseFloat((laps.length * dist).toFixed(2)), avgSpeed, fastestMs: Math.min(...durations), slowestMs: Math.max(...durations), totalMs }
  }).sort((a, b) => b.totalLaps - a.totalLaps)
}


// ─── Lap detail popup ─────────────────────────────────────────────────────────
function LapPopup({ lap, label, bikeLabels, onClose }: { lap: Lap; label: string; bikeLabels: Record<BikeId, string>; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 600 }}>{label}</span>
          <button className="btn btn-ghost" style={{ fontSize: 16 }} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <table className="table">
            <tbody>
              <tr><td className="label">Tour #</td><td style={{ fontWeight: 600 }}>{lap.lapNumber}</td></tr>
              <tr><td className="label">Vélo</td><td>{bikeLabels[lap.bikeId]}</td></tr>
              <tr><td className="label">Coureur</td><td style={{ fontWeight: 600 }}>{lap.riderName}</td></tr>
              {lap.riderName2 && <tr><td className="label">Coureur 2</td><td>{lap.riderName2}</td></tr>}
              <tr><td className="label">Durée</td><td className="mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{formatMs(lap.durationMs)}</td></tr>
              <tr><td className="label">Vitesse</td><td>{lap.speedKmh} km/h</td></tr>
              <tr><td className="label">Départ</td><td className="fs-12">{new Date(lap.startTimestamp).toLocaleTimeString('fr-BE')}</td></tr>
              <tr><td className="label">Arrivée</td><td className="fs-12">{new Date(lap.endTimestamp).toLocaleTimeString('fr-BE')}</td></tr>
              <tr><td className="label">Type</td><td><span className={`badge ${lap.type === 'TOUR' ? 'badge-slate' : 'badge-amber'}`} style={{ fontSize: 10 }}>{lap.type === 'TOUR' ? 'Tour' : 'Fin relais'}</span></td></tr>
              {lap.notes && <tr><td className="label">Notes</td><td className="fs-12">{lap.notes}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Rider detail modal ───────────────────────────────────────────────────────
function RiderModal({ name, allLaps, bikeLabels, circuitDistanceKm, onClose }: { name: string; allLaps: Lap[]; bikeLabels: Record<BikeId, string>; circuitDistanceKm: number; onClose: () => void }) {
  const [filter, setFilter] = useState<BikeId | 'all'>('all')
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const laps = allLaps.filter(l => l.riderName === name || l.riderName2 === name)
  const availableBikeIds = [...new Set(laps.map(l => l.bikeId))] as BikeId[]
  const filtered = filter === 'all' ? laps : laps.filter(l => l.bikeId === filter)
  const sorted = [...filtered].sort((a, b) => Date.parse(a.startTimestamp) - Date.parse(b.startTimestamp))
  const totalMs = filtered.reduce((s, l) => s + l.durationMs, 0)
  const fastestMs = filtered.length ? Math.min(...filtered.map(l => l.durationMs)) : 0
  const avgSpeed = totalMs > 0 ? ((filtered.length * circuitDistanceKm) / (totalMs / 3_600_000)).toFixed(2) : '0'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{name}</div>
            <div className="text-muted fs-12">{laps.length} tour{laps.length !== 1 ? 's' : ''} au total</div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 16 }} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '0.75rem' }}>
          {/* Filter */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <button className={`btn${filter === 'all' ? ' btn-primary' : ''}`} style={{ fontSize: 11, padding: '0.2rem 0.6rem' }} onClick={() => setFilter('all')}>
              Tous les vélos
            </button>
            {availableBikeIds.map(id => (
              <button key={id} className={`btn${filter === id ? ' btn-primary' : ''}`} style={{ fontSize: 11, padding: '0.2rem 0.6rem' }} onClick={() => setFilter(id)}>
                {bikeLabels[id]}
              </button>
            ))}
          </div>

          {/* Summary */}
          <div className="grid-3" style={{ gap: '0.5rem', marginBottom: '0.75rem' }}>
            {[
              { label: 'Tours', value: filtered.length, color: 'var(--text)' },
              { label: 'Temps total', value: formatMs(totalMs), color: 'var(--text)' },
              { label: 'Plus rapide', value: fastestMs ? formatMs(fastestMs) : '—', color: 'var(--green)' },
              { label: 'Tps moy./tour', value: filtered.length ? formatMs(Math.round(totalMs / filtered.length)) : '—', color: 'var(--amber)' },
              { label: 'Vitesse moy.', value: `${avgSpeed} km/h`, color: 'var(--blue)' },
              { label: 'Distance', value: `${(filtered.length * circuitDistanceKm).toFixed(1)} km`, color: 'var(--text)' },
            ].map(s => (
              <div key={s.label} style={{ padding: '0.4rem 0.5rem', background: 'var(--surface-2)', borderRadius: 6 }}>
                <div className="label" style={{ marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Laps table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>#</th><th>Vélo</th><th>Type</th><th>Départ</th><th>Durée</th><th>Vitesse</th></tr>
              </thead>
              <tbody>
                {sorted.map(lap => (
                  <tr key={lap.id}>
                    <td className="mono fs-12">{lap.lapNumber}</td>
                    <td><span className="badge badge-slate" style={{ fontSize: 10 }}>{bikeLabels[lap.bikeId]}</span></td>
                    <td><span className={`badge ${lap.type === 'TOUR' ? 'badge-slate' : 'badge-amber'}`} style={{ fontSize: 10 }}>{lap.type === 'TOUR' ? 'Tour' : 'Relais'}</span></td>
                    <td className="fs-12 text-muted">{new Date(lap.startTimestamp).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="mono fs-12" style={{ color: lap.durationMs === fastestMs ? 'var(--green)' : undefined }}>{formatMs(lap.durationMs)}</td>
                    <td className="fs-12 text-muted">{lap.speedKmh} km/h</td>
                  </tr>
                ))}
                {sorted.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-3)', fontSize: 13 }}>Aucun tour</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Bike stats card ──────────────────────────────────────────────────────────
function BikeStatsCard({ bike, label, color, bikeLabels }: { bike: BikeState; label: string; color: string; bikeLabels: Record<BikeId, string> }) {
  const stats = buildBikeStats(bike)
  const transitions = bike.transitions.filter(t => t.durationMs != null)
  const [lapPopup, setLapPopup] = useState<{ lap: Lap; label: string } | null>(null)
  const [showAllTransitions, setShowAllTransitions] = useState(false)

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
        <span className="badge badge-slate" style={{ fontSize: 11 }}>{bike.totalLaps} tours · {bike.totalDistanceKm.toFixed(1)} km</span>
      </div>
      {!stats ? (
        <div className="card-body text-faint fs-12">Aucune donnée</div>
      ) : (
        <div className="card-body">
          <div className="grid-3" style={{ gap: '0.5rem' }}>
            {[
              { label: 'Vitesse moy.', value: `${stats.avgSpeed} km/h`, color, onClick: undefined },
              {
                label: 'Tour le + rapide',
                value: formatMs(stats.fastestMs),
                color: 'var(--green)',
                onClick: () => setLapPopup({ lap: stats.fastestLap, label: 'Tour le plus rapide' }),
              },
              {
                label: 'Tour le + lent',
                value: formatMs(stats.slowestMs),
                color: 'var(--amber)',
                onClick: () => setLapPopup({ lap: stats.slowestLap, label: 'Tour le plus lent' }),
              },
              { label: 'Transitions', value: stats.totalTransitions, color: undefined, onClick: undefined },
              { label: 'Tps perdu moy.', value: stats.avgTransitionMs ? formatMs(stats.avgTransitionMs) : '—', color: undefined, onClick: undefined },
              { label: 'Tps perdu total', value: stats.totalLostMs ? formatMs(stats.totalLostMs) : '—', color: undefined, onClick: undefined },
            ].map(s => (
              <div
                key={s.label}
                style={{ padding: '0.4rem 0.5rem', background: 'var(--surface-2)', borderRadius: 6, cursor: s.onClick ? 'pointer' : undefined }}
                onClick={s.onClick}
                title={s.onClick ? 'Cliquer pour voir les détails' : undefined}
              >
                <div className="label" style={{ marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: s.color ?? 'var(--text)' }}>{s.value}</div>
                {s.onClick && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Cliquer pour voir</div>}
              </div>
            ))}
          </div>

          {transitions.length > 0 && (() => {
            const LIMIT = 5
            const visible = showAllTransitions ? transitions : transitions.slice(0, LIMIT)
            const hidden = transitions.length - LIMIT
            return (
              <div style={{ marginTop: '0.75rem' }}>
                <div className="label" style={{ marginBottom: '0.4rem' }}>Transitions</div>
                <table className="table">
                  <thead><tr><th>#</th><th>De</th><th>Vers</th><th>Durée</th></tr></thead>
                  <tbody>
                    {visible.map((t, i) => (
                      <tr key={t.id}>
                        <td className="text-muted fs-12">{i + 1}</td>
                        <td className="fs-12">{t.incomingRiderName}{t.incomingRiderName2 ? ` + ${t.incomingRiderName2}` : ''}</td>
                        <td className="fs-12 fw-500">{t.outgoingRiderName ? `${t.outgoingRiderName}${t.outgoingRiderName2 ? ` + ${t.outgoingRiderName2}` : ''}` : '—'}</td>
                        <td className="mono fs-12" style={{ color: 'var(--amber)' }}>{formatMs(t.durationMs!)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transitions.length > LIMIT && (
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: '0.35rem', fontSize: 12, color: 'var(--primary)', padding: '0.2rem 0' }}
                    onClick={() => setShowAllTransitions(v => !v)}
                  >
                    {showAllTransitions ? '▲ Réduire' : `▼ Voir ${hidden} de plus (${transitions.length} au total)`}
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}
      {lapPopup && <LapPopup lap={lapPopup.lap} label={lapPopup.label} bikeLabels={bikeLabels} onClose={() => setLapPopup(null)} />}
    </div>
  )
}

// ─── Trend + efficiency ───────────────────────────────────────────────────────

const buildTrend = (bike: BikeState) => {
  const laps = bike.laps
  if (laps.length < 2) return null
  const overallAvg = laps.reduce((s, l) => s + l.durationMs, 0) / laps.length
  const recent = laps.slice(-5)
  const recentAvg = recent.reduce((s, l) => s + l.durationMs, 0) / recent.length
  // negative delta = faster (good), positive = slower
  const deltaPct = ((recentAvg - overallAvg) / overallAvg) * 100
  const racingMs = laps.reduce((s, l) => s + l.durationMs, 0)
  const transitionMs = bike.transitions.filter(t => t.durationMs != null).reduce((s, t) => s + t.durationMs!, 0)
  const efficiency = racingMs + transitionMs > 0 ? (racingMs / (racingMs + transitionMs)) * 100 : null
  return { overallAvg, recentAvg, deltaPct, recentCount: recent.length, efficiency }
}

// ─── Bike config ──────────────────────────────────────────────────────────────

const BIKE_CONFIG = [
  { id: 'V1' as BikeId, color: 'var(--blue)' },
  { id: 'V2' as BikeId, color: 'var(--green)' },
  { id: 'V3' as BikeId, color: 'var(--amber)' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AnalyticsTab({ race }: Props) {
  const [riderModal, setRiderModal] = useState<string | null>(null)
  const [showAllRiders, setShowAllRiders] = useState(false)

  const enabledBikes = race.settings.enabledBikes ?? { V1: true, V2: true, V3: true }
  const enabledConfig = BIKE_CONFIG.filter(b => enabledBikes[b.id])
  const enabledIds = enabledConfig.map(b => b.id)
  const bikeLabel = (id: BikeId) => race.settings.bikeLabels?.[id] ?? race.bikes[id].label
  const allBikeLabels: Record<BikeId, string> = { V1: bikeLabel('V1'), V2: bikeLabel('V2'), V3: bikeLabel('V3') }

  const riderStats = buildRiderStats(race, enabledIds)
  const allLaps = enabledIds.flatMap(id => race.bikes[id].laps)

  if (allLaps.length === 0) {
    return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-3)', fontSize: 14 }}>Aucune donnée — les analytics apparaîtront dès le premier tour.</div>
  }

  const folkloSorted = race.folkloEntries
  const enabledCount = enabledConfig.length
  const gridClass = enabledCount === 1 ? '' : enabledCount === 2 ? 'grid-2' : 'grid-3'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Tendance du rythme */}
      {allLaps.length >= 2 && (
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600 }}>Tendance du rythme</span>
            <span className="text-muted fs-12">Moyenne globale vs 5 derniers tours · Efficacité = temps de course / (course + transitions)</span>
          </div>
          <div className="card-body">
            <div className={gridClass}>
              {enabledConfig.map(b => {
                const trend = buildTrend(race.bikes[b.id])
                if (!trend) return (
                  <div key={b.id} style={{ padding: '0.5rem 0.75rem', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <div className="label">{bikeLabel(b.id)}</div>
                    <div className="text-muted fs-12">Pas assez de données</div>
                  </div>
                )
                const faster = trend.deltaPct < -1
                const slower = trend.deltaPct > 1
                const trendColor = faster ? 'var(--green)' : slower ? 'var(--red, #ef4444)' : 'var(--text-2)'
                const trendIcon = faster ? '↑' : slower ? '↓' : '→'
                const trendLabel = faster
                  ? `${Math.abs(trend.deltaPct).toFixed(1)}% plus rapide`
                  : slower
                  ? `${Math.abs(trend.deltaPct).toFixed(1)}% plus lent`
                  : 'Rythme stable'
                return (
                  <div key={b.id} style={{ padding: '0.6rem 0.75rem', background: 'var(--surface-2)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: b.color }}>{bikeLabel(b.id)}</div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <div className="label">Moy. générale</div>
                        <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{formatMs(Math.round(trend.overallAvg))}</div>
                      </div>
                      <div>
                        <div className="label">{trend.recentCount} derniers tours</div>
                        <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{formatMs(Math.round(trend.recentAvg))}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: trendColor, lineHeight: 1 }}>{trendIcon}</span>
                      <span style={{ fontSize: 12, color: trendColor, fontWeight: 500 }}>{trendLabel}</span>
                    </div>
                    {trend.efficiency != null && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        Efficacité : <span style={{ fontWeight: 600, color: trend.efficiency >= 90 ? 'var(--green)' : trend.efficiency >= 75 ? 'var(--amber)' : 'var(--red, #ef4444)' }}>{trend.efficiency.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Per-bike stats */}
      <div className={gridClass}>
        {enabledConfig.map(b => (
          <BikeStatsCard key={b.id} bike={race.bikes[b.id]} label={bikeLabel(b.id)} color={b.color} bikeLabels={allBikeLabels} />
        ))}
      </div>

      {/* Rider rankings */}
      {riderStats.length > 0 && (() => {
        const LIMIT = 8
        const visible = showAllRiders ? riderStats : riderStats.slice(0, LIMIT)
        const hidden = riderStats.length - LIMIT
        return (
          <div className="card">
            <div className="card-header">
              <span style={{ fontWeight: 600 }}>Classement des coureurs</span>
              <span className="text-muted fs-12">Cliquer sur un nom pour voir ses tours · Tous vélos confondus</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Rang</th><th>Coureur</th><th>Tours</th><th>Distance</th>
                    <th>Vit. moy.</th><th>+ rapide</th><th>+ lent</th><th>Tps piste</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s, idx) => (
                    <tr key={s.name}>
                      <td style={{ fontWeight: 700, color: idx === 0 ? 'var(--amber)' : idx === 1 ? 'var(--text-2)' : idx === 2 ? 'var(--amber)' : 'var(--text-3)' }}>{idx + 1}</td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ fontWeight: 500, fontSize: 13, padding: '0.1rem 0.3rem', color: 'var(--blue)' }}
                          onClick={() => setRiderModal(s.name)}
                        >
                          {s.name}
                        </button>
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.totalLaps}</td>
                      <td className="text-muted fs-12">{s.totalKm.toFixed(1)} km</td>
                      <td className="fs-12">{s.avgSpeed} km/h</td>
                      <td className="mono fs-12 text-green">{formatMs(s.fastestMs)}</td>
                      <td className="mono fs-12 text-muted">{formatMs(s.slowestMs)}</td>
                      <td className="fs-12 text-muted">{formatMs(s.totalMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {riderStats.length > LIMIT && (
              <div style={{ padding: '0.4rem 0.75rem', borderTop: '1px solid var(--border)' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, color: 'var(--primary)', padding: '0.2rem 0' }}
                  onClick={() => setShowAllRiders(v => !v)}
                >
                  {showAllRiders ? '▲ Réduire' : `▼ Voir ${hidden} de plus (${riderStats.length} coureurs au total)`}
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* Folklo entries */}
      {folkloSorted.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600 }}>Équipes Folklo</span>
            <span className="text-muted fs-12">{folkloSorted.length} équipe{folkloSorted.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>#</th><th>Équipe</th><th>Costume</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {folkloSorted.map((e, idx) => (
                  <tr key={e.id}>
                    <td className="text-muted fs-12 mono">{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{e.teamName}</td>
                    <td className="text-muted fs-12">{e.costumeDescription || '—'}</td>
                    <td className="text-muted fs-12">{e.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chart builder */}
      <ChartBuilder race={race} bikeLabels={allBikeLabels} enabledConfig={enabledConfig} />

      {/* Rider detail modal */}
      {riderModal && (
        <RiderModal
          name={riderModal}
          allLaps={allLaps}
          bikeLabels={allBikeLabels}
          circuitDistanceKm={race.settings.circuitDistanceKm}
          onClose={() => setRiderModal(null)}
        />
      )}
    </div>
  )
}
