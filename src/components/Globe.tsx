import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import maplibregl, { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { styleFor, type Theme } from '../lib/mapStyles'
import { toMs } from '../lib/time'
import type { Segment } from '../lib/types'
import {
  addSegmentLayers,
  drawElevatedArcs,
  fitToSegments,
  updateSegmentData,
} from '../lib/segmentLayers'

interface GlobeProps {
  theme: Theme
  segments: Segment[]
  currentTimeMs: number
}

export interface GlobeHandle {
  recenter: () => void
}

const HOME_CENTER: [number, number] = [-95, 40]
const HOME_ZOOM = 1.4

function isActiveAt(seg: Segment, currentMs: number, all: Segment[]): boolean {
  const start = toMs(seg.startUtc)
  const end = toMs(seg.endUtc)
  if (currentMs >= start && currentMs <= end) return true
  if (seg.kind === 'poi' && seg.parentSegmentId) {
    const parent = all.find(
      (s) => s.id === seg.parentSegmentId && s.kind === 'hotel',
    )
    if (parent) {
      const ps = toMs(parent.startUtc)
      const pe = toMs(parent.endUtc)
      return currentMs >= ps && currentMs <= pe
    }
  }
  return false
}

export const Globe = forwardRef<GlobeHandle, GlobeProps>(function Globe(
  { theme, segments, currentTimeMs },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const segmentsRef = useRef<Segment[]>(segments)
  const currentMsRef = useRef<number>(currentTimeMs)
  const fittedRef = useRef(false)
  // Tracks whether style.load has fired. We can't rely on map.isStyleLoaded()
  // because in MapLibre v5 it returns false while basemap tiles are still
  // loading, even though sources/layers can already be added safely.
  const styleReadyRef = useRef(false)
  segmentsRef.current = segments
  currentMsRef.current = currentTimeMs

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(theme),
      center: HOME_CENTER,
      zoom: HOME_ZOOM,
      attributionControl: { compact: true },
    })

    map.on('style.load', () => {
      map.setProjection({ type: 'globe' })
      // Reserve viewport space for the sidebar (left) and the timeline (bottom)
      // so all camera operations frame markers within the visible area.
      map.setPadding({ top: 0, right: 0, bottom: 110, left: 320 })
      addSegmentLayers(map)
      updateSegmentData(map, segmentsRef.current, currentMsRef.current)
      styleReadyRef.current = true
      if (!fittedRef.current && segmentsRef.current.length > 0) {
        fittedRef.current = true
        fitToSegments(map, segmentsRef.current)
      } else if (segmentsRef.current.length === 0) {
        // No trip yet — re-anchor HOME so it respects the new padding.
        map.jumpTo({ center: HOME_CENTER, zoom: HOME_ZOOM })
      }
    })

    mapRef.current = map

    // Single canvas-overlay render path: draws the elevated flight arcs AND
    // the chevron arrows that ride along them. Driven by RAF for animation,
    // plus immediate redraws on camera moves so the overlay tracks the basemap.
    const drawOverlay = (frameTime: number) => {
      const m = mapRef.current
      const o = overlayRef.current
      if (!m || !o) return
      drawElevatedArcs(m, o, segmentsRef.current, currentMsRef.current, frameTime)
    }

    let raf = 0
    let lastTick = 0
    const tick = (frameTime: number) => {
      if (frameTime - lastTick >= 33) {
        drawOverlay(frameTime)
        lastTick = frameTime
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // Camera moves trigger an extra rAF-batched draw so dragging the globe
    // keeps the overlay glued to the basemap (between the 30fps animation ticks).
    let moveScheduled = false
    const onMove = () => {
      if (moveScheduled) return
      moveScheduled = true
      requestAnimationFrame((frameTime) => {
        moveScheduled = false
        drawOverlay(frameTime)
      })
    }
    map.on('move', onMove)
    map.on('resize', onMove)

    return () => {
      cancelAnimationFrame(raf)
      map.off('move', onMove)
      map.off('resize', onMove)
      map.remove()
      mapRef.current = null
      fittedRef.current = false
      styleReadyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // setStyle wipes layers/sources; the style.load handler re-attaches them
    // and flips styleReadyRef back to true.
    styleReadyRef.current = false
    map.setStyle(styleFor(theme))
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let didApply = false
    const apply = () => {
      if (didApply) return
      didApply = true
      addSegmentLayers(map)
      updateSegmentData(map, segments, currentTimeMs)
      if (segments.length === 0) {
        if (fittedRef.current) {
          map.flyTo({
            center: HOME_CENTER,
            zoom: HOME_ZOOM,
            duration: 1500,
            essential: true,
          })
        }
        fittedRef.current = false
      } else if (!fittedRef.current) {
        fittedRef.current = true
        fitToSegments(map, segments)
      }
    }

    if (styleReadyRef.current) {
      apply()
      return
    }
    // Style isn't ready yet. Register one-time listeners on both style.load and
    // idle — whichever fires first wins (apply() is idempotent for this effect run).
    // Using both is belt-and-suspenders: style.load is the canonical signal, but
    // if it already fired before we got here (in some race), idle will catch us.
    map.once('style.load', apply)
    map.once('idle', apply)
    return () => {
      map.off('style.load', apply)
      map.off('idle', apply)
    }
  }, [segments, currentTimeMs])


  useImperativeHandle(
    ref,
    () => ({
      recenter: () => {
        const map = mapRef.current
        if (!map) return
        const segs = segmentsRef.current
        if (segs.length === 0) {
          map.flyTo({
            center: HOME_CENTER,
            zoom: HOME_ZOOM,
            duration: 1000,
            essential: true,
          })
          return
        }
        const active = segs.filter((s) =>
          isActiveAt(s, currentMsRef.current, segs),
        )
        fitToSegments(map, active.length > 0 ? active : segs)
      },
    }),
    [],
  )

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      />
    </>
  )
})
