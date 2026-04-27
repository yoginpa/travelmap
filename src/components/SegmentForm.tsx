import { useEffect, useMemo, useState } from 'react'
import { useTripStore } from '../lib/store'
import type {
  HotelSegment,
  PoiCategory,
  Segment,
  TransportMode,
  Trip,
} from '../lib/types'
import type { PhotonResult } from '../lib/photon'
import { localInputToUtc, utcToLocalInput } from '../lib/time'
import { PlaceSearch } from './PlaceSearch'
import { Modal } from './Modal'

type Kind = 'travel' | 'hotel' | 'poi'

interface Props {
  open: boolean
  trip: Trip
  initialKind: Kind
  editing?: Segment | null
  hotels: HotelSegment[]
  defaultParentHotelId?: string | null
  onClose: () => void
}

const POI_CATEGORIES: PoiCategory[] = [
  'restaurant',
  'cafe',
  'bar',
  'museum',
  'attraction',
  'park',
  'shop',
  'other',
]

const MODES: Array<{ value: TransportMode; label: string; icon: string }> = [
  { value: 'flight', label: 'Flight', icon: '✈' },
  { value: 'car', label: 'Car', icon: '🚗' },
  { value: 'transit', label: 'Transit', icon: '🚆' },
]

const placeFromSegment = (s: Segment, side?: 'origin' | 'destination'): PhotonResult => {
  if (s.kind === 'travel') {
    const p = side === 'destination' ? s.destination : s.origin
    return { name: p.name, lat: p.lat, lng: p.lng, address: p.address, placeId: p.placeId }
  }
  const p = s.location
  return { name: p.name, lat: p.lat, lng: p.lng, address: p.address, placeId: p.placeId }
}

const carrierLabel = (mode: TransportMode) =>
  mode === 'flight' ? 'Airline' : mode === 'transit' ? 'Operator' : 'Vehicle / Rental'

const routeLabel = (mode: TransportMode) =>
  mode === 'flight' ? 'Flight #' : mode === 'transit' ? 'Route / Train #' : 'Plate / Trip name'

