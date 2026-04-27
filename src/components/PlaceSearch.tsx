import { useEffect, useRef, useState } from 'react'
import { searchPhoton, type PhotonResult } from '../lib/photon'

interface Props {
  value: PhotonResult | null
  onChange: (place: PhotonResult | null) => void
  placeholder?: string
}

export function PlaceSearch({ value, onChange, placeholder = 'Search a place…' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PhotonResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    abortRef.current?.abort()
    abortRef.current = ctrl
    setLoading(true)
    const t = window.setTimeout(() => {
      searchPhoton(query, ctrl.signal)
        .then((rs) => {
          if (!ctrl.signal.aborted) setResults(rs)
        })
        .catch((err) => {
          // AbortError fires whenever a previous request is superseded by a
          // newer keystroke — that's expected behavior, not a problem to log.
          if (ctrl.signal.aborted) return
          if (err?.name === 'AbortError') return
          if (err instanceof DOMException && err.name === 'AbortError') return
          console.warn('Photon search failed:', err)
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false)
        })
    }, 120)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm">
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium">{value.name}</div>
          {value.address && (
            <div className="truncate text-xs text-white/60">{value.address}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-white/60 hover:text-white px-1"
          aria-label="Clear"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">
          …
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-white/15 bg-zinc-900 shadow-xl z-50">
          {results.map((r, i) => (
            <button
              key={r.placeId ?? `${r.lat},${r.lng},${i}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(r)
                setQuery('')
                setOpen(false)
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-white/10"
            >
              <div className="truncate">{r.name}</div>
              {r.address && (
                <div className="truncate text-xs text-white/60">{r.address}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
