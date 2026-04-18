import type { Race, BikeId } from '../types'
import { formatMs } from '../hooks/useTimer'
import jsPDF from 'jspdf'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BIKE_IDS: BikeId[] = ['V1', 'V2', 'V3']
const BIKE_HEX: Record<BikeId, string> = { V1: '#3b82f6', V2: '#22c55e', V3: '#f59e0b' }
const DPR = 2
const W = 900
const PAD = 44
const GAP = 20

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function lighten([r, g, b]: [number, number, number], t: number): string {
  return `rgb(${Math.round(r + (255 - r) * t)},${Math.round(g + (255 - g) * t)},${Math.round(b + (255 - b) * t)})`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1)
  return text + '…'
}

function fmtLapShort(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Data gathering ───────────────────────────────────────────────────────────

function gather(race: Race) {
  const enabled = race.settings.enabledBikes ?? { V1: true, V2: true, V3: true }
  const ids = BIKE_IDS.filter(id => enabled[id])
  const label = (id: BikeId) => race.settings.bikeLabels?.[id] ?? race.bikes[id].label

  const allLaps = ids.flatMap(id => race.bikes[id].laps)
  const totalLaps = ids.reduce((s, id) => s + race.bikes[id].totalLaps, 0)
  const totalKm = ids.reduce((s, id) => s + race.bikes[id].totalDistanceKm, 0)

  const elapsed = race.startTimestamp
    ? (race.endTimestamp ? Date.parse(race.endTimestamp) : Date.now()) - Date.parse(race.startTimestamp)
    : 0

  const dist = race.settings.circuitDistanceKm
  const riderMap = new Map<string, { laps: number; ms: number; fastest: number }>()
  for (const lap of allLaps) {
    const r = riderMap.get(lap.riderName) ?? { laps: 0, ms: 0, fastest: Infinity }
    r.laps++; r.ms += lap.durationMs; r.fastest = Math.min(r.fastest, lap.durationMs)
    riderMap.set(lap.riderName, r)
  }
  const riders = Array.from(riderMap.entries()).map(([name, s]) => ({
    name,
    laps: s.laps,
    km: parseFloat((s.laps * dist).toFixed(1)),
    avgSpeed: s.ms > 0 ? ((s.laps * dist) / (s.ms / 3_600_000)).toFixed(2) : '—',
    fastest: s.fastest < Infinity ? fmtLapShort(s.fastest) : '—',
  })).sort((a, b) => b.laps - a.laps)

  const bikes = ids.map(id => {
    const b = race.bikes[id]
    const laps = b.laps
    const totMs = laps.reduce((s, l) => s + l.durationMs, 0)
    const avgSpeed = totMs > 0 ? (b.totalDistanceKm / (totMs / 3_600_000)).toFixed(2) : '—'
    const fastestMs = laps.length ? Math.min(...laps.map(l => l.durationMs)) : 0
    const ts = b.transitions.filter(t => t.durationMs != null)
    const avgTs = ts.length ? Math.round(ts.reduce((s, t) => s + t.durationMs!, 0) / ts.length) : 0
    return {
      id, label: label(id),
      totalLaps: b.totalLaps,
      totalKm: b.totalDistanceKm,
      avgSpeed,
      fastest: fastestMs > 0 ? fmtLapShort(fastestMs) : '—',
      transitions: ts.length,
      avgTransition: avgTs > 0 ? fmtLapShort(avgTs) : '—',
    }
  })

  const genDate = new Date().toLocaleDateString('fr-BE', { day: '2-digit', month: 'long', year: 'numeric' })
    + ' à '
    + new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })

  return { ids, totalLaps, totalKm, elapsed, riders, bikes, genDate,
    raceName: race.settings.raceName ?? '24h Vélo',
    status: race.status,
    uniqueRiders: riderMap.size,
    startDate: race.startTimestamp
      ? new Date(race.startTimestamp).toLocaleDateString('fr-BE', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—',
  }
}

// ─── Canvas report ────────────────────────────────────────────────────────────

