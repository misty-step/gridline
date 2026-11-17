# Changelog

## 0.1.0 — 2026-11-16

### Added
- **Multi-scale US Data Center Atlas (`src/client/`)**: MapLibre GL JS + React 19 UI supporting three semantic zoom tiers (national ISO/cluster aggregation, regional corridor glyphs with Capacity/Water/Grid lenses, and `z 15.8` parcel-level 2.5D hall, substation, and cooling-yard inspection over Vector, Esri World Imagery, and USGS National Map imagery).
- **Curated 45-Campus Dataset (`src/data/`)**: 22 Eastern/Midwest campuses and 23 Central/Texas/West campuses (`7,728 MW` operational, `31,401 MW` planned pipeline, `218` parcel footprint polygons, `9` contiguous-US ISO/RTO region polygons) with explicit epistemic provenance tags (`measured`, `permitted`, `filed`, `disclosed`, `estimated`, `undisclosed`) and symmetric proponent/critic source records (`199` primary links).
- **Live Edge Telemetry Proxy (`src/worker/`)**: Cloudflare Workers Static Assets deployment aggregating live NOAA NWS station observations (computing Stull 2011 wet-bulb temperature and cooling regime), USGS OGC continuous stream discharge (`00060`), and live Federal Register FERC/DOE/EPA filings with bounded 4.5s timeouts, edge caching, hourly cron warming, and explicit `degraded` status reporting.
- **Agent CLI & Verification Gates (`scripts/`)**: `bun run cli` (`summary`, `list`, `get`, `live`) and `./scripts/check` (`doctor`, `fast`, `verify`) enforcing `DESIGN.md` ↔ `tokens.css` parity (119 tokens), TypeScript strict checks, and dataset invariants.
- **Deterministic 1080p60 Launch Film Pipeline (`video/`)**: Reproducible Playwright + Chrome + FFmpeg motion composition and procedural 48 kHz stereo soundtrack generator (`bun run video:plates`, `video:audio`, `video:render`).
