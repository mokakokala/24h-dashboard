export type BikeId = 'V1' | 'V2' | 'V3'
export type BikeStatus = 'IDLE' | 'RUNNING' | 'TRANSITION'
export type LapType = 'TOUR' | 'RELAY_END'
export type RaceStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'FINISHED'

export interface Rider { id: string; name: string; type?: 'animé' | 'autre' }
export interface AniméSlot { start: string; end: string }

export interface QueueEntry {
  id: string
  riderName: string
  riderName2?: string
}

export interface Lap {
  id: string; bikeId: BikeId; riderId: string; riderName: string
  riderId2?: string; riderName2?: string
  lapNumber: number; distanceKm: number; durationMs: number
  startTimestamp: string; endTimestamp: string; type: LapType
  speedKmh: number; notes?: string
}

export interface Transition {
  id: string; bikeId: BikeId
  incomingRiderId: string; incomingRiderName: string
  incomingRiderId2?: string; incomingRiderName2?: string
  outgoingRiderId?: string; outgoingRiderName?: string
  outgoingRiderId2?: string; outgoingRiderName2?: string
  startTimestamp: string; endTimestamp?: string; durationMs?: number
}

export interface BikeState {
  id: BikeId; label: string; status: BikeStatus
  currentRiderId?: string; currentRiderName?: string
  currentRiderId2?: string; currentRiderName2?: string
  isDualRider?: boolean
  maintenanceMode?: boolean
  maintenanceStartTimestamp?: string
  pausedLapElapsedMs?: number
  currentLapStartTimestamp?: string; transitionStartTimestamp?: string
  totalLaps: number; totalDistanceKm: number
  laps: Lap[]; transitions: Transition[]
  currentTransition?: Transition
  queue: QueueEntry[]
}

export interface FolkloEntry {
  id: string; teamName: string; costumeDescription: string
  notes?: string; timestamp: string
}

export interface LapAlertSettings { V1: number; V2: number; V3: number }
export interface LapAlertEnabled { V1: boolean; V2: boolean; V3: boolean }
export type LapGaugeMode = 'fixed' | 'average'

export interface HeaderStatConfig {
  showDuration?: boolean   // chrono de course
  showTotalLaps?: boolean  // somme tours tous vélos
  showTotalKm?: boolean    // somme km tous vélos
  showV1Laps?: boolean
  showV2Laps?: boolean
  showV3Laps?: boolean
  showV1Km?: boolean
  showV2Km?: boolean
  showV3Km?: boolean
}

export interface PublicViewSettings {
  showClock?: boolean
  showRaceDuration?: boolean
  showCurrentRider?: boolean
  showChrono?: boolean
  showGauge?: boolean
  showQueue?: boolean
  queueMaxEntries?: number
  showBikeStats?: boolean
  showGlobalStats?: boolean
}

export interface RaceSettings {
  relayAlertThresholdMs: number
  lapAlertMs: LapAlertSettings
  lapAlertEnabled: LapAlertEnabled
  lapGaugeEnabled?: { V1: boolean; V2: boolean; V3: boolean }
  lapGaugeMode?: { V1: LapGaugeMode; V2: LapGaugeMode; V3: LapGaugeMode }
  lapGaugeMs?: { V1: number; V2: number; V3: number }
  circuitDistanceKm: number
  raceDurationMs: number
  enabledBikes?: { V1: boolean; V2: boolean; V3: boolean }
  bikeLabels?: { V1: string; V2: string; V3: string }
  raceName?: string
  animéOnlyMode?: boolean
  animéSchedule?: AniméSlot[]
  headerStats?: HeaderStatConfig
  timezone?: string
  clockDateFormat?: 'long' | 'short' | 'iso'
  clockShowSeconds?: boolean
  clockHourFormat?: '24h' | '12h'
  lapAlertSoundEnabled?: boolean
  publicView?: PublicViewSettings
}

export interface Race {
  id: string; name: string; status: RaceStatus
  startTimestamp?: string; endTimestamp?: string
  pausedAt?: string; totalPausedMs?: number
  bikes: Record<BikeId, BikeState>
  riders: Rider[]; folkloEntries: FolkloEntry[]
  settings: RaceSettings; lastSavedAt: string; schemaVersion: 1
}

export interface ApiResponse<T = unknown> {
  success: boolean; data?: T; error?: string; timestamp: string
}

export interface TourPayload { bikeId: BikeId; riderId: string; riderName: string; riderId2?: string; riderName2?: string }
export interface StopPayload { bikeId: BikeId }
export interface StartPayload { bikeId: BikeId; riderId: string; riderName: string; riderId2?: string; riderName2?: string }
