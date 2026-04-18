import { useState, useEffect } from 'react'

const pad = (n: number, digits = 2) => String(n).padStart(digits, '0')

export const formatDuration = (ms: number): string => {
  if (ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((ms % 1000) / 100)
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${tenths}`
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`
}

export const formatMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${pad(minutes)}min ${pad(seconds)}s`
  if (minutes > 0) return `${minutes}min ${pad(seconds)}s`
  return `${seconds}s`
}

export const useTimer = (startTimestamp: string | undefined, running: boolean, frozenMs?: number): string => {
  const [display, setDisplay] = useState('00:00.0')

  useEffect(() => {
    if (!running) {
      setDisplay(frozenMs !== undefined ? formatDuration(frozenMs) : '00:00.0')
      return
    }
    if (!startTimestamp) {
      setDisplay('00:00.0')
      return
    }
    const tick = () => setDisplay(formatDuration(Date.now() - Date.parse(startTimestamp)))
    tick()
    const interval = setInterval(tick, 100)
    return () => clearInterval(interval)
  }, [startTimestamp, running, frozenMs])

  return display
}

export const useCountup = (startTimestamp: string | undefined, active: boolean): number => {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active || !startTimestamp) {
      setElapsed(0)
      return
    }
    const tick = () => setElapsed(Date.now() - Date.parse(startTimestamp))
    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [startTimestamp, active])

  return elapsed
}
