import { useEffect, useMemo, useRef } from 'react'
import { daysBetween, fmtShortDate, fmtShortDateTime, toMs } from '../lib/time'
import type { Segment, Trip } from '../lib/types'

interface Props {
  trip: Trip
  segments: Segment[]
  currentMs: number
  onChange: (ms: number) => void
}

export function Timeline({ trip, segments, currentMs, onChange }: Props) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)

  const { startMs, endMs } = useMemo(() => {
    let start = toMs(`${trip.startDate}T00:00:00`)
    let end = toMs(`${trip.endDate}T23:59:59`)
    for (const s of segments) {
      const sMs = toMs(s.startUtc)
      const eMs = toMs(s.endUtc)
      if (sMs < start) start = sMs
      if (eMs > end) end = eMs
    }
    return { startMs: start, endMs: end }
  }, [trip, segments])

  const span = Math.max(endMs - startMs, 1)
  const pct = (ms: number) => Math.max(0, Math.min(1, (ms - startMs) / span)) * 100
  const fromClientX = (clientX: number): number => {
    const rect = railRef.current?.getBoundingClientRect()
    if (!rect) return startMs
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return startMs + t * span
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) onChange(fromClientX(e.clientX))
    }
    const onUp = () => {
      draggingRef.current = false
    }
    const onTouchMove = (e: TouchEvent) => {
      if (draggingRef.current && e.touches[0]) onChange(fromClientX(e.touches[0].clientX))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, span, onChange])

  const days = useMemo(() => daysBetween(startMs, endMs), [startMs, endMs])

  const labelStride = Math.max(1, Math.floor(days.length / 8))

  return (
    <div className="absolute bottom-0 left-80 right-0 z-10 border-t border-white/10 bg-zinc-950/85 px-4 pt-2.5 pb-3 text-white backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between text-xs text-white/60">
        <span>{fmtShortDate(startMs)}</span>
        <span className="font-medium text-white">{fmtShortDateTime(currentMs)}</span>
        <span>{fmtShortDate(endMs)}</span>
      </div>

      <div
        ref={railRef}
        className="relative h-10 cursor-pointer select-none rounded-md bg-white/5"
        onMouseDown={(e) => {
          draggingRef.current = true
          onChange(fromClientX(e.clientX))
        }}
        onTouchStart={(e) => {
          if (e.touches[0]) {
            draggingRef.current = true
            onChange(fromClientX(e.touches[0].clientX))
          }
        }}
      >
        {/* day grid */}
        {days.map((d) => (
          <div
            key={d}
            className="absolute top-0 bottom-0 border-l border-white/10"
            style={{ left: `${pct(d)}%` }}
          />
        ))}

        {/* segment bars */}
        {segments.map((s) => {
          const a = pct(toMs(s.startUtc))
          const b = pct(toMs(s.endUtc))
          const left = Math.min(a, b)
          const width = Math.max(0.4, Math.abs(b - a))
          const color =
            s.kind === 'travel'
              ? 'bg-blue-400/70'
              : s.kind === 'hotel'
                ? 'bg-amber-400/70'
                : 'bg-emerald-400/70'
          const top =
            s.kind === 'travel' ? 'top-1' : s.kind === 'hotel' ? 'top-4' : 'top-7'
          return (
            <div
              key={s.id}
              className={`absolute h-2 rounded ${color} ${top}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={s.kind}
            />
          )
        })}

        {/* playhead */}
        <div
          className="pointer-events-none absolute top-[-4px] bottom-[-4px] w-0.5 bg-blue-300 shadow-[0_0_8px_rgba(96,165,250,0.8)]"
          style={{ left: `${pct(currentMs)}%` }}
        />
      </div>

      {/* Day labels live in their own row inside the padded container so they
          can never spill below the viewport edge. */}
      <div className="relative mt-1 h-3.5">
        {days.map((d, i) => {
          const show =
            i === 0 || i === days.length - 1 || i % labelStride === 0
          if (!show) return null
          return (
            <div
              key={`lbl-${d}`}
              className="absolute top-0 whitespace-nowrap text-[10px] text-white/40"
              style={{ left: `${pct(d)}%`, transform: 'translateX(-50%)' }}
            >
              {fmtShortDate(d)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
