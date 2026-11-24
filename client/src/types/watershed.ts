export type Geometry = GeoJSON.Polygon | GeoJSON.MultiPolygon
export type AnalysisError = { error: string }

export type Results = {
  area_km2: number
  population: { total: number; cell_count: number } | AnalysisError
  buildings: { total: number; by_type: { type: string; count: number }[] } | AnalysisError
  wards: { ward_count: number; district_count: number; municipalities: string[]; wards: { district: string; municipality: string; ward_number: string | number; area_sqkm: number }[] } | AnalysisError
  lulc: { class_name: string; area_km2: number; percentage: number; color: string }[] | AnalysisError
  lulc_overlay: { image: string; bounds: [[number, number], [number, number]] } | AnalysisError | null
}

export type Report = { id: number; name: string; area_km2: number; created_at: string }
export type ReportDetail = Report & { geometry: Geometry; results: Results }
export type AnalysisResponse = { results: Results; geometry: Geometry; report_id: number | null }
