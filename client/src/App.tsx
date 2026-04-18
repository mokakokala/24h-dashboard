import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useDayNight } from './hooks/useDayNight'
import LogistiqueView from './views/LogistiqueView'

const PublicView = lazy(() => import('./views/PublicView'))

export default function App() {
  useDayNight()

  useEffect(() => {
    const saved = localStorage.getItem('accent-color')
    if (saved) document.documentElement.style.setProperty('--primary', saved)
  }, [])

  return (
    <Routes>
      <Route
        path="/public"
        element={
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
              <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Chargement…</div>
            </div>
          }>
            <PublicView />
          </Suspense>
        }
      />
      <Route path="*" element={<LogistiqueView />} />
    </Routes>
  )
}
