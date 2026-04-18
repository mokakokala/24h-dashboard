import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { Race, BikeId } from '../../types'
import { formatMs } from '../../hooks/useTimer'

interface Props {
  race: Race
  bikeLabels: Record<BikeId, string>
  enabledConfig: Array<{ id: BikeId; color: string }>
}

type MetricId = 'duration' | 'speed' | 'cumulative' | 'transitions'

const METRIC_DEFS: { id: MetricId; label: string; unit: string; yLabel: string }[] = [
  { id: 'duration',    label: 'Durée des tours',        unit: 'min',    yLabel: 'Durée (min)' },
  { id: 'speed',       label: 'Vitesse (km/h)',          unit: 'km/h',   yLabel: 'Vitesse (km/h)' },
  { id: 'cumulative',  label: 'Tours cumulés',           unit: 'tours',  yLabel: 'Tours' },
  { id: 'transitions', label: 'Durée des transitions',   unit: 'min',    yLabel: 'Transition (min)' },
]

// Hardcoded hex values so SVG/canvas export keeps correct colours
const BIKE_HEX: Record<BikeId, string> = {
  V1: '#3b82f6',
  V2: '#22c55e',
  V3: '#f59e0b',
}

// ─── Data builders ────────────────────────────────────────────────────────────

function buildChartData(race: Race, bikes: BikeId[], metric: MetricId): Record<string, string | number>[] {
  if (metric === 'cumulative') {
    if (!race.startTimestamp) return []
    const start = Date.parse(race.startTimestamp)
    const now = Date.now()
    const points: Record<string, string | number>[] = []
    for (let h = 0; h <= 24; h += 0.5) {
      const cut = start + h * 3_600_000
      if (cut > now + 60_000) break
      const hh = Math.floor(h)
      const mm = h % 1 === 0.5 ? '30' : '00'
      const pt: Record<string, string | number> = { x: `${String(hh).padStart(2, '0')}h${mm}` }
      for (const id of bikes) {
        pt[id] = race.bikes[id].laps.filter(l => Date.parse(l.endTimestamp) <= cut).length
      }
      points.push(pt)
    }
    return points
  }

  if (metric === 'transitions') {
    const validTs = (id: BikeId) => race.bikes[id].transitions.filter(t => t.durationMs != null)
    const maxLen = Math.max(0, ...bikes.map(id => validTs(id).length))
    if (maxLen === 0) return []
    return Array.from({ length: maxLen }, (_, i) => {
      const pt: Record<string, string | number> = { x: `T${i + 1}` }
      for (const id of bikes) {
        const ts = validTs(id)
        if (ts[i]) pt[id] = parseFloat((ts[i].durationMs! / 60_000).toFixed(2))
      }
      return pt
    })
  }

  // duration or speed — aligned by lap index
  const maxLaps = Math.max(0, ...bikes.map(id => race.bikes[id].laps.length))
  if (maxLaps === 0) return []
  return Array.from({ length: maxLaps }, (_, i) => {
    const pt: Record<string, string | number> = { x: `Tour ${i + 1}` }
    for (const id of bikes) {
      const lap = race.bikes[id].laps[i]
      if (lap) pt[id] = metric === 'duration'
        ? parseFloat((lap.durationMs / 60_000).toFixed(2))
        : lap.speedKmh
    }
    return pt
  })
}