export function SegmentForm({
  open,
  trip,
  initialKind,
  editing,
  hotels,
  defaultParentHotelId,
  onClose,
}: Props) {
  const addSegment = useTripStore((s) => s.addSegment)
  const updateSegment = useTripStore((s) => s.updateSegment)

  const [kind, setKind] = useState<Kind>(editing?.kind ?? initialKind)
  const [mode, setMode] = useState<TransportMode>('flight')
  const [origin, setOrigin] = useState<PhotonResult | null>(null)
  const [destination, setDestination] = useState<PhotonResult | null>(null)
  const [location, setLocation] = useState<PhotonResult | null>(null)
  const [startLocal, setStartLocal] = useState('')
  const [endLocal, setEndLocal] = useState('')
  const [carrier, setCarrier] = useState('')
  const [routeNumber, setRouteNumber] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [parentHotelId, setParentHotelId] = useState<string>('')
  const [category, setCategory] = useState<PoiCategory>('restaurant')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      setKind(editing.kind)
      setStartLocal(utcToLocalInput(editing.startUtc))
      setEndLocal(utcToLocalInput(editing.endUtc))
      setNotes(editing.notes ?? '')
      if (editing.kind === 'travel') {
        setMode(editing.mode)
        setOrigin(placeFromSegment(editing, 'origin'))
        setDestination(placeFromSegment(editing, 'destination'))
        setCarrier(editing.carrier ?? '')
        setRouteNumber(editing.routeNumber ?? '')
        setConfirmation(editing.confirmation ?? '')
      } else if (editing.kind === 'hotel') {
        setLocation(placeFromSegment(editing))
        setConfirmation(editing.confirmation ?? '')
      } else {
        setLocation(placeFromSegment(editing))
        setParentHotelId(editing.parentSegmentId ?? '')
        setCategory(editing.category ?? 'restaurant')
      }
    } else {
      setKind(initialKind)
      setMode('flight')
      setOrigin(null)
      setDestination(null)
      setLocation(null)
      setStartLocal(`${trip.startDate}T09:00`)
      setEndLocal(`${trip.startDate}T12:00`)
      setCarrier('')
      setRouteNumber('')
      setConfirmation('')
      setParentHotelId(defaultParentHotelId ?? hotels[0]?.id ?? '')
      setCategory('restaurant')
      setNotes('')
    }
  }, [open, editing, initialKind, trip, defaultParentHotelId, hotels])

  const title = editing
    ? `Edit ${kind === 'travel' ? mode : kind}`
    : `New ${kind === 'travel' ? mode : kind}`

  const submit = async () => {
    setError(null)
    if (!startLocal || !endLocal) {
      setError('Start and end times are required')
      return
    }
    const startUtc = localInputToUtc(startLocal)
    const endUtc = localInputToUtc(endLocal)
    if (new Date(endUtc).getTime() < new Date(startUtc).getTime()) {
      setError('End must be after start')
      return
    }
    setSubmitting(true)
    try {
      if (kind === 'travel') {
        if (!origin || !destination) {
          setError('Origin and destination required')
          return
        }
        const payload = {
          tripId: trip.id,
          kind: 'travel' as const,
          mode,
          startUtc,
          endUtc,
          origin: stripPlace(origin),
          destination: stripPlace(destination),
          carrier: carrier || undefined,
          routeNumber: routeNumber || undefined,
          confirmation: confirmation || undefined,
          notes: notes || undefined,
        }
        if (editing) await updateSegment(editing.id, payload)
        else await addSegment(payload)
      } else if (kind === 'hotel') {
        if (!location) {
          setError('Location required')
          return
        }
        const payload = {
          tripId: trip.id,
          kind: 'hotel' as const,
          startUtc,
          endUtc,
          location: stripPlace(location),
          confirmation: confirmation || undefined,
          notes: notes || undefined,
        }
        if (editing) await updateSegment(editing.id, payload)
        else await addSegment(payload)
      } else {
        if (!location) {
          setError('Location required')
          return
        }
        const payload = {
          tripId: trip.id,
          kind: 'poi' as const,
          startUtc,
          endUtc,
          location: stripPlace(location),
          parentSegmentId: parentHotelId || undefined,
          category,
          notes: notes || undefined,
        }
        if (editing) await updateSegment(editing.id, payload)
        else await addSegment(payload)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  const tabs = useMemo(() => (['travel', 'hotel', 'poi'] as Kind[]), [])

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {!editing && (
        <div className="mb-4 flex gap-1 rounded-md bg-white/5 p-1 text-sm">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setKind(t)}
              className={`flex-1 rounded px-2 py-1 capitalize transition-colors ${
                kind === t ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              {t === 'poi' ? 'Place of interest' : t}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-3"
      >
        {kind === 'travel' && (
          <>
            <div className="flex gap-1.5">
              {MODES.map((m) => {
                const on = mode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                      on
                        ? 'border-blue-400/60 bg-blue-400/15 text-blue-100'
                        : 'border-white/15 bg-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    <span className="mr-1.5">{m.icon}</span>
                    {m.label}
                  </button>
                )
              })}
            </div>
            <Field label="From">
              <PlaceSearch
                value={origin}
                onChange={setOrigin}
                placeholder={
                  mode === 'flight' ? 'e.g. SFO, San Francisco' : 'Start address or place'
                }
              />
            </Field>
            <Field label="To">
              <PlaceSearch
                value={destination}
                onChange={setDestination}
                placeholder={mode === 'flight' ? 'e.g. HND, Tokyo' : 'End address or place'}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={carrierLabel(mode)}>
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </Field>
              <Field label={routeLabel(mode)}>
                <Input
                  value={routeNumber}
                  onChange={(e) => setRouteNumber(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Confirmation">
              <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
          </>
        )}

        {kind === 'hotel' && (
          <>
            <Field label="Hotel">
              <PlaceSearch value={location} onChange={setLocation} placeholder="Hotel name or address" />
            </Field>
            <Field label="Confirmation">
              <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
          </>
        )}

        {kind === 'poi' && (
          <>
            <Field label="Place">
              <PlaceSearch value={location} onChange={setLocation} placeholder="Restaurant, museum, …" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PoiCategory)}
                  className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm capitalize"
                >
                  {POI_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-zinc-900 capitalize">
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Anchor hotel">
                <select
                  value={parentHotelId}
                  onChange={(e) => setParentHotelId(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
                >
                  <option value="" className="bg-zinc-900">
                    None
                  </option>
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id} className="bg-zinc-900">
                      {h.location.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              kind === 'travel'
                ? mode === 'flight'
                  ? 'Depart'
                  : 'Start'
                : kind === 'hotel'
                  ? 'Check-in'
                  : 'Start'
            }
          >
            <Input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </Field>
          <Field
            label={
              kind === 'travel'
                ? mode === 'flight'
                  ? 'Arrive'
                  : 'End'
                : kind === 'hotel'
                  ? 'Check-out'
                  : 'End'
            }
          >
            <Input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40 resize-none"
          />
        </Field>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-white/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : editing ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-wide text-white/50">{label}</div>
      {children}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40 ${props.className ?? ''}`}
    />
  )
}

function stripPlace(p: PhotonResult) {
  return {
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    placeId: p.placeId,
  }
}
