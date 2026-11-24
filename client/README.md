# Watershed report client

The React client draws or uploads boundaries, displays the analysis and map overlay, and manages saved reports. For setup, dataset paths, and backend requirements see the [server README](../server/README.md).

```powershell
pnpm install
pnpm dev
```

Open the URL printed by Vite. Its development proxy forwards `/api` to `http://localhost:3000`. If the server uses another address, set `WATERSHED_API_TARGET` before starting Vite.

The client uses Tailwind CSS through the Vite plugin. Leaflet and Leaflet Draw retain their own stylesheets for map controls and rendering.

## Client structure

- `src/pages`: page state and watershed workflows.
- `src/layouts`: sidebar and page layout.
- `src/components`: reusable controls, map, report results and saved reports.
- `src/api`: Axios client and typed authentication and watershed endpoints.
- `src/types`: shared report and geometry types.

The API client uses the existing session cookie and request-verification header; it does not use the token authentication from the reference project.
