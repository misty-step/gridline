# AGENTS.md — Working Guide for Undercurrent

## Architecture & Source of Truth

- `src/shared/types.ts`: Canonical TypeScript contracts shared across Worker, client, dataset validation, tests, and CLI.
- `src/shared/wetbulb.ts`: Stull (2011) wet-bulb calculation and thermal regime classifier.
- `src/shared/validate.ts`: Runtime schema, epistemic, geospatial, and URL protocol validation.
- `src/data/`: Curated and ingested campus data, re-exported via `src/data/index.ts`. `public/data/footprints-us.geojson` holds traced footprints, loaded lazily.
- `src/worker/`: Cloudflare Worker API (`index.ts`), live grid (`grid.ts`), weather and rivers (`telemetry.ts`), filings (`pulse.ts`, `regulatory.ts`), edge caching, and `ASSETS` fallback.
- `src/client/**`: React + MapLibre GL JS frontend. All design tokens live in `src/client/styles/tokens.css` and are mirrored 1:1 in `DESIGN.md`. Map paint colors in `src/client/lib/constants.ts` mirror the tokens and are checked by `tests/tokens.test.ts`.

## Non-Negotiable Invariants

1. **Epistemic honesty:** `epistemic === "undisclosed"` MUST have `value === null`. Never coerce undisclosed metrics to `0` or fabricate telemetry values on upstream errors (`status: "degraded"` + `error`).
2. **Protocol safety:** Validate external `href` URLs with `isSafeHttpUrl` (`https://` or `http://`) before rendering links.
3. **Verified upstream hosts only:** Use `api.weather.gov`, `api.waterdata.usgs.gov/ogcapi/v0/...`, and `www.federalregister.gov/api/v1/...`. Never use `api.open-meteo.com`, `waterservices.usgs.gov`, or `overpass-api.de`.
4. **Token parity:** Keep `DESIGN.md` and `src/client/styles/tokens.css` synchronized 1:1.
5. **Verified and reported stay separate:** Never sum reported or unpermitted-proposal MW into a verified total, in the UI, API, CLI, or exports.
6. **Plain words:** User-facing copy is sentence case and jargon-free. No code names or raw enum values.

The product was renamed from Gridline to Undercurrent in v1.1.0. The repository, the deployed Worker (`gridline`) and the D1 database (`gridline-observatory`) keep their original identifiers; see [ADR 0003](docs/decisions/0003-rename-to-undercurrent.md).

## Standard Commands

```bash
./scripts/check doctor   # Toolchain & repository sanity check
./scripts/check fast     # Typecheck, unit/integration tests, dataset schema validation, Vite build
./scripts/check verify   # Full fast checks + live upstream checks + CLI + local wrangler dev HTTP smoke test
bun run cli summary      # Dataset rollup via agent CLI
bun run capture          # Screenshot named UI states into out/ui (needs both dev servers; see scripts/capture-ui.ts)
```
