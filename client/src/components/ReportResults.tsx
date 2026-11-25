import type { AnalysisError, Results } from "../types/watershed";
import Button from "./Button";

type Props = {
  results: Results;
  user: string | null;
  reportId: number | null;
  busy: boolean;
  onSave: () => void;
};

function displayValue(value: number | AnalysisError) {
  return typeof value === "number" ? value.toLocaleString() : "Unavailable";
}

export default function ReportResults({
  results,
  user,
  reportId,
  busy,
  onSave,
}: Props) {
  return (
    <section className="border-b mt-[0.8rem] border-[#dce5e8] px-6 py-[22px] [&_h2]:mb-3 [&_h2]:text-[1rem] [&_h2]:font-bold [&_h2]:tracking-[.07em] [&_h2]:uppercase">
      <h2>Result Summary</h2>

      <Button
        className="mb-4 padding flex justify-self-end"
        variant="secondary"
        size="small"
        onClick={() => window.print()}
      >
        Save Result
      </Button>
      {user && !reportId && (
        <Button
          variant="secondary"
          size="small"
          disabled={busy}
          onClick={onSave}
        >
          Save report (reruns analysis)
        </Button>
      )}
      <div className="pb-7 mb-7 border-b border-[#dce5e8] grid grid-cols-2 gap-2 [&_div]:rounded-[7px] [&_div]:bg-[#e8f2f1] [&_div]:p-3 [&_span]:mt-1 [&_span]:block [&_span]:text-[.75rem] [&_span]:text-[#71858b] [&_strong]:block">
        <div>
          <strong>{results.area_km2.toLocaleString()}</strong>
          <span>Area (km²)</span>
        </div>
        <div>
          <strong>
            {displayValue(
              "error" in results.population
                ? results.population
                : results.population.total,
            )}
          </strong>
          <span>Population</span>
        </div>
        <div>
          <strong>
            {displayValue(
              "error" in results.buildings
                ? results.buildings
                : results.buildings.total,
            )}
          </strong>
          <span>Buildings</span>
        </div>
        <div>
          <strong>
            {displayValue(
              "error" in results.wards
                ? results.wards
                : results.wards.ward_count,
            )}
          </strong>
          <span>Wards</span>
        </div>
      </div>
      <h2 className="mt-[22px]">Land use / land cover</h2>
      {"error" in results.lulc ? (
        <p className="mt-2 mb-3 rounded-[6px]  bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">
          {results.lulc.error}
        </p>
      ) : results.lulc.length ? (
        <div className="mt-4 mb-7 overflow-hidden rounded-xl border border-[#dce5e8] bg-white shadow-sm">
          <div className="flex flex-col items-center border-b border-[#e5edef] bg-[#f7fafb] py-3">
            <svg
              className="h-44 w-44"
              viewBox="0 0 44 44"
              role="img"
              aria-label="Land use and land cover distribution"
            >
              <title>Land use and land cover distribution</title>
              <circle
                cx="22"
                cy="22"
                r="14"
                fill="none"
                stroke="#e5edef"
                strokeWidth="11"
              />
              {
                results.lulc.reduce<{
                  offset: number;
                  circles: React.ReactNode[];
                }>(
                  (chart, item) => {
                    chart.circles.push(
                      <circle
                        key={item.class_name}
                        cx="22"
                        cy="22"
                        r="14"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="11"
                        strokeLinecap="butt"
                        pathLength="100"
                        strokeDasharray={`${item.percentage} ${100 - item.percentage}`}
                        strokeDashoffset={-chart.offset}
                        transform="rotate(-90 22 22)"
                      >
                        <title>
                          {item.class_name}: {item.percentage}%
                        </title>
                      </circle>,
                    );
                    chart.offset += item.percentage;
                    return chart;
                  },
                  { offset: 0, circles: [] },
                ).circles
              }
              <text
                x="22"
                y="21"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-[#103c47] text-[3px] font-bold"
              >
                LULC
              </text>
              <text
                x="22"
                y="25"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-[#71858b] text-[1.7px]"
              >
                {results.lulc.length} classes
              </text>
            </svg>
            <span className="mt-1 text-[.68rem] font-semibold tracking-[.12em] text-[#71858b] uppercase">
              Share of mapped area
            </span>
          </div>
          <div className="divide-y divide-[#e5edef] px-4">
            {results.lulc.map((item) => (
              <div
                className="flex items-center justify-between gap-3 py-3"
                key={item.class_name}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <i
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 text-[.8rem] font-medium text-[#263b40] [overflow-wrap:anywhere]">
                    {item.class_name}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block text-[.8rem] text-[#263b40]">
                    {item.percentage}%
                  </strong>
                  <span className="block text-[.7rem] text-[#71858b]">
                    {item.area_km2} km²
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">
          No land cover data for this area.
        </p>
      )}

      <h2 className="mt-[22px] border-t pt-7 border-[#e5edef]">
        Buildings by type
      </h2>
      {"error" in results.buildings ? (
        <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">
          {results.buildings.error}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border mb-7 border-[#dce5e8] bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-[.8rem]">
            <thead className="bg-[#f7fafb] text-[.68rem] font-semibold tracking-[.12em] text-[#71858b] uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Building type
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Count
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5edef]">
              {results.buildings.by_type.map((item) => (
                <tr key={item.type}>
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-medium text-[#263b40] [overflow-wrap:anywhere]"
                  >
                    {item.type}
                  </th>
                  <td className="px-4 py-3 text-right font-semibold text-[#263b40]">
                    {item.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="mt-[22px] border-t pt-7 border-[#e5edef]">
        Administrative units
      </h2>
      {"error" in results.wards ? (
        <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">
          {results.wards.error}
        </p>
      ) : (
        <>
          <p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">
            {results.wards.district_count} districts ·{" "}
            {results.wards.municipalities.length} municipalities
          </p>
          <div className="overflow-hidden rounded-xl border border-[#dce5e8] bg-white shadow-sm print:overflow-visible">
            <div
              role="region"
              aria-label="Administrative wards"
              tabIndex={0}
              className="grid max-h-96 auto-rows-[6rem] overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#103c47] print:max-h-none print:auto-rows-auto print:overflow-visible"
            >
              {results.wards.wards.map((ward, index) => (
                <div
                  className="flex flex-col justify-center border-b border-[#e5edef] px-4 py-3 text-[.8rem] last:border-b-0 print:break-inside-avoid"
                  key={index}
                >
                  <strong
                    className="line-clamp-2 font-medium text-[#263b40] print:line-clamp-none"
                    title={`${ward.municipality} — Ward ${ward.ward_number}`}
                  >
                    {ward.municipality} — Ward {ward.ward_number}
                  </strong>
                  <span className="mt-1 block text-[.75rem] text-[#71858b]">
                    {ward.district} · {ward.area_sqkm} km²
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {"error" in results.population && (
        <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">
          Population: {results.population.error}
        </p>
      )}
      {results.lulc_overlay && "error" in results.lulc_overlay && (
        <p className="mt-2 mb-3 rounded-[6px] bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">
          Map overlay: {results.lulc_overlay.error}
        </p>
      )}
    </section>
  );
}
