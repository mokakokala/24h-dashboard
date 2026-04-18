import { useState } from 'react'
import type { Race, Lap, Transition, BikeId } from '../../types'
import { updateLap, deleteLap } from '../../api'
import { formatMs } from '../../hooks/useTimer'

interface Props { race: Race; onUpdate: () => void }

const fmt = (iso: string) => new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const isCorrected = (lap: Lap): boolean =>
  Math.abs(lap.durationMs - (Date.parse(lap.endTimestamp) - Date.parse(lap.startTimestamp))) > 2000

// ─── Column config ────────────────────────────────────────────────────────────

const ALL_COLS = [
  { key: 'startTs',   label: 'Départ' },
  { key: 'endTs',     label: 'Arrivée' },
  { key: 'speedKmh',  label: 'Vitesse' },
  { key: 'notes',     label: 'Notes' },
] as const
type ColKey = typeof ALL_COLS[number]['key']

// ─── CSV export ───────────────────────────────────────────────────────────────

function buildCsv(race: Race, bikeIds: BikeId[], cols: Set<ColKey>, bikeLabels: Record<BikeId, string>): string {
  const header = ['Vélo', '#', 'Coureur']
  if (cols.has('startTs'))  header.push('Départ')
  if (cols.has('endTs'))    header.push('Arrivée')
  header.push('Durée')
  if (cols.has('speedKmh')) header.push('Vitesse (km/h)')
  if (cols.has('notes'))    header.push('Notes')

  const rows: string[][] = []
  for (const id of bikeIds) {
    const laps = [...race.bikes[id].laps].sort((a, b) => a.lapNumber - b.lapNumber)
    for (const lap of laps) {
      const row = [bikeLabels[id], String(lap.lapNumber), lap.riderName + (lap.riderName2 ? ` + ${lap.riderName2}` : '')]
      if (cols.has('startTs'))  row.push(fmt(lap.startTimestamp))
      if (cols.has('endTs'))    row.push(fmt(lap.endTimestamp))
      row.push(formatMs(lap.durationMs))
      if (cols.has('speedKmh')) row.push(lap.speedKmh.toFixed(1))
      if (cols.has('notes'))    row.push(lap.notes ?? '')
      rows.push(row)
    }
  }
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  return [header, ...rows].map(r => r.map(escape).join(',')).join('\n')
}

function downloadCsv(content: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `historique-24h-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Shared edit state type ────────────────────────────────────────────────────

type EditState = { lapId: string; field: string; value: string } | null

// ─── Cell — defined at module level so React never unmounts on re-render ──────

function LapCell({
  lap, field, value, type = 'text',
  editing, setEditing, onCommit,
}: {
  lap: Lap; field: string; value: string; type?: string
  editing: EditState
  setEditing: (e: EditState) => void
  onCommit: () => void
}) {
  const isEditing = editing?.lapId === lap.id && editing.field === field
  if (isEditing) return (
    <td>
      <input
        className="input"
        type={type}
        autoFocus
        value={editing!.value}
        style={{ minWidth: type === 'datetime-local' ? 165 : 90 }}
        onChange={e => setEditing({ ...editing!, value: e.target.value })}
        onBlur={onCommit}
        onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') setEditing(null) }}
      />
    </td>
  )
  return (
    <td
      onClick={() => setEditing({ lapId: lap.id, field, value: type === 'datetime-local' ? new Date(value).toISOString().slice(0, 16) : value })}
      style={{ cursor: 'pointer' }}
      title="Cliquer pour modifier"
    >
      {type === 'datetime-local' ? fmt(value) : (value || <span className="text-faint">—</span>)}
    </td>
  )
}

function LapDurationCell({
  lap, editing, setEditing, onSaveDuration,
}: {
  lap: Lap
  editing: EditState
  setEditing: (e: EditState) => void
  onSaveDuration: (lapId: string, ms: number) => void
}) {
  const isEditing = editing?.lapId === lap.id && editing.field === 'durationMs'

  if (isEditing) {
    const mins = Math.floor(Number(editing!.value) / 60_000)
    const secs = Math.floor((Number(editing!.value) % 60_000) / 1_000)
    const handleSave = (raw: string) => {
      setEditing(null)
      const parts = raw.split(':')
      if (parts.length === 2) {
        const ms = (parseInt(parts[0]) * 60 + parseInt(parts[1])) * 1_000
        if (ms > 0) onSaveDuration(lap.id, ms)
      }
    }
    return (
      <td>
        <input
          className="input mono"
          autoFocus
          defaultValue={`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
          style={{ minWidth: 70 }}
          placeholder="MM:SS"
          onBlur={e => handleSave(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(null); if (e.key === 'Enter') handleSave(e.currentTarget.value) }}
        />
      </td>
    )
  }

  const corrected = isCorrected(lap)
  return (
    <td
      className="mono fs-12 text-muted"
      onClick={() => setEditing({ lapId: lap.id, field: 'durationMs', value: String(lap.durationMs) })}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
      title={corrected ? "Durée corrigée manuellement (différente de l'horloge)" : 'Cliquer pour modifier'}
    >
      {formatMs(lap.durationMs)}
      {corrected && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--amber)', verticalAlign: 'middle' }}>✎</span>}
    </td>
  )
}

