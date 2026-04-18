import { useState, useEffect } from 'react'

interface ClockOptions {
  timezone?: string
  dateFormat?: 'long' | 'short' | 'iso'
  showSeconds?: boolean
  hourFormat?: '24h' | '12h'
}

export function useClock({
  timezone = 'Europe/Brussels',
  dateFormat = 'long',
  showSeconds = true,
  hourFormat = '24h',
}: ClockOptions = {}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('fr-BE', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12: hourFormat === '12h',
  })

  let date: string
  if (dateFormat === 'iso') {
    date = now.toLocaleDateString('sv-SE', { timeZone: timezone })
  } else if (dateFormat === 'short') {
    date = now.toLocaleDateString('fr-BE', { timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric' })
  } else {
    date = now.toLocaleDateString('fr-BE', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })
  }

  return { time, date }
}
