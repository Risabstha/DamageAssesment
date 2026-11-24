import api from './Api'

export type RiverStreams = GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString, {
  name: string | null
  waterway: string | null
}>

export async function getRiverStreams(bounds: [number, number, number, number], signal: AbortSignal) {
  return (await api.get<RiverStreams>('/watershed/river-streams', {
    params: { bbox: bounds.join(',') },
    signal,
  })).data
}

export type RiverBuffer = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, {
  stream_id: number
  name: string | null
  waterway: string | null
  distance_m: number
  area_km2: number
}>

export async function getRiverBuffer(streamId: number, distance: number, signal: AbortSignal) {
  return (await api.get<RiverBuffer>(`/watershed/river-streams/${streamId}/buffer`, {
    params: { distance },
    signal,
  })).data
}
