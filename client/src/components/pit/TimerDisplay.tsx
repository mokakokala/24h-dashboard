import { useTimer, formatMs } from '../../hooks/useTimer'
import type { BikeStatus } from '../../types'

interface Props {
  lapStartTimestamp?: string
  transitionStartTimestamp?: string
  status: BikeStatus
  alertThresholdMs: number
}

export default function TimerDisplay({ lapStartTimestamp, transitionStartTimestamp, status, alertThresholdMs }: Props) {
  const lapTimer = useTimer(lapStartTimestamp, status === 'RUNNING')
  const transitionTimer = useTimer(transitionStartTimestamp, status === 'TRANSITION')

  if (status === 'IDLE') {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
        <div className="timer-main" style={{ color: 'var(--text-dim)', textShadow: 'none' }}>
          --:--.-
        </div>
        <div className="panel-label" style={{ marginTop: '0.5rem' }}>EN ATTENTE</div>
      </div>
    )
  }

  if (status === 'TRANSITION') {
    return (
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <div className="panel-label" style={{ color: 'var(--accent-yellow)' }}>TRANSITION EN COURS</div>
        <div className="timer-transition">{transitionTimer}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--accent-yellow)', marginTop: '0.4rem', letterSpacing: '0.1em' }}>
          TEMPS PERDU
        </div>
      </div>
    )
  }

  // Running — check alert threshold
  const elapsed = lapStartTimestamp ? Date.now() - Date.parse(lapStartTimestamp) : 0
  const isAlert = elapsed > alertThresholdMs

  return (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      {isAlert && (
        <div className="alert-banner" style={{ marginBottom: '0.5rem' }}>
          ⚠ EN PISTE DEPUIS {formatMs(elapsed)}
        </div>
      )}
      <div className="panel-label">TOUR EN COURS</div>
      <div className={`timer-main${isAlert ? ' text-orange' : ''}`} style={isAlert ? { textShadow: 'var(--glow-orange)' } : {}}>
        {lapTimer}
      </div>
    </div>
  )
}
