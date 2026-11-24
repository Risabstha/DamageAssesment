import type { AnalysisError, Results } from '../types/watershed'
import Button from './Button'

type Props = {
  results: Results
  user: string | null
  reportId: number | null
  busy: boolean
  onSave: () => void
}

function displayValue(value: number | AnalysisError) {
  return typeof value === 'number' ? value.toLocaleString() : 'Unavailable'
}

export default function ReportResults({ results, user, reportId, busy, onSave }: Props) {
  return (
    <section className="border-b border-[#dce5e8] px-6 py-[22px] [&_h2]:mb-3 [&_h2]:text-[.85rem] [&_h2]:font-bold [&_h2]:tracking-[.07em] [&_h2]:uppercase">
      <div className="flex items-center justify-between gap-2"><h2>Summary</h2><Button variant="secondary" size="small" onClick={() => window.print()}>Print report</Button></div>
      {user && !reportId && <Button variant="secondary" size="small" disabled={busy} onClick={onSave}>Save report (reruns analysis)</Button>}
      <div className="mb-6 grid grid-cols-2 gap-2 [&_div]:rounded-[7px] [&_div]:bg-[#e8f2f1] [&_div]:p-3 [&_span]:mt-1 [&_span]:block [&_span]:text-[.75rem] [&_span]:text-[#71858b] [&_strong]:block">
        <div><strong>{results.area_km2.toLocaleString()}</strong><span>Area (km²)</span></div>
        <div><strong>{displayValue('error' in results.population ? results.population : results.population.total)}</strong><span>Population</span></div>
        <div><strong>{displayValue('error' in results.buildings ? results.buildings : results.buildings.total)}</strong><span>Buildings</span></div>
        <div><strong>{displayValue('error' in results.wards ? results.wards : results.wards.ward_count)}</strong><span>Wards</span></div>
      </div>
      <h2 className="mt-[22px]">Land use / land cover</h2>
      {'error' in results.lulc ? <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">{results.lulc.error}</p> : results.lulc.length ? results.lulc.map(item => <div className="flex items-center justify-between gap-2 border-b border-[#e3ecee] py-[7px] text-[.8rem]" key={item.class_name}><span><i className="mr-2 inline-block h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: item.color }} />{item.class_name}</span><span>{item.area_km2} km² · {item.percentage}%</span></div>) : <p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">No land cover data for this area.</p>}
      <h2 className="mt-[22px]">Buildings by type</h2>
      {'error' in results.buildings ? <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">{results.buildings.error}</p> : results.buildings.by_type.map(item => <div className="flex items-center justify-between gap-2 border-b border-[#e3ecee] py-[7px] text-[.8rem]" key={item.type}><span>{item.type}</span><span>{item.count.toLocaleString()}</span></div>)}
      <h2 className="mt-[22px]">Administrative units</h2>
      {'error' in results.wards ? <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">{results.wards.error}</p> : <><p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">{results.wards.district_count} districts · {results.wards.municipalities.length} municipalities</p>{results.wards.wards.map((ward, index) => <div className="border-b border-[#e3ecee] py-2 text-[.8rem]" key={index}><strong>{ward.municipality} — Ward {ward.ward_number}</strong><span className="mt-1 block text-[.75rem] text-[#71858b]">{ward.district} · {ward.area_sqkm} km²</span></div>)}</>}
      {'error' in results.population && <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">Population: {results.population.error}</p>}
      {results.lulc_overlay && 'error' in results.lulc_overlay && <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">Map overlay: {results.lulc_overlay.error}</p>}
    </section>
  )
}
