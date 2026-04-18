import { useState, useEffect, useRef } from 'react'
import { exportBackup, listBackups, restoreBackup, importBackup, resetRace, exportExcel, exportCsv } from '../../api'

interface Props { onRestore: () => void }

export default function BackupPanel({ onRestore }: Props) {
  const [backups, setBackups] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 4000)
  }

  const fetchBackups = async () => {
    const res = await listBackups()
    if (res.success && res.data) setBackups(res.data)
  }

  useEffect(() => { fetchBackups() }, [])

  const handleImport = async (file: File) => {
    setLoading(true)
    try {
      const res = await importBackup(file)
      if (res.success) { showMessage('Backup importé avec succès !', 'success'); onRestore(); await fetchBackups() }
      else showMessage(`Erreur : ${res.error}`, 'error')
    } finally { setLoading(false) }
  }

  const handleRestore = async (filename: string) => {
    if (!window.confirm(`Restaurer "${filename}" ? L'état actuel sera écrasé.`)) return
    setLoading(true)
    try {
      const res = await restoreBackup(filename)
      if (res.success) { showMessage('État restauré avec succès !', 'success'); onRestore() }
      else showMessage(`Erreur : ${res.error}`, 'error')
    } finally { setLoading(false) }
  }

  const handleReset = async () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 5000); return }
    setLoading(true)
    try {
      const res = await resetRace()
      if (res.success) { showMessage('Course réinitialisée.', 'success'); onRestore() }
    } finally { setLoading(false); setConfirmReset(false) }
  }

  const formatBackupName = (filename: string) => {
    const match = filename.match(/race_state_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/)
    if (!match) return filename
    const [, year, month, day, hour, min, sec] = match
    return `${day}/${month}/${year} à ${hour}:${min}:${sec}`
  }

  const msgStyle = (type: 'success' | 'error') => ({
    padding: '0.6rem 0.9rem',
    borderRadius: 8,
    border: `1px solid ${type === 'success' ? 'var(--green-border)' : 'var(--red-border)'}`,
    background: type === 'success' ? 'var(--green-bg)' : 'var(--red-bg)',
    color: type === 'success' ? 'var(--green)' : 'var(--red)',
    fontSize: 13,
    fontWeight: 500,
  })

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {message && <div style={msgStyle(message.type)}>{message.text}</div>}

      {/* ── Exports ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header"><span style={{ fontWeight: 600 }}>Exports de données</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => exportExcel()} style={{ fontSize: 13 }}>
              📊 Exporter en Excel (.xlsx)
            </button>
            <button className="btn" onClick={() => exportCsv()} style={{ fontSize: 13 }}>
              📄 Exporter CSV
            </button>
            <button className="btn" onClick={() => exportBackup()} style={{ fontSize: 13 }}>
              💾 Backup JSON
            </button>
          </div>

          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Export Excel contient :</div>
            <ul style={{ fontSize: 12, color: 'var(--text-2)', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
              <li>Résumé de la course (3 vélos)</li>
              <li>Tous les tours par vélo (V1, V2, V3 Folklo)</li>
              <li>Classement des coureurs</li>
              <li>Équipes Folklo enregistrées</li>
              <li>Historique des transitions</li>
            </ul>
          </div>


<div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '0.6rem 0.75rem', border: '1px solid var(--amber-border)' }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: 'var(--amber)' }}>Backup automatique CSV</div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Un fichier <code>data/race_data.csv</code> est mis à jour automatiquement à chaque action. C&apos;est ton filet de sécurité ultime même si tout crash.
            </p>
          </div>
        </div>
      </div>

      {/* ── Import backup ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header"><span style={{ fontWeight: 600 }}>Importer un backup</span></div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
            Charge un fichier <code>.json</code> exporté précédemment. Remplacera l&apos;état actuel.
          </p>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }} />
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            Charger un fichier backup (.json)
          </button>
        </div>
      </div>

      {/* ── Backup history ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 600 }}>Sauvegardes automatiques ({backups.length})</span>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={fetchBackups}>↻ Rafraîchir</button>
        </div>
        {backups.length === 0 ? (
          <div className="card-body text-faint fs-12">Aucune sauvegarde automatique.</div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {backups.slice(0, 50).map((filename) => (
              <div key={filename} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{formatBackupName(filename)}</span>
                <button className="btn" style={{ fontSize: 11, padding: '0.2rem 0.6rem' }} onClick={() => handleRestore(filename)} disabled={loading}>Restaurer</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      <div className="card" style={{ borderColor: 'var(--red-border)' }}>
        <div className="card-header">
          <span style={{ fontWeight: 600, color: 'var(--red)' }}>Zone dangereuse</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: '0.75rem' }}>
            Réinitialise complètement la course. Action irréversible — exporte un backup avant.
          </p>
          <button className={`btn ${confirmReset ? 'btn-danger' : ''}`} onClick={handleReset} disabled={loading} style={{ fontSize: 13 }}>
            {confirmReset ? '⚠ Confirmer la réinitialisation' : 'Réinitialiser la course'}
          </button>
        </div>
      </div>
    </div>
  )
}
