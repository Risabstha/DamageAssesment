import api from './Api'

export type HydrologyStation = {
  id: number
  station_name: string
  river_name: string | null
  latitude: number
  longitude: number
  elevation: number | null
  point_value: number | null
  point_observed_at: string | null
  district: string | null
  description: string | null
  fetched_at: string
}

export type HydrologyStationsResponse = {
  stations: HydrologyStation[]
  failed_station_ids: number[]
}

export async function getHydrologyStations(signal: AbortSignal) {
  return (await api.get<HydrologyStationsResponse>('/watershed/hydrology-stations', { signal })).data
}
