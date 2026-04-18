import { useState, useEffect, useCallback, useRef } from 'react'
import { getRace } from '../api'
import type { Race } from '../types'

export const useRaceState = () => {
  const [race, setRace] = useState<Race | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // M17: Track the current in-flight request so we can cancel it before starting a new one
  const controllerRef = useRef<AbortController | null>(null)

  const fetchRace = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await getRace(signal)
      if (signal?.aborted) return
      if (res.success && res.data) {
        setRace(res.data)
        setError(null)
      } else {
        setError(res.error ?? 'Erreur inconnue')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError('Serveur inaccessible')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const doFetch = () => {
      // Cancel the previous request if it's still pending
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      fetchRace(controller.signal)
    }

    doFetch()
    const interval = setInterval(doFetch, 1000)
    return () => {
      clearInterval(interval)
      controllerRef.current?.abort()
    }
  }, [fetchRace])

  const refresh = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    fetchRace(controller.signal)
  }, [fetchRace])

  return { race, error, loading, refresh }
}
