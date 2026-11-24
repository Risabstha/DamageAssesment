import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import type { Geometry, Results } from '../types/watershed'
import { extractGeometry } from '../utils/geometry'
import RiverLegend from './RiverLegend'
import RiverStreamPanel from './RiverStreamPanel'
import { useRiverBuffer } from '../hooks/useRiverBuffer'
import { createRiverStreamLayer } from '../utils/riverStreamLayer'
import type { RiverFeature, RiverLayerState } from '../utils/riverStreamLayer'
import { createHydrologyStationLayer } from '../utils/hydrologyStationLayer'
import type { StationLayerState } from '../utils/hydrologyStationLayer'

export type WatershedMapHandle = {
  showGeometry: (geometry: Geometry) => void
  clearGeometry: () => void
}

type Props = {
  onDraw: (geometry: Geometry) => void
  overlay: Results['lulc_overlay']
}

const WatershedMap = forwardRef<WatershedMapHandle, Props>(function WatershedMap({ onDraw, overlay }, ref) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.FeatureGroup | null>(null)
  const riverLayerRef = useRef<ReturnType<typeof createRiverStreamLayer> | null>(null)
  const stationLayerRef = useRef<ReturnType<typeof createHydrologyStationLayer> | null>(null)
  const [riverState, setRiverState] = useState<RiverLayerState>({ enabled: false, message: '', error: false })
  const [stationState, setStationState] = useState<StationLayerState>({ enabled: true, message: 'Loading hydrology stations…', error: false })
  const [selectedStream, setSelectedStream] = useState<RiverFeature | null>(null)
  const [bufferDistance, setBufferDistance] = useState(500)
  const riverBuffer = useRiverBuffer(selectedStream ? Number(selectedStream.id) : null, bufferDistance)

  const showBoundary = useCallback((geometry: Geometry) => {
    const layers = layersRef.current
    if (!layers) return
    layers.clearLayers()
    const layer = L.geoJSON(geometry).addTo(layers)
    if (layer.getBounds().isValid()) mapRef.current?.fitBounds(layer.getBounds(), { padding: [30, 30] })
  }, [])

  useImperativeHandle(ref, () => ({
    showGeometry: showBoundary,
    clearGeometry() { layersRef.current?.clearLayers() },
  }), [showBoundary])

  useEffect(() => {
    if (!mapElement.current) return
    const map = L.map(mapElement.current).setView([28.2, 84.1], 7)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    map.createPane('land-cover').style.zIndex = '390'
    map.createPane('river-buffer').style.zIndex = '410'
    const layers = new L.FeatureGroup().addTo(map)
    layersRef.current = layers
    map.addControl(new L.Control.Draw({
      edit: { featureGroup: layers, edit: false, remove: false },
      draw: { polygon: {}, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false },
    }))
    map.on(L.Draw.Event.CREATED, (event: L.LeafletEvent) => {
      const layer = (event as L.DrawEvents.Created).layer
      layers.clearLayers()
      layers.addLayer(layer)
      onDraw(extractGeometry((layer as L.Polygon).toGeoJSON()))
    })
    const printMedia = window.matchMedia('print')
    let screenView: { center: L.LatLng; zoom: number } | null = null
    let restoringPrint = false
    const riverLayer = createRiverStreamLayer(map, () => printMedia.matches || restoringPrint, setRiverState, setSelectedStream)
    riverLayerRef.current = riverLayer
    const stationLayer = createHydrologyStationLayer(map, setStationState)
    stationLayerRef.current = stationLayer
    const resizeMap = () => {
      if (printMedia.matches && !screenView) screenView = { center: map.getCenter(), zoom: map.getZoom() }
      map.invalidateSize({ animate: false })
      if (printMedia.matches) {
        const bounds = layers.getBounds()
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], animate: false })
      }
    }
    const onPrintChange = (event: MediaQueryListEvent) => {
      if (!event.matches) restoringPrint = true
      resizeMap()
      if (!event.matches && screenView) {
        map.setView(screenView.center, screenView.zoom, { animate: false })
        screenView = null
      }
      if (!event.matches) {
        restoringPrint = false
        riverLayer.retry()
      }
    }
    const resizeObserver = new ResizeObserver(resizeMap)
    resizeObserver.observe(mapElement.current)
    printMedia.addEventListener('change', onPrintChange)
    return () => {
      printMedia.removeEventListener('change', onPrintChange)
      resizeObserver.disconnect()
      riverLayer.dispose()
      riverLayerRef.current = null
      stationLayer.dispose()
      stationLayerRef.current = null
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [onDraw])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !overlay || 'error' in overlay) return
    const layer = L.imageOverlay(overlay.image, overlay.bounds, { pane: 'land-cover' }).addTo(map)
    return () => { layer.remove() }
  }, [overlay])

  const bufferPreview = riverBuffer.preview
  useEffect(() => {
    const map = mapRef.current
    if (!map || !bufferPreview) return
    const layer = L.geoJSON(bufferPreview, {
      pane: 'river-buffer',
      interactive: false,
      style: { color: '#e8590c', weight: 2, dashArray: '6 4', fillColor: '#f59f00', fillOpacity: 0.2 },
    }).addTo(map)
    return () => { layer.remove() }
  }, [bufferPreview])

  function applyBufferAsBoundary() {
    const buffer = riverBuffer.buffer
    if (!buffer) return
    showBoundary(buffer.geometry)
    onDraw(buffer.geometry)
    riverLayerRef.current?.clearSelection()
  }

  return (
    <div className="relative min-h-0 min-w-0 flex-1 [@media_screen_and_(max-width:700px)]:h-[45vh] [@media_screen_and_(max-width:700px)]:flex-none print:h-auto print:w-full print:break-inside-avoid print:[&_.leaflet-control-container]:hidden print:[&_.leaflet-river-streams-pane]:hidden print:[&_.leaflet-river-buffer-pane]:hidden print:[&_.leaflet-hydrology-stations-pane]:hidden print:[&_.hydrology-station-tooltip]:hidden print:[&_.hydrology-station-popup]:hidden">
      <h2 className="mb-3 hidden text-[.85rem] font-bold tracking-[.07em] uppercase print:block">Land-cover detail</h2>
      <main className="h-full w-full print:h-[400px]" ref={mapElement} aria-label="Watershed boundary map" />
      <RiverLegend state={riverState} onChange={enabled => riverLayerRef.current?.setEnabled(enabled)} onRetry={() => riverLayerRef.current?.retry()}
        stations={stationState} onStationsChange={enabled => stationLayerRef.current?.setEnabled(enabled)} onStationsRetry={() => stationLayerRef.current?.retry()} />
      {selectedStream && (
        <RiverStreamPanel stream={selectedStream} distance={bufferDistance} buffer={riverBuffer.buffer}
          loading={riverBuffer.loading} error={riverBuffer.error} onDistanceChange={setBufferDistance}
          onUseBoundary={applyBufferAsBoundary} onRetry={riverBuffer.retry}
          onClose={() => riverLayerRef.current?.clearSelection()} />
      )}
    </div>
  )
})

export default WatershedMap