function buildExcelRows(race: Race, bikes: BikeId[], metric: MetricId, bikeLabels: Record<BikeId, string>) {
  const metricDef = METRIC_DEFS.find(m => m.id === metric)!

  if (metric === 'cumulative') {
    if (!race.startTimestamp) return []
    const start = Date.parse(race.startTimestamp)
    const now = Date.now()
    const rows: Record<string, string | number>[] = []
    for (let h = 0; h <= 24; h += 0.5) {
      const cut = start + h * 3_600_000
      if (cut > now + 60_000) break
      const hh = Math.floor(h)
      const mm = h % 1 === 0.5 ? '30' : '00'
      const row: Record<string, string | number> = { Heure: `${String(hh).padStart(2, '0')}h${mm}` }
      for (const id of bikes) row[bikeLabels[id]] = race.bikes[id].laps.filter(l => Date.parse(l.endTimestamp) <= cut).length
      rows.push(row)
    }
    return rows
  }

  if (metric === 'transitions') {
    const validTs = (id: BikeId) => race.bikes[id].transitions.filter(t => t.durationMs != null)
    const maxLen = Math.max(0, ...bikes.map(id => validTs(id).length))
    return Array.from({ length: maxLen }, (_, i) => {
      const row: Record<string, string | number> = { Transition: `T${i + 1}` }
      for (const id of bikes) {
        const ts = validTs(id)
        if (ts[i]) row[`${bikeLabels[id]} (${metricDef.unit})`] = parseFloat((ts[i].durationMs! / 60_000).toFixed(2))
      }
      return row
    })
  }

  const maxLaps = Math.max(0, ...bikes.map(id => race.bikes[id].laps.length))
  return Array.from({ length: maxLaps }, (_, i) => {
    const row: Record<string, string | number> = { Tour: i + 1 }
    for (const id of bikes) {
      const lap = race.bikes[id].laps[i]
      if (lap) {
        row[`${bikeLabels[id]} (${metricDef.unit})`] = metric === 'duration'
          ? parseFloat((lap.durationMs / 60_000).toFixed(2))
          : lap.speedKmh
        row[`${bikeLabels[id]} — Heure départ`] = new Date(lap.startTimestamp).toLocaleTimeString('fr-BE')
        row[`${bikeLabels[id]} — Coureur`] = lap.riderName
      }
    }
    return row
  })
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({
  active, payload, label, metric,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  metric: MetricId
}) {
  if (!active || !payload?.length) return null
  const fmt = (v: number) => metric === 'duration' || metric === 'transitions' ? formatMs(Math.round(v * 60_000)) : `${v}`
  const unit = METRIC_DEFS.find(m => m.id === metric)!.unit
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: 12 }}>
      <div className="text-muted" style={{ marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name} : {fmt(p.value)} {metric !== 'duration' && metric !== 'transitions' ? unit : ''}
        </div>
      ))}
    </div>
  )
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportPng(containerEl: HTMLDivElement | null, metric: MetricId) {
  if (!containerEl) return
  const svgEl = containerEl.querySelector('svg')
  if (!svgEl) return

  const rect = svgEl.getBoundingClientRect()
  const W = rect.width || 800
  const H = rect.height || 300

  // Clone and patch CSS variables to literal values so canvas renders correctly
  const clone = svgEl.cloneNode(true) as SVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(W))
  clone.setAttribute('height', String(H))

  // Replace var(--xxx) in style attributes with computed values
  const patchStyles = (el: Element) => {
    const style = el.getAttribute('style') || ''
    if (style.includes('var(--')) {
      const patched = style.replace(/var\(--[\w-]+\)/g, match => {
        const prop = match.slice(4, -1)
        return getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || '#888'
      })
      el.setAttribute('style', patched)
    }
    Array.from(el.children).forEach(patchStyles)
  }
  patchStyles(clone)

  const svgStr = new XMLSerializer().serializeToString(clone)
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, W, H)
    canvas.toBlob(blob => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `graphique-${metric}-${new Date().toISOString().slice(0, 10)}.png`
      a.click()
    }, 'image/png')
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
}

