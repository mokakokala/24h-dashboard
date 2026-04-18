import { Router, type Request, type Response } from 'express'
import { getRace, getCsvFilePath } from '../persistence.js'
import fs from 'fs'
import * as XLSX from 'xlsx'

const router = Router()

// GET /api/exports/excel — full Excel export
router.get('/excel', (_req: Request, res: Response) => {
  try {
    const race = getRace()
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Summary ──────────────────────────────────────────────────────
    const summaryData = [
      ['Course', race.name],
      ['Statut', race.status === 'RUNNING' ? 'En cours' : race.status === 'FINISHED' ? 'Terminée' : 'En attente'],
      ['Démarrage', race.startTimestamp ? new Date(race.startTimestamp).toLocaleString('fr-BE') : '—'],
      ['Export', new Date().toLocaleString('fr-BE')],
      [],
      ['Vélo', 'Tours', 'Distance (km)'],
      ['Grand Vélo (V1)', race.bikes.V1.totalLaps, race.bikes.V1.totalDistanceKm],
      ['Petit Vélo (V2)', race.bikes.V2.totalLaps, race.bikes.V2.totalDistanceKm],
      ['Vélo Folklo (V3)', race.bikes.V3.totalLaps, race.bikes.V3.totalDistanceKm],
      ['TOTAL', race.bikes.V1.totalLaps + race.bikes.V2.totalLaps + race.bikes.V3.totalLaps,
        (race.bikes.V1.totalDistanceKm + race.bikes.V2.totalDistanceKm + race.bikes.V3.totalDistanceKm).toFixed(2)],
    ]
    const ws0 = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws0, 'Résumé')

    // ── Sheets 2-4: Laps per bike ─────────────────────────────────────────────
    const bikeDefs = [
      { id: 'V1', label: 'V1 Grand Vélo' },
      { id: 'V2', label: 'V2 Petit Vélo' },
      { id: 'V3', label: 'V3 Folklo' },
    ] as const

    for (const { id, label } of bikeDefs) {
      const bike = race.bikes[id]
      const header = ['#', 'Coureur', id === 'V3' ? 'Coureur 2' : '', 'Type', 'Départ', 'Arrivée', 'Durée', 'Vitesse (km/h)', 'Notes']
      const rows = [...bike.laps].sort((a, b) => a.lapNumber - b.lapNumber).map(lap => [
        lap.lapNumber,
        lap.riderName,
        lap.riderName2 ?? '',
        lap.type === 'TOUR' ? 'Tour' : 'Fin relais',
        new Date(lap.startTimestamp).toLocaleString('fr-BE'),
        new Date(lap.endTimestamp).toLocaleString('fr-BE'),
        formatMsExcel(lap.durationMs),
        lap.speedKmh,
        lap.notes ?? '',
      ])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      // Column widths
      ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 25 }]
      XLSX.utils.book_append_sheet(wb, ws, label)
    }

    // ── Sheet 5: All riders combined ──────────────────────────────────────────
    const allLaps = ['V1', 'V2', 'V3'].flatMap(id => race.bikes[id as 'V1'|'V2'|'V3'].laps)
    const riderMap = new Map<string, { laps: number; totalMs: number; fastestMs: number }>()
    for (const lap of allLaps) {
      const key = lap.riderName
      const prev = riderMap.get(key) ?? { laps: 0, totalMs: 0, fastestMs: Infinity }
      riderMap.set(key, { laps: prev.laps + 1, totalMs: prev.totalMs + lap.durationMs, fastestMs: Math.min(prev.fastestMs, lap.durationMs) })
    }
    const riderHeader = ['Coureur', 'Tours', 'Temps total', 'Tour le + rapide', 'Vitesse moy. (km/h)']
    const riderRows = Array.from(riderMap.entries())
      .sort((a, b) => b[1].laps - a[1].laps)
      .map(([name, s]) => [
        name,
        s.laps,
        formatMsExcel(s.totalMs),
        formatMsExcel(s.fastestMs === Infinity ? 0 : s.fastestMs),
        s.totalMs > 0 ? ((s.laps * race.settings.circuitDistanceKm) / (s.totalMs / 3_600_000)).toFixed(2) : '0',
      ])
    const wsRiders = XLSX.utils.aoa_to_sheet([riderHeader, ...riderRows])
    wsRiders['!cols'] = [{ wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsRiders, 'Classement Coureurs')

    // ── Sheet 6: Folklo entries ───────────────────────────────────────────────
    if (race.folkloEntries.length > 0) {
      const fHeader = ['#', 'Équipe', 'Costume', 'Notes', 'Enregistré le']
      const fRows = race.folkloEntries.map((e, i) => [
        i + 1, e.teamName, e.costumeDescription, e.notes ?? '',
        new Date(e.timestamp).toLocaleString('fr-BE'),
      ])
      const wsFolklo = XLSX.utils.aoa_to_sheet([fHeader, ...fRows])
      wsFolklo['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 30 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, wsFolklo, 'Vélo Folklo')
    }

    // ── Transitions ───────────────────────────────────────────────────────────
    const tHeader = ['Vélo', 'Entrant', 'Entrant 2', 'Sortant', 'Sortant 2', 'Début', 'Fin', 'Durée']
    const tRows = ['V1', 'V2', 'V3'].flatMap(id =>
      race.bikes[id as 'V1'|'V2'|'V3'].transitions
        .filter(t => t.durationMs != null)
        .map(t => [
          id,
          t.incomingRiderName,
          t.incomingRiderName2 ?? '',
          t.outgoingRiderName ?? '',
          t.outgoingRiderName2 ?? '',
          t.startTimestamp ? new Date(t.startTimestamp).toLocaleString('fr-BE') : '',
          t.endTimestamp ? new Date(t.endTimestamp).toLocaleString('fr-BE') : '',
          t.durationMs != null ? formatMsExcel(t.durationMs) : '',
        ])
    )
    if (tRows.length > 0) {
      const wsTransitions = XLSX.utils.aoa_to_sheet([tHeader, ...tRows])
      wsTransitions['!cols'] = Array(8).fill({ wch: 18 })
      XLSX.utils.book_append_sheet(wb, wsTransitions, 'Transitions')
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `24h-velo-export-${new Date().toISOString().slice(0, 10)}.xlsx`

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.send(buf)
  } catch (err) {
    console.error('Excel export error:', err)
    res.status(500).json({ success: false, error: 'Export failed', timestamp: new Date().toISOString() })
  }
})

// GET /api/exports/csv — download the live CSV file
router.get('/csv', (_req: Request, res: Response) => {
  const csvPath = getCsvFilePath()
  if (!fs.existsSync(csvPath)) {
    res.status(404).json({ success: false, error: 'No CSV data yet', timestamp: new Date().toISOString() })
    return
  }
  res.setHeader('Content-Disposition', 'attachment; filename="race_data.csv"')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.send(fs.readFileSync(csvPath, 'utf-8'))
})

// Helpers
function formatMsExcel(ms: number): string {
  if (!ms || ms <= 0) return '0:00'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default router
