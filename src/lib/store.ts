import { create } from 'zustand'
import { db } from './db'
import { dateInputToMs, toMs } from './time'
import type { HotelSegment, NewSegmentInput, Segment, Trip } from './types'

interface NewTripInput {
  name: string
  startDate: string
  endDate: string
}

interface State {
  trips: Trip[]
  segments: Segment[]
  activeTripId: string | null
  currentTimeMs: number
  loaded: boolean
}

interface Actions {
  load: () => Promise<void>

  createTrip: (input: NewTripInput) => Promise<Trip>
  updateTrip: (
    id: string,
    patch: Partial<Pick<Trip, 'name' | 'startDate' | 'endDate'>>,
  ) => Promise<void>
  deleteTrip: (id: string) => Promise<void>
  setActiveTrip: (id: string | null) => void

  addSegment: (input: NewSegmentInput) => Promise<Segment>
  updateSegment: (id: string, patch: Partial<Segment>) => Promise<void>
  deleteSegment: (id: string) => Promise<void>

  setCurrentTime: (ms: number) => void
}

export type TripStore = State & Actions

const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export const useTripStore = create<TripStore>((set, get) => ({
  trips: [],
  segments: [],
  activeTripId: null,
  currentTimeMs: 0,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    const [trips, segments] = await Promise.all([
      db.trips.toArray(),
      db.segments.toArray(),
    ])
    trips.sort((a, b) => a.startDate.localeCompare(b.startDate))
    segments.sort((a, b) => a.startUtc.localeCompare(b.startUtc))
    const activeTrip = trips[0] ?? null
    set({
      trips,
      segments,
      activeTripId: activeTrip?.id ?? null,
      currentTimeMs: activeTrip ? defaultTimeForTrip(activeTrip, segments) : 0,
      loaded: true,
    })
  },

  createTrip: async (input) => {
    const trip: Trip = {
      id: newId(),
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    await db.trips.add(trip)
    set((s) => ({
      trips: [...s.trips, trip].sort((a, b) => a.startDate.localeCompare(b.startDate)),
      activeTripId: s.activeTripId ?? trip.id,
    }))
    return trip
  },

  updateTrip: async (id, patch) => {
    const updatedAt = nowIso()
    await db.trips.update(id, { ...patch, updatedAt })
    set((s) => ({
      trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch, updatedAt } : t)),
    }))
  },

  deleteTrip: async (id) => {
    await db.transaction('rw', db.trips, db.segments, async () => {
      await db.segments.where('tripId').equals(id).delete()
      await db.trips.delete(id)
    })
    set((s) => {
      const trips = s.trips.filter((t) => t.id !== id)
      return {
        trips,
        segments: s.segments.filter((seg) => seg.tripId !== id),
        activeTripId: s.activeTripId === id ? (trips[0]?.id ?? null) : s.activeTripId,
      }
    })
  },

  setActiveTrip: (id) => {
    const state = get()
    const trip = id ? state.trips.find((t) => t.id === id) ?? null : null
    set({
      activeTripId: id,
      currentTimeMs: trip ? defaultTimeForTrip(trip, state.segments) : 0,
    })
  },

  addSegment: async (input) => {
    const segment = {
      ...input,
      id: newId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as Segment
    await db.segments.add(segment)
    set((s) => ({
      segments: [...s.segments, segment].sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
    }))
    return segment
  },

  updateSegment: async (id, patch) => {
    const updatedAt = nowIso()
    await db.segments.update(id, { ...patch, updatedAt })
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === id ? ({ ...seg, ...patch, updatedAt } as Segment) : seg,
      ),
    }))
  },

  deleteSegment: async (id) => {
    await db.segments.delete(id)
    set((s) => ({
      segments: s.segments
        .filter((seg) => seg.id !== id)
        .map((seg) =>
          seg.kind === 'poi' && seg.parentSegmentId === id
            ? ({ ...seg, parentSegmentId: undefined } as Segment)
            : seg,
        ),
    }))
  },

  setCurrentTime: (ms) => set({ currentTimeMs: ms }),
}))

export const selectActiveTrip = (s: TripStore): Trip | null =>
  s.activeTripId ? s.trips.find((t) => t.id === s.activeTripId) ?? null : null

export const selectActiveSegments = (s: TripStore): Segment[] =>
  s.activeTripId ? s.segments.filter((seg) => seg.tripId === s.activeTripId) : []

export const selectActiveHotels = (s: TripStore): HotelSegment[] =>
  s.activeTripId
    ? (s.segments.filter(
        (seg) => seg.tripId === s.activeTripId && seg.kind === 'hotel',
      ) as HotelSegment[])
    : []

function defaultTimeForTrip(trip: Trip, allSegments: Segment[]): number {
  const tripSegments = allSegments.filter((s) => s.tripId === trip.id)
  if (tripSegments.length > 0) {
    return Math.min(...tripSegments.map((s) => toMs(s.startUtc)))
  }
  return dateInputToMs(trip.startDate)
}
