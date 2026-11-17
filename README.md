# Gridline — US Data Center Infrastructure & Telemetry Atlas

An interactive multi-scale geospatial atlas of major US data center campuses (`operational`, `expanding`, `under_construction`, `permitted`, `proposed`, `contested`, and `moratorium`), combining verified power/grid interconnection records, cooling & water disclosures, regulatory dockets, balanced proponent/critic evidence, and live NOAA/USGS/Federal Register telemetry.

## Architecture

- **Frontend (`src/client/`)**: React 19, TypeScript, and MapLibre GL JS across three semantic zoom tiers (National ISO/Market clusters, Regional Corridor glyphs, and Parcel Footprint inspection over Vector, Esri Satellite, or USGS National Map imagery).
- **Edge Worker (`src/worker/`)**: Cloudflare Worker serving `/api/*` routes alongside built Vite SPA assets (`dist/client`), with bounded 4.5s upstream timeouts, edge caching (`caches.default`), and an hourly cron warmer (`0 * * * *`).
- **Live Upstream Telemetry**:
  - **Meteorology & Wet-Bulb**: NOAA/NWS station observations (`api.weather.gov/stations/{ICAO}/observations/latest`) -> Stull (2011) wet-bulb temperature & thermal regime.
  - **Basin Hydrology**: USGS Water Data OGC API (`api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items`) continuous stream discharge (`00060`, `ft3/s`).
  - **Federal Policy**: Federal Register API (`www.federalregister.gov/api/v1/documents.json`).

## Quick Start

```bash
bun install
./scripts/check doctor
./scripts/check fast
```

Run local development (Worker API on `:8788` + Vite HMR client on `:5173`):

```bash
# Terminal 1
bun run dev:worker

# Terminal 2
bun run dev
```

Full end-to-end verification (including live network telemetry & local `wrangler dev` smoke tests):

```bash
./scripts/check verify
```

## Agent & Developer CLI

```bash
bun run cli summary
bun run cli list --iso PJM --contested
bun run cli get <facility-id>
bun run cli live <facility-id>
```

## Worker API Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Service status, dataset counts, and MW totals |
| `GET /api/facilities` | Filter by `status`, `iso`, `state`, `cooling`, `contested`, `undisclosedWater`, `minMw`, `q`, `bbox`; export via `format=json\|geojson\|csv` |
| `GET /api/facilities/:id` | Single facility dossier, campus parcel footprints, and live telemetry |
| `GET /api/telemetry/summary` | Deduplicated live weather & hydrology across all facility stations/gauges (`?refresh=1` bypasses cache) |
| `GET /api/telemetry/live?facilityId=<id>` | Live NOAA wet-bulb + USGS discharge for one campus (`?refresh=1` bypasses cache) |
| `GET /api/regulatory/live` | Live Federal Register filings matching `"data center" electric` |

## Deployment

```bash
bun run deploy
```

See [SPEC.md](SPEC.md), [DESIGN.md](DESIGN.md), and [ADR 0001](docs/decisions/0001-stack-and-architecture.md) for system invariants and design specifications.
