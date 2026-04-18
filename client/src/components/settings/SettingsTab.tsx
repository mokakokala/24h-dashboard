import { useState } from 'react'
import type { Race, RaceSettings, AniméSlot, LapGaugeMode, HeaderStatConfig } from '../../types'
import { updateSettings, finishRace, reopenRace, pauseRace, resumeRace } from '../../api'
import BackupPanel from '../backup/BackupPanel'
import { downloadReportPdf, downloadReportPng } from '../../lib/reportGenerator'

interface Props { race: Race; onUpdate: () => void; onRestore: () => void }

const ACCENT_PRESETS = [
  { label: 'Indigo',  value: '#6366f1' },
  { label: 'Bleu',    value: '#3b82f6' },
  { label: 'Violet',  value: '#8b5cf6' },
  { label: 'Rose',    value: '#ec4899' },
  { label: 'Orange',  value: '#f97316' },
  { label: 'Teal',    value: '#14b8a6' },
  { label: 'Vert',    value: '#22c55e' },
  { label: 'Rouge',   value: '#ef4444' },
]

const DEFAULT_ACCENT = '#6366f1'

const BIKE_IDS = ['V1', 'V2', 'V3'] as const

type SectionId = 'velos' | 'course' | 'interface' | 'donnees' | 'info'

const SECTIONS: { id: SectionId; label: string; sub: string }[] = [
  { id: 'velos',      label: 'Vélos',      sub: 'Config, alertes, jauge' },
  { id: 'course',     label: 'Course',     sub: 'Circuit, mode animés' },
  { id: 'interface',  label: 'Interface',  sub: 'Couleur, réseau' },
  { id: 'donnees',    label: 'Données',    sub: 'Exports, backup, reset' },
  { id: 'info',       label: 'Info',       sub: 'Comment ça marche' },
]

