import type { HydrologyStation } from "../api/HydrologyStationsApi";

type Props = {
  station: HydrologyStation;
  stale: boolean;
};

export default function HydrologyStationDetails({ station, stale }: Props) {
  const fields: [string, string][] = [
    ["River", station.river_name ?? "Not provided"],
    [
      "Elevation",
      station.elevation === null ? "Not provided" : `${station.elevation} m`,
    ],
  ];
  if (station.elevation === null) {
    fields.push([
      "Point value",
      station.point_value?.toString() ?? "Not available",
    ]);
    if (station.point_observed_at)
      fields.push(["Point time (DHM)", station.point_observed_at]);
  }
  fields.push(
    ["District", station.district ?? "Not provided"],
    ["Description", station.description ?? "Not provided"],
    ["Last collected", new Date(station.fetched_at).toLocaleString()],
  );
  if (stale)
    fields.push([
      "Status",
      "Latest refresh failed; showing last successful data",
    ]);

  return (
    <div className="w-[17rem] max-w-[40rem] whitespace-normal rounded-xl bg-white p-4 shadow-lg border border-slate-200">
      <div className="mb-3 border-b border-slate-100 pb-3 pr-7">
        <strong className="block text-base font-bold leading-snug text-slate-800">
          {station.station_name}
        </strong>
      </div>

      <div className="space-y-2">
        {fields.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </span>
            <span className="text-sm font-medium leading-snug text-slate-700 break-words">
              {value ?? "N/A"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
        Station Information
      </div>
    </div>
  );
}
