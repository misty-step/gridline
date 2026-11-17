# AGENTS.md — Working Guide for Gridline (`gridline`)

## Architecture & Source of Truth

- `src/shared/types.ts`: Canonical TypeScript contracts shared across Worker, client, dataset validation, tests, and CLI.
- `src/shared/wetbulb.ts`: Stull (2011) wet-bulb calculation and thermal regime classifier.
- `src/shared/validate.ts`: Runtime schema, epistemic, geospatial, and URL protocol validation.
- `src/data/facilities-{east,west}.json`, `footprints-{east,west}.json`, `iso-regions.geojson`: Curated data modules re-exported via `src/data/index.ts`.
- `src/worker/index.ts`, `telemetry.ts`, `regulatory.ts`: Cloudflare Worker API, live NOAA/USGS/Federal Register integration, edge caching, and `ASSETS` fallback.
- `src/client/**`: React + MapLibre GL JS frontend; all visual design tokens live in `src/client/styles/tokens.css` and are mirrored 1:1 in `DESIGN.md`.

## Non-Negotiable Invariants

1. **Epistemic honesty:** `epistemic === "undisclosed"` MUST have `value === null`. Never coerce undisclosed metrics to `0` or fabricate telemetry values on upstream errors (`status: "degraded"` + `error`).
2. **Protocol safety:** Validate external `href` URLs with `isSafeHttpUrl` (`https://` or `http://`) before rendering links.
3. **Verified upstream hosts only:** Use `api.weather.gov`, `api.waterdata.usgs.gov/ogcapi/v0/...`, and `www.federalregister.gov/api/v1/...`. Never use `api.open-meteo.com`, `waterservices.usgs.gov`, or `overpass-api.de`.
4. **Token parity:** Keep `DESIGN.md` and `src/client/styles/tokens.css` synchronized 1:1.

## Standard Commands

```bash
./scripts/check doctor   # Toolchain & repository sanity check
./scripts/check fast     # Typecheck, unit/integration tests, dataset schema validation, Vite build
./scripts/check verify   # Full fast checks + live upstream checks + CLI + local wrangler dev HTTP smoke test
bun run cli summary      # Dataset rollup via agent CLI
```
