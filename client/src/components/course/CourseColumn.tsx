import { useState, useEffect, useRef } from 'react'
import type { BikeState, Rider, Race, QueueEntry } from '../../types'
import { pitTour, pitStop, pitStart, createRider, addToQueue, removeFromQueue, replaceQueue, updateLap, updateCurrentRider, deleteLap } from '../../api'
import { useTimer, formatMs } from '../../hooks/useTimer'
import RiderInput from './RiderInput'
import LapGauge from './LapGauge'

interface Props {
  bike: BikeState
  riders: Rider[]
  settings: Race['settings']
  onUpdate: () => void
  scrollTrigger?: number
  racePaused?: boolean
  pausedAt?: string
}

function LiveTimer({ startTs, running, isTransition, frozenMs }: { startTs?: string; running: boolean; isTransition?: boolean; frozenMs?: number }) {
  const t = useTimer(startTs, running, frozenMs)
  return <span className={isTransition ? 'timer-transition' : 'timer-running'} style={{ whiteSpace: 'nowrap' }}>{t}</span>
}

function playAlertBeeps() {
  try {
    const ctx = new AudioContext()
    const beep = (t: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880; osc.type = 'sine'
      gain.gain.setValueAtTime(0.25, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      osc.start(t); osc.stop(t + 0.2)
    }
    beep(ctx.currentTime); beep(ctx.currentTime + 0.28); beep(ctx.currentTime + 0.56)
    setTimeout(() => ctx.close(), 2000)
  } catch { /* silent fail */ }
}

type RowKind = 'completed' | 'running' | 'transition' | 'queued'

interface Row {
  kind: RowKind
  num: number
  riderName: string
  durationMs?: number
  startTs?: string
  queueEntry?: QueueEntry
  lapId?: string
}

function buildRows(bike: BikeState): Row[] {
  const rows: Row[] = []
  const sorted = [...bike.laps].sort((a, b) => a.lapNumber - b.lapNumber)
  for (const lap of sorted) {
    rows.push({ kind: 'completed', num: lap.lapNumber, riderName: lap.riderName, durationMs: lap.durationMs, lapId: lap.id })
  }
  const nextNum = bike.totalLaps + 1
  if (bike.status === 'RUNNING') {
    rows.push({ kind: 'running', num: nextNum, riderName: bike.currentRiderName ?? '', startTs: bike.currentLapStartTimestamp })
    bike.queue.forEach((q, i) => rows.push({ kind: 'queued', num: nextNum + 1 + i, riderName: q.riderName, queueEntry: q }))
  } else if (bike.status === 'TRANSITION') {
    const next = bike.queue[0]
    rows.push({ kind: 'transition', num: nextNum, riderName: next?.riderName ?? '', startTs: bike.transitionStartTimestamp, queueEntry: next })
    bike.queue.slice(1).forEach((q, i) => rows.push({ kind: 'queued', num: nextNum + 1 + i, riderName: q.riderName, queueEntry: q }))
  } else {
    bike.queue.forEach((q, i) => rows.push({ kind: 'queued', num: nextNum + i, riderName: q.riderName, queueEntry: q }))
  }
  return rows
}

function isInAniméSchedule(schedule: { start: string; end: string }[]): boolean {
  if (!schedule.length) return false
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return schedule.some(slot => {
    const [sh, sm] = slot.start.split(':').map(Number)
    const [eh, em] = slot.end.split(':').map(Number)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    if (startMin <= endMin) return currentMinutes >= startMin && currentMinutes < endMin
    return currentMinutes >= startMin || currentMinutes < endMin  // spans midnight
  })
}

export default function CourseColumn({ bike, riders, settings, onUpdate, scrollTrigger, racePaused, pausedAt }: Props) {
  const isAniméMode = (settings.animéOnlyMode ?? false) || isInAniméSchedule(settings.animéSchedule ?? [])
  const [pendingName, setPendingName] = useState('')
  const [queueInput, setQueueInput] = useState('')
  const [addingToQueue, setAddingToQueue] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Inline editing state for completed laps
  const [editLap, setEditLap] = useState<{ lapId: string; field: 'riderName' | 'durationMs'; value: string } | null>(null)
  // Inline editing state for running rider name
  const [editingCurrentRider, setEditingCurrentRider] = useState(false)
  const [currentRiderEdit, setCurrentRiderEdit] = useState('')
  // Inline editing state for queued entries
  const [editQueue, setEditQueue] = useState<{ entryId: string; value: string } | null>(null)
  // Drag & drop state for queue reordering
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    if (bike.status === 'TRANSITION' && bike.queue[0]) setPendingName(bike.queue[0].riderName)
    else if (bike.status !== 'TRANSITION') setPendingName('')
  }, [bike.status, bike.queue])

  // Cancel current rider edit if bike status changes
  useEffect(() => {
    if (bike.status !== 'RUNNING') setEditingCurrentRider(false)
  }, [bike.status])

  const rows = buildRows(bike)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const activeRow = container.querySelector<HTMLElement>('tr.running, tr.transition')
    if (!activeRow) return
    const containerHeight = container.clientHeight
    const rowHeight = activeRow.clientHeight
    const desiredScrollTop = activeRow.offsetTop - containerHeight / 2 + rowHeight / 2
    const needed = desiredScrollTop + containerHeight - container.scrollHeight
    if (needed > 0) container.style.paddingBottom = `${needed}px`
    container.scrollTop = Math.max(0, desiredScrollTop)
  }, [scrollTrigger])

  const alertThresholdMs = settings.lapAlertMs?.[bike.id] ?? settings.relayAlertThresholdMs
  const alertEnabled = settings.lapAlertEnabled?.[bike.id] ?? true
  const isAlert = alertEnabled && bike.status === 'RUNNING' && bike.currentLapStartTimestamp && !racePaused
    ? Date.now() - Date.parse(bike.currentLapStartTimestamp) > alertThresholdMs
    : false

  // Sound alert — play once when alert first fires
  const alertFiredRef = useRef(false)
  useEffect(() => {
    if (isAlert && !alertFiredRef.current && (settings.lapAlertSoundEnabled ?? true)) {
      alertFiredRef.current = true
      playAlertBeeps()
    }
    if (!isAlert) alertFiredRef.current = false
  }, [isAlert, settings.lapAlertSoundEnabled])

  // Frozen lap elapsed when race is paused (no maintenance mode active)
  const pausedFrozenMs = racePaused && !bike.maintenanceMode && bike.pausedLapElapsedMs !== undefined
    ? bike.pausedLapElapsedMs
    : undefined

  // Frozen transition elapsed when race is paused
  const pausedTransitionMs = racePaused && pausedAt && bike.transitionStartTimestamp
    ? Date.parse(pausedAt) - Date.parse(bike.transitionStartTimestamp)
    : undefined

  const resolveOrCreate = async (name: string): Promise<string> => {
    const trimmed = name.trim()
    if (!trimmed) return 'unknown'
    const existing = riders.find(r => r.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing.id
    const res = await createRider(trimmed)
    return res.data?.id ?? 'unknown'
  }

  // ─── Pit actions ─────────────────────────────────────────────────────────────

  const handleTour = async () => {
    if (loading || bike.status !== 'RUNNING') return
    setLoading(true); setErr(null)
    try {
      const res = await pitTour({ bikeId: bike.id, riderId: bike.currentRiderId ?? 'unknown', riderName: bike.currentRiderName ?? '' })
      if (!res.success) setErr(res.error ?? 'Erreur')
      else onUpdate()
    } finally { setLoading(false) }
  }

  const handleStop = async () => {
    if (loading || bike.status !== 'RUNNING') return
    setLoading(true); setErr(null)
    try {
      const res = await pitStop({ bikeId: bike.id })
      if (!res.success) setErr(res.error ?? 'Erreur')
      else onUpdate()
    } finally { setLoading(false) }
  }

  const handleStart = async () => {
    if (loading || bike.status !== 'TRANSITION') return
    setLoading(true); setErr(null)
    try {
      const name = pendingName.trim()
      const riderId = name ? await resolveOrCreate(name) : 'unknown'
      if (name && bike.queue[0]?.riderName.toLowerCase() === name.toLowerCase()) {
        await removeFromQueue(bike.id, bike.queue[0].id)
      }
      const res = await pitStart({ bikeId: bike.id, riderId, riderName: name })
      if (!res.success) setErr(res.error ?? 'Erreur')
      else { setPendingName(''); onUpdate() }
    } finally { setLoading(false) }
  }

  const handleAddQueue = async (nameArg?: string) => {
    const name = (nameArg ?? queueInput).trim()
    if (!name) { setAddingToQueue(false); return }
    setLoading(true)
    try {
      await resolveOrCreate(name)
      await addToQueue(bike.id, name)
      setQueueInput(''); setAddingToQueue(false); onUpdate()
    } finally { setLoading(false) }
  }

  const cancelAddQueue = () => { setAddingToQueue(false); setQueueInput('') }

  const handleQueueDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const newQueue = [...bike.queue]
    const fromIdx = newQueue.findIndex(e => e.id === dragId)
    const toIdx = newQueue.findIndex(e => e.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [item] = newQueue.splice(fromIdx, 1)
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx
    newQueue.splice(insertIdx, 0, item)
    setDragId(null); setDragOverId(null)
    await replaceQueue(bike.id, newQueue)
    onUpdate()
  }

  const handleRemoveQueue = async (entryId: string) => {
    setLoading(true)
    try { await removeFromQueue(bike.id, entryId); onUpdate() }
    finally { setLoading(false) }
  }

  const handleDeleteLap = async (lapId: string) => {
    setLoading(true)
    try { await deleteLap(lapId); onUpdate() }
    finally { setLoading(false) }
  }

  // ─── Inline editing ───────────────────────────────────────────────────────────

  const saveLapName = async (lapId: string, name: string) => {
    setEditLap(null)
    await updateLap(lapId, { riderName: name.trim() })
    onUpdate()
  }

  const saveQueueName = async (entryId: string, name: string) => {
    setEditQueue(null)
    const trimmed = name.trim()
    if (!trimmed) return
    const updatedQueue = bike.queue.map(e => e.id === entryId ? { ...e, riderName: trimmed } : e)
    await replaceQueue(bike.id, updatedQueue)
    onUpdate()
  }

  const saveLapDuration = async (lapId: string, rawValue: string) => {
    setEditLap(null)
    const parts = rawValue.split(':')
    if (parts.length === 2) {
      const ms = (parseInt(parts[0]) * 60 + parseInt(parts[1])) * 1_000
      if (ms > 0) {
        await updateLap(lapId, { durationMs: ms })
        onUpdate()
      }
    }
  }

  const saveCurrentRider = async (name: string) => {
    setEditingCurrentRider(false)
    const trimmed = name.trim()
    const riderId = trimmed ? await resolveOrCreate(trimmed) : 'unknown'
    await updateCurrentRider(bike.id, riderId, trimmed)
    onUpdate()
  }

  // ─── Header ───────────────────────────────────────────────────────────────────

  const statusBadge = bike.status === 'RUNNING'
    ? <span className={`badge ${isAlert ? 'badge-red' : 'badge-green'}`}>{isAlert ? '⚠ Trop longtemps' : 'En piste'}</span>
    : bike.status === 'TRANSITION'
    ? <span className="badge badge-amber">Transition</span>
    : <span className="badge badge-slate">En attente</span>

  return (
    <div className={`card${isAlert ? ' card-danger' : ''}`} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div className="card-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{settings.bikeLabels?.[bike.id] ?? bike.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {statusBadge}
            {isAniméMode && <span className="badge badge-amber" style={{ fontSize: 10 }}>Mode animés</span>}
            {bike.status === 'RUNNING' && (
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {bike.totalLaps} tour{bike.totalLaps !== 1 ? 's' : ''} · {bike.totalDistanceKm.toFixed(1)} km
              </span>
            )}
          </div>
        </div>
        {bike.status === 'TRANSITION' && bike.transitionStartTimestamp && (
          <div style={{ textAlign: 'right' }}>
            <div className="label">Transition</div>
            <LiveTimer startTs={bike.transitionStartTimestamp} running={!racePaused} isTransition frozenMs={pausedTransitionMs} />
          </div>
        )}
        {bike.status === 'RUNNING' && (
          <div style={{ textAlign: 'right', maxWidth: 130 }}>
            {bike.currentRiderName
              ? <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bike.currentRiderName}</div>
              : <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Sans nom</div>
            }
            <LiveTimer startTs={bike.currentLapStartTimestamp} running={!racePaused} frozenMs={pausedFrozenMs} />
          </div>
        )}
        {settings.lapGaugeEnabled?.[bike.id] && (
          <div style={{ width: '100%', marginTop: '0.4rem' }}>
            <LapGauge
              startTs={bike.currentLapStartTimestamp}
              running={bike.status === 'RUNNING' && !racePaused}
              frozenMs={pausedFrozenMs}
              mode={settings.lapGaugeMode?.[bike.id] ?? 'fixed'}
              fixedMs={settings.lapGaugeMs?.[bike.id] ?? 250000}
              laps={bike.laps}
            />
          </div>
        )}
      </div>

      {err && (
        <div style={{ margin: '0.5rem 0.75rem 0', padding: '0.35rem 0.6rem', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 5, color: 'var(--red)', fontSize: 12 }}>
          {err}
        </div>
      )}

      {/* Table */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        <table className="table" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 32 }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Coureur</th>
              <th style={{ whiteSpace: 'nowrap' }}>Chrono</th>
              <th style={{ textAlign: 'center', fontSize: 10 }}>START</th>
              <th style={{ textAlign: 'center', fontSize: 10 }}>STOP</th>
              <th style={{ textAlign: 'center', fontSize: 10 }}>TOUR</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={`${row.kind}-${row.num}`}
                className={row.kind}
                draggable={row.kind === 'queued'}
                onDragStart={row.kind === 'queued' && row.queueEntry ? (e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(row.queueEntry!.id) } : undefined}
                onDragOver={row.kind === 'queued' && row.queueEntry ? (e) => { e.preventDefault(); setDragOverId(row.queueEntry!.id) } : undefined}
                onDrop={row.kind === 'queued' && row.queueEntry ? (e) => { e.preventDefault(); handleQueueDrop(row.queueEntry!.id) } : undefined}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                style={{
                  overflowAnchor: (row.kind === 'running' || row.kind === 'transition') ? 'auto' : 'none',
                  opacity: row.kind === 'queued' && dragId === row.queueEntry?.id ? 0.3 : 1,
                  borderTop: row.kind === 'queued' && dragOverId === row.queueEntry?.id && dragId !== row.queueEntry?.id ? '2px solid var(--primary, #6366f1)' : undefined,
                  cursor: row.kind === 'queued' ? 'grab' : undefined,
                  transition: 'opacity 0.15s ease, border-top 0.1s ease',
                }}
              >
                <td className="mono text-muted fs-12">{row.num}</td>

                {/* ── Name cell ── */}
                <td style={{ padding: '2px 4px' }}>
                  {row.kind === 'transition' && (
                    <RiderInput
                      riders={riders}
                      value={pendingName}
                      onChange={setPendingName}
                      onSubmit={handleStart}
                      placeholder="Prochain coureur…"
                      autoFocus={!bike.queue[0]}
                      animéOnly={isAniméMode}
                    />
                  )}
                  {row.kind === 'running' && (
                    editingCurrentRider ? (
                      <RiderInput
                        riders={riders}
                        value={currentRiderEdit}
                        onChange={setCurrentRiderEdit}
                        onSubmit={(name) => saveCurrentRider(name ?? currentRiderEdit)}
                        onCancel={() => setEditingCurrentRider(false)}
                        autoFocus
                      />
                    ) : (
                      <span
                        style={{ fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        onClick={() => { setCurrentRiderEdit(row.riderName); setEditingCurrentRider(true) }}
                        title="Cliquer pour modifier"
                      >
                        {row.riderName || <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 12 }}>Sans nom — cliquer pour ajouter</span>}
                      </span>
                    )
                  )}
                  {row.kind === 'completed' && (
                    editLap !== null && editLap.lapId === row.lapId && editLap.field === 'riderName' ? (
                      <RiderInput
                        riders={riders}
                        value={editLap.value}
                        onChange={v => setEditLap(prev => prev ? { ...prev, value: v } : null)}
                        onSubmit={(name) => saveLapName(row.lapId!, name ?? editLap.value)}
                        onCancel={() => setEditLap(null)}
                        autoFocus
                      />
                    ) : (
                      <span
                        style={{ fontWeight: 400, fontSize: 13, cursor: 'pointer', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        onClick={() => setEditLap({ lapId: row.lapId!, field: 'riderName', value: row.riderName })}
                        title="Cliquer pour modifier"
                      >
                        {row.riderName || <span className="text-faint">—</span>}
                      </span>
                    )
                  )}
                  {row.kind === 'queued' && (
                    editQueue?.entryId === row.queueEntry?.id ? (
                      <RiderInput
                        riders={riders}
                        value={editQueue.value}
                        onChange={v => setEditQueue(prev => prev ? { ...prev, value: v } : null)}
                        onSubmit={(name) => saveQueueName(row.queueEntry!.id, name ?? editQueue.value)}
                        onCancel={() => setEditQueue(null)}
                        autoFocus
                        animéOnly={isAniméMode}
                      />
                    ) : (
                      <span
                        style={{ fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        onClick={() => row.queueEntry && setEditQueue({ entryId: row.queueEntry.id, value: row.riderName })}
                        title="Cliquer pour modifier"
                      >
                        {row.riderName || <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 12 }}>Sans nom</span>}
                      </span>
                    )
                  )}
                </td>

                {/* ── Chrono cell ── */}
                <td className="mono" style={{ whiteSpace: 'nowrap', padding: '2px 4px' }}>
                  {row.kind === 'completed' && (
                    editLap !== null && editLap.lapId === row.lapId && editLap.field === 'durationMs' ? (
                      <input
                        className="input mono"
                        autoFocus
                        defaultValue={(() => {
                          const ms = Number(editLap.value)
                          return `${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor((ms % 60_000) / 1_000)).padStart(2, '0')}`
                        })()}
                        style={{ width: 65, fontSize: 12 }}
                        placeholder="MM:SS"
                        onBlur={e => saveLapDuration(row.lapId!, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveLapDuration(row.lapId!, e.currentTarget.value)
                          if (e.key === 'Escape') setEditLap(null)
                        }}
                      />
                    ) : (
                      <span
                        style={{ fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}
                        onClick={() => row.lapId && setEditLap({ lapId: row.lapId, field: 'durationMs', value: String(row.durationMs ?? 0) })}
                        title="Cliquer pour modifier"
                      >
                        {formatMs(row.durationMs ?? 0)}
                      </span>
                    )
                  )}
                  {row.kind === 'running' && <LiveTimer startTs={row.startTs} running={!racePaused} frozenMs={pausedFrozenMs} />}
                </td>

                {/* ── Buttons ── */}
                <td style={{ textAlign: 'center' }}>
                  <button
                    className={`pit-btn pit-btn-start${row.kind === 'transition' ? ' active' : ''}`}
                    disabled={row.kind !== 'transition' || loading}
                    onClick={handleStart}
                    style={{ minWidth: 52, height: 32, fontSize: 12, padding: '0 0.4rem', fontWeight: 600 }}
                  >
                    {loading && row.kind === 'transition' ? '…' : 'START'}
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className={`pit-btn pit-btn-stop${row.kind === 'running' ? ' active' : ''}`}
                    disabled={row.kind !== 'running' || loading}
                    onClick={handleStop}
                    style={{ minWidth: 52, height: 32, fontSize: 12, padding: '0 0.4rem', fontWeight: 600 }}
                  >
                    {loading && row.kind === 'running' ? '…' : 'STOP'}
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {row.kind === 'queued' && row.queueEntry ? (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '0.1rem 0.3rem', color: 'var(--text-3)', minWidth: 52, height: 32 }}
                      onClick={() => handleRemoveQueue(row.queueEntry!.id)}
                      title="Retirer de la file"
                    >
                      ✕
                    </button>
                  ) : (
                    <button
                      className={`pit-btn pit-btn-tour${row.kind === 'running' ? ' active' : ''}`}
                      disabled={row.kind !== 'running' || loading}
                      onClick={handleTour}
                      style={{ minWidth: 52, height: 32, fontSize: 12, padding: '0 0.4rem', fontWeight: 600 }}
                    >
                      {loading && row.kind === 'running' ? '…' : 'TOUR'}
                    </button>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {row.kind === 'completed' && row.lapId && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '0.1rem 0.3rem', color: 'var(--text-3)', width: 28, height: 28 }}
                      onClick={() => handleDeleteLap(row.lapId!)}
                      title="Supprimer ce tour"
                      disabled={loading}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {/* ── Inline queue add row ── */}
            {addingToQueue ? (
              <tr style={{ background: 'var(--surface-2)' }}>
                <td className="mono text-muted fs-12">+</td>
                <td colSpan={2}>
                  <RiderInput
                    riders={riders}
                    value={queueInput}
                    onChange={setQueueInput}
                    onSubmit={handleAddQueue}
                    onCancel={cancelAddQueue}
                    placeholder="Ajouter à la file…"
                    autoFocus
                    animéOnly={isAniméMode}
                    className="grow"
                  />
                </td>
                <td colSpan={2}></td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: '0.2rem 0.4rem', minWidth: 52, height: 32 }}
                    onClick={() => handleAddQueue()}
                    disabled={!queueInput.trim() || loading}
                  >
                    +
                  </button>
                </td>
                <td></td>
              </tr>
            ) : (
              <tr className="queue-add-ghost" style={{ cursor: 'pointer' }} onClick={() => setAddingToQueue(true)}>
                <td></td>
                <td colSpan={6} style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', padding: '0.4rem 0.6rem' }}>
                  + Ajouter à la file…
                </td>
              </tr>
            )}
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={`spacer-${i}`} style={{ pointerEvents: 'none' }}>
                <td colSpan={7} style={{ height: 32, borderColor: 'transparent' }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
