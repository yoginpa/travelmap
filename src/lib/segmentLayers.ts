import { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl'
import { toMs } from './time'
import type { Segment, TransportMode } from './types'

const SRC = {
  flights: 'segments-flights',
  flightsEndpoints: 'segments-flights-endpoints',
  hotels: 'segments-hotels',
  pois: 'segments-pois',
} as const

const LYR = {
  flightsLine: 'segments-flights-line',
  flightsEndpoints: 'segments-flights-endpoints',
  hotelsCircle: 'segments-hotels-circle',
  poisCircle: 'segments-pois-circle',
} as const

// Gradient endpoints: origin → destination across line, endpoints, and arrows.
const ORIGIN_COLOR = '#60a5fa' // light blue — "departure"
const DEST_COLOR = '#f472b6' // rose — "arrival"

const emptyFC = () =>
  ({ type: 'FeatureCollection', features: [] }) as GeoJSON.FeatureCollection

// Paint expressions key off feature property `state`: 'past' | 'active' | 'future' | 'none'
const stateOpacity = (active: number, dim: number) =>
  ['match', ['get', 'state'], 'active', active, 'none', dim, dim] as unknown

export function addSegmentLayers(map: MlMap): void {
  if (!map.getSource(SRC.flights)) {
    // The line source is kept (in case we want to re-enable a surface trace),
    // but the rendering of elevated flight arcs is now handled by the canvas
    // overlay (drawElevatedArcs) — globe projection in MapLibre v5 doesn't
    // support `line-z-offset`, so a stock line layer can't lift the path.
    map.addSource(SRC.flights, { type: 'geojson', data: emptyFC() })
    map.addLayer({
      id: LYR.flightsLine,
      type: 'line',
      source: SRC.flights,
      paint: {
        'line-color': '#60a5fa',
        'line-width': 2,
        'line-opacity': 0, // hidden; canvas overlay draws the elevated arc instead
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
  }

  if (!map.getSource(SRC.flightsEndpoints)) {
    map.addSource(SRC.flightsEndpoints, { type: 'geojson', data: emptyFC() })
    map.addLayer({
      id: LYR.flightsEndpoints,
      type: 'circle',
      source: SRC.flightsEndpoints,
      paint: {
        'circle-radius': 5,
        'circle-color': [
          'match',
          ['get', 'role'],
          'origin',
          ORIGIN_COLOR,
          'destination',
          DEST_COLOR,
          ORIGIN_COLOR,
        ] as never,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': stateOpacity(1.0, 0.4) as never,
        'circle-stroke-opacity': stateOpacity(1.0, 0.4) as never,
      },
    })
  }

  if (!map.getSource(SRC.hotels)) {
    map.addSource(SRC.hotels, { type: 'geojson', data: emptyFC() })
    map.addLayer({
      id: LYR.hotelsCircle,
      type: 'circle',
      source: SRC.hotels,
      paint: {
        'circle-radius': [
          'match',
          ['get', 'state'],
          'active',
          10,
          7,
        ] as never,
        'circle-color': '#f59e0b',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': stateOpacity(1.0, 0.45) as never,
        'circle-stroke-opacity': stateOpacity(1.0, 0.45) as never,
      },
    })
  }

  if (!map.getSource(SRC.pois)) {
    map.addSource(SRC.pois, { type: 'geojson', data: emptyFC() })
    map.addLayer({
      id: LYR.poisCircle,
      type: 'circle',
      source: SRC.pois,
      paint: {
        'circle-radius': [
          'match',
          ['get', 'state'],
          'active',
          6,
          4,
        ] as never,
        'circle-color': '#10b981',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        // POIs without an active parent hotel are very dim — they hint at "future plans"
        // without crowding the active scene.
        'circle-opacity': stateOpacity(1.0, 0.2) as never,
        'circle-stroke-opacity': stateOpacity(1.0, 0.2) as never,
      },
    })
  }

  // Flight arrows are drawn on the canvas overlay (drawElevatedArcs) so they
  // ride along the lifted line instead of sitting on the surface.
}

// Cached great-circle paths so the per-frame arrow update doesn't recompute them.
const arcCache = new Map<string, number[][]>()
function getArc(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): number[][] {
  const key = `${origin.lng.toFixed(4)},${origin.lat.toFixed(4)}|${destination.lng.toFixed(4)},${destination.lat.toFixed(4)}`
  let arc = arcCache.get(key)
  if (!arc) {
    arc = greatCircleArc(
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
      96,
    )
    arcCache.set(key, arc)
  }
  return arc
}

const ARROWS_PER_FLIGHT = 6
const ARROW_CYCLE_MS = 5000

// All icons render with their natural "forward" direction pointing UP (-y).
// Caller rotates by the velocity-vector angle + π/2 so the front aligns with motion.

function drawFlightIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -size * 0.55)
  ctx.lineTo(size * 0.45, size * 0.4)
  ctx.lineTo(0, size * 0.18)
  ctx.lineTo(-size * 0.45, size * 0.4)
  ctx.closePath()
  ctx.fill()
}

function drawCarIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color
  const w = size * 0.55
  const h = size * 0.85
  const r = size * 0.16
  // Rounded rectangle (top-down car silhouette) with a subtly tapered front.
  ctx.beginPath()
  ctx.moveTo(-w / 2 + r, h / 2)
  ctx.lineTo(w / 2 - r, h / 2)
  ctx.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - r)
  ctx.lineTo(w / 2 - size * 0.04, -h / 2 + r)
  ctx.quadraticCurveTo(
    w / 2 - size * 0.02,
    -h / 2,
    w / 2 - r - size * 0.02,
    -h / 2,
  )
  ctx.lineTo(-w / 2 + r + size * 0.02, -h / 2)
  ctx.quadraticCurveTo(
    -w / 2 + size * 0.02,
    -h / 2,
    -w / 2 + size * 0.04,
    -h / 2 + r,
  )
  ctx.lineTo(-w / 2, h / 2 - r)
  ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2 + r, h / 2)
  ctx.closePath()
  ctx.fill()
}

function drawTransitIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color
  const w = size * 0.5
  const h = size * 1.15
  const r = size * 0.13
  ctx.beginPath()
  ctx.moveTo(-w / 2 + r, h / 2)
  ctx.lineTo(w / 2 - r, h / 2)
  ctx.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - r)
  ctx.lineTo(w / 2, -h / 2 + r)
  ctx.quadraticCurveTo(w / 2, -h / 2, w / 2 - r, -h / 2)
  ctx.lineTo(-w / 2 + r, -h / 2)
  ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2, -h / 2 + r)
  ctx.lineTo(-w / 2, h / 2 - r)
  ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2 + r, h / 2)
  ctx.closePath()
  ctx.fill()
  // Two horizontal stripes evoke train/bus windows.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  const sw = w * 0.7
  ctx.fillRect(-sw / 2, -size * 0.18, sw, size * 0.06)
  ctx.fillRect(-sw / 2, size * 0.06, sw, size * 0.06)
}

function drawIconForMode(
  ctx: CanvasRenderingContext2D,
  mode: TransportMode,
  x: number,
  y: number,
  rotation: number,
  size: number,
  color: string,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  if (mode === 'flight') drawFlightIcon(ctx, size, color)
  else if (mode === 'car') drawCarIcon(ctx, size, color)
  else drawTransitIcon(ctx, size, color)
  ctx.restore()
}

type State = 'past' | 'active' | 'future' | 'none'

function classify(currentMs: number, startMs: number, endMs: number): State {
  if (currentMs < startMs) return 'future'
  if (currentMs > endMs) return 'past'
  return 'active'
}

