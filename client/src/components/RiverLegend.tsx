import type { RiverLayerState } from '../utils/riverStreamLayer'
import type { StationLayerState } from '../utils/hydrologyStationLayer'
import Button from './Button'

type Props = {
  state: RiverLayerState
  onChange: (enabled: boolean) => void
  onRetry: () => void
  stations: StationLayerState
  onStationsChange: (enabled: boolean) => void
  onStationsRetry: () => void
}

export default function RiverLegend({ state, onChange, onRetry, stations, onStationsChange, onStationsRetry }: Props) {
  return (
    <div className="absolute top-3 right-3 z-[1000] flex max-w-[230px] flex-col gap-[7px] rounded-[6px] bg-white px-3 py-[10px] text-[.8rem] shadow-[0_1px_5px_#0004] print:hidden" aria-label="Map layers">
      <strong>Map layers</strong>
      <label className="flex cursor-pointer items-center gap-[7px]">
        <input type="checkbox" checked={state.enabled} onChange={event => onChange(event.target.checked)} />
        <span className="w-[18px] border-t-[3px] border-solid border-[#1384c4]" />
        River Stream
      </label>
      <span className="text-[.72rem] text-[#60777d]">Automatic from zoom level 5</span>
      {state.message && <span role={state.error ? 'alert' : 'status'} className={`text-[.72rem] ${state.error ? 'text-[#a33432]' : 'text-[#60777d]'}`}>{state.message}</span>}
      {state.error && <Button variant="secondary" size="small" onClick={onRetry}>Retry</Button>}
      <label className="flex cursor-pointer items-center gap-[7px]">
        <input type="checkbox" checked={stations.enabled} onChange={event => onStationsChange(event.target.checked)} />
        <span className="h-3 w-3 rounded-full border-2 border-white bg-[#742aa5] shadow-[0_0_0_1px_#742aa5]" />
        Hydrology stations
      </label>
      {stations.message && <span role={stations.error ? 'alert' : 'status'} className={`text-[.72rem] ${stations.error ? 'text-[#a33432]' : 'text-[#60777d]'}`}>{stations.message}</span>}
      {stations.error && <Button variant="secondary" size="small" onClick={onStationsRetry}>Retry stations</Button>}
    </div>
  )
}
