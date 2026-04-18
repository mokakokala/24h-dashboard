import { useState, useEffect } from 'react'

// Brussels civil time: sunrise ~06:30, sunset ~20:30
const SUNRISE_HOUR = 6
const SUNRISE_MIN = 30
const SUNSET_HOUR = 20
const SUNSET_MIN = 30

const isDay = (): boolean => {
  const now = new Date()
  const totalMin = now.getHours() * 60 + now.getMinutes()
  const sunriseMin = SUNRISE_HOUR * 60 + SUNRISE_MIN
  const sunsetMin = SUNSET_HOUR * 60 + SUNSET_MIN
  return totalMin >= sunriseMin && totalMin < sunsetMin
}

export type Theme = 'day' | 'night'

export const useDayNight = () => {
  const [manualOverride, setManualOverride] = useState<Theme | null>(() => {
    const stored = localStorage.getItem('theme-override')
    return (stored as Theme | null)
  })

  const autoTheme: Theme = isDay() ? 'day' : 'night'
  const theme: Theme = manualOverride ?? autoTheme

  // Apply theme to <html> element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Re-check auto every minute
  useEffect(() => {
    if (manualOverride) return
    const interval = setInterval(() => {
      document.documentElement.setAttribute('data-theme', isDay() ? 'day' : 'night')
    }, 60_000)
    return () => clearInterval(interval)
  }, [manualOverride])

  const setTheme = (t: Theme) => {
    setManualOverride(t)
    localStorage.setItem('theme-override', t)
  }

  const setAuto = () => {
    setManualOverride(null)
    localStorage.removeItem('theme-override')
  }

  const toggle = () => setTheme(theme === 'day' ? 'night' : 'day')

  return { theme, manualOverride, setTheme, setAuto, toggle }
}
