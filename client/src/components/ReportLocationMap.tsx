import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { Geometry } from '../types/watershed'

export default function ReportLocationMap({ geometry }: { geometry: Geometry }) {
  const mapElement = useRef<HTMLDivElement>(null)
  const [tileError, setTileError] = useState(false)

  useEffect(() => {
    if (!mapElement.current) return
    const boundary = L.geoJSON(geometry, {
      interactive: false,
      style: { color: '#b83219', weight: 2, fillOpacity: 0.15 },
    })
    const bounds = boundary.getBounds()
    const map = L.map(mapElement.current, {
      zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false,
      touchZoom: false, zoomAnimation: false, fadeAnimation: false,
    })
    map.fitBounds(bounds, { maxZoom: 8, padding: [25, 25], animate: false })
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
    tiles.on('loading', () => setTileError(false))
    tiles.on('tileerror', () => setTileError(true))
    tiles.addTo(map)
    boundary.addTo(map)
    L.circleMarker(bounds.getCenter(), {
      radius: 7, color: '#fff', weight: 2, fillColor: '#b83219', fillOpacity: 1, interactive: false,
    }).addTo(map)
    const resizeMap = () => {
      map.invalidateSize({ animate: false })
      map.fitBounds(bounds, { maxZoom: 8, padding: [25, 25], animate: false })
    }
    resizeMap()
    const observer = new ResizeObserver(resizeMap)
    observer.observe(mapElement.current)
    return () => {
      observer.disconnect()
      map.remove()
    }
  }, [geometry])

  return (
    <>
      {tileError && <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]" role="alert">Some location map tiles could not be loaded. Check your internet connection before printing.</p>}
      <div className="invisible fixed top-0 left-[-10000px] w-screen print:visible print:static print:w-full print:break-inside-avoid print:[&_.leaflet-control-container]:hidden">
        <h2 className="mb-3 text-[.85rem] font-bold tracking-[.07em] uppercase">Regional location</h2>
        <div className="h-[300px] w-full" ref={mapElement} aria-label="Regional location map" />
        <p className="mt-1 text-[.75rem] leading-[1.5]">Red marker: analysis area. Map data © OpenStreetMap contributors.</p>
      </div>
    </>
  )
}
