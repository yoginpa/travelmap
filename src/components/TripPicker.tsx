import { useEffect, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import 'react-day-picker/style.css'
import { useTripStore } from '../lib/store'
import type { Trip } from '../lib/types'
import { Modal } from './Modal'

export function TripPicker({ activeTrip, trips }: { activeTrip: Trip | null; trips: Trip[] }) {
  const setActiveTrip = useTripStore((s) => s.setActiveTrip)
  const createTrip = useTripStore((s) => s.createTrip)
  const deleteTrip = useTripStore((s) => s.deleteTrip)

  const [showNew, setShowNew] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={activeTrip?.id ?? ''}
          onChange={(e) => setActiveTrip(e.target.value || null)}
          className="flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm"
          disabled={trips.length === 0}
        >
          {trips.length === 0 && (
            <option value="" className="bg-zinc-900">
              No trips yet
            </option>
          )}
          {trips.map((t) => (
            <option key={t.id} value={t.id} className="bg-zinc-900">
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-2 text-sm hover:bg-white/10"
          title="New trip"
        >
          +
        </button>
        {activeTrip && (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="rounded-md border border-white/15 bg-white/5 px-2.5 py-2 text-sm text-red-300 hover:bg-red-500/10"
            title="Delete trip"
          >
            ✕
          </button>
        )}
      </div>
      {activeTrip && (
        <div className="text-xs text-white/50">
          {activeTrip.startDate} → {activeTrip.endDate}
        </div>
      )}

      <NewTripModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreate={async (name, startDate, endDate) => {
          const t = await createTrip({ name, startDate, endDate })
          setActiveTrip(t.id)
        }}
      />

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete trip?">
        <p className="text-sm text-white/70">
          This will permanently delete{' '}
          <span className="font-medium text-white">{activeTrip?.name}</span> and all of its
          segments.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowDelete(false)}
            className="rounded-md px-3 py-1.5 text-sm text-white/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              if (activeTrip) await deleteTrip(activeTrip.id)
              setShowDelete(false)
            }}
            className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-400"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}

function NewTripModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string, startDate: string, endDate: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'calendar' | 'manual'>('calendar')
  const [range, setRange] = useState<DateRange | undefined>(undefined)
  const [startManual, setStartManual] = useState('')
  const [endManual, setEndManual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setMode('calendar')
      setRange(undefined)
      setStartManual('')
      setEndManual('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    let startDate: string
    let endDate: string
    if (mode === 'calendar') {
      if (!range?.from) {
        setError('Pick a start date on the calendar')
        return
      }
      startDate = formatYmd(range.from)
      endDate = formatYmd(range.to ?? range.from)
    } else {
      if (!startManual || !endManual) {
        setError('Both dates are required')
        return
      }
      if (endManual < startManual) {
        setError('End must be on or after start')
        return
      }
      startDate = startManual
      endDate = endManual
    }
    setSubmitting(true)
    try {
      await onCreate(name.trim(), startDate, endDate)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip')
    } finally {
      setSubmitting(false)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const summary =
    mode === 'calendar'
      ? rangeSummary(range)
      : startManual && endManual
        ? `${startManual} → ${endManual} · ${dayCount(startManual, endManual)} day${dayCount(startManual, endManual) === 1 ? '' : 's'}`
        : 'No dates picked yet'

  return (
    <Modal open={open} onClose={onClose} title="New trip" width="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <div className="mb-1 text-xs uppercase tracking-wide text-white/50">Name</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tokyo & Kyoto"
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          />
        </label>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <div className="text-xs uppercase tracking-wide text-white/50">Dates</div>
            <button
              type="button"
              onClick={() => setMode(mode === 'calendar' ? 'manual' : 'calendar')}
              className="text-xs text-white/50 hover:text-white"
            >
              {mode === 'calendar' ? 'Type dates instead' : 'Use calendar'}
            </button>
          </div>

          <div className="mb-2 text-sm text-white/80">{summary}</div>

          {mode === 'calendar' ? (
            <div className="rdp-wrapper rounded-md border border-white/10 bg-white/5 p-2">
              <DayPicker
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                pagedNavigation
                disabled={{ before: today }}
                showOutsideDays={false}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-wide text-white/50">Start</div>
                <input
                  type="date"
                  value={startManual}
                  onChange={(e) => {
                    setStartManual(e.target.value)
                    if (endManual && endManual < e.target.value) setEndManual(e.target.value)
                  }}
                  className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-wide text-white/50">End</div>
                <input
                  type="date"
                  value={endManual}
                  min={startManual || undefined}
                  onChange={(e) => setEndManual(e.target.value)}
                  disabled={!startManual}
                  className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40 disabled:opacity-40"
                />
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
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
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function formatYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function rangeSummary(range: DateRange | undefined): string {
  if (!range?.from) return 'Click a start date'
  if (!range.to || +range.to === +range.from) {
    return `${range.from.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · 1 day — click an end date to extend`
  }
  const days = Math.round((+range.to - +range.from) / (1000 * 60 * 60 * 24)) + 1
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(range.from)} → ${fmt(range.to)} · ${days} day${days === 1 ? '' : 's'}`
}

function dayCount(startStr: string, endStr: string): number {
  const s = new Date(`${startStr}T00:00:00`).getTime()
  const e = new Date(`${endStr}T00:00:00`).getTime()
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1)
}
