import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  selectActiveHotels,
  selectActiveSegments,
  selectActiveTrip,
  useTripStore,
} from '../lib/store'
import type { HotelSegment, Segment } from '../lib/types'
import { TripPicker } from './TripPicker'
import { SegmentList } from './SegmentList'
import { SegmentForm } from './SegmentForm'
import { NearbyPanel } from './NearbyPanel'
import { DataMenu } from './DataMenu'

export function Sidebar() {
  const trips = useTripStore((s) => s.trips)
  const activeTrip = useTripStore(selectActiveTrip)
  const segments = useTripStore(useShallow(selectActiveSegments))
  const hotels = useTripStore(useShallow(selectActiveHotels))

  const [formOpen, setFormOpen] = useState(false)
  const [formKind, setFormKind] = useState<'travel' | 'hotel' | 'poi'>('travel')
  const [editing, setEditing] = useState<Segment | null>(null)
  const [defaultParent, setDefaultParent] = useState<string | null>(null)

  const [nearbyHotel, setNearbyHotel] = useState<HotelSegment | null>(null)

  const openNew = (kind: 'travel' | 'hotel' | 'poi') => {
    setEditing(null)
    setFormKind(kind)
    setDefaultParent(null)
    setFormOpen(true)
  }

  const openEdit = (seg: Segment) => {
    setEditing(seg)
    setFormKind(seg.kind)
    setFormOpen(true)
  }

  const openNearby = (hotelId: string) => {
    const h = hotels.find((x) => x.id === hotelId)
    if (h) setNearbyHotel(h)
  }

  return (
    <aside className="absolute top-0 left-0 z-10 flex h-full w-80 flex-col border-r border-white/10 bg-zinc-950/85 text-white backdrop-blur">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Travel Map</div>
          <DataMenu />
        </div>
        <div className="mt-2">
          <TripPicker activeTrip={activeTrip} trips={trips} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTrip ? (
          <>
            <SegmentList segments={segments} onEdit={openEdit} onFindNearby={openNearby} />
          </>
        ) : (
          <div className="rounded-md border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/50">
            Create a trip to start adding segments.
          </div>
        )}
      </div>

      {activeTrip && (
        <div className="grid grid-cols-3 gap-1 border-t border-white/10 px-3 py-2 text-sm">
          <SidebarAdd label="Travel" onClick={() => openNew('travel')} />
          <SidebarAdd label="Hotel" onClick={() => openNew('hotel')} />
          <SidebarAdd label="Place" onClick={() => openNew('poi')} />
        </div>
      )}

      {activeTrip && (
        <SegmentForm
          open={formOpen}
          trip={activeTrip}
          initialKind={formKind}
          editing={editing}
          hotels={hotels}
          defaultParentHotelId={defaultParent}
          onClose={() => setFormOpen(false)}
        />
      )}

      <NearbyPanel
        open={!!nearbyHotel}
        hotel={nearbyHotel}
        onClose={() => setNearbyHotel(null)}
      />
    </aside>
  )
}

function SidebarAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10"
    >
      + {label}
    </button>
  )
}
