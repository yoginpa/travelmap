import { useTripStore } from '../lib/store'
import { fmtShortDateTime } from '../lib/time'
import type { Segment } from '../lib/types'

interface Props {
  segments: Segment[]
  onEdit: (s: Segment) => void
  onFindNearby: (hotelId: string) => void
}

export function SegmentList({ segments, onEdit, onFindNearby }: Props) {
  const deleteSegment = useTripStore((s) => s.deleteSegment)

  if (segments.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/50">
        No segments yet — add a flight or hotel to start.
      </div>
    )
  }

  return (
    <ul className="space-y-1.5">
      {segments.map((s) => (
        <li
          key={s.id}
          className="group rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:border-white/25"
        >
          <div className="flex items-start gap-2">
            <SegmentIcon segment={s} />
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{summary(s)}</div>
              <div className="truncate text-xs text-white/50">
                {fmtShortDateTime(new Date(s.startUtc).getTime())}
                {s.kind === 'hotel' || s.kind === 'travel'
                  ? ` → ${fmtShortDateTime(new Date(s.endUtc).getTime())}`
                  : ''}
              </div>
              {s.kind === 'poi' && s.category && (
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-emerald-300/80">
                  {s.category}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {s.kind === 'hotel' && (
                <button
                  type="button"
                  onClick={() => onFindNearby(s.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-emerald-300 hover:bg-emerald-300/10"
                  title="Find nearby places"
                >
                  ◎
                </button>
              )}
              <button
                type="button"
                onClick={() => onEdit(s)}
                className="rounded px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                title="Edit"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => void deleteSegment(s.id)}
                className="rounded px-1.5 py-0.5 text-xs text-red-300 hover:bg-red-500/10"
                title="Delete"
              >
                ✕
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function summary(s: Segment): string {
  if (s.kind === 'travel') {
    const route = s.routeNumber ? `${s.routeNumber} · ` : ''
    return `${route}${s.origin.name} → ${s.destination.name}`
  }
  return s.location.name
}

function SegmentIcon({ segment }: { segment: Segment }) {
  if (segment.kind === 'travel') {
    const symbol =
      segment.mode === 'flight' ? '✈' : segment.mode === 'car' ? '🚗' : '🚆'
    return (
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-400 text-[11px] text-black">
        {symbol}
      </div>
    )
  }
  const color = segment.kind === 'hotel' ? 'bg-amber-400' : 'bg-emerald-400'
  const symbol = segment.kind === 'hotel' ? '⌂' : '◎'
  return (
    <div
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-black ${color}`}
    >
      {symbol}
    </div>
  )
}
