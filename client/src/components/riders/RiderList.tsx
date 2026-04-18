import { useState } from 'react'
import type { Rider } from '../../types'
import { createRider, updateRider, deleteRider } from '../../api'

interface Props { riders: Rider[]; onUpdate: () => void }

const TYPE_LABELS: Record<string, string> = { animé: 'Animé', autre: 'Autre' }

function TypeCell({ rider, onUpdate }: { rider: Rider; onUpdate: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = async (type: 'animé' | 'autre') => {
    setSaving(true)
    setOpen(false)
    try { await updateRider(rider.id, rider.name, type); onUpdate() }
    finally { setSaving(false) }
  }

  if (open) {
    return (
      <select
        className="input"
        autoFocus
        style={{ width: 'auto', padding: '0.1rem 0.3rem', fontSize: 12 }}
        defaultValue={rider.type ?? ''}
        onChange={e => set(e.target.value as 'animé' | 'autre')}
        onBlur={() => setOpen(false)}
      >
        <option value="" disabled>—</option>
        <option value="animé">Animé</option>
        <option value="autre">Autre</option>
      </select>
    )
  }

  return (
    <span
      className={rider.type ? `badge ${rider.type === 'animé' ? 'badge-amber' : 'badge-slate'}` : 'text-muted fs-12'}
      style={{ cursor: 'pointer', fontStyle: rider.type ? 'normal' : 'italic', fontSize: rider.type ? 10 : undefined, opacity: saving ? 0.5 : 1 }}
      onClick={() => setOpen(true)}
      title="Cliquer pour modifier"
    >
      {rider.type ? TYPE_LABELS[rider.type] : '— cliquer'}
    </span>
  )
}

export default function RiderList({ riders, onUpdate }: Props) {
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'animé' | 'autre'>('animé')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<'animé' | 'autre'>('animé')
  const [pendingDel, setPendingDel] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'animé' | 'autre'>('all')

  const filtered = riders.filter(r => {
    const matchName = r.name.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || r.type === filterType
    return matchName && matchType
  })

  const animéCount = riders.filter(r => r.type === 'animé').length
  const autreCount = riders.filter(r => r.type === 'autre').length

  const add = async () => {
    if (!newName.trim() || loading) return
    setLoading(true)
    try { await createRider(newName.trim(), newType); setNewName(''); onUpdate() }
    finally { setLoading(false) }
  }

  const startEdit = (r: Rider) => {
    setEditingId(r.id)
    setEditName(r.name)
    setEditType(r.type ?? 'animé')
  }

  const commitEdit = async () => {
    if (!editingId || !editName.trim() || loading) return
    setLoading(true)
    try { await updateRider(editingId, editName.trim(), editType); setEditingId(null); onUpdate() }
    finally { setLoading(false) }
  }

  const del = async (id: string) => {
    if (pendingDel !== id) { setPendingDel(id); setTimeout(() => setPendingDel(p => p === id ? null : p), 3000); return }
    setLoading(true)
    try { await deleteRider(id); setPendingDel(null); onUpdate() }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 580 }}>
      {/* Add */}
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <div className="card-header"><span style={{ fontWeight: 600 }}>Ajouter un coureur</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className="flex-row" style={{ gap: '0.5rem' }}>
            <input
              className="input grow"
              placeholder="Nom du coureur"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
            />
            <select
              className="input"
              style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: 13 }}
              value={newType}
              onChange={e => setNewType(e.target.value as 'animé' | 'autre')}
            >
              <option value="animé">Animé</option>
              <option value="autre">Autre</option>
            </select>
            <button className="btn btn-primary" onClick={add} disabled={!newName.trim() || loading}>+ Ajouter</button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            <strong>Animé</strong> : peut rouler pendant les heures animés. <strong>Autre</strong> : coureur normal (sans contrainte horaire).
          </p>
        </div>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>{riders.length} coureur{riders.length !== 1 ? 's' : ''}</span>
            <span className="badge badge-amber" style={{ fontSize: 10 }}>{animéCount} animés</span>
            <span className="badge badge-slate" style={{ fontSize: 10 }}>{autreCount} autres</span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: 'auto' }}>
            <select
              className="input"
              style={{ width: 'auto', padding: '0.2rem 0.4rem', fontSize: 12 }}
              value={filterType}
              onChange={e => setFilterType(e.target.value as typeof filterType)}
            >
              <option value="all">Tous</option>
              <option value="animé">Animés</option>
              <option value="autre">Autres</option>
            </select>
            <input className="input" style={{ width: 160 }} placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="table">
          <thead><tr><th>#</th><th>Nom</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {filtered.map((r, idx) => (
              <tr key={r.id}>
                <td className="text-muted fs-12">{idx + 1}</td>
                {editingId === r.id ? (
                  <td colSpan={3}>
                    <div className="flex-row" style={{ gap: '0.4rem' }}>
                      <input className="input grow" autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }} />
                      <select
                        className="input"
                        style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: 13 }}
                        value={editType}
                        onChange={e => setEditType(e.target.value as 'animé' | 'autre')}
                      >
                        <option value="animé">Animé</option>
                        <option value="autre">Autre</option>
                      </select>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={commitEdit} disabled={loading}>✓</button>
                      <button className="btn" style={{ fontSize: 12 }} onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td><TypeCell rider={r} onUpdate={onUpdate} /></td>
                    <td>
                      <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => startEdit(r)}>✎</button>
                        <button className={`btn ${pendingDel === r.id ? 'btn-danger' : 'btn-ghost'}`} style={{ fontSize: 12 }} onClick={() => del(r.id)}>
                          {pendingDel === r.id ? '⚠ Confirmer' : '✕'}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>
                {riders.length === 0 ? 'Aucun coureur inscrit' : 'Aucun résultat'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
