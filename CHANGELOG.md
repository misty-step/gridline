# Changelog

## 0.2.0 — 2026-11-16

### Changed
- **Focused Workspace & Single-Bar Chrome**: Consolidated `TopBar` and the 2-row `TelemetryRibbon` into one `48px` command bar (`Corridors ▾` popover + cycling theme button), moved the basemap switcher onto the map canvas, slimmed `--rail-width` (`312px`) and `--drawer-width` (`456px`), made `.map-wrapper` a true flex sibling with `ResizeObserver`, and framed all contiguous-US clusters cleanly on cold load without West Coast rail occlusion.
- **3-Tier Analytical Lens Parity & Cartographic Polish**: Bound macro cluster rings, pill sub-labels, and conditional `Grid Stress` ISO fills across all three lenses (`Capacity`, `Water`, `Grid`); fixed regional `facilities-water-undisclosed-ring` and `facilities-contested-halo` layer ordering/radii so dashed rings render cleanly outside core fills; added 1:1 legend parity, basemap symbol toning, cluster hover summaries, hover lifecycle cleanup, and `"Peak Water"` tooltip labels.
- **Editorial Dossier, Contrast & Responsive Ergonomics**: Promoted a 4-KPI executive strip and compact single-row NOAA/USGS telemetry strip above prose in `FacilityDrawer`, flattened nested borders via tonal elevation, added `< 1280px` single-side-panel mutual exclusion and a `390x844` 2-detent sheet (`peek` on `Inspect Parcel`, `>= 44px` touch targets), and raised light-mode status/epistemic/border tokens to WCAG AA (`>= 4.5:1` text, `>= 3.0:1` UI borders).
- **Accessibility & Federal Pulse Accuracy**: Fixed `/` search shortcut literal-character insertion, added modal focus-trap & focus restoration across `RegulatoryModal` and `ComparisonModal`, honored `prefers-reduced-motion` across CSS and MapLibre flights, and filtered `Federal Regulatory Pulse` strictly to `DOE`, `FERC`, `EPA`, and `NRC` filings.

## 0.1.0 — 2026-11-16

### Added
- **Multi-scale US Data Center Atlas (`src/client/`)**: MapLibre GL JS + React 19 UI supporting three semantic zoom tiers (national ISO/cluster aggregation, regional corridor glyphs with Capacity/Water/Grid lenses, and `z 15.8` parcel-level 2.5D hall, substation, and cooling-yard inspection over Vector, Esri World Imagery, and USGS National Map imagery).
- **Curated 45-Campus Dataset (`src/data/`)**: 22 Eastern/Midwest campuses and 23 Central/Texas/West campuses (`7,728 MW` operational, `31,401 MW` planned pipeline, `218` parcel footprint polygons, `9` contiguous-US ISO/RTO region polygons) with explicit epistemic provenance tags (`measured`, `permitted`, `filed`, `disclosed`, `estimated`, `undisclosed`) and symmetric proponent/critic source records (`199` primary links).
- **Live Edge Telemetry Proxy (`src/worker/`)**: Cloudflare Workers Static Assets deployment aggregating live NOAA NWS station observations (computing Stull 2011 wet-bulb temperature and cooling regime), USGS OGC continuous stream discharge (`00060`), and live Federal Register FERC/DOE/EPA filings with bounded 4.5s timeouts, edge caching, hourly cron warming, and explicit `degraded` status reporting.
- **Agent CLI & Verification Gates (`scripts/`)**: `bun run cli` (`summary`, `list`, `get`, `live`) and `./scripts/check` (`doctor`, `fast`, `verify`) enforcing `DESIGN.md` ↔ `tokens.css` parity (119 tokens), TypeScript strict checks, and dataset invariants.
- **Deterministic 1080p60 Launch Film Pipeline (`video/`)**: Reproducible Playwright + Chrome + FFmpeg motion composition and procedural 48 kHz stereo soundtrack generator (`bun run video:plates`, `video:audio`, `video:render`).
