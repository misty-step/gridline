# Undercurrent

A live atlas of the power and water behind US data centers.

Undercurrent maps **2,266 data center campuses across all 50 states and DC** and answers three questions about each one: how much power does it draw or plan to draw, how much water, and how do we know. Every figure carries its provenance (measured, permitted, filed, disclosed, estimated, reported, or undisclosed), and capacity that only appears in press reports is never added into a verified total. Live grid dispatch, weather, river flow and new federal and corporate filings sit alongside the static record.

- **Live:** https://gridline.misty-step.workers.dev
- **Repository:** https://github.com/misty-step/gridline

The product was called Gridline until v1.1.0. The repository, Worker and database keep that identifier for now ([ADR 0003](docs/decisions/0003-rename-to-undercurrent.md)).

## Architecture

- **Frontend (`src/client/`)**: React 19, TypeScript, and MapLibre GL JS. Four lenses (`Capacity`, `Water`, `Grid`, `Activity`), a national constellation with collision-culled cluster callouts, lazily loaded traced footprints (`1,915` real polygons, zero synthetic rectangles), a virtualized directory with a verified-versus-reported ledger, campus dossiers, side-by-side comparison, and a live view of grid dispatch and filings. Dark and light themes follow the OS. Design system: [DESIGN.md](DESIGN.md).
- **Census Ingestion (`scripts/ingest-us-census.ts`, `src/data/`)**: Deterministic commercial-safe fusion of curated flagship/provisional dossiers (`75` flagships, `21` proposals) with DOE/PNNL `IM3`, PeeringDB US (`country=US`), and EPA ECHO NAICS `518210`, mapped across all `9` ISO/RTO territories (`PJM`, `ERCOT`, `MISO`, `WECC`, `CAISO`, `SERC`, `SPP`, `NYISO`, `ISO-NE`) to nearest verified 4-char ICAO NOAA NWS stations and active 8-digit USGS `00060` streamgauges.
- **Edge Worker & Cloudflare D1 (`src/worker/`, `migrations/0001_live_observatory.sql`)**: Cloudflare Worker + D1 (`gridline-observatory`) serving `/api/*` routes alongside Vite SPA assets (`dist/client`), with bounded 4.5s timeouts, `caches.default` + D1 snapshot persistence (`live_signals`, `grid_snapshots`, `ingest_runs`), hourly cron ingest (`0 * * * *`), and explicit `live` / `stale` / `degraded` reporting.
- **Live Upstream Observatories**:
  - **Electric Grid Dispatch**: EIA API v2 (`region-data` & `fuel-type-data`) across all 9 US ISO/RTO regions.
  - **Infrastructure Pulse**: Federal Register (`DOE`, `FERC`, `EPA`, `NRC`), SEC EDGAR full-text search (`efts.sec.gov`), and PeeringDB US facility deltas.
  - **Meteorology & Wet-Bulb**: NOAA/NWS station observations -> Stull (2011) wet-bulb temperature & thermal cooling regime.
  - **Basin Hydrology**: USGS Water Data OGC API continuous stream discharge (`00060`, `ft3/s`).

## Quick Start

```bash
bun install
./scripts/check doctor
./scripts/check fast
```

Rebuild the 50-state + DC census and footprints from public open sources:

```bash
bun run ingest
bun run scripts/verify-data.ts
```

Provision and migrate local/remote Cloudflare D1 (`gridline-observatory`):

```bash
bunx wrangler d1 migrations apply gridline-observatory --local
bunx wrangler d1 migrations apply gridline-observatory --remote
```

Run local development (Worker API + local D1 on `:8788`, Vite HMR client on `:5173`):

```bash
# Terminal 1
bun run dev:worker

# Terminal 2
bun run dev
```

Full end-to-end verification (live network dataset checks, CLI smoke, and local `wrangler dev` HTTP smoke across all routes):

```bash
./scripts/check verify
```

## Agent & Developer CLI

```bash
bun run cli summary
bun run cli list --tier flagship --iso PJM --contested
bun run cli list --verified-only --state VA --limit 20
bun run cli get <facility-id>
bun run cli live <facility-id>
bun run cli grid [--iso PJM]
bun run cli pulse [--stream federal_register|sec_edgar|peeringdb|all] [--window 90d] [--limit 20]
```

## Worker API Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Service status, release (`1.1.0`), campus & jurisdiction counts, segregated verified vs. reported MW totals, and `d1Bound` |
| `GET /api/facilities` | Compact `FacilityIndexItem[]` + `FleetSummaryMetadata` + `isoRegions` (`?view=legacy` returns full `FacilityRecord[]` + footprints); filter by `status`, `tier`, `verifiedOnly`, `proposalsOnly`, `window`, `iso`, `state`, `cooling`, `contested`, `undisclosedWater`, `minMw`, `q`, `bbox`; export via `format=json\|geojson\|csv` |
| `GET /api/facilities/:id` | Single facility dossier, campus parcel footprints, live NOAA/USGS telemetry, and regional EIA `gridSnapshot` |
| `GET /api/grid/live` | Live EIA v2 regional electric demand, net generation, interchange, and fuel mix across all 9 ISOs (`?refresh=1`) |
| `GET /api/pulse/live` | Multi-stream live signals (`federal_register`, `sec_edgar`, `peeringdb`) filterable by `stream`, `window` (`24h\|7d\|30d\|90d\|all`), and `refresh=1` |
| `GET /api/telemetry/summary` | 50-subrequest-safe batched weather & hydrology summary across top priority corridors (`?refresh=1`) |
| `GET /api/telemetry/live?facilityId=<id>` | Live NOAA wet-bulb + USGS discharge for one campus (`?refresh=1`) |
| `GET /api/regulatory/live` | Live Federal Register `DOE/FERC/EPA/NRC` filings |

## Checking the UI

With both dev servers running, capture named UI states as PNGs. The run prints each file path and exits non-zero on any console or page error.

```bash
bun run capture
```

```bash
bun run capture --theme light --size 390x844 --states home,dossier,live
```

## Deployment

```bash
bun run deploy
```

See [SPEC.md](SPEC.md), [DESIGN.md](DESIGN.md), [ADR 0001](docs/decisions/0001-stack-and-architecture.md), [ADR 0002](docs/decisions/0002-comprehensive-census-and-live-observatory.md), and [ADR 0003](docs/decisions/0003-rename-to-undercurrent.md).