export default function SettingsTab({ race, onUpdate, onRestore }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>('velos')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [accentColor, setAccentColor] = useState<string>(() => localStorage.getItem('accent-color') ?? DEFAULT_ACCENT)
  const [newSlotStart, setNewSlotStart] = useState('10:00')
  const [newSlotEnd, setNewSlotEnd] = useState('14:00')

  const applyAccent = (color: string) => {
    document.documentElement.style.setProperty('--primary', color)
    localStorage.setItem('accent-color', color)
    setAccentColor(color)
  }
  const resetAccent = () => applyAccent(DEFAULT_ACCENT)

  const s = race.settings
  const enabledBikes = s.enabledBikes ?? { V1: true, V2: true, V3: true }
  const bikeLabels = s.bikeLabels ?? { V1: race.bikes.V1.label, V2: race.bikes.V2.label, V3: race.bikes.V3.label }
  const animéSchedule = s.animéSchedule ?? []

  const save = async (partial: Partial<RaceSettings>) => {
    setSaving(true)
    try {
      await updateSettings(partial)
      onUpdate()
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally { setSaving(false) }
  }

  const setLapAlertMs = (bikeId: 'V1' | 'V2' | 'V3', value: number) =>
    save({ lapAlertMs: { ...s.lapAlertMs, [bikeId]: value } })
  const setLapAlertEnabled = (bikeId: 'V1' | 'V2' | 'V3', enabled: boolean) =>
    save({ lapAlertEnabled: { ...s.lapAlertEnabled, [bikeId]: enabled } })

  const gaugeEnabled = s.lapGaugeEnabled ?? { V1: false, V2: false, V3: false }
  const gaugeMode = s.lapGaugeMode ?? { V1: 'fixed' as LapGaugeMode, V2: 'fixed' as LapGaugeMode, V3: 'fixed' as LapGaugeMode }
  const gaugeMs = s.lapGaugeMs ?? { V1: 250000, V2: 250000, V3: 250000 }

  const setGaugeEnabled = (bikeId: 'V1' | 'V2' | 'V3', enabled: boolean) =>
    save({ lapGaugeEnabled: { ...gaugeEnabled, [bikeId]: enabled } })
  const setGaugeMode = (bikeId: 'V1' | 'V2' | 'V3', mode: LapGaugeMode) =>
    save({ lapGaugeMode: { ...gaugeMode, [bikeId]: mode } })
  const setGaugeMs = (bikeId: 'V1' | 'V2' | 'V3', ms: number) =>
    save({ lapGaugeMs: { ...gaugeMs, [bikeId]: ms } })

  const parseMmSs = (value: string): number | null => {
    const parts = value.split(':')
    if (parts.length !== 2) return null
    const m = parseInt(parts[0])
    const sec = parseInt(parts[1])
    if (isNaN(m) || isNaN(sec) || sec < 0 || sec >= 60) return null
    return (m * 60 + sec) * 1000
  }

  const fmtMmSs = (ms: number): string => {
    const m = Math.floor(ms / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const setEnabledBike = (bikeId: 'V1' | 'V2' | 'V3', enabled: boolean) => {
    const newEnabled = { ...enabledBikes, [bikeId]: enabled }
    if (!Object.values(newEnabled).some(Boolean)) return
    save({ enabledBikes: newEnabled })
  }

  const setBikeLabel = (bikeId: 'V1' | 'V2' | 'V3', label: string) => {
    if (!label.trim()) return
    save({ bikeLabels: { ...bikeLabels, [bikeId]: label.trim() } })
  }

  const bikeStatus = (id: 'V1' | 'V2' | 'V3') => race.bikes[id].status

  // ─── Section content ────────────────────────────────────────────────────────

  const sectionVelos = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Configuration des vélos */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Configuration des vélos</span>
          <span className="text-muted fs-12">Activer/désactiver et renommer</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {BIKE_IDS.map(id => {
            const status = bikeStatus(id)
            const isActive = status === 'RUNNING' || status === 'TRANSITION'
            const isEnabled = enabledBikes[id]
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 32 }}>
                  <input type="checkbox" checked={isEnabled} onChange={e => setEnabledBike(id, e.target.checked)}
                    disabled={saving} title={isActive ? 'Ce vélo est actuellement en piste' : undefined} />
                </label>
                <span className="text-muted fs-12" style={{ minWidth: 20, fontFamily: 'monospace' }}>{id}</span>
                <input className="input" key={bikeLabels[id]} defaultValue={bikeLabels[id]}
                  style={{ flex: 1, fontSize: 13, opacity: isEnabled ? 1 : 0.45 }}
                  placeholder={`Nom du vélo ${id}`} disabled={saving || !isEnabled}
                  onBlur={e => { if (e.target.value.trim() !== bikeLabels[id]) setBikeLabel(id, e.target.value) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
                {isActive && <span className="badge badge-green" style={{ fontSize: 10 }}>En piste</span>}
                {!isEnabled && <span className="text-muted fs-12" style={{ fontStyle: 'italic' }}>désactivé</span>}
              </div>
            )
          })}
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Au moins un vélo doit rester actif. Les données des vélos désactivés sont conservées.
          </p>
        </div>
      </div>

      {/* Alerte durée de tour */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Alerte durée de tour</span>
          <span className="text-muted fs-12">Bordure rouge clignotante quand le seuil est dépassé</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {BIKE_IDS.filter(id => enabledBikes[id]).map(id => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 160 }}>
                <input type="checkbox" checked={s.lapAlertEnabled?.[id] ?? true}
                  onChange={e => setLapAlertEnabled(id, e.target.checked)} disabled={saving} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{bikeLabels[id]}</span>
              </label>
              <input className="input mono"
                key={`alert-${id}-${s.lapAlertMs?.[id] ?? s.relayAlertThresholdMs}`}
                defaultValue={fmtMmSs(s.lapAlertMs?.[id] ?? s.relayAlertThresholdMs)}
                placeholder="MM:SS" style={{ width: 80, fontSize: 13, textAlign: 'center' }}
                disabled={saving || !(s.lapAlertEnabled?.[id] ?? true)}
                onBlur={e => {
                  const ms = parseMmSs(e.target.value)
                  if (ms !== null && ms > 0) setLapAlertMs(id, ms)
                  else e.target.value = fmtMmSs(s.lapAlertMs?.[id] ?? s.relayAlertThresholdMs)
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Jauge de progression */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Jauge de progression</span>
          <span className="text-muted fs-12">Barre de progression du tour en cours</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {BIKE_IDS.filter(id => enabledBikes[id]).map(id => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 160 }}>
                <input type="checkbox" checked={gaugeEnabled[id]}
                  onChange={e => setGaugeEnabled(id, e.target.checked)} disabled={saving} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{bikeLabels[id]}</span>
              </label>
              {gaugeEnabled[id] && (
                <>
                  <select className="input" style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: 13 }}
                    value={gaugeMode[id]} onChange={e => setGaugeMode(id, e.target.value as LapGaugeMode)} disabled={saving}>
                    <option value="fixed">Durée fixe</option>
                    <option value="average">Moyenne des tours</option>
                  </select>
                  {gaugeMode[id] === 'fixed' && (
                    <input className="input mono" key={`gauge-${id}-${gaugeMs[id]}`}
                      defaultValue={fmtMmSs(gaugeMs[id])} placeholder="MM:SS"
                      style={{ width: 80, fontSize: 13, textAlign: 'center' }} disabled={saving}
                      onBlur={e => {
                        const ms = parseMmSs(e.target.value)
                        if (ms !== null && ms > 0) setGaugeMs(id, ms)
                        else e.target.value = fmtMmSs(gaugeMs[id])
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    />
                  )}
                  {gaugeMode[id] === 'average' && (
                    <span className="text-muted fs-12" style={{ fontStyle: 'italic' }}>calculé automatiquement</span>
                  )}
                </>
              )}
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            En mode « Moyenne », la cible est recalculée à partir de tous les tours effectués.
          </p>
        </div>
      </div>

      {/* Son d'alerte */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Son d'alerte</span>
          <span className="text-muted fs-12">Signal sonore quand un tour dépasse le seuil</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
            <input type="checkbox"
              checked={s.lapAlertSoundEnabled ?? true}
              onChange={e => save({ lapAlertSoundEnabled: e.target.checked })}
              disabled={saving}
            />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Activer le son d'alerte</span>
          </label>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Trois bips sonores sont joués une fois par tour quand le seuil de durée est dépassé.
            L'alerte visuelle (bordure rouge) s'affiche toujours, indépendamment de ce réglage.
          </p>
        </div>
      </div>
    </div>
  )

  const sectionCourse = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Circuit */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Circuit</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: 13, fontWeight: 500, minWidth: 140 }}>Distance par tour</label>
            <input className="input" type="number" step="0.1" min="0.1" max="50"
              style={{ width: 90, fontSize: 13 }} defaultValue={s.circuitDistanceKm}
              onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) save({ circuitDistanceKm: v }) }}
              disabled={saving} />
            <span className="text-muted fs-12">km</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: 13, fontWeight: 500, minWidth: 140 }}>Durée de la course</label>
            <input className="input" type="number" step="1" min="1" max="48"
              style={{ width: 90, fontSize: 13 }} defaultValue={Math.round(s.raceDurationMs / 3_600_000)}
              onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) save({ raceDurationMs: v * 3_600_000 }) }}
              disabled={saving} />
            <span className="text-muted fs-12">heures</span>
          </div>
        </div>
      </div>

      {/* Pause course */}
      {race.status === 'RUNNING' && (
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600 }}>Pause</span>
            <span className="text-muted fs-12">Gèle tous les chronomètres</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              Met tous les vélos en pause simultanément. Les actions TOUR / STOP / START sont désactivées jusqu'à la reprise.
            </p>
            <div>
              <button className="btn" style={{ fontSize: 13 }} disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try { await pauseRace(); onUpdate() }
                  finally { setSaving(false) }
                }}>
                ⏸ Mettre en pause
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprendre après pause */}
      {race.status === 'PAUSED' && (
        <div className="card" style={{ borderColor: 'var(--amber-border, #fcd34d)' }}>
          <div className="card-header">
            <span style={{ fontWeight: 600 }}>Course en pause</span>
            <span className="badge badge-amber" style={{ fontSize: 11 }}>⏸ Pausée</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              Tous les chronomètres sont gelés. La reprise décale automatiquement les timestamps de départ de tour pour ne pas compter la durée de pause.
            </p>
            <div>
              <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try { await resumeRace(); onUpdate() }
                  finally { setSaving(false) }
                }}>
                ▶ Reprendre la course
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fin de course */}
      {race.status === 'RUNNING' && (
        <div className="card" style={{ borderColor: 'var(--amber-border, #fcd34d)' }}>
          <div className="card-header">
            <span style={{ fontWeight: 600 }}>Fin de course</span>
            <span className="text-muted fs-12">Fige le chrono et marque la course comme terminée</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              Enregistre l'heure officielle de fin. Les données restent consultables et modifiables depuis l'Historique.
              Cette action est réversible en redémarrant la course depuis l'onglet Course.
            </p>
            <div>
              <button
                className={`btn ${confirmFinish ? 'btn-danger' : ''}`}
                style={{ fontSize: 13 }}
                disabled={saving}
                onClick={async () => {
                  if (!confirmFinish) {
                    setConfirmFinish(true)
                    setTimeout(() => setConfirmFinish(false), 5000)
                    return
                  }
                  setSaving(true)
                  try { await finishRace(); onUpdate() }
                  finally { setSaving(false); setConfirmFinish(false) }
                }}
              >
                {confirmFinish ? '⚠ Confirmer la fin de course' : 'Terminer la course'}
              </button>
              {confirmFinish && (
                <span style={{ marginLeft: '0.75rem', fontSize: 12, color: 'var(--text-3)' }}>
                  Cliquer à nouveau pour confirmer (5 s)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reprendre après fin accidentelle */}
      {race.status === 'FINISHED' && (
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600 }}>Course terminée</span>
            <span className="badge badge-slate" style={{ fontSize: 11 }}>Terminée</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              La course a été marquée comme terminée. Si c'était une erreur, tu peux la reprendre — l'heure de fin sera effacée et le chrono repartira.
            </p>
            <div>
              <button
                className="btn btn-primary"
                style={{ fontSize: 13 }}
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try { await reopenRace(); onUpdate() }
                  finally { setSaving(false) }
                }}
              >
                ↺ Reprendre la course
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode Animés */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Mode Animés</span>
          <span className="text-muted fs-12">Restreindre aux coureurs animés uniquement</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.animéOnlyMode ?? false}
              onChange={e => save({ animéOnlyMode: e.target.checked })} disabled={saving} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Activer maintenant (override manuel)</span>
          </label>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            Quand activé, seuls les coureurs de type <strong>Animé</strong> apparaissent dans le menu déroulant lors de l&apos;ajout en file.
          </p>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: '0.5rem' }}>Plages horaires animés</div>
            <p style={{ margin: '0 0 0.5rem', fontSize: 12, color: 'var(--text-3)' }}>
              Le mode animés s&apos;activera automatiquement pendant ces créneaux (heure locale).
            </p>
            {animéSchedule.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune plage définie</p>
            )}
            {animéSchedule.map((slot, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span className="badge badge-amber" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  {slot.start} → {slot.end}
                </span>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '0.1rem 0.4rem' }} disabled={saving}
                  onClick={() => { const updated = animéSchedule.filter((_, idx) => idx !== i); save({ animéSchedule: updated }) }}>
                  ✕
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13 }}>De</span>
              <input className="input mono" type="time" value={newSlotStart}
                onChange={e => setNewSlotStart(e.target.value)} style={{ width: 110, fontSize: 13 }} />
              <span style={{ fontSize: 13 }}>à</span>
              <input className="input mono" type="time" value={newSlotEnd}
                onChange={e => setNewSlotEnd(e.target.value)} style={{ width: 110, fontSize: 13 }} />
              <button className="btn btn-primary" style={{ fontSize: 12 }}
                disabled={saving || !newSlotStart || !newSlotEnd}
                onClick={() => {
                  const updated: AniméSlot[] = [...animéSchedule, { start: newSlotStart, end: newSlotEnd }]
                  save({ animéSchedule: updated })
                }}>
                + Ajouter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const sectionInterface = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Couleur d'accentuation */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Couleur d'accentuation</span>
          <span className="text-muted fs-12">Boutons, onglet actif, champs focus</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {ACCENT_PRESETS.map(p => (
              <button key={p.value} title={p.label} onClick={() => applyAccent(p.value)} style={{
                width: 28, height: 28, borderRadius: '50%', background: p.value,
                border: accentColor === p.value ? '3px solid var(--text)' : '2px solid transparent',
                outline: accentColor === p.value ? `2px solid ${p.value}` : 'none',
                outlineOffset: 2, cursor: 'pointer', transition: 'transform 100ms', flexShrink: 0,
              }} />
            ))}
            <label title="Couleur personnalisée" style={{ position: 'relative', width: 28, height: 28, cursor: 'pointer', flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                border: !ACCENT_PRESETS.some(p => p.value === accentColor) ? '3px solid var(--text)' : '2px solid var(--border)',
              }} />
              <input type="color" value={accentColor} onChange={e => applyAccent(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: accentColor, flexShrink: 0 }} />
            <span className="mono fs-12" style={{ color: 'var(--text-2)' }}>{accentColor}</span>
            {accentColor !== DEFAULT_ACCENT && (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '0.1rem 0.5rem' }} onClick={resetAccent}>
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Informations du bandeau */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Informations du bandeau</span>
          <span className="text-muted fs-12">Données affichées en haut à gauche pendant la course</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {(() => {
            const hs: HeaderStatConfig = s.headerStats ?? { showDuration: true, showTotalLaps: true, showTotalKm: true }
            const setHs = (patch: Partial<HeaderStatConfig>) => save({ headerStats: { ...hs, ...patch } })

            const generalStats: { key: keyof HeaderStatConfig; label: string }[] = [
              { key: 'showDuration',  label: 'Durée de course (chrono)' },
              { key: 'showTotalLaps', label: 'Total tours (tous vélos)' },
              { key: 'showTotalKm',   label: 'Distance totale (tous vélos)' },
            ]

            const bikeStats: { id: 'V1' | 'V2' | 'V3' }[] = [
              { id: 'V1' }, { id: 'V2' }, { id: 'V3' },
            ]

            return (
              <>
                <div>
                  <div className="label" style={{ marginBottom: '0.4rem' }}>Général</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {generalStats.map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={hs[key] ?? false}
                          onChange={e => setHs({ [key]: e.target.checked })} disabled={saving} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: '0.4rem' }}>Par vélo (indépendant)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {bikeStats.filter(({ id }) => enabledBikes[id]).map(({ id }) => {
                      const lbl = bikeLabels[id]
                      const lapsKey = `show${id}Laps` as keyof HeaderStatConfig
                      const kmKey   = `show${id}Km`   as keyof HeaderStatConfig
                      return (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 500, minWidth: 120 }}>{lbl}</span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" checked={hs[lapsKey] ?? false}
                              onChange={e => setHs({ [lapsKey]: e.target.checked })} disabled={saving} />
                            Tours
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" checked={hs[kmKey] ?? false}
                              onChange={e => setHs({ [kmKey]: e.target.checked })} disabled={saving} />
                            Km
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                  Les informations n'apparaissent que pendant la course (statut "En cours").
                </p>
              </>
            )
          })()}
        </div>
      </div>

      {/* Horloge */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Horloge</span>
          <span className="text-muted fs-12">Fuseau horaire et format de date affichés en haut à droite</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label className="label">Fuseau horaire</label>
            <select className="input" style={{ maxWidth: 280, fontSize: 13 }}
              value={s.timezone ?? 'Europe/Brussels'}
              onChange={e => save({ timezone: e.target.value })}
              disabled={saving}
            >
              <optgroup label="Europe">
                <option value="Europe/Brussels">Europe/Brussels (Belgique)</option>
                <option value="Europe/Paris">Europe/Paris (France)</option>
                <option value="Europe/London">Europe/London (Royaume-Uni)</option>
                <option value="Europe/Berlin">Europe/Berlin (Allemagne)</option>
                <option value="Europe/Amsterdam">Europe/Amsterdam (Pays-Bas)</option>
                <option value="Europe/Madrid">Europe/Madrid (Espagne)</option>
                <option value="Europe/Rome">Europe/Rome (Italie)</option>
                <option value="Europe/Zurich">Europe/Zurich (Suisse)</option>
                <option value="Europe/Lisbon">Europe/Lisbon (Portugal)</option>
                <option value="Europe/Warsaw">Europe/Warsaw (Pologne)</option>
                <option value="Europe/Helsinki">Europe/Helsinki (Finlande)</option>
                <option value="Europe/Athens">Europe/Athens (Grèce)</option>
                <option value="Europe/Moscow">Europe/Moscow (Russie)</option>
              </optgroup>
              <optgroup label="Amériques">
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Chicago">America/Chicago (CST)</option>
                <option value="America/Denver">America/Denver (MST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="America/Sao_Paulo">America/Sao_Paulo (Brésil)</option>
                <option value="America/Toronto">America/Toronto (Canada Est)</option>
              </optgroup>
              <optgroup label="Asie / Pacifique">
                <option value="Asia/Dubai">Asia/Dubai (EAU)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (Inde)</option>
                <option value="Asia/Bangkok">Asia/Bangkok (Thaïlande)</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="Asia/Tokyo">Asia/Tokyo (Japon)</option>
                <option value="Asia/Shanghai">Asia/Shanghai (Chine)</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
              </optgroup>
              <optgroup label="Autre">
                <option value="UTC">UTC</option>
                <option value="Africa/Casablanca">Africa/Casablanca (Maroc)</option>
              </optgroup>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label className="label">Format de date</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {([
                { value: 'long',  label: 'sam. 17 avr.' },
                { value: 'short', label: '17/04/2026' },
                { value: 'iso',   label: '2026-04-17' },
              ] as const).map(opt => (
                <button key={opt.value}
                  className={`btn${(s.clockDateFormat ?? 'long') === opt.value ? ' btn-primary' : ''}`}
                  style={{ fontSize: 12, padding: '0.25rem 0.6rem', fontFamily: opt.value === 'iso' ? 'monospace' : undefined }}
                  onClick={() => save({ clockDateFormat: opt.value })}
                  disabled={saving}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label className="label">Format heure</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {([{ value: '24h', label: '14:32' }, { value: '12h', label: '2:32 PM' }] as const).map(opt => (
                  <button key={opt.value}
                    className={`btn${(s.clockHourFormat ?? '24h') === opt.value ? ' btn-primary' : ''}`}
                    style={{ fontSize: 12, padding: '0.25rem 0.6rem', fontFamily: 'monospace' }}
                    onClick={() => save({ clockHourFormat: opt.value })}
                    disabled={saving}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label className="label">Secondes</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {([{ value: true, label: 'Afficher' }, { value: false, label: 'Masquer' }] as const).map(opt => (
                  <button key={String(opt.value)}
                    className={`btn${(s.clockShowSeconds ?? true) === opt.value ? ' btn-primary' : ''}`}
                    style={{ fontSize: 12, padding: '0.25rem 0.6rem' }}
                    onClick={() => save({ clockShowSeconds: opt.value })}
                    disabled={saving}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const sectionDonnees = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Rapport visuel */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Rapport visuel</span>
          <span className="text-muted fs-12">Document mis en page avec la couleur d'accentuation</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
            Génère un rapport complet : résumé général, performance par vélo, classement des coureurs.
            La couleur du rapport suit la couleur d'accentuation choisie dans Interface.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13 }}
              onClick={() => downloadReportPdf(race, accentColor)}
            >
              ↓ Télécharger en PDF
            </button>
            <button
              className="btn"
              style={{ fontSize: 13 }}
              onClick={() => downloadReportPng(race, accentColor)}
            >
              ↓ Télécharger en PNG
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Le PNG est idéal pour partager sur les réseaux. Le PDF pour imprimer ou envoyer par mail.
          </p>
        </div>
      </div>

      <BackupPanel onRestore={onRestore} />
    </div>
  )

  const InfoBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>{children}</div>
    </div>
  )

  const Tag = ({ children }: { children: React.ReactNode }) => (
    <code style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 5px', fontSize: 12, color: 'var(--text)' }}>{children}</code>
  )

  const sectionInfo = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Comment fonctionne le dashboard</span>
          <span className="text-muted fs-12">Tout ce qui se passe en arrière-plan</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column' }}>

          <InfoBlock title="Architecture générale">
            Le dashboard est composé de deux parties qui tournent sur la même machine :<br />
            — Un <strong>serveur</strong> qui stocke toutes les données et répond aux actions (appuyer sur TOUR, STOP, START…)<br />
            — Une <strong>interface web</strong> qui s'affiche dans le navigateur et interroge le serveur toutes les <strong>secondes</strong> pour se mettre à jour automatiquement.<br /><br />
            Il n'y a <strong>aucune base de données</strong>. Toutes les données de la course sont stockées dans un seul fichier texte : <Tag>server/data/race_state.json</Tag>.
          </InfoBlock>

          <InfoBlock title="Sauvegarde à chaque action">
            Chaque fois qu'une action est effectuée (tour validé, coureur changé, paramètre modifié…), le fichier <Tag>race_state.json</Tag> est immédiatement réécrit sur le disque. L'écriture est dite <strong>atomique</strong> : le fichier est d'abord écrit sous un nom temporaire, puis renommé — ce qui évite tout fichier corrompu en cas de coupure de courant.<br /><br />
            En parallèle, une <strong>copie horodatée</strong> est automatiquement créée dans <Tag>server/data/backups/</Tag> à chaque action. Ces copies sont visibles et restaurables depuis l'onglet Données.
          </InfoBlock>

          <InfoBlock title="Annulation (Ctrl+Z)">
            Avant chaque modification, l'état complet de la course est mis de côté dans une <strong>pile de 30 états</strong> en mémoire. Appuyer sur <Tag>Ctrl+Z</Tag> (ou <Tag>Cmd+Z</Tag> sur Mac) depuis l'onglet Course restaure l'état précédent. Au-delà de 30 actions en arrière, les plus anciennes sont effacées.
          </InfoBlock>

          <InfoBlock title="Les vélos et leurs états">
            Chaque vélo peut être dans l'un de ces trois états :<br /><br />
            — <strong>En attente</strong> <Tag>IDLE</Tag> : le vélo n'a pas encore démarré.<br />
            — <strong>En piste</strong> <Tag>RUNNING</Tag> : un coureur est actuellement sur le circuit. Le chrono tourne.<br />
            — <strong>En transition</strong> <Tag>TRANSITION</Tag> : le coureur précédent est arrivé (bouton STOP pressé), le suivant n'est pas encore parti (bouton START pas encore pressé).<br /><br />
            Le cycle normal est : <Tag>IDLE</Tag> → <Tag>RUNNING</Tag> → <Tag>TRANSITION</Tag> → <Tag>RUNNING</Tag> → <Tag>TRANSITION</Tag> → …
          </InfoBlock>

          <InfoBlock title="Les trois boutons de la zone Course">
            — <strong>TOUR</strong> : le coureur actuel vient de passer la ligne et <em>continue</em>. Un tour est enregistré, le chrono repart à zéro, le même coureur reste.<br />
            — <strong>STOP</strong> : le coureur actuel vient de passer la ligne et <em>s'arrête</em>. Un tour est enregistré, la transition démarre, le vélo attend le suivant.<br />
            — <strong>START</strong> : le nouveau coureur part. La transition se termine, le chrono du nouveau tour commence.
          </InfoBlock>

          <InfoBlock title="Tours et transitions">
            Chaque <strong>tour</strong> enregistre : le numéro, le coureur, l'heure de départ, l'heure d'arrivée, la durée, la vitesse et d'éventuelles notes.<br /><br />
            Chaque <strong>transition</strong> enregistre : le coureur entrant, le coureur sortant, l'heure de début (= moment où STOP est pressé), l'heure de fin (= moment où START est pressé), et la durée.
          </InfoBlock>

          <InfoBlock title="Heures d'horloge vs durée corrigée">
            Les <strong>heures d'horloge</strong> (départ et arrivée d'un tour) représentent exactement le moment où l'opérateur a appuyé sur le bouton. Elles ne sont jamais modifiées rétrospectivement.<br /><br />
            La <strong>durée</strong> d'un tour peut être corrigée manuellement dans l'Historique (si l'opérateur a appuyé en retard par exemple). Dans ce cas, la durée corrigée est utilisée pour toutes les statistiques, mais les heures d'horloge restent inchangées comme journal de bord. Un petit <strong>✎</strong> orange apparaît sur les tours dont la durée a été corrigée.
          </InfoBlock>

          <InfoBlock title="File d'attente">
            Avant même que le coureur actuel termine, on peut <strong>pré-enregistrer</strong> le ou les prochains coureurs dans la file d'attente de chaque vélo. Quand la transition commence, le premier de la file est automatiquement proposé dans le champ "Prochain coureur". La file peut être réordonnée par glisser-déposer.
          </InfoBlock>

          <InfoBlock title="Coureurs enregistrés">
            La liste des coureurs (onglet Coureurs) est un annuaire global. Quand on tape un nom dans une zone de saisie, l'autocomplète cherche dans cet annuaire. Si un nom nouveau est tapé et validé, le coureur est automatiquement créé dans l'annuaire.
          </InfoBlock>

          <InfoBlock title="Vélo Folklo (V3)">
            Le V3 est configuré pour accepter <strong>deux coureurs simultanément</strong> (tandem ou duo). Il dispose aussi d'un <strong>mode maintenance</strong> : quand activé, le chrono du tour en cours est mis en pause et la durée de maintenance n'est pas comptée dans le temps du tour.
          </InfoBlock>

          <InfoBlock title="Alertes de durée">
            Pour chaque vélo, un seuil de durée est configurable. Si un tour dépasse ce seuil, le cadre du vélo devient rouge et clignote dans l'onglet Course — signal visuel qu'il faut peut-être vérifier ce qui se passe sur le circuit.
          </InfoBlock>

          <InfoBlock title="Jauge de progression">
            La barre de progression affichée sous le chrono compare la durée du tour en cours à une cible. Cette cible peut être soit une durée fixe configurée manuellement, soit la moyenne automatique de tous les tours effectués par ce vélo.
          </InfoBlock>

          <InfoBlock title="Mode Animés">
            Quand le mode Animés est actif, seuls les coureurs ayant le type "Animé" apparaissent dans l'autocomplète lors de l'ajout en file. Ce mode peut être activé manuellement ou automatiquement selon des plages horaires configurées (ex : actif de 10h à 14h).
          </InfoBlock>

          <InfoBlock title="Exports">
            — <strong>Excel (.xlsx)</strong> : fichier multi-feuilles complet (résumé, tours par vélo, classement des coureurs, transitions, équipes folklo).<br />
            — <strong>CSV filtré</strong> (depuis l'Historique) : export des données visibles selon les filtres actifs (vélos et colonnes sélectionnés).<br />
            — <strong>CSV automatique</strong> : <Tag>server/data/race_data.csv</Tag> est mis à jour à chaque action — toujours disponible même sans export manuel.<br />
            — <strong>Backup JSON</strong> : copie intégrale de l'état de la course, réimportable pour restaurer exactement l'état sauvegardé.
          </InfoBlock>

          <InfoBlock title="Couleur d'accentuation et thème">
            La couleur d'accentuation (boutons, onglet actif, champs focus) et le thème jour/nuit sont des <strong>préférences locales</strong> : elles sont enregistrées dans le navigateur sur l'appareil courant et ne sont pas partagées avec les autres appareils connectés au même dashboard. Le thème jour/nuit bascule automatiquement au lever et coucher du soleil (heure de Bruxelles), sauf si tu l'as forcé manuellement.
          </InfoBlock>

        </div>
      </div>
    </div>
  )

  const sectionContent: Record<SectionId, React.ReactNode> = {
    velos:      sectionVelos,
    course:     sectionCourse,
    interface:  sectionInterface,
    donnees:    sectionDonnees,
    info:       sectionInfo,
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: '1rem', height: '100%', minHeight: 0 }}>

      {/* ── Sidebar ── */}
      <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {SECTIONS.map(sec => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '0.1rem',
              padding: '0.6rem 0.75rem',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              background: activeSection === sec.id ? 'var(--surface)' : 'transparent',
              boxShadow: activeSection === sec.id ? 'var(--shadow-sm)' : 'none',
              borderLeft: activeSection === sec.id ? `3px solid var(--primary)` : '3px solid transparent',
              transition: 'background 120ms',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: activeSection === sec.id ? 'var(--primary)' : 'var(--text-2)' }}>
              {sec.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{sec.sub}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {saved && (
          <div style={{ padding: '0.5rem 0.75rem', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 8, color: 'var(--green)', fontSize: 13, fontWeight: 500 }}>
            Réglages sauvegardés
          </div>
        )}
        {sectionContent[activeSection]}
      </div>

    </div>
  )
}
