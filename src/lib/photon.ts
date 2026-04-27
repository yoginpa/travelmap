// Photon — open-source geocoder by Komoot, OSM-based, free, no API key required.
// Docs: https://photon.komoot.io
const PHOTON_URL = 'https://photon.komoot.io/api/'

export interface PhotonResult {
  name: string
  lat: number
  lng: number
  address?: string
  placeId?: string
  countryCode?: string
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    city?: string
    state?: string
    country?: string
    countrycode?: string
    osm_type?: string
    osm_id?: number
    type?: string
  }
}

// Simple LRU-ish in-memory cache so retyped queries are instant.
// Lives for the page session only; that's plenty given Photon results are stable.
const cache = new Map<string, PhotonResult[]>()
const CACHE_LIMIT = 200

export async function searchPhoton(
  query: string,
  signal?: AbortSignal,
): Promise<PhotonResult[]> {
  const key = query.trim().toLowerCase()
  if (key.length < 2) return []
  const cached = cache.get(key)
  if (cached) {
    // Refresh recency by re-inserting
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }
  const url = new URL(PHOTON_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('lang', 'en')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  const results = data.features.map(toResult)
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, results)
  return results
}

function toResult(f: PhotonFeature): PhotonResult {
  const p = f.properties
  const street =
    p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street
  const parts = [street, p.city, p.state, p.country].filter(Boolean)
  return {
    name: p.name ?? p.street ?? p.city ?? 'Unnamed',
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    address: parts.join(', ') || undefined,
    placeId:
      p.osm_type && p.osm_id != null ? `${p.osm_type}/${p.osm_id}` : undefined,
    countryCode: p.countrycode,
  }
}
