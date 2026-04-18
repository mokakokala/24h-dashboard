import type {
  Race, BikeState, Lap, Rider, FolkloEntry, QueueEntry,
  ApiResponse, TourPayload, StopPayload, StartPayload, RaceSettings, BikeId
} from './types'

const BASE = '/api'

const post = <T>(url: string, body: unknown): Promise<ApiResponse<T>> =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

const put = <T>(url: string, body: unknown): Promise<ApiResponse<T>> =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

const patch = <T>(url: string, body: unknown): Promise<ApiResponse<T>> =>
  fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

const del = <T>(url: string): Promise<ApiResponse<T>> =>
  fetch(url, { method: 'DELETE' }).then(r => r.json())

// Race
export const getRace = (): Promise<ApiResponse<Race>> => fetch(`${BASE}/race`).then(r => r.json())
export const startRace  = (): Promise<ApiResponse<Race>> => post(`${BASE}/race/start`,  {})
export const finishRace  = (): Promise<ApiResponse<Race>> => post(`${BASE}/race/finish`,  {})
export const reopenRace  = (): Promise<ApiResponse<Race>> => post(`${BASE}/race/reopen`,  {})
export const pauseRace   = (): Promise<ApiResponse<Race>> => post(`${BASE}/race/pause`,   {})
export const resumeRace  = (): Promise<ApiResponse<Race>> => post(`${BASE}/race/resume`,  {})
export const resetRace = (): Promise<ApiResponse<Race>> => post(`${BASE}/race/reset`, { confirm: true })
export const updateSettings = (settings: Partial<RaceSettings>): Promise<ApiResponse<Race>> => put(`${BASE}/race/settings`, settings)
export const toggleMaintenance = (bikeId: BikeId): Promise<ApiResponse<Race>> => patch(`${BASE}/race/bikes/${bikeId}/maintenance`, {})
export const updateCurrentRider = (bikeId: BikeId, riderId: string, riderName: string, riderId2?: string, riderName2?: string): Promise<ApiResponse<Race>> =>
  patch(`${BASE}/race/bikes/${bikeId}/current-rider`, { riderId, riderName, riderId2, riderName2 })

// Undo
export const undoAction = (): Promise<ApiResponse<Race>> => post(`${BASE}/undo`, {})
export const canUndo = (): Promise<{ canUndo: boolean }> => fetch(`${BASE}/undo/can`).then(r => r.json())

// Pit
export const pitTour = (payload: TourPayload): Promise<ApiResponse<BikeState>> => post(`${BASE}/pit/tour`, payload)
export const pitStop = (payload: StopPayload): Promise<ApiResponse<BikeState>> => post(`${BASE}/pit/stop`, payload)
export const pitStart = (payload: StartPayload): Promise<ApiResponse<BikeState>> => post(`${BASE}/pit/start`, payload)

// Laps
export const getLaps = (bikeId?: BikeId): Promise<ApiResponse<Lap[]>> => fetch(`${BASE}/laps${bikeId ? `?bikeId=${bikeId}` : ''}`).then(r => r.json())
export const updateLap = (lapId: string, updates: Partial<Lap>): Promise<ApiResponse<Lap>> => put(`${BASE}/laps/${lapId}`, updates)
export const deleteLap = (lapId: string): Promise<ApiResponse> => del(`${BASE}/laps/${lapId}`)

// Riders
export const getRiders = (): Promise<ApiResponse<Rider[]>> => fetch(`${BASE}/riders`).then(r => r.json())
export const createRider = (name: string, type?: 'animé' | 'autre'): Promise<ApiResponse<Rider>> => post(`${BASE}/riders`, { name, type })
export const updateRider = (riderId: string, name: string, type?: 'animé' | 'autre'): Promise<ApiResponse<Rider>> => put(`${BASE}/riders/${riderId}`, { name, type })
export const deleteRider = (riderId: string): Promise<ApiResponse> => del(`${BASE}/riders/${riderId}`)

// Folklo
export const getFolklo = (): Promise<ApiResponse<FolkloEntry[]>> => fetch(`${BASE}/folklo`).then(r => r.json())
export const createFolklo = (entry: Omit<FolkloEntry, 'id' | 'timestamp'>): Promise<ApiResponse<FolkloEntry>> => post(`${BASE}/folklo`, entry)
export const updateFolklo = (entryId: string, updates: Partial<FolkloEntry>): Promise<ApiResponse<FolkloEntry>> => put(`${BASE}/folklo/${entryId}`, updates)
export const deleteFolklo = (entryId: string): Promise<ApiResponse> => del(`${BASE}/folklo/${entryId}`)

// Queue
export const addToQueue = (bikeId: BikeId, riderName: string, riderName2?: string): Promise<ApiResponse<QueueEntry>> =>
  post(`${BASE}/queue/${bikeId}`, { riderName, riderName2 })
export const removeFromQueue = (bikeId: BikeId, entryId: string): Promise<ApiResponse> => del(`${BASE}/queue/${bikeId}/${entryId}`)
export const replaceQueue = (bikeId: BikeId, queue: QueueEntry[]): Promise<ApiResponse<QueueEntry[]>> => put(`${BASE}/queue/${bikeId}`, queue)

// Exports
export const exportExcel = (): void => { window.location.href = `${BASE}/exports/excel` }
export const exportCsv = (): void => { window.location.href = `${BASE}/exports/csv` }

// Backup
export const exportBackup = (): void => { window.location.href = `${BASE}/backup/export` }
export const listBackups = (): Promise<ApiResponse<string[]>> => fetch(`${BASE}/backup/list`).then(r => r.json())
export const restoreBackup = (filename: string): Promise<ApiResponse<Race>> => post(`${BASE}/backup/restore/${filename}`, {})
export const importBackup = (file: File): Promise<ApiResponse<Race>> => {
  const formData = new FormData()
  formData.append('backup', file)
  return fetch(`${BASE}/backup/import`, { method: 'POST', body: formData }).then(r => r.json())
}
