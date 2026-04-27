export type ID = string

export interface Place {
  name: string
  lat: number
  lng: number
  address?: string
  placeId?: string
  tz?: string
}

export type SegmentKind = 'travel' | 'hotel' | 'poi'

export type TransportMode = 'flight' | 'car' | 'transit'

export type PoiCategory =
  | 'restaurant'
  | 'museum'
  | 'attraction'
  | 'cafe'
  | 'bar'
  | 'shop'
  | 'park'
  | 'other'

interface SegmentBase {
  id: ID
  tripId: ID
  kind: SegmentKind
  startUtc: string
  endUtc: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface TravelSegment extends SegmentBase {
  kind: 'travel'
  mode: TransportMode
  origin: Place
  destination: Place
  carrier?: string // airline / transit operator / rental company
  routeNumber?: string // flight number / line / train number
  confirmation?: string
}

export interface HotelSegment extends SegmentBase {
  kind: 'hotel'
  location: Place
  confirmation?: string
}

export interface PoiSegment extends SegmentBase {
  kind: 'poi'
  location: Place
  parentSegmentId?: ID
  category?: PoiCategory
}

export type Segment = TravelSegment | HotelSegment | PoiSegment

export interface Trip {
  id: ID
  name: string
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export type NewTravelInput = Omit<TravelSegment, 'id' | 'createdAt' | 'updatedAt'>
export type NewHotelInput = Omit<HotelSegment, 'id' | 'createdAt' | 'updatedAt'>
export type NewPoiInput = Omit<PoiSegment, 'id' | 'createdAt' | 'updatedAt'>
export type NewSegmentInput = NewTravelInput | NewHotelInput | NewPoiInput
