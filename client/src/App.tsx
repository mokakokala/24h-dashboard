import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useDayNight } from './hooks/useDayNight'
import LogistiqueView from './views/LogistiqueView'

export default function App() {
  useDayNight()

  useEffect(() => {
    const saved = localStorage.getItem('accent-color')
    if (saved) document.documentElement.style.setProperty('--primary', saved)
  }, [])

  return (
    <Routes>
      <Route path="*" element={<LogistiqueView />} />
    </Routes>
  )
}
