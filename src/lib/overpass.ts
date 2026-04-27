// Overpass API — query OpenStreetMap data. Free, no key, but rate-limited.
// We use it to find POIs near a hotel (restaurants, museums, etc).
import type { PoiCategory } from './types'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export interface OverpassResult {
  id: string // "node/123" — stable OSM identifier
  name: string
  lat: number
  lng: number
  category: PoiCategory
  tags: Record<string, string>
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const CATEGORY_FILTERS: Record<PoiCategory, string[]> = {
  restaurant: ['["amenity"="restaurant"]'],
  cafe: ['["amenity"="cafe"]'],
  bar: ['["amenity"="bar"]', '["amenity"="pub"]'],
  museum: ['["tourism"="museum"]', '["tourism"="gallery"]'],
  attraction: ['["tourism"="attraction"]', '["tourism"="viewpoint"]'],
  park: ['["leisure"="park"]', '["leisure"="garden"]'],
  shop: ['["shop"]'],
  other: [],
}

export async function searchNearby(
  opts: {
    lat: number
    lng: number
    radius: number
    categories: PoiCategory[]
  },
  signal?: AbortSignal,
): Promise<OverpassResult[]> {
  const queries: string[] = []
  for (const cat of opts.categories) {
    for (const filter of CATEGORY_FILTERS[cat] ?? []) {
      queries.push(
        `node${filter}(around:${opts.radius},${opts.lat},${opts.lng});`,
      )
      queries.push(
        `way${filter}(around:${opts.radius},${opts.lat},${opts.lng});`,
      )
    }
  }
  if (queries.length === 0) return []

  const body = `[out:json][timeout:25];(${queries.join('')});out center 80;`
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(body),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const data = (await res.json()) as { elements: OverpassElement[] }

  const results: OverpassResult[] = []
  const seen = new Set<string>()
  for (const el of data.elements) {
    const tags = el.tags ?? {}
    const name = tags.name
    if (!name) continue
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    const id = `${el.type}/${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    results.push({
      id,
      name,
      lat,
      lng,
      category: classify(tags),
      tags,
    })
  }
  return results
}

function classify(tags: Record<string, string>): PoiCategory {
  if (tags.amenity === 'restaurant') return 'restaurant'
  if (tags.amenity === 'cafe') return 'cafe'
  if (tags.amenity === 'bar' || tags.amenity === 'pub') return 'bar'
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum'
  if (tags.tourism === 'attraction' || tags.tourism === 'viewpoint')
    return 'attraction'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park'
  if (tags.shop) return 'shop'
  return 'other'
}
