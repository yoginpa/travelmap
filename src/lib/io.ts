import { db } from './db'
import type { Segment, Trip } from './types'

export const FORMAT_TAG = 'travel-app/itinerary'
export const FORMAT_VERSION = 1

export interface ExportData {
  format: typeof FORMAT_TAG
  version: number
  exportedAt: string
  trips: Trip[]
  segments: Segment[]
}

export async function buildExport(): Promise<ExportData> {
  const [trips, segments] = await Promise.all([
    db.trips.toArray(),
    db.segments.toArray(),
  ])
  return {
    format: FORMAT_TAG,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    trips,
    segments,
  }
}

export function downloadJson(data: ExportData, filename?: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? defaultFilename()
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click handler's tick so Safari doesn't drop the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function defaultFilename(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `travel-app-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

export type ValidationResult =
  | { ok: true; data: ExportData }
  | { ok: false; error: string }

export function validateImport(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'File is not a JSON object.' }
  }
  const r = raw as Record<string, unknown>
  if (r.format !== FORMAT_TAG) {
    return {
      ok: false,
      error: `Not a travel-app export (format = ${JSON.stringify(r.format)}).`,
    }
  }
  if (typeof r.version !== 'number') {
    return { ok: false, error: 'Missing or invalid `version`.' }
  }
  if (r.version > FORMAT_VERSION) {
    return {
      ok: false,
      error: `File was exported by a newer version (${r.version}). This app supports up to ${FORMAT_VERSION}.`,
    }
  }
  if (!Array.isArray(r.trips)) {
    return { ok: false, error: 'Missing `trips` array.' }
  }
  if (!Array.isArray(r.segments)) {
    return { ok: false, error: 'Missing `segments` array.' }
  }
  // Light shape check on a couple of fields — full type validation would
  // require duplicating the schema, and any malformed records would just
  // fail to render rather than corrupt the DB.
  for (const t of r.trips) {
    if (typeof (t as Trip).id !== 'string' || typeof (t as Trip).name !== 'string') {
      return { ok: false, error: 'A trip is missing required fields.' }
    }
  }
  for (const s of r.segments) {
    const seg = s as Segment
    if (typeof seg.id !== 'string' || typeof seg.tripId !== 'string') {
      return { ok: false, error: 'A segment is missing required fields.' }
    }
    const k = (s as { kind?: unknown }).kind
    if (k !== 'travel' && k !== 'hotel' && k !== 'poi') {
      return { ok: false, error: `Unknown segment kind: ${String(k)}.` }
    }
  }
  return { ok: true, data: r as unknown as ExportData }
}
