import Dexie, { type Table } from 'dexie'
import type { Trip, Segment } from './types'

export class TravelDB extends Dexie {
  trips!: Table<Trip, string>
  segments!: Table<Segment, string>

  constructor() {
    super('travel_app')
    this.version(1).stores({
      trips: 'id, createdAt, name',
      segments: 'id, tripId, startUtc, [tripId+startUtc], parentSegmentId',
    })
    // v2: rename 'flight' kind to 'travel' with a mode field; consolidate
    // airline/flightNumber into carrier/routeNumber.
    this.version(2)
      .stores({
        trips: 'id, createdAt, name',
        segments: 'id, tripId, startUtc, [tripId+startUtc], parentSegmentId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('segments')
          .toCollection()
          .modify((s: Record<string, unknown>) => {
            if (s.kind === 'flight') {
              s.kind = 'travel'
              s.mode = 'flight'
              if (s.airline !== undefined) {
                s.carrier = s.airline
                delete s.airline
              }
              if (s.flightNumber !== undefined) {
                s.routeNumber = s.flightNumber
                delete s.flightNumber
              }
            }
          })
      })
  }
}

export const db = new TravelDB()