function exportExcel(
  race: Race, bikes: BikeId[], metric: MetricId, bikeLabels: Record<BikeId, string>
) {
  const rows = buildExcelRows(race, bikes, metric, bikeLabels)
  if (!rows.length) return

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  const metricLabel = METRIC_DEFS.find(m => m.id === metric)!.label
  XLSX.utils.book_append_sheet(wb, ws, metricLabel.slice(0, 31))

  // Auto column widths
  const cols = Object.keys(rows[0])
  ws['!cols'] = cols.map(k => ({ wch: Math.max(k.length, 12) }))

  XLSX.writeFile(wb, `données-${metric}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── ChartBuilder ─────────────────────────────────────────────────────────────

export default function ChartBuilder({ race, bikeLabels, enabledConfig }: Props) {
  const [selectedBikes, setSelectedBikes] = useState<Set<BikeId>>(
    () => new Set(enabledConfig.map(b => b.id))
  )
  const [metric, setMetric] = useState<MetricId>('duration')
  const chartRef = useRef<HTMLDivElement>(null)

  const toggleBike = (id: BikeId) =>
    setSelectedBikes(prev => {
      const next = new Set(prev)
      if (next.has(id)) { if (next.size > 1) next.delete(id) }
      else next.add(id)
      return next
    })

  const activeBikes = enabledConfig.map(b => b.id).filter(id => selectedBikes.has(id))
  const data = buildChartData(race, activeBikes, metric)
  const metricDef = METRIC_DEFS.find(m => m.id === metric)!

  const avgValues: Partial<Record<BikeId, number>> = {}
  if (metric !== 'cumulative') {
    for (const id of activeBikes) {
      const vals = data.map(d => d[id] as number).filter(v => v != null)
      if (vals.length) avgValues[id] = parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2))
    }
  }

  const canExport = activeBikes.length > 0 && data.length > 0

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontWeight: 700, fontSize: 15 }}>Constructeur de graphique</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>

          {/* Bike selector */}
          <div>
            <div className="label" style={{ marginBottom: '0.35rem' }}>Vélos</div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {enabledConfig.map(b => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={selectedBikes.has(b.id)}
                    onChange={() => toggleBike(b.id)}
                    style={{ accentColor: BIKE_HEX[b.id] }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: selectedBikes.has(b.id) ? BIKE_HEX[b.id] : 'var(--text-3)' }}>
                    {bikeLabels[b.id]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Metric selector */}
          <div>
            <div className="label" style={{ marginBottom: '0.35rem' }}>Métrique</div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {METRIC_DEFS.map(m => (
                <button
                  key={m.id}
                  className={`btn${metric === m.id ? ' btn-primary' : ''}`}
                  style={{ fontSize: 12, padding: '0.25rem 0.6rem' }}
                  onClick={() => setMetric(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Export buttons */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignSelf: 'flex-end' }}>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '0.25rem 0.6rem', opacity: canExport ? 1 : 0.5 }}
              disabled={!canExport}
              onClick={() => exportPng(chartRef.current, metric)}
              title="Télécharger le graphique en PNG"
            >
              ↓ PNG
            </button>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '0.25rem 0.6rem', opacity: canExport ? 1 : 0.5 }}
              disabled={!canExport}
              onClick={() => exportExcel(race, activeBikes, metric, bikeLabels)}
              title="Télécharger les données en Excel"
            >
              ↓ Excel
            </button>
          </div>
        </div>

        {/* Chart */}
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-3)', fontSize: 13 }}>
            Aucune donnée pour cette métrique
          </div>
        ) : (
          <>
            <div ref={chartRef} style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="x"
                    tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'monospace' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-3)', fontSize: 10 }}
                    label={{ value: metricDef.yLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 10, dx: 10 }}
                    width={54}
                  />
                  <Tooltip content={<ChartTooltip metric={metric} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {activeBikes.map(id => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stroke={BIKE_HEX[id]}
                      strokeWidth={2}
                      dot={{ r: 3, fill: BIKE_HEX[id] }}
                      activeDot={{ r: 5 }}
                      name={bikeLabels[id]}
                      connectNulls={false}
                    />
                  ))}
                  {/* Average reference lines */}
                  {metric !== 'cumulative' && activeBikes.map(id =>
                    avgValues[id] != null ? (
                      <ReferenceLine
                        key={`avg-${id}`}
                        y={avgValues[id]}
                        stroke={BIKE_HEX[id]}
                        strokeDasharray="5 3"
                        strokeOpacity={0.5}
                        label={{ value: `moy. ${bikeLabels[id]}`, fill: BIKE_HEX[id], fontSize: 9, position: 'insideTopRight' }}
                      />
                    ) : null
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Avg summary */}
            {metric !== 'cumulative' && Object.keys(avgValues).length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {activeBikes.map(id => avgValues[id] != null && (
                  <div key={id} style={{ padding: '0.3rem 0.6rem', background: 'var(--surface-2)', borderRadius: 5, fontSize: 12, borderLeft: `3px solid ${BIKE_HEX[id]}` }}>
                    <span className="text-muted">Moy. {bikeLabels[id]} : </span>
                    <span style={{ fontWeight: 600, color: BIKE_HEX[id] }}>
                      {metric === 'duration' || metric === 'transitions'
                        ? formatMs(Math.round(avgValues[id]! * 60_000))
                        : `${avgValues[id]} ${metricDef.unit}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
