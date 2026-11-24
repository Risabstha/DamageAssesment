import api from './Api'
import type { AnalysisResponse, Geometry, Report, ReportDetail } from '../types/watershed'

export async function analyzeWatershed(boundary: { geometry: Geometry; name: string } | FormData) {
  return (await api.post<AnalysisResponse>('/watershed/analyze', boundary)).data
}

export async function getReports() {
  return (await api.get<{ reports: Report[] }>('/watershed/history')).data.reports
}

export async function getReport(id: number) {
  return (await api.get<ReportDetail>(`/watershed/report/${id}`)).data
}

export async function deleteReport(id: number) {
  return (await api.delete<{ success: boolean }>(`/watershed/report/${id}`)).data
}

export async function renameReport(id: number, name: string) {
  return (await api.post<{ success: boolean; name: string }>(`/watershed/report/${id}/rename`, { name })).data
}