// ─── Per-bike lap table ───────────────────────────────────────────────────────

function LapTable({
  bike, bikeLabel, onUpdate, isDualRider, cols,
}: {
  bike: Race['bikes'][BikeId]
  bikeLabel: string
  onUpdate: () => void
  isDualRider?: boolean
  cols: Set<ColKey>
}) {
  const [editing, setEditing] = useState<EditState>(null)
  const [pendingDel, setPendingDel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const laps = [...bike.laps].sort((a, b) => a.lapNumber - b.lapNumber)
  const transitions = bike.transitions.filter(t => t.durationMs != null)

  type MergedRow = { kind: 'lap'; lap: Lap } | { kind: 'transition'; t: Transition }
  const merged: MergedRow[] = [
    ...laps.map(lap => ({ kind: 'lap' as const, lap })),
    ...transitions.map(t => ({ kind: 'transition' as const, t })),
  ].sort((a, b) => {
    const tsA = a.kind === 'lap' ? a.lap.startTimestamp : a.t.startTimestamp
    const tsB = b.kind === 'lap' ? b.lap.startTimestamp : b.t.startTimestamp
    return Date.parse(tsA) - Date.parse(tsB)
  })

  const commit = async () => {
    if (!editing || saving) return
    setSaving(true)
    try { await updateLap(editing.lapId, { [editing.field]: editing.value }); onUpdate() }
    finally { setEditing(null); setSaving(false) }
  }

  const saveDuration = async (lapId: string, ms: number) => {
    setSaving(true)
    try { await updateLap(lapId, { durationMs: ms }); onUpdate() }
    finally { setSaving(false) }
  }

  const del = async (lapId: string) => {
    if (pendingDel !== lapId) {
      setPendingDel(lapId)
      setTimeout(() => setPendingDel(p => p === lapId ? null : p), 3000)
      return
    }
    setSaving(true)
    try { await deleteLap(lapId); onUpdate() }
    finally { setPendingDel(null); setSaving(false) }
  }

  const visibleColCount = 3
    + (cols.has('startTs')  ? 1 : 0)
    + (cols.has('endTs')    ? 1 : 0)
    + 1
    + (cols.has('speedKmh') ? 1 : 0)
    + (cols.has('notes')    ? 1 : 0)
    + 1

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontWeight: 700, fontSize: 15 }}>{bikeLabel}</span>
        <span className="text-muted fs-12">{laps.length} tour{laps.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Coureur{isDualRider ? '(s)' : ''}</th>
              {cols.has('startTs')  && <th style={{ whiteSpace: 'nowrap' }}>Départ</th>}
              {cols.has('endTs')    && <th style={{ whiteSpace: 'nowrap' }}>Arrivée</th>}
              <th style={{ whiteSpace: 'nowrap' }}>Durée</th>
              {cols.has('speedKmh') && <th style={{ whiteSpace: 'nowrap' }}>Vitesse</th>}
              {cols.has('notes')    && <th>Notes</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {merged.map(row => {
              if (row.kind === 'transition') {
                const t = row.t
                return (
                  <tr key={`tr-${t.id}`} style={{ background: 'var(--amber-bg, rgba(245,158,11,0.06))', color: 'var(--amber, #d97706)' }}>
                    <td colSpan={visibleColCount} style={{ fontSize: 12, padding: '0.25rem 0.6rem', fontStyle: 'italic' }}>
                      ↔ Transition —&nbsp;
                      <span style={{ fontWeight: 500 }}>{t.incomingRiderName}{t.incomingRiderName2 ? ` + ${t.incomingRiderName2}` : ''}</span>
                      {t.outgoingRiderName && (
                        <> → <span style={{ fontWeight: 500 }}>{t.outgoingRiderName}{t.outgoingRiderName2 ? ` + ${t.outgoingRiderName2}` : ''}</span>
                        </>
                      )}
                      &nbsp;—&nbsp;<span className="mono">{formatMs(t.durationMs!)}</span>
                    </td>
                  </tr>
                )
              }
              const lap = row.lap
              return (
                <tr key={lap.id} className="completed">
                  <td className="text-muted fs-12 mono">{lap.lapNumber}</td>
                  <td>
                    {lap.riderName || <span className="text-faint">—</span>}
                    {isDualRider && lap.riderName2 && (
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{lap.riderName2}</div>
                    )}
                  </td>
                  {cols.has('startTs') && (
                    <LapCell lap={lap} field="startTimestamp" value={lap.startTimestamp} type="datetime-local"
                      editing={editing} setEditing={setEditing} onCommit={commit} />
                  )}
                  {cols.has('endTs') && (
                    <LapCell lap={lap} field="endTimestamp" value={lap.endTimestamp} type="datetime-local"
                      editing={editing} setEditing={setEditing} onCommit={commit} />
                  )}
                  <LapDurationCell lap={lap} editing={editing} setEditing={setEditing} onSaveDuration={saveDuration} />
                  {cols.has('speedKmh') && <td className="fs-12 text-muted" style={{ whiteSpace: 'nowrap' }}>{lap.speedKmh.toFixed(1)} km/h</td>}
                  {cols.has('notes') && (
                    <LapCell lap={lap} field="notes" value={lap.notes ?? ''}
                      editing={editing} setEditing={setEditing} onCommit={commit} />
                  )}
                  <td>
                    <button
                      className={`btn ${pendingDel === lap.id ? 'btn-danger' : 'btn-ghost'}`}
                      style={{ padding: '0.15rem 0.4rem', fontSize: 11 }}
                      onClick={() => del(lap.id)}
                    >
                      {pendingDel === lap.id ? '⚠' : '✕'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {laps.length === 0 && (
              <tr><td colSpan={visibleColCount} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Aucun tour</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Timeline view ────────────────────────────────────────────────────────────

const BIKE_COLORS: Record<BikeId, string> = {
  V1: 'var(--blue)',
  V2: 'var(--green)',
  V3: 'var(--amber)',
}

function TimelineTable({
  race, bikeIds, bikeLabels, cols, onUpdate,
}: {
  race: Race
  bikeIds: BikeId[]
  bikeLabels: Record<BikeId, string>
  cols: Set<ColKey>
  onUpdate: () => void
}) {
  const [editing, setEditing] = useState<EditState>(null)
  const [pendingDel, setPendingDel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  type MergedRow = { kind: 'lap'; lap: Lap; bikeId: BikeId } | { kind: 'transition'; t: Transition; bikeId: BikeId }

  const merged: MergedRow[] = bikeIds.flatMap(id => [
    ...race.bikes[id].laps.map(lap => ({ kind: 'lap' as const, lap, bikeId: id })),
    ...race.bikes[id].transitions.filter(t => t.durationMs != null).map(t => ({ kind: 'transition' as const, t, bikeId: id })),
  ]).sort((a, b) => {
    const tsA = a.kind === 'lap' ? a.lap.startTimestamp : a.t.startTimestamp
    const tsB = b.kind === 'lap' ? b.lap.startTimestamp : b.t.startTimestamp
    return Date.parse(tsA) - Date.parse(tsB)
  })

  const commit = async () => {
    if (!editing || saving) return
    setSaving(true)
    try { await updateLap(editing.lapId, { [editing.field]: editing.value }); onUpdate() }
    finally { setEditing(null); setSaving(false) }
  }

  const saveDuration = async (lapId: string, ms: number) => {
    setSaving(true)
    try { await updateLap(lapId, { durationMs: ms }); onUpdate() }
    finally { setSaving(false) }
  }

  const del = async (lapId: string) => {
    if (pendingDel !== lapId) {
      setPendingDel(lapId)
      setTimeout(() => setPendingDel(p => p === lapId ? null : p), 3000)
      return
    }
    setSaving(true)
    try { await deleteLap(lapId); onUpdate() }
    finally { setPendingDel(null); setSaving(false) }
  }

  const visibleColCount = 3
    + (cols.has('startTs')  ? 1 : 0)
    + (cols.has('endTs')    ? 1 : 0)
    + 1
    + (cols.has('speedKmh') ? 1 : 0)
    + (cols.has('notes')    ? 1 : 0)
    + 1

  if (merged.length === 0) {
    return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-3)', fontSize: 13 }}>Aucun tour pour les vélos sélectionnés</div>
  }

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontWeight: 700, fontSize: 15 }}>Vue chronologique</span>
        <span className="text-muted fs-12">{merged.filter(r => r.kind === 'lap').length} tours · tous vélos confondus</span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Vélo</th><th>#</th><th>Coureur</th>
              {cols.has('startTs')  && <th style={{ whiteSpace: 'nowrap' }}>Départ</th>}
              {cols.has('endTs')    && <th style={{ whiteSpace: 'nowrap' }}>Arrivée</th>}
              <th style={{ whiteSpace: 'nowrap' }}>Durée</th>
              {cols.has('speedKmh') && <th style={{ whiteSpace: 'nowrap' }}>Vitesse</th>}
              {cols.has('notes')    && <th>Notes</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {merged.map(row => {
              if (row.kind === 'transition') {
                const t = row.t
                return (
                  <tr key={`tr-${t.id}`} style={{ background: 'var(--amber-bg, rgba(245,158,11,0.06))', color: 'var(--amber, #d97706)' }}>
                    <td><span className="badge badge-amber" style={{ fontSize: 10 }}>{bikeLabels[row.bikeId]}</span></td>
                    <td colSpan={visibleColCount - 1} style={{ fontSize: 12, padding: '0.25rem 0.6rem', fontStyle: 'italic' }}>
                      ↔ Transition —&nbsp;
                      <span style={{ fontWeight: 500 }}>{t.incomingRiderName}{t.incomingRiderName2 ? ` + ${t.incomingRiderName2}` : ''}</span>
                      {t.outgoingRiderName && <> → <span style={{ fontWeight: 500 }}>{t.outgoingRiderName}{t.outgoingRiderName2 ? ` + ${t.outgoingRiderName2}` : ''}</span></>}
                      &nbsp;—&nbsp;<span className="mono">{formatMs(t.durationMs!)}</span>
                    </td>
                  </tr>
                )
              }
              const { lap, bikeId } = row
              return (
                <tr key={lap.id} className="completed">
                  <td><span className="badge badge-slate" style={{ fontSize: 10, color: BIKE_COLORS[bikeId] }}>{bikeLabels[bikeId]}</span></td>
                  <td className="text-muted fs-12 mono">{lap.lapNumber}</td>
                  <td>
                    {lap.riderName || <span className="text-faint">—</span>}
                    {lap.riderName2 && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{lap.riderName2}</div>}
                  </td>
                  {cols.has('startTs') && (
                    <LapCell lap={lap} field="startTimestamp" value={lap.startTimestamp} type="datetime-local"
                      editing={editing} setEditing={setEditing} onCommit={commit} />
                  )}
                  {cols.has('endTs') && (
                    <LapCell lap={lap} field="endTimestamp" value={lap.endTimestamp} type="datetime-local"
                      editing={editing} setEditing={setEditing} onCommit={commit} />
                  )}
                  <LapDurationCell lap={lap} editing={editing} setEditing={setEditing} onSaveDuration={saveDuration} />
                  {cols.has('speedKmh') && <td className="fs-12 text-muted" style={{ whiteSpace: 'nowrap' }}>{lap.speedKmh.toFixed(1)} km/h</td>}
                  {cols.has('notes') && (
                    <LapCell lap={lap} field="notes" value={lap.notes ?? ''}
                      editing={editing} setEditing={setEditing} onCommit={commit} />
                  )}
                  <td>
                    <button className={`btn ${pendingDel === lap.id ? 'btn-danger' : 'btn-ghost'}`}
                      style={{ padding: '0.15rem 0.4rem', fontSize: 11 }} onClick={() => del(lap.id)}>
                      {pendingDel === lap.id ? '⚠' : '✕'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Bike meta ────────────────────────────────────────────────────────────────

const BIKE_META = [
  { id: 'V1' as BikeId, isDualRider: false },
  { id: 'V2' as BikeId, isDualRider: false },
  { id: 'V3' as BikeId, isDualRider: true },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HistoryTable({ race, onUpdate }: Props) {
  const enabledBikes = race.settings.enabledBikes ?? { V1: true, V2: true, V3: true }
  const bikeLabels: Record<BikeId, string> = {
    V1: race.settings.bikeLabels?.V1 ?? race.bikes.V1.label,
    V2: race.settings.bikeLabels?.V2 ?? race.bikes.V2.label,
    V3: race.settings.bikeLabels?.V3 ?? race.bikes.V3.label,
  }
  const enabledIds = BIKE_META.filter(b => enabledBikes[b.id]).map(b => b.id)

  const [selectedBikes, setSelectedBikes] = useState<Set<BikeId>>(() => new Set(enabledIds))
  const [selectedCols, setSelectedCols]   = useState<Set<ColKey>>(() => new Set(['startTs', 'endTs', 'speedKmh', 'notes'] as ColKey[]))
  const [viewMode, setViewMode]           = useState<'per-bike' | 'timeline'>('per-bike')

  const toggleBike = (id: BikeId) =>
    setSelectedBikes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleCol = (key: ColKey) =>
    setSelectedCols(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const handleExport = () => downloadCsv(buildCsv(race, [...selectedBikes], selectedCols, bikeLabels))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.5rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>

        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button className={`btn${viewMode === 'per-bike'  ? ' btn-primary' : ''}`} style={{ fontSize: 12, padding: '0.25rem 0.6rem' }} onClick={() => setViewMode('per-bike')}>Par vélo</button>
          <button className={`btn${viewMode === 'timeline'  ? ' btn-primary' : ''}`} style={{ fontSize: 12, padding: '0.25rem 0.6rem' }} onClick={() => setViewMode('timeline')}>Chronologique</button>
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="text-muted fs-12">Vélos :</span>
          {enabledIds.map(id => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={selectedBikes.has(id)} onChange={() => toggleBike(id)} />
              {bikeLabels[id]}
            </label>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="text-muted fs-12">Colonnes :</span>
          {ALL_COLS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={selectedCols.has(col.key)} onChange={() => toggleCol(col.key)} />
              {col.label}
            </label>
          ))}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '0.3rem 0.75rem' }}
            disabled={selectedBikes.size === 0} onClick={handleExport}>
            Exporter CSV
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {viewMode === 'timeline' ? (
        <TimelineTable
          race={race}
          bikeIds={[...selectedBikes].filter(id => enabledIds.includes(id))}
          bikeLabels={bikeLabels}
          cols={selectedCols}
          onUpdate={onUpdate}
        />
      ) : (
        <div style={{
          display: 'grid', gap: '0.75rem', alignItems: 'start',
          gridTemplateColumns: `repeat(${Math.max(1, [...selectedBikes].filter(id => enabledIds.includes(id)).length)}, 1fr)`,
        }}>
          {BIKE_META.filter(b => enabledBikes[b.id] && selectedBikes.has(b.id)).map(b => (
            <LapTable key={b.id} bike={race.bikes[b.id]} bikeLabel={bikeLabels[b.id]}
              onUpdate={onUpdate} isDualRider={b.isDualRider} cols={selectedCols} />
          ))}
          {selectedBikes.size === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-3)', fontSize: 13 }}>
              Sélectionne au moins un vélo pour afficher les tours.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
