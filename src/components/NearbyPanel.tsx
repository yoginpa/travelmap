import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { searchNearby, type OverpassResult } from '../lib/overpass'
import { useTripStore } from '../lib/store'
import type { HotelSegment, NewPoiInput, PoiCategory } from '../lib/types'

interface Props {
  open: boolean
  hotel: HotelSegment | null
  onClose: () => void
}

const ALL_CATS: PoiCategory[] = [
  'restaurant',
  'cafe',
  'bar',
  'museum',
  'attraction',
  'park',
  'shop',
]

const RADII = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
]

export function NearbyPanel({ open, hotel, onClose }: Props) {
  const addSegment = useTripStore((s) => s.addSegment)
  const segments = useTripStore((s) => s.segments)

  const [categories, setCategories] = useState<PoiCategory[]>(['restaurant', 'cafe', 'museum'])
  const [radius, setRadius] = useState(1000)
  const [results, setResults] = useState<OverpassResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const existingPlaceIds = useMemo(() => {
    if (!hotel) return new Set<string>()
    return new Set(
      segments
        .filter((s) => s.tripId === hotel.tripId && s.kind === 'poi')
        .map((s) => (s.kind === 'poi' ? s.location.placeId : null))
        .filter((id): id is string => !!id),
    )
  }, [segments, hotel])

  useEffect(() => {
    if (!open || !hotel) return
    if (categories.length === 0) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    abortRef.current?.abort()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    searchNearby(
      { lat: hotel.location.lat, lng: hotel.location.lng, radius, categories },
      ctrl.signal,
    )
      .then((rs) => {
        if (!ctrl.signal.aborted) setResults(rs)
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error(err)
          setError('Could not load places. Try again in a moment.')
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [open, hotel, radius, categories])

  const toggleCat = (c: PoiCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const addAsPoi = async (r: OverpassResult) => {
    if (!hotel) return
    const payload: NewPoiInput = {
      tripId: hotel.tripId,
      kind: 'poi',
      // Default to a 1-hour visit on the day of check-in. User can edit later.
      startUtc: hotel.startUtc,
      endUtc: new Date(new Date(hotel.startUtc).getTime() + 60 * 60 * 1000).toISOString(),
      location: {
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        placeId: r.id,
      },
      parentSegmentId: hotel.id,
      category: r.category,
    }
    await addSegment(payload)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hotel ? `Near ${hotel.location.name}` : 'Nearby'}
      width="max-w-xl"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {ALL_CATS.map((c) => {
            const on = categories.includes(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCat(c)}
                className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
                  on
                    ? 'border-emerald-300/60 bg-emerald-300/15 text-emerald-200'
                    : 'border-white/15 bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/60">
          <span>Radius:</span>
          {RADII.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRadius(r.value)}
              className={`rounded px-2 py-0.5 ${
                radius === r.value
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto rounded-md border border-white/10">
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-white/50">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-white/50">
              {categories.length === 0
                ? 'Pick at least one category.'
                : 'No places found at this radius.'}
            </div>
          ) : (
            <ul>
              {results.map((r) => {
                const already = existingPlaceIds.has(r.id)
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate">{r.name}</div>
                      <div className="text-[10px] uppercase tracking-wide text-emerald-300/70">
                        {r.category}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => void addAsPoi(r)}
                      className="shrink-0 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                    >
                      {already ? 'Added' : 'Add'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
