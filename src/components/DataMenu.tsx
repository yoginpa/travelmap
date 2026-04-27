import { useRef, useState } from 'react'
import { useTripStore } from '../lib/store'
import {
  buildExport,
  downloadJson,
  validateImport,
  type ExportData,
} from '../lib/io'
import { Modal } from './Modal'

export function DataMenu() {
  const replaceAll = useTripStore((s) => s.replaceAll)
  const mergeImport = useTripStore((s) => s.mergeImport)
  const trips = useTripStore((s) => s.trips)
  const segments = useTripStore((s) => s.segments)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ExportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    try {
      const data = await buildExport()
      downloadJson(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const raw = JSON.parse(text)
      const result = validateImport(raw)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPending(result.data)
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? 'Could not parse file as JSON.'
          : e instanceof Error
            ? e.message
            : 'Failed to read file',
      )
    }
  }

  const applyReplace = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await replaceAll({ trips: pending.trips, segments: pending.segments })
      setPending(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const applyMerge = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await mergeImport({ trips: pending.trips, segments: pending.segments })
      setPending(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const overlapTrips = pending
    ? pending.trips.filter((t) => trips.some((existing) => existing.id === t.id)).length
    : 0
  const overlapSegments = pending
    ? pending.segments.filter((s) => segments.some((existing) => existing.id === s.id)).length
    : 0

  return (
    <div className="flex items-center gap-2 text-xs text-white/60">
      <button
        type="button"
        onClick={handleExport}
        className="rounded border border-white/15 bg-white/5 px-2 py-1 hover:bg-white/10 hover:text-white"
      >
        Export
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="rounded border border-white/15 bg-white/5 px-2 py-1 hover:bg-white/10 hover:text-white"
      >
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          // Reset so picking the same file again still triggers onChange.
          e.target.value = ''
        }}
      />

      {error && (
        <Modal open onClose={() => setError(null)} title="Import problem">
          <p className="text-sm text-red-300">{error}</p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              OK
            </button>
          </div>
        </Modal>
      )}

      {pending && (
        <Modal
          open
          onClose={() => (busy ? null : setPending(null))}
          title="Import itinerary"
        >
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-white">
                {pending.trips.length} trip{pending.trips.length === 1 ? '' : 's'} ·{' '}
                {pending.segments.length} segment
                {pending.segments.length === 1 ? '' : 's'}
              </div>
              <div className="mt-1 text-xs text-white/60">
                Exported {new Date(pending.exportedAt).toLocaleString()}
              </div>
            </div>

            {trips.length > 0 && (
              <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                You have <strong>{trips.length}</strong> existing trip
                {trips.length === 1 ? '' : 's'} ({segments.length} segment
                {segments.length === 1 ? '' : 's'}).{' '}
                {overlapTrips + overlapSegments > 0 && (
                  <>
                    {overlapTrips} trip{overlapTrips === 1 ? '' : 's'} and{' '}
                    {overlapSegments} segment{overlapSegments === 1 ? '' : 's'} share IDs with
                    items in this file.
                  </>
                )}
              </div>
            )}

            <p className="text-xs text-white/60">
              <strong className="text-white">Replace</strong> wipes everything in this device's
              storage and applies the file.{' '}
              <strong className="text-white">Merge</strong> keeps existing items and overwrites
              any with the same ID using the imported version.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-white/70 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyMerge()}
                disabled={busy}
                className="rounded-md bg-blue-500 px-3 py-1.5 font-medium text-white hover:bg-blue-400 disabled:opacity-50"
              >
                {busy ? 'Merging…' : 'Merge'}
              </button>
              <button
                type="button"
                onClick={() => void applyReplace()}
                disabled={busy}
                className="rounded-md bg-red-500 px-3 py-1.5 font-medium text-white hover:bg-red-400 disabled:opacity-50"
              >
                {busy ? 'Replacing…' : 'Replace all'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
