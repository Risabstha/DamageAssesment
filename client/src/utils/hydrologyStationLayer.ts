import L from "leaflet";
import { getHydrologyStations } from "../api/HydrologyStationsApi";
import type {
  HydrologyStation,
  HydrologyStationsResponse,
} from "../api/HydrologyStationsApi";
import { errorMessage } from "../api/Api";

export type StationLayerState = {
  enabled: boolean;
  message: string;
  error: boolean;
};

function stationDetails(station: HydrologyStation, stale: boolean) {
  const content = document.createElement("div");
  content.className = "max-w-[260px] whitespace-normal";
  const title = document.createElement("strong");
  title.className = "mb-1 block";
  title.textContent = station.station_name;
  content.append(title);
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
  for (const [label, value] of fields) {
    const row = document.createElement("div");
    const labelElement = document.createElement("span");
    labelElement.className = "text-[#60777d]";
    labelElement.textContent = `${label}: `;
    row.append(labelElement, document.createTextNode(value));
    content.append(row);
  }
  return content;
}

export function createHydrologyStationLayer(
  map: L.Map,
  onState: (state: StationLayerState) => void,
) {
  const pane = map.createPane("hydrology-stations");
  pane.style.zIndex = "460";
  const layer = L.layerGroup().addTo(map);
  let enabled = true;
  let disposed = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastData = "";
  let message = "Loading hydrology stations…";
  let error = false;

  function notify() {
    if (!disposed) onState({ enabled, message, error });
  }

  function render(data: HydrologyStationsResponse) {
    const serialized = JSON.stringify(data);
    if (serialized === lastData) return;
    lastData = serialized;
    layer.clearLayers();
    for (const station of data.stations) {
      const stale = data.failed_station_ids.includes(station.id);
      const marker = L.circleMarker([station.latitude, station.longitude], {
        pane: "hydrology-stations",
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#742aa5",
        fillOpacity: 1,
      });
      marker.bindTooltip(stationDetails(station, stale), {
        direction: "top",
        offset: [0, -6],
        className: "hydrology-station-tooltip",
      });
      marker.bindPopup(stationDetails(station, stale), {
        className: "hydrology-station-popup",
      });
      marker.on("add", () => {
        const element = marker.getElement();
        element?.setAttribute("tabindex", "0");
        element?.setAttribute("role", "button");
        element?.setAttribute("aria-label", station.station_name);
        element?.addEventListener("keydown", (event) => {
          if (
            event instanceof KeyboardEvent &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            marker.openPopup();
          }
        });
      });
      marker.addTo(layer);
    }
  }

  function refresh() {
    if (disposed || controller) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const request = new AbortController();
    controller = request;
    void getHydrologyStations(request.signal)
      .then((data) => {
        if (disposed || request.signal.aborted) return;
        render(data);
        const missing = data.stations.length < 4;
        error = data.failed_station_ids.length > 0 || missing;
        message = error
          ? `Some station data is unavailable or stale (${data.stations.length}/4 available).`
          : "";
      })
      .catch((failure: unknown) => {
        if (disposed || request.signal.aborted) return;
        error = true;
        message = errorMessage(failure, "Could not load hydrology stations.");
      })
      .finally(() => {
        if (disposed || request.signal.aborted) return;
        controller = null;
        notify();
        timer = setTimeout(refresh, error ? 10_000 : 60_000);
      });
  }

  notify();
  refresh();

  return {
    setEnabled(value: boolean) {
      enabled = value;
      if (enabled) layer.addTo(map);
      else map.removeLayer(layer);
      notify();
    },
    retry: refresh,
    dispose() {
      disposed = true;
      controller?.abort();
      if (timer !== null) clearTimeout(timer);
      layer.remove();
    },
  };
}
