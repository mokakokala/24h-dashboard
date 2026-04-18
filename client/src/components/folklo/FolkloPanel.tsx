import { useState } from 'react'
import type { FolkloEntry } from '../../types'
import { createFolklo, updateFolklo, deleteFolklo } from '../../api'

interface Props {
  entries: FolkloEntry[]
  onUpdate: () => void
}

export default function FolkloPanel({ entries, onUpdate }: Props) {
  const [form, setForm] = useState({ teamName: '', costumeDescription: '', notes: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ teamName: '', costumeDescription: '', notes: '' })
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleAdd = async () => {
    if (!form.teamName.trim() || loading) return
    setLoading(true)
    try {
      await createFolklo({
        teamName: form.teamName.trim(),
        costumeDescription: form.costumeDescription.trim(),
        notes: form.notes.trim() || undefined,
      })
      setForm({ teamName: '', costumeDescription: '', notes: '' })
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (entry: FolkloEntry) => {
    setEditingId(entry.id)
    setEditForm({
      teamName: entry.teamName,
      costumeDescription: entry.costumeDescription,
      notes: entry.notes ?? '',
    })
  }

  const commitEdit = async () => {
    if (!editingId || loading) return
    setLoading(true)
    try {
      await updateFolklo(editingId, {
        teamName: editForm.teamName,
        costumeDescription: editForm.costumeDescription,
        notes: editForm.notes || undefined,
      })
      setEditingId(null)
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (pendingDelete !== id) {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete((p) => (p === id ? null : p)), 3000)
      return
    }
    setLoading(true)
    try {
      await deleteFolklo(id)
      setPendingDelete(null)
      onUpdate()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div className="panel" style={{ borderColor: 'var(--accent-yellow)', background: 'rgba(240,224,64,0.03)' }}>
        <div style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-yellow)', letterSpacing: '0.2em', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
          🎭 VÉLO FOLKLO
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Suivi des équipes participantes
        </div>
      </div>

      {/* Add form */}
      <div className="panel">
        <div className="panel-label">ENREGISTRER UNE ÉQUIPE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input className="input-field" placeholder="Nom de l'équipe *" value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} />
          <input className="input-field" placeholder="Description du costume" value={form.costumeDescription} onChange={(e) => setForm({ ...form, costumeDescription: e.target.value })} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input-field" style={{ flex: 1 }} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
            <button className="btn btn-primary" onClick={handleAdd} disabled={!form.teamName.trim() || loading}>
              + AJOUTER
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontSize: '0.8rem', letterSpacing: '0.15em' }}>
          AUCUNE ÉQUIPE ENREGISTRÉE
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {entries.map((entry, idx) => (
            <div key={entry.id} className="panel" style={editingId === entry.id ? { borderColor: 'var(--accent-green)' } : {}}>
              {editingId === entry.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input className="input-field" value={editForm.teamName} onChange={(e) => setEditForm({ ...editForm, teamName: e.target.value })} />
                  <input className="input-field" value={editForm.costumeDescription} onChange={(e) => setEditForm({ ...editForm, costumeDescription: e.target.value })} />
                  <input className="input-field" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes" />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={commitEdit} disabled={loading}>✓ SAUVEGARDER</button>
                    <button className="btn" onClick={() => setEditingId(null)}>ANNULER</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--accent-yellow)', minWidth: '30px' }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{entry.teamName}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{entry.costumeDescription || '—'}</div>
                    {entry.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontStyle: 'italic' }}>{entry.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                    <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => startEdit(entry)}>✎</button>
                    <button className="btn btn-danger" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(entry.id)}>
                      {pendingDelete === entry.id ? '⚠' : '✕'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
