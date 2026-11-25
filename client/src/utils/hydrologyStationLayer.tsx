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

export type StationDetailsTarget = {
  station: HydrologyStation;
  stale: boolean;
  tooltip: HTMLDivElement;
  popup: HTMLDivElement;
};

export function createHydrologyStationLayer(
  map: L.Map,
  onState: (state: StationLayerState) => void,
  onDetailsChange: (details: StationDetailsTarget[]) => void,
) {
  const pane = map.createPane("hydrology-stations");
  pane.style.zIndex = "460";
  const tooltipPane = map.createPane("hydrology-station-tooltips");
  tooltipPane.style.zIndex = "710";
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
    const details: StationDetailsTarget[] = [];
    for (const station of data.stations) {
      const stale = data.failed_station_ids.includes(station.id);
      // Leaflet owns the empty hosts; React renders their contents through portals.
      const tooltip = document.createElement("div");
      const popup = document.createElement("div");
      details.push({ station, stale, tooltip, popup });
      const marker = L.circleMarker([station.latitude, station.longitude], {
        pane: "hydrology-stations",
        radius: 10,
        color: "#fff",
        weight: 2,
        fillColor: "blue",
        fillOpacity: 1,
      });
      const tooltipOptions: L.TooltipOptions = {
        pane: "hydrology-station-tooltips",
        direction: "top",
        offset: [0, -6],
        className: "hydrology-station-tooltip",
      };
      marker.bindTooltip(tooltip, tooltipOptions);
      marker.bindPopup(popup, {
        className: "hydrology-station-popup",
      });
      marker.on("popupopen", () => marker.unbindTooltip());
      marker.on("popupclose", () => marker.bindTooltip(tooltip, tooltipOptions));
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
    onDetailsChange(details);
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
      onDetailsChange([]);
    },
  };
}
