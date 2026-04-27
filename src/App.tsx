import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Globe, type GlobeHandle } from './components/Globe'
import { Sidebar } from './components/Sidebar'
import { Timeline } from './components/Timeline'
import type { Theme } from './lib/mapStyles'
import {
  selectActiveSegments,
  selectActiveTrip,
  useTripStore,
} from './lib/store'

export default function App() {
  const [theme, setTheme] = useState<Theme>('dark')
  const isDark = theme === 'dark'

  const load = useTripStore((s) => s.load)
  const activeTrip = useTripStore(selectActiveTrip)
  const activeSegments = useTripStore(useShallow(selectActiveSegments))
  const currentTimeMs = useTripStore((s) => s.currentTimeMs)
  const setCurrentTime = useTripStore((s) => s.setCurrentTime)

  const globeRef = useRef<GlobeHandle>(null)

  useEffect(() => {
    void load()
  }, [load])

  const buttonClasses = `rounded-md px-3 py-1.5 text-sm backdrop-blur border transition-colors ${
    isDark
      ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
      : 'bg-black/5 text-black border-black/10 hover:bg-black/10'
  }`

  return (
    <div className={`relative h-full w-full overflow-hidden ${isDark ? 'bg-black' : 'bg-white'}`}>
      <Globe
        ref={globeRef}
        theme={theme}
        segments={activeSegments}
        currentTimeMs={currentTimeMs}
      />

      <Sidebar />

      {activeTrip && (
        <Timeline
          trip={activeTrip}
          segments={activeSegments}
          currentMs={currentTimeMs}
          onChange={setCurrentTime}
        />
      )}

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {activeTrip && (
          <button
            onClick={() => globeRef.current?.recenter()}
            className={buttonClasses}
            title="Center on the active segment, or the whole trip"
          >
            Recenter
          </button>
        )}
        <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={buttonClasses}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </div>
  )
}
