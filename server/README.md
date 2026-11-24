# Watershed report

NestJS and React implementation of the watershed report. It reads the local population shapefile, building FlatGeobuf, ward GeoJSON, and land-cover GeoTIFFs using GDAL. Results include population, building types, administrative units, land cover and a map overlay.

## Local setup

Use Node.js 24 and pnpm. Open two PowerShell terminals:

```powershell
cd "D:\1 ML project\DamageAssesment\server"
pnpm install
pnpm run start:dev
```

```powershell
cd "D:\1 ML project\DamageAssesment\client"
pnpm install
pnpm dev
```

Open the address printed by Vite. The server defaults to port 3000. The GDAL dependency downloads a platform-specific native binary during installation; the pnpm workspace permits its installation script.

When started from the server directory, the default data directory is `D:\1 ML project\upload\DamageAssesment`. Set `WATERSHED_DATA_DIR` before starting the server if the datasets are elsewhere. The directory must contain:

- `Population\nepal_polygon.shp` and its shapefile companions;
- `buildings\osm_google_microsoft_buildings_NPL.fgb`;
- `river_stream\waterways.fgb` (WGS84);
- `nepal_wards\npl_admin4.geojson`;
- `lulc\44R_20250101-20251231.tif` and `lulc\45R_20250101-20251231.tif`.

The map uses OpenStreetMap tiles, so displaying it requires an internet connection and sends the viewed map area to the tile provider. Boundary uploads support GeoJSON and zipped shapefiles, limited to 20 MB compressed and 100 MB unpacked.

Printed reports include a regional location map with a marker for the analysis area, as well as the detailed land-cover map. The location map also loads OpenStreetMap tiles when a report is shown.

## Hydrology stations

The server reads the four DHM station pages (5047, 5080, 260 and 262) on startup and every 10 minutes while the server is running. It stores the latest successful values in `server\data\hydrology-stations.csv` (set `HYDROLOGY_STATIONS_CSV` to use another path). The CSV is a snapshot, not a history; `fetched_at` records each station's last successful collection. The structured DHM data supplies district, coordinates, elevation and description; the river name is derived from the station name. The CSV also contains the latest row of DHM's Point observations table, with its time kept as displayed by DHM. Missing values remain blank. Point observations are not elevations; for stations without an elevation the map shows the point value and its observation time separately. The displayed DHM page currently labels the basin as “District”, so its visible value may differ from the structured district.

The map displays the stations by default; hover a marker or click it for details. Use the map layers legend to hide them. If a refresh fails, the last successful station values are retained, the server logs the failure, and the map shows a warning. The map polls the server for updates; browsers do not scrape DHM. Internet access is required for collection. The CSV is ignored by Git and can be backed up if needed.

River streams are not loaded on initial map display. Enable **River Stream** in the map layers legend, or zoom the map to level 5 or higher to enable it automatically. If enabled below level 5, zoom in to load streams. Turning the layer off disables automatic activation until it is manually enabled again. The server queries the FlatGeobuf spatial index for the visible WGS84 bounding box; recently loaded extents are cached in the browser. At low zoom levels a large extent can return many complete geometries and take time to load. Click a stream to highlight it and open the stream panel with its name, waterway type and ID; clicks within a few pixels of a thin stream are accepted. The panel slider creates a buffer from 50 m to 5 km around the selected stream. The server calculates it in meters with a local equidistant projection (`GET /api/watershed/river-streams/:id/buffer?distance=500`). Choose **Use as boundary** to make the buffer the analysis boundary. Printed reports show the analysis boundary and land-cover overlay; river streams and buffer previews are hidden.

## Accounts and reports

Accounts are new and separate from Django; existing Django users and reports are not migrated. Anonymous users can analyze and print; sign in and choose **Save report** to rerun and save an anonymous analysis. Signed-in analyses are saved automatically. Reports can be opened, renamed, deleted and printed.

The SQLite database defaults to `server\data\watershed.sqlite`; set `WATERSHED_DB_PATH` to change it. Back up this file to preserve accounts and reports. The database is ignored by Git.

This is intended for local development. Before public deployment, add deployment-specific protections including HTTPS, login rate limiting, operational monitoring and appropriate resource limits for large spatial analyses. Large analyses run synchronously and may block other requests.

## Checks

```powershell
pnpm run build
pnpm test
pnpm run test:e2e
pnpm run lint
```
