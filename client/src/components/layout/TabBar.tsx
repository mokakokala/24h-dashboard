const TABS = [
  { id: 'course', label: 'Course' },
  { id: 'historique', label: 'Historique' },
  { id: 'riders', label: 'Coureurs' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'parametres', label: 'Paramètres' },
]

interface Props { active: string; onChange: (tab: string) => void }

export default function TabBar({ active, onChange }: Props) {
  return (
    <div className="tab-bar">
      {TABS.map(t => (
        <button key={t.id} className={`tab-btn${active === t.id ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
