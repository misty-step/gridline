# ADR 0001: Stack and Architecture (Gridline — US Data Center Infrastructure Atlas)

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Gridline is an analytical, multi-scale geospatial atlas for tracking major US data center campuses alongside grid interconnection status, water/cooling disclosures, regulatory dockets, balanced proponent/critic evidence, and real-time NOAA/USGS/Federal Register telemetry.

The application requires:
1. Smooth WebGL multi-scale cartography across three semantic zoom tiers (national ISO/cluster aggregation, regional corridor glyphs, and sub-meter parcel footprints over orthophoto satellite imagery).
2. An edge HTTP proxy and cache layer that unifies CORS, request timeouts, Stull wet-bulb derivation, and structured JSON/GeoJSON/CSV exports for NOAA NWS, USGS Water Data OGC API, and Federal Register upstreams without client-side API fragility.
3. Single-origin deployment serving both the static client bundle and `/api/*` edge endpoints.

## Decision

We record an explicit stack selection of **TypeScript + React 19 + MapLibre GL JS + Vite + Cloudflare Workers with Static Assets** (with **Bun** for package management, testing, and CLI tooling) as an intentional exception to a Rust/WASM frontend stack:

1. **Cartographic Engine (`maplibre-gl` + React 19):** MapLibre GL JS provides native WebGL vector/raster tile rendering, symbol/circle expression scaling, GeoJSON polygon parcel overlays, and smooth `flyTo` transitions across basemaps (CartoDB Positron/Dark Matter, Esri World Imagery, USGS National Map Imagery).
2. **Edge Backend (`src/worker/*` on Cloudflare Workers Static Assets):**
   - `wrangler.jsonc` binds `./dist/client` as `ASSETS` with `run_worker_first: ["/api/*"]` and SPA fallback for client routes.
   - `/api/*` routes normalize upstream weather (`api.weather.gov`), hydrology (`api.waterdata.usgs.gov/ogcapi/v0`), and federal regulatory notices (`www.federalregister.gov/api/v1`) with bounded `AbortController` timeouts (4.5s) and `caches.default` edge caching (900s telemetry, 1800s regulatory), plus an hourly `scheduled` cron warmer.
   - Upstream failures never fabricate readings; responses degrade explicitly with `status: "degraded"` and a diagnostic `error` message.
3. **Static Data Bundling (`src/data/index.ts`):** Curated East/West facility datasets, parcel footprint polygons, and ISO region polygons are statically imported into the Worker bundle for zero-I/O query/export execution.
4. **Shared Type & Invariant Kernel (`src/shared/*`):** `types.ts`, `wetbulb.ts`, and `validate.ts` run identically inside the Worker, React client, test suite, and CLI.

## Consequences

- Single deployment target (`gridline` Worker) serves UI assets, filtered GeoJSON/CSV exports, and live telemetry without separate origin servers.
- Every metric carries explicit epistemic provenance (`measured | permitted | filed | disclosed | estimated | undisclosed`) enforced in automated tests and build verification.
- Local verification is deterministic via `bun test`, `tsc --noEmit`, `vite build`, and `wrangler dev`.
