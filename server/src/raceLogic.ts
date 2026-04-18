import { v4 as uuidv4 } from 'uuid'
import type { Race, BikeId, Lap, Transition, TourPayload, StopPayload, StartPayload } from './types.js'

const computeSpeed = (durationMs: number, distKm: number): number => {
  if (durationMs <= 0) return 0
  return parseFloat(((distKm / (durationMs / 3_600_000))).toFixed(2))
}

// ─── TOUR ─────────────────────────────────────────────────────────────────────

export const handleTour = (race: Race, payload: TourPayload): Race => {
  const bike = race.bikes[payload.bikeId]
  const distKm = race.settings.circuitDistanceKm

  if (bike.status !== 'RUNNING') {
    throw new Error(`Bike ${payload.bikeId} is not RUNNING (current: ${bike.status})`)
  }
  if (!bike.currentLapStartTimestamp) {
    throw new Error(`Bike ${payload.bikeId} has no lap start timestamp`)
  }

  const now = new Date().toISOString()
  const durationMs = Date.parse(now) - Date.parse(bike.currentLapStartTimestamp)

  const lap: Lap = {
    id: uuidv4(),
    bikeId: payload.bikeId,
    riderId: payload.riderId,
    riderName: payload.riderName,
    riderId2: payload.riderId2,
    riderName2: payload.riderName2,
    lapNumber: bike.totalLaps + 1,
    distanceKm: distKm,
    durationMs,
    startTimestamp: bike.currentLapStartTimestamp,
    endTimestamp: now,
    type: 'TOUR',
    speedKmh: computeSpeed(durationMs, distKm),
  }

  const updatedBike = {
    ...bike,
    currentRiderId: payload.riderId,
    currentRiderName: payload.riderName,
    currentRiderId2: payload.riderId2,
    currentRiderName2: payload.riderName2,
    currentLapStartTimestamp: now,
    totalLaps: bike.totalLaps + 1,
    totalDistanceKm: parseFloat(((bike.totalLaps + 1) * distKm).toFixed(2)),
    laps: [...bike.laps, lap],
  }

  return {
    ...race,
    bikes: { ...race.bikes, [payload.bikeId]: updatedBike },
  }
}

// ─── STOP ─────────────────────────────────────────────────────────────────────

export const handleStop = (race: Race, payload: StopPayload): Race => {
  const bike = race.bikes[payload.bikeId]
  const distKm = race.settings.circuitDistanceKm

  if (bike.status !== 'RUNNING') {
    throw new Error(`Bike ${payload.bikeId} is not RUNNING (current: ${bike.status})`)
  }
  if (!bike.currentLapStartTimestamp) {
    throw new Error(`Bike ${payload.bikeId} has no lap start timestamp`)
  }

  const now = new Date().toISOString()
  const durationMs = Date.parse(now) - Date.parse(bike.currentLapStartTimestamp)

  const lap: Lap = {
    id: uuidv4(),
    bikeId: payload.bikeId,
    riderId: bike.currentRiderId ?? 'unknown',
    riderName: bike.currentRiderName ?? 'Inconnu',
    riderId2: bike.currentRiderId2,
    riderName2: bike.currentRiderName2,
    lapNumber: bike.totalLaps + 1,
    distanceKm: distKm,
    durationMs,
    startTimestamp: bike.currentLapStartTimestamp,
    endTimestamp: now,
    type: 'RELAY_END',
    speedKmh: computeSpeed(durationMs, distKm),
  }

  const transition: Transition = {
    id: uuidv4(),
    bikeId: payload.bikeId,
    incomingRiderId: bike.currentRiderId ?? 'unknown',
    incomingRiderName: bike.currentRiderName ?? 'Inconnu',
    incomingRiderId2: bike.currentRiderId2,
    incomingRiderName2: bike.currentRiderName2,
    startTimestamp: now,
  }

  const updatedBike = {
    ...bike,
    status: 'TRANSITION' as const,
    currentLapStartTimestamp: undefined,
    transitionStartTimestamp: now,
    totalLaps: bike.totalLaps + 1,
    totalDistanceKm: parseFloat(((bike.totalLaps + 1) * distKm).toFixed(2)),
    laps: [...bike.laps, lap],
    currentTransition: transition,
  }

  return {
    ...race,
    bikes: { ...race.bikes, [payload.bikeId]: updatedBike },
  }
}

// ─── START ────────────────────────────────────────────────────────────────────

export const handleStart = (race: Race, payload: StartPayload): Race => {
  const bike = race.bikes[payload.bikeId]

  if (bike.status !== 'TRANSITION') {
    throw new Error(`Bike ${payload.bikeId} is not in TRANSITION (current: ${bike.status})`)
  }
  if (!bike.currentTransition) {
    throw new Error(`Bike ${payload.bikeId} has no active transition`)
  }

  const now = new Date().toISOString()
  const durationMs = Date.parse(now) - Date.parse(bike.currentTransition.startTimestamp)

  const closedTransition: Transition = {
    ...bike.currentTransition,
    outgoingRiderId: payload.riderId,
    outgoingRiderName: payload.riderName,
    outgoingRiderId2: payload.riderId2,
    outgoingRiderName2: payload.riderName2,
    endTimestamp: now,
    durationMs,
  }

  const updatedBike = {
    ...bike,
    status: 'RUNNING' as const,
    currentRiderId: payload.riderId,
    currentRiderName: payload.riderName,
    currentRiderId2: payload.riderId2,
    currentRiderName2: payload.riderName2,
    currentLapStartTimestamp: now,
    transitionStartTimestamp: undefined,
    currentTransition: undefined,
    transitions: [...bike.transitions, closedTransition],
  }

  return {
    ...race,
    bikes: { ...race.bikes, [payload.bikeId]: updatedBike },
  }
}

// ─── Lap Recomputation ────────────────────────────────────────────────────────

export const recomputeBikeTotals = (race: Race, bikeId: BikeId): Race => {
  const bike = race.bikes[bikeId]
  const distKm = race.settings.circuitDistanceKm
  const totalLaps = bike.laps.length
  const totalDistanceKm = parseFloat((totalLaps * distKm).toFixed(2))

  const renumberedLaps = bike.laps.map((lap, i) => ({ ...lap, lapNumber: i + 1 }))

  return {
    ...race,
    bikes: {
      ...race.bikes,
      [bikeId]: { ...bike, totalLaps, totalDistanceKm, laps: renumberedLaps },
    },
  }
}