export function updateSegmentData(
  map: MlMap,
  segments: Segment[],
  currentMs: number,
): void {
  const flightFeatures: GeoJSON.Feature[] = []
  const flightEndpointFeatures: GeoJSON.Feature[] = []
  const hotelFeatures: GeoJSON.Feature[] = []
  const poiFeatures: GeoJSON.Feature[] = []

  // Index hotels by id for POI parent lookup
  const hotelById = new Map<string, { startMs: number; endMs: number }>()
  for (const seg of segments) {
    if (seg.kind === 'hotel') {
      hotelById.set(seg.id, {
        startMs: toMs(seg.startUtc),
        endMs: toMs(seg.endUtc),
      })
    }
  }

  for (const seg of segments) {
    const startMs = toMs(seg.startUtc)
    const endMs = toMs(seg.endUtc)

    if (seg.kind === 'travel') {
      const state = classify(currentMs, startMs, endMs)
      // The hidden line layer doesn't actually render (canvas overlay does),
      // but we keep the chunked feature generation for hit-testing later.
      const arc = getArc(seg.origin, seg.destination)
      const N_CHUNKS = 24
      const stepFloat = (arc.length - 1) / N_CHUNKS
      for (let i = 0; i < N_CHUNKS; i++) {
        const startIdx = Math.floor(i * stepFloat)
        const endIdx = Math.min(arc.length - 1, Math.floor((i + 1) * stepFloat))
        if (endIdx <= startIdx) continue
        const coords = arc.slice(startIdx, endIdx + 1)
        flightFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            id: `${seg.id}:chunk:${i}`,
            travelId: seg.id,
            mode: seg.mode,
            state,
            progress: (i + 0.5) / N_CHUNKS,
            startMs,
            endMs,
          },
        })
      }
      flightEndpointFeatures.push(
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [seg.origin.lng, seg.origin.lat] },
          properties: { id: `${seg.id}:origin`, state, role: 'origin', name: seg.origin.name },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [seg.destination.lng, seg.destination.lat] },
          properties: {
            id: `${seg.id}:dest`,
            state,
            role: 'destination',
            name: seg.destination.name,
          },
        },
      )
    } else if (seg.kind === 'hotel') {
      const state = classify(currentMs, startMs, endMs)
      hotelFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [seg.location.lng, seg.location.lat] },
        properties: { id: seg.id, state, name: seg.location.name },
      })
    } else {
      // POI: "active" if its parent hotel is active OR if its own window contains current time.
      let state: State
      if (seg.parentSegmentId && hotelById.has(seg.parentSegmentId)) {
        const h = hotelById.get(seg.parentSegmentId)!
        state = currentMs >= h.startMs && currentMs <= h.endMs ? 'active' : 'none'
      } else {
        state = classify(currentMs, startMs, endMs)
      }
      poiFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [seg.location.lng, seg.location.lat] },
        properties: {
          id: seg.id,
          state,
          name: seg.location.name,
          category: seg.category ?? 'other',
        },
      })
    }
  }

  setSourceData(map, SRC.flights, flightFeatures)
  setSourceData(map, SRC.flightsEndpoints, flightEndpointFeatures)
  setSourceData(map, SRC.hotels, hotelFeatures)
  setSourceData(map, SRC.pois, poiFeatures)
}

function setSourceData(map: MlMap, sourceId: string, features: GeoJSON.Feature[]) {
  const src = map.getSource(sourceId) as GeoJSONSource | undefined
  if (!src) return
  src.setData({ type: 'FeatureCollection', features })
}

export function fitToSegments(map: MlMap, segments: Segment[]): void {
  if (segments.length === 0) return

  const points: Array<[number, number]> = []
  for (const seg of segments) {
    if (seg.kind === 'travel') {
      const arc = greatCircleArc(
        [seg.origin.lng, seg.origin.lat],
        [seg.destination.lng, seg.destination.lat],
        16,
      )
      for (const p of arc) points.push([p[0], p[1]])
    } else {
      points.push([seg.location.lng, seg.location.lat])
    }
  }
  if (points.length === 0) return

  const center = sphericalCentroid(points)
  const spreadRad = points.reduce(
    (max, p) => Math.max(max, angularDistance(center, p)),
    0,
  )
  const zoom = zoomForSpreadDeg((spreadRad * 180) / Math.PI)
  map.flyTo({ center, zoom, duration: 1500, essential: true })
}

