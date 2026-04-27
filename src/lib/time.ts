export const toMs = (iso: string): number => new Date(iso).getTime()

export function fmtDateTime(utcIso: string): string {
  return new Date(utcIso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function fmtTime(utcIso: string): string {
  return new Date(utcIso).toLocaleTimeString(undefined, { timeStyle: 'short' })
}

export function fmtShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtShortDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "YYYY-MM-DDTHH:mm" (interpreted by browser as local) → UTC ISO
export function localInputToUtc(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

// UTC ISO → "YYYY-MM-DDTHH:mm" suitable for <input type="datetime-local">
export function utcToLocalInput(utc: string): string {
  if (!utc) return ''
  const d = new Date(utc)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// "YYYY-MM-DD" → midnight local-time ms
export function dateInputToMs(dateStr: string): number {
  if (!dateStr) return 0
  return new Date(`${dateStr}T00:00:00`).getTime()
}

const DAY_MS = 24 * 60 * 60 * 1000

export function daysBetween(startMs: number, endMs: number): number[] {
  const days: number[] = []
  const d = new Date(startMs)
  d.setHours(0, 0, 0, 0)
  for (let t = d.getTime(); t <= endMs + 1; t += DAY_MS) days.push(t)
  return days
}