export function generateReportCanvas(race: Race, accentHex: string): HTMLCanvasElement {
  const acc = hexToRgb(accentHex)
  const data = gather(race)

  // Section heights
  const HEADER_H    = 140
  const STATS_H     = 130   // row + padding
  const LABEL_H     = 50    // section title + underline
  const BIKE_H      = 215   // bike card
  const RIDER_ROW_H = 30
  const TABLE_HDR_H = 34
  const FOOTER_H    = 72
  const maxRiders   = Math.min(data.riders.length, 25)

  const totalH = HEADER_H
    + GAP + LABEL_H + STATS_H
    + GAP + LABEL_H + BIKE_H
    + GAP + LABEL_H + TABLE_HDR_H + maxRiders * RIDER_ROW_H
    + GAP + FOOTER_H + 10

  const canvas = document.createElement('canvas')
  canvas.width  = W * DPR
  canvas.height = totalH * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  // Background
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, W, totalH)

  let y = 0

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = `rgb(${acc[0]},${acc[1]},${acc[2]})`
  ctx.fillRect(0, 0, W, HEADER_H)

  // Decorative blobs
  ctx.fillStyle = `rgba(255,255,255,0.07)`
  ctx.beginPath(); ctx.arc(W - 70, -20, 120, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(W + 10, HEADER_H + 10, 70, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(60, HEADER_H + 30, 60, 0, Math.PI * 2); ctx.fill()

  // Race name
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 30px system-ui,-apple-system,Arial`
  ctx.fillText(clip(ctx, data.raceName, W - PAD * 2 - 110), PAD, 54)

  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `500 15px system-ui,-apple-system,Arial`
  ctx.fillText('Rapport de course officiel', PAD, 80)

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `13px system-ui,-apple-system,Arial`
  ctx.fillText(`Course du ${data.startDate}  ·  Rapport généré le ${data.genDate}`, PAD, 108)

  // Status pill
  const statusLabel = data.status === 'RUNNING' ? 'En cours' : data.status === 'FINISHED' ? 'Terminée' : 'En attente'
  ctx.font = `bold 11px system-ui,-apple-system,Arial`
  const pillW = ctx.measureText(statusLabel).width + 24
  const pillX = W - PAD - pillW, pillY = HEADER_H - 50
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  roundRect(ctx, pillX, pillY, pillW, 24, 12); ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.fillText(statusLabel, pillX + pillW / 2, pillY + 16)
  ctx.textAlign = 'left'

  y = HEADER_H + GAP

  // ── Section helper ─────────────────────────────────────────────────────────
  const drawSectionTitle = (title: string) => {
    ctx.fillStyle = '#1e293b'
    ctx.font = `bold 15px system-ui,-apple-system,Arial`
    ctx.fillText(title, PAD, y + 22)
    ctx.fillStyle = `rgb(${acc[0]},${acc[1]},${acc[2]})`
    ctx.fillRect(PAD, y + 30, 36, 3)
    y += LABEL_H
  }

  // ── Résumé stats ───────────────────────────────────────────────────────────
  drawSectionTitle('Résumé général')

  const statsData = [
    { value: String(data.totalLaps), label: 'Tours total', sub: `${data.ids.length} vélo${data.ids.length > 1 ? 's' : ''}` },
    { value: `${data.totalKm.toFixed(1)} km`, label: 'Distance totale', sub: 'tous vélos confondus' },
    { value: data.elapsed > 0 ? formatMs(data.elapsed) : '—', label: 'Durée de course', sub: data.startDate },
    { value: String(data.uniqueRiders), label: 'Coureurs engagés', sub: 'sur la piste' },
  ]

  const cW = (W - PAD * 2 - GAP * 3) / 4
  statsData.forEach((s, i) => {
    const x = PAD + i * (cW + GAP)
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x, y, cW, 108, 10); ctx.fill()
    ctx.fillStyle = `rgb(${acc[0]},${acc[1]},${acc[2]})`
    ctx.fillRect(x, y + 12, 4, 84)

    ctx.fillStyle = '#0f172a'
    ctx.font = `bold 24px system-ui,-apple-system,Arial`
    ctx.fillText(clip(ctx, s.value, cW - 20), x + 16, y + 46)

    ctx.fillStyle = '#475569'
    ctx.font = `600 12px system-ui,-apple-system,Arial`
    ctx.fillText(s.label, x + 16, y + 68)

    ctx.fillStyle = '#94a3b8'
    ctx.font = `11px system-ui,-apple-system,Arial`
    ctx.fillText(clip(ctx, s.sub, cW - 20), x + 16, y + 87)
  })
  y += STATS_H

  // ── Bike cards ─────────────────────────────────────────────────────────────
  drawSectionTitle('Performance par vélo')

  const bCW = (W - PAD * 2 - GAP * (data.bikes.length - 1)) / data.bikes.length
  data.bikes.forEach((b, i) => {
    const x = PAD + i * (bCW + GAP)
    const bHex = BIKE_HEX[b.id as BikeId] ?? accentHex
    const bRgb = hexToRgb(bHex)

    // Card background
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x, y, bCW, BIKE_H, 12); ctx.fill()

    // Colored header band (62px tall)
    const BAND = 62
    ctx.fillStyle = bHex
    roundRect(ctx, x, y, bCW, BAND, 12); ctx.fill()
    ctx.fillStyle = bHex
    ctx.fillRect(x, y + BAND - 20, bCW, 20) // flatten bottom corners

    ctx.fillStyle = '#ffffff'
    ctx.font = `bold 14px system-ui,-apple-system,Arial`
    ctx.fillText(clip(ctx, b.label, bCW - 24), x + 12, y + 26)

    // Big laps number
    ctx.fillStyle = lighten(bRgb, 0.85)
    ctx.font = `bold 38px system-ui,-apple-system,Arial`
    ctx.textAlign = 'right'
    ctx.fillText(String(b.totalLaps), x + bCW - 12, y + 48)
    ctx.textAlign = 'left'
    ctx.fillStyle = lighten(bRgb, 0.7)
    ctx.font = `10px system-ui,-apple-system,Arial`
    ctx.textAlign = 'right'
    ctx.fillText('tours', x + bCW - 12, y + 58)
    ctx.textAlign = 'left'

    const rows: [string, string][] = [
      ['Distance',     `${b.totalKm.toFixed(1)} km`],
      ['Vit. moyenne', `${b.avgSpeed} km/h`],
      ['Tour le + rapide', b.fastest],
      ['Transitions',  `${b.transitions} (moy. ${b.avgTransition})`],
    ]
    rows.forEach(([lbl, val], ri) => {
      const ry = y + 80 + ri * 30
      ctx.fillStyle = '#64748b'
      ctx.font = `11px system-ui,-apple-system,Arial`
      ctx.fillText(lbl, x + 12, ry)
      ctx.fillStyle = '#0f172a'
      ctx.font = `600 13px system-ui,-apple-system,Arial`
      ctx.textAlign = 'right'
      ctx.fillText(clip(ctx, val, bCW - 20), x + bCW - 12, ry)
      ctx.textAlign = 'left'
      if (ri < rows.length - 1) {
        ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + 12, ry + 10); ctx.lineTo(x + bCW - 12, ry + 10); ctx.stroke()
      }
    })
  })
  y += BIKE_H

  // ── Riders table ───────────────────────────────────────────────────────────
  drawSectionTitle(`Classement des coureurs (${data.riders.length})`)

  const TABLE_W = W - PAD * 2
  // col widths
  const COL = {
    rank:    44,
    name:    TABLE_W - 44 - 72 - 100 - 100 - 100,
    laps:    72,
    km:      100,
    speed:   100,
    fastest: 100,
  }

  // Table header
  ctx.fillStyle = `rgb(${acc[0]},${acc[1]},${acc[2]})`
  roundRect(ctx, PAD, y, TABLE_W, TABLE_HDR_H, 8); ctx.fill()

  const headers: [string, number, CanvasTextAlign][] = [
    ['#',          PAD + COL.rank / 2,                                      'center'],
    ['Coureur',    PAD + COL.rank + 10,                                      'left'],
    ['Tours',      PAD + COL.rank + COL.name + COL.laps - 8,                'right'],
    ['Distance',   PAD + COL.rank + COL.name + COL.laps + COL.km - 8,      'right'],
    ['Vit. moy.',  PAD + COL.rank + COL.name + COL.laps + COL.km + COL.speed - 8, 'right'],
    ['+ rapide',   PAD + TABLE_W - 8,                                        'right'],
  ]
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 11px system-ui,-apple-system,Arial`
  headers.forEach(([txt, x, align]) => {
    ctx.textAlign = align; ctx.fillText(txt, x, y + 22); ctx.textAlign = 'left'
  })
  y += TABLE_HDR_H

  data.riders.slice(0, maxRiders).forEach((r, ri) => {
    const ry = y + ri * RIDER_ROW_H
    // Alternating rows
    if (ri % 2 === 0) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(PAD, ry, TABLE_W, RIDER_ROW_H)
    }
    // Podium highlight
    if (ri === 0) {
      ctx.fillStyle = 'rgba(251,191,36,0.12)'
      ctx.fillRect(PAD, ry, TABLE_W, RIDER_ROW_H)
    }

    // Rank
    const rankColors = ['#b45309', '#64748b', '#92400e']
    ctx.fillStyle = ri < 3 ? rankColors[ri] : '#94a3b8'
    ctx.font = `bold 13px system-ui,-apple-system,Arial`
    ctx.textAlign = 'center'
    ctx.fillText(String(ri + 1), PAD + COL.rank / 2, ry + 20)
    ctx.textAlign = 'left'

    // Name
    ctx.fillStyle = '#0f172a'
    ctx.font = `${ri < 3 ? 'bold' : '500'} 13px system-ui,-apple-system,Arial`
    ctx.fillText(clip(ctx, r.name, COL.name - 12), PAD + COL.rank + 8, ry + 20)

    // Stats cells
    const cells: [string | number, number][] = [
      [r.laps,     PAD + COL.rank + COL.name + COL.laps - 8],
      [`${r.km} km`, PAD + COL.rank + COL.name + COL.laps + COL.km - 8],
      [`${r.avgSpeed} km/h`, PAD + COL.rank + COL.name + COL.laps + COL.km + COL.speed - 8],
      [r.fastest,  PAD + TABLE_W - 8],
    ]
    cells.forEach(([val, x]) => {
      ctx.fillStyle = '#475569'
      ctx.font = `13px system-ui,-apple-system,Arial`
      ctx.textAlign = 'right'
      ctx.fillText(String(val), x, ry + 20)
    })
    ctx.textAlign = 'left'

    // Row separator
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD, ry + RIDER_ROW_H); ctx.lineTo(PAD + TABLE_W, ry + RIDER_ROW_H); ctx.stroke()
  })

  if (data.riders.length > maxRiders) {
    const ry = y + maxRiders * RIDER_ROW_H
    ctx.fillStyle = '#94a3b8'
    ctx.font = `italic 11px system-ui,-apple-system,Arial`
    ctx.textAlign = 'center'
    ctx.fillText(`… et ${data.riders.length - maxRiders} coureurs supplémentaires`, PAD + TABLE_W / 2, ry + 16)
    ctx.textAlign = 'left'
    y += 24
  }

  y += maxRiders * RIDER_ROW_H + GAP

  // ── Footer ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = `rgb(${acc[0]},${acc[1]},${acc[2]})`
  ctx.fillRect(0, y, W, FOOTER_H)

  // Decorative blob
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.beginPath(); ctx.arc(80, y + FOOTER_H, 80, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = `bold 13px system-ui,-apple-system,Arial`
  ctx.textAlign = 'center'
  ctx.fillText('Built with ♥ by Cyril', W / 2, y + 32)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `11px system-ui,-apple-system,Arial`
  ctx.fillText(`Rapport généré le ${data.genDate}`, W / 2, y + 52)
  ctx.textAlign = 'left'

  return canvas
}

// ─── Export functions ─────────────────────────────────────────────────────────

export function downloadReportPng(race: Race, accentHex: string) {
  const canvas = generateReportCanvas(race, accentHex)
  canvas.toBlob(blob => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rapport-24h-${new Date().toISOString().slice(0, 10)}.png`
    a.click()
  }, 'image/png')
}

export function downloadReportPdf(race: Race, accentHex: string) {
  const canvas = generateReportCanvas(race, accentHex)
  const imgData = canvas.toDataURL('image/png')

  // Logical dimensions (before DPR scaling)
  const logW = canvas.width / DPR
  const logH = canvas.height / DPR

  // Map to PDF mm — A4 width = 210 mm
  const pdfW = 210
  const pdfH = Math.round((logH / logW) * pdfW)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, pdfH] })
  doc.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH, undefined, 'FAST')
  doc.save(`rapport-24h-${new Date().toISOString().slice(0, 10)}.pdf`)
}
