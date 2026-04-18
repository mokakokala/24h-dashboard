import { useState, useEffect, useCallback } from 'react'
import { getRace } from '../api'
import type { Race } from '../types'

export const useRaceState = () => {
  const [race, setRace] = useState<Race | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchRace = useCallback(async () => {
    try {
      const res = await getRace()
      if (res.success && res.data) {
        setRace(res.data)
        setError(null)
      } else {
        setError(res.error ?? 'Unknown error')
      }
    } catch {
      setError('Serveur inaccessible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRace()
    const interval = setInterval(fetchRace, 1000)
    return () => clearInterval(interval)
  }, [fetchRace])

  return { race, error, loading, refresh: fetchRace }
}