function sphericalCentroid(points: Array<[number, number]>): [number, number] {
  let x = 0
  let y = 0
  let z = 0
  for (const [lng, lat] of points) {
    const lngRad = (lng * Math.PI) / 180
    const latRad = (lat * Math.PI) / 180
    x += Math.cos(latRad) * Math.cos(lngRad)
    y += Math.cos(latRad) * Math.sin(lngRad)
    z += Math.sin(latRad)
  }
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < 1e-9) return [points[0][0], points[0][1]]
  x /= len
  y /= len
  z /= len
  const lat = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI
  const lng = (Math.atan2(y, x) * 180) / Math.PI
  return [lng, lat]
}

function angularDistance(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const dLng = toRad(b[0] - a[0])
  const cosD =
    Math.sin(lat1) * Math.sin(lat2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return Math.acos(Math.max(-1, Math.min(1, cosD)))
}

function zoomForSpreadDeg(deg: number): number {
  if (deg > 90) return 1
  if (deg > 60) return 1.4
  if (deg > 30) return 2
  if (deg > 15) return 3
  if (deg > 7) return 4.5
  if (deg > 3) return 6
  if (deg > 1) return 8
  return 10
}

// Hex → [r, g, b] (assumes "#rrggbb")
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

const ORIGIN_RGB = hexToRgb(ORIGIN_COLOR)
const DEST_RGB = hexToRgb(DEST_COLOR)

function lerpRgba(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
  alpha: number,
): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bb = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgba(${r},${g},${bb},${alpha})`
}

/**
 * Render flight arcs and their animated chevrons on a 2D canvas overlay,
 * lifting each vertex in screen-space by a sin-curve so the path bows above
 * the surface like a flight tracker. Chevrons ride along the same lifted
 * curve and rotate to match the on-screen tangent.
 */
export function drawElevatedArcs(
  map: MlMap,
  canvas: HTMLCanvasElement,
  segments: Segment[],
  currentMs: number,
  frameTime: number,
): void {
  const dpr = window.devicePixelRatio || 1
  const mapCanvas = map.getCanvas()
  const w = mapCanvas.clientWidth
  const h = mapCanvas.clientHeight
  if (w === 0 || h === 0) return
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const phase = (frameTime % ARROW_CYCLE_MS) / ARROW_CYCLE_MS

  for (const seg of segments) {
    if (seg.kind !== 'travel') continue
    const arc = getArc(seg.origin, seg.destination)
    const state = classify(currentMs, toMs(seg.startUtc), toMs(seg.endUtc))

    // Project every arc vertex to screen space.
    const projected: Array<{ x: number; y: number; t: number }> = []
    for (let i = 0; i < arc.length; i++) {
      const sp = map.project([arc[i][0], arc[i][1]])
      projected.push({ x: sp.x, y: sp.y, t: i / (arc.length - 1) })
    }

    const dx = projected[projected.length - 1].x - projected[0].x
    const dy = projected[projected.length - 1].y - projected[0].y
    const chordPx = Math.sqrt(dx * dx + dy * dy)
    // Elevation: flights bow up like a flight tracker; ground modes stay on
    // (or near) the surface — they're not actually airborne.
    const peakElev =
      seg.mode === 'flight'
        ? Math.min(180, Math.max(20, chordPx * 0.18))
        : 0

    const elevated = projected.map((p) => ({
      x: p.x,
      y: p.y - Math.sin(p.t * Math.PI) * peakElev,
      t: p.t,
    }))

    const baseOpacity =
      state === 'active' ? 1.0 : state === 'past' ? 0.5 : 0.75
    const lineWidth = state === 'active' ? 3.5 : 2.5

    // ---- Line ----
    // Ground modes: dashed line — we don't have routing, so the path is a
    // great-circle approximation. The dashes signal "approximate."
    if (seg.mode === 'flight') {
      ctx.setLineDash([])
    } else {
      ctx.setLineDash([8, 6])
    }
    ctx.lineWidth = lineWidth
    for (let i = 0; i < elevated.length - 1; i++) {
      const a = elevated[i]
      const b = elevated[i + 1]
      const tMid = (a.t + b.t) / 2
      ctx.strokeStyle = lerpRgba(ORIGIN_RGB, DEST_RGB, tMid, baseOpacity)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // ---- Animated icons riding the path ----
    const arrowOpacity =
      state === 'active' ? 1.0 : state === 'past' ? 0.45 : 0.75
    const baseSize = state === 'active' ? 18 : 13

    const TANGENT_WINDOW = 4
    const lastIdx = elevated.length - 1

    for (let i = 0; i < ARROWS_PER_FLIGHT; i++) {
      const t = (i / ARROWS_PER_FLIGHT + phase) % 1
      if (t < 0.06 || t > 0.94) continue

      const idx = t * lastIdx
      const i0 = Math.floor(idx)
      const i1 = Math.min(lastIdx, i0 + 1)
      const f = idx - i0
      const x = elevated[i0].x + (elevated[i1].x - elevated[i0].x) * f
      const y = elevated[i0].y + (elevated[i1].y - elevated[i0].y) * f

      const center = Math.round(idx)
      const tA = elevated[Math.max(0, center - TANGENT_WINDOW)]
      const tB = elevated[Math.min(lastIdx, center + TANGENT_WINDOW)]
      const rotation = Math.atan2(tB.y - tA.y, tB.x - tA.x) + Math.PI / 2

      const sizeAlongPath = 0.5 + 0.8 * Math.sin(t * Math.PI)
      const pulse = 0.85 + 0.15 * Math.sin(frameTime * 0.001 + i * 0.7)
      const size = baseSize * sizeAlongPath * pulse
      const color = lerpRgba(ORIGIN_RGB, DEST_RGB, t, arrowOpacity)
      drawIconForMode(ctx, seg.mode, x, y, rotation, size, color)
    }
  }
}

export function greatCircleArc(
  start: [number, number],
  end: [number, number],
  steps = 64,
): number[][] {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (d: number) => (d * 180) / Math.PI

  const lng1 = toRad(start[0])
  const lat1 = toRad(start[1])
  const lng2 = toRad(end[0])
  const lat2 = toRad(end[1])

  const x1 = Math.cos(lat1) * Math.cos(lng1)
  const y1 = Math.cos(lat1) * Math.sin(lng1)
  const z1 = Math.sin(lat1)
  const x2 = Math.cos(lat2) * Math.cos(lng2)
  const y2 = Math.cos(lat2) * Math.sin(lng2)
  const z2 = Math.sin(lat2)

  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2))
  const omega = Math.acos(dot)
  if (omega < 1e-9) return [start, end]
  const sinOmega = Math.sin(omega)

  const points: number[][] = []
  let prevLngDeg: number | null = null
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = Math.sin((1 - t) * omega) / sinOmega
    const b = Math.sin(t * omega) / sinOmega
    const x = a * x1 + b * x2
    const y = a * y1 + b * y2
    const z = a * z1 + b * z2
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y))
    let lngDeg = toDeg(Math.atan2(y, x))
    if (prevLngDeg !== null) {
      while (lngDeg - prevLngDeg > 180) lngDeg -= 360
      while (lngDeg - prevLngDeg < -180) lngDeg += 360
    }
    prevLngDeg = lngDeg
    points.push([lngDeg, toDeg(lat)])
  }
  return points
}
