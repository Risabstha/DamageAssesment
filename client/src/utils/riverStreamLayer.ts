import L from "leaflet";
import { getRiverStreams } from "../api/RiverStreamsApi";
import type { RiverStreams } from "../api/RiverStreamsApi";
import { errorMessage } from "../api/Api";

const MIN_ZOOM = 5;
const CACHE_FEATURE_LIMIT = 100_000;
const MAX_CACHE_ENTRIES = 3;

export type RiverLayerState = {
  enabled: boolean;
  message: string;
  error: boolean;
};

type CacheEntry = { bounds: L.LatLngBounds; data: RiverStreams };
export type RiverFeature = RiverStreams["features"][number];

const BASE_STYLE: L.PathOptions = {
  color: "#1384c4",
  weight: 1.5,
  opacity: 0.9,
};
const HOVER_STYLE: L.PathOptions = { color: "#0b5f8f", weight: 3, opacity: 1 };
const SELECTED_STYLE: L.PathOptions = {
  color: "#e8590c",
  weight: 4,
  opacity: 1,
};

export function createRiverStreamLayer(
  map: L.Map,
  isPrinting: () => boolean,
  onState: (state: RiverLayerState) => void,
  onSelect: (feature: RiverFeature | null) => void,
) {
  const pane = map.createPane("river-streams");
  pane.style.zIndex = "450";
  // Extra hit tolerance makes thin streams easier to click.
  const renderer = L.canvas({
    padding: 0.1,
    pane: "river-streams",
    tolerance: 6,
  });
  let selectedId: RiverFeature["id"] | null = null;
  let selectedLayer: L.Path | null = null;
  const layer = L.geoJSON(undefined, {
    renderer,
    interactive: true,
    style: (feature) =>
      selectedId !== null && feature?.id === selectedId
        ? SELECTED_STYLE
        : BASE_STYLE,
    onEachFeature(feature, featureLayer) {
      if (selectedId !== null && feature.id === selectedId)
        selectedLayer = featureLayer as L.Path;
    },
  } as L.GeoJSONOptions);

  function featureOf(event: L.LeafletEvent) {
    const target = (
      event as L.LeafletEvent & {
        propagatedFrom?: L.Path & { feature?: RiverFeature };
      }
    ).propagatedFrom;
    return target?.feature ? { target, feature: target.feature } : null;
  }

  function clearSelection() {
    selectedLayer?.setStyle(BASE_STYLE);
    selectedLayer = null;
    if (selectedId === null) return;
    selectedId = null;
    if (!disposed) onSelect(null);
  }

  layer.on("click", (event) => {
    const hit = featureOf(event);
    if (!hit || hit.feature.id === undefined) return;
    selectedLayer?.setStyle(BASE_STYLE);
    selectedId = hit.feature.id;
    selectedLayer = hit.target;
    hit.target.setStyle(SELECTED_STYLE).bringToFront();
    onSelect(hit.feature);
  });
  layer.on("mouseover", (event) => {
    const hit = featureOf(event);
    if (hit && hit.target !== selectedLayer) hit.target.setStyle(HOVER_STYLE);
  });
  layer.on("mouseout", (event) => {
    const hit = featureOf(event);
    if (hit && hit.target !== selectedLayer) hit.target.setStyle(BASE_STYLE);
  });
  const cache: CacheEntry[] = [];
  let enabled = false;
  let autoEnabled = true;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame: number | null = null;
  let generation = 0;
  let currentData: RiverStreams | null = null;
  let renderedComplete = false;
  let disposed = false;

  function notify(message = "", error = false) {
    if (!disposed) onState({ enabled, message, error });
  }

  function cancelWork() {
    generation++;
    if (timer !== null) clearTimeout(timer);
    if (frame !== null) cancelAnimationFrame(frame);
    request?.abort();
    timer = null;
    frame = null;
    request = null;
  }

  function clearLayer(keepSelection = false) {
    if (!keepSelection) clearSelection();
    selectedLayer = null;
    layer.clearLayers();
    currentData = null;
    renderedComplete = false;
    if (map.hasLayer(layer)) map.removeLayer(layer);
  }

  function viewport() {
    const bounds = map.getBounds();
    const west = Math.max(-180, bounds.getWest());
    const east = Math.min(180, bounds.getEast());
    const south = Math.max(-90, bounds.getSouth());
    const north = Math.min(90, bounds.getNorth());
    if (west >= east || south >= north) return null;
    return L.latLngBounds([south, west], [north, east]);
  }

  function remember(bounds: L.LatLngBounds, data: RiverStreams) {
    cache.push({ bounds, data });
    while (
      cache.length > 1 &&
      (cache.length > MAX_CACHE_ENTRIES ||
        cache.reduce((sum, entry) => sum + entry.data.features.length, 0) >
          CACHE_FEATURE_LIMIT)
    )
      cache.shift();
  }

  function render(data: RiverStreams) {
    if (currentData === data && renderedComplete && map.hasLayer(layer)) {
      notify(data.features.length ? "" : "No river streams in this area.");
      return;
    }
    clearLayer(true);
    layer.addTo(map);
    currentData = data;
    const token = generation;
    let index = 0;
    function renderChunk() {
      if (disposed || token !== generation) return;
      const features = data.features.slice(index, index + 250);
      const chunk: RiverStreams = { type: "FeatureCollection", features };
      layer.addData(chunk);
      index += features.length;
      if (index < data.features.length) {
        frame = requestAnimationFrame(renderChunk);
      } else {
        frame = null;
        renderedComplete = true;
        notify(data.features.length ? "" : "No river streams in this area.");
      }
    }
    notify("Loading river streams…");
    renderChunk();
  }

  function update() {
    if (disposed || isPrinting()) return;
    cancelWork();
    if (!enabled) {
      clearLayer();
      notify();
      return;
    }
    if (map.getZoom() < MIN_ZOOM) {
      clearLayer();
      notify(`Zoom in to level ${MIN_ZOOM} to load river streams.`);
      return;
    }
    const bounds = viewport();
    if (!bounds) {
      clearLayer();
      notify("No river streams in this area.");
      return;
    }
    const index = cache.findIndex((entry) => entry.bounds.contains(bounds));
    if (index !== -1) {
      const [entry] = cache.splice(index, 1);
      cache.push(entry);
      render(entry.data);
      return;
    }
    clearLayer(true);
    notify("Loading river streams…");
    const token = generation;
    timer = setTimeout(() => {
      timer = null;
      const controller = new AbortController();
      request = controller;
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];
      void getRiverStreams(bbox, controller.signal)
        .then((data) => {
          if (disposed || token !== generation) return;
          request = null;
          remember(bounds, data);
          if (!isPrinting()) render(data);
        })
        .catch((error: unknown) => {
          if (disposed || token !== generation || controller.signal.aborted)
            return;
          request = null;
          notify(errorMessage(error, "Could not load river streams."), true);
        });
    }, 250);
  }

  function onZoom() {
    if (isPrinting()) return;
    if (!enabled && autoEnabled && map.getZoom() >= MIN_ZOOM) {
      enabled = true;
      notify();
    }
  }

  map.on("zoomend", onZoom);
  map.on("moveend", update);

  return {
    setEnabled(value: boolean) {
      autoEnabled = false;
      enabled = value;
      update();
    },
    retry: update,
    clearSelection,
    dispose() {
      disposed = true;
      map.off("zoomend", onZoom);
      map.off("moveend", update);
      cancelWork();
      clearLayer();
    },
  };
}
