import { useState, useEffect, useCallback } from 'react'
import { useRaceState } from '../hooks/useRaceState'
import Header from '../components/layout/Header'
import TabBar from '../components/layout/TabBar'
import CourseColumn from '../components/course/CourseColumn'
import FolkloColumn from '../components/course/FolkloColumn'
import HistoryTable from '../components/history/HistoryTable'
import RiderList from '../components/riders/RiderList'
import AnalyticsTab from '../components/analytics/AnalyticsTab'
import SettingsTab from '../components/settings/SettingsTab'
import { startRace, undoAction, resumeRace, reopenRace } from '../api'

export default function LogistiqueView() {
  const { race, loading, error, refresh } = useRaceState()
  const [activeTab, setActiveTab] = useState('course')
  const [starting, setStarting] = useState(false)
  const [undoToast, setUndoToast] = useState(false)
  const [scrollTrigger, setScrollTrigger] = useState(0)

  const handleTabChange = (tab: string) => {
    if (tab === 'course') setScrollTrigger(n => n + 1)
    setActiveTab(tab)
  }

  const handleStart = async () => {
    setStarting(true)
    await startRace()
    await refresh()
    setStarting(false)
  }

  // Global undo: Cmd+Z / Ctrl+Z
  const handleUndo = useCallback(async (e: KeyboardEvent) => {
    const isMac = navigator.platform.includes('Mac')
    const isUndo = (isMac ? e.metaKey : e.ctrlKey) && e.key === 'z' && !e.shiftKey
    if (!isUndo) return
    // Don't intercept if user is typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    e.preventDefault()
    const res = await undoAction()
    if (res.success) {
      await refresh()
      setUndoToast(true)
      setTimeout(() => setUndoToast(false), 2000)
    }
  }, [refresh])

  useEffect(() => {
    document.addEventListener('keydown', handleUndo)
    return () => document.removeEventListener('keydown', handleUndo)
  }, [handleUndo])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Connexion au serveur…</div>
      </div>
    )
  }

  if (error || !race) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--red)' }}>Serveur inaccessible</div>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>{error}</div>
        <button className="btn btn-primary" onClick={refresh}>Réessayer</button>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <Header race={race} />
      <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
        <TabBar active={activeTab} onChange={handleTabChange} />
      </div>

      <div className="app-content" style={{ padding: '0.75rem' }}>

        {/* ── COURSE ── */}
        {activeTab === 'course' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {race.status === 'PENDING' && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Course en attente</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Démarre les trois vélos et le chrono général</div>
                </div>
                <button className="btn btn-primary" onClick={handleStart} disabled={starting} style={{ padding: '0.5rem 1.2rem' }}>
                  {starting ? '…' : '🏁 Démarrer la course'}
                </button>
              </div>
            )}
            {race.status === 'PAUSED' && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--amber-bg, rgba(245,158,11,0.08))', border: '1px solid var(--amber-border, #fcd34d)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>⏸ Course en pause</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Les chronomètres sont gelés. Les actions TOUR / STOP / START sont désactivées.</div>
                </div>
                <button className="btn btn-primary" style={{ padding: '0.5rem 1.2rem' }}
                  onClick={async () => { await resumeRace(); refresh() }}>
                  ▶ Reprendre
                </button>
              </div>
            )}
            {race.status === 'FINISHED' && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>🏁 Course terminée</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    Les chronomètres sont arrêtés.
                    {race.endTimestamp && (
                      <> Fin enregistrée à <strong>{new Date(race.endTimestamp).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>.</>
                    )}
                  </div>
                </div>
                <button className="btn" style={{ padding: '0.5rem 1.2rem', fontSize: 13 }}
                  onClick={async () => { await reopenRace(); refresh() }}>
                  ↺ Reprendre la course
                </button>
              </div>
            )}
            {(() => {
              const eb = race.settings.enabledBikes ?? { V1: true, V2: true, V3: true }
              const count = [eb.V1, eb.V2, eb.V3].filter(Boolean).length
              return (
                <div style={{ flex: 1, minHeight: 0, display: 'grid', gap: '0.75rem', height: '100%', gridTemplateColumns: `repeat(${count}, 1fr)` }}>
                  {eb.V1 && <CourseColumn bike={race.bikes.V1} riders={race.riders} settings={race.settings} onUpdate={refresh} scrollTrigger={scrollTrigger} racePaused={race.status === 'PAUSED' || race.status === 'FINISHED'} pausedAt={race.pausedAt ?? race.endTimestamp} />}
                  {eb.V2 && <CourseColumn bike={race.bikes.V2} riders={race.riders} settings={race.settings} onUpdate={refresh} scrollTrigger={scrollTrigger} racePaused={race.status === 'PAUSED' || race.status === 'FINISHED'} pausedAt={race.pausedAt ?? race.endTimestamp} />}
                  {eb.V3 && <FolkloColumn bike={race.bikes.V3} riders={race.riders} settings={race.settings} onUpdate={refresh} scrollTrigger={scrollTrigger} racePaused={race.status === 'PAUSED' || race.status === 'FINISHED'} pausedAt={race.pausedAt ?? race.endTimestamp} />}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── HISTORIQUE ── */}
        {activeTab === 'historique' && <HistoryTable race={race} onUpdate={refresh} />}

        {/* ── COUREURS ── */}
        {activeTab === 'riders' && <RiderList riders={race.riders} onUpdate={refresh} />}

        {/* ── ANALYTICS ── */}
        {activeTab === 'analytics' && <AnalyticsTab race={race} />}

        {/* ── PARAMÈTRES ── */}
        {activeTab === 'parametres' && <SettingsTab race={race} onUpdate={refresh} onRestore={refresh} />}
      </div>

      {/* Signature */}
      <div style={{ position: 'fixed', bottom: 0, right: '0.6rem', fontSize: 10, color: 'var(--text-3)', pointerEvents: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        Built with <span style={{ color: '#ef4444', fontSize: 11 }}>♥</span> by Cyril
      </div>

      {/* Undo toast */}
      {undoToast && <div className="toast">↩ Action annulée</div>}
    </div>
  )
}
