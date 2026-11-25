# Watershed report client

The React client draws or uploads boundaries, displays the analysis and map overlay, and manages saved reports. For setup, dataset paths, and backend requirements see the [server README](../server/README.md).

```powershell
pnpm install
pnpm dev
```

Open the URL printed by Vite. Its development proxy forwards `/api` to `http://localhost:3000`. If the server uses another address, set `WATERSHED_API_TARGET` before starting Vite.

The client uses Tailwind CSS through the Vite plugin. Leaflet and Leaflet Draw retain their own stylesheets for map controls and rendering.

The map's **Map layers** panel offers **OpenStreetMap** (the default) and **Satellite** (Esri World Imagery) base maps. Switching base maps preserves the selected boundary, land-cover overlay, rivers, and hydrology stations. Both base maps require an internet connection.

River streams are off by default and load only when **River Stream** is checked (at zoom level 5 or higher). Panning or zooming refreshes streams only while enabled. Unchecking the layer cancels pending loading and hides the streams.

Selecting a stream opens its details without creating a buffer. Move the distance slider or enter a whole-number distance within the slider's range to request a buffer preview, then select **Use as boundary** to apply it. Selecting another stream resets the preview until its distance is adjusted.

## Client structure

- `src/pages`: page state and watershed workflows.
- `src/layouts`: sidebar and page layout.
- `src/components`: reusable controls, map, report results and saved reports.
- `src/api`: Axios client and typed authentication and watershed endpoints.
- `src/types`: shared report and geometry types.

Station tooltip and popup content is defined in `src/components/HydrologyStationDetails.tsx`. The map renders both boxes with JSX through React portals, keeping them in the main React tree. The Leaflet adapter in `src/utils/hydrologyStationLayer.tsx` only provides the empty containers and handles marker behavior; it does not render UI or create separate React roots.

Opening a station popup suppresses that station's hover tooltip until the popup is closed. Other stations' hover tooltips appear above open popups.

The API client uses the existing session cookie and request-verification header; it does not use the token authentication from the reference project.
