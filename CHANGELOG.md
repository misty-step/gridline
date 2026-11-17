# Changelog

## 1.1.0 — 2026-11-17

### Changed
- **Renamed to Undercurrent.** New wordmark and mark (two crossing currents), page title, CLI banner, export filenames (`undercurrent-campuses.csv`/`.geojson`), outbound user agents, and `localStorage` key. The repository, Worker name and D1 database name are unchanged ([ADR 0003](docs/decisions/0003-rename-to-undercurrent.md)).
- **New design system.** Replaced the borrowed "NERV // MAGI" theme with an identity of its own: amber for power, cyan for water, solid for verified, hatched for reported-only, neutral chrome. Removed chamfered clip-paths, scanlines, corner brackets and amber-on-everything borders. Light-theme status colors now meet WCAG AA on every surface.
- **View ledger.** The directory opens with operating, verified planned and reported-only capacity as three separate figures and a proportional bar, plus disclosed water and counts of undisclosed and contested campuses.
- **Readable map.** Cluster callouts name the hub and label each figure; hubs with no public capacity show their site count instead of `0 MW`. The legend is generated from the map palette so it cannot drift from the marks. The position readout is plain coordinates.
- **Plain language throughout.** Lens names are Capacity, Water, Grid and Activity. The live view's freshness strip says what each stream is and whether it is live, stale or degraded. Filing dates are formatted, and filings link to campuses by name instead of raw id.
- **Theme follows the OS by default** and is no longer written into shared links.

### Added
- `bun run capture` (`scripts/capture-ui.ts`): screenshots named UI states and fails on console errors.
- `tests/tokens.test.ts`: fails if the map paint palette differs from `tokens.css`.

### Removed
- The `video/` launch-film pipeline, which rendered the old brand.
- 471-line token file reduced to a single dark block (the duplicated `prefers-color-scheme` copy was unreachable), and three unused tokens dropped.

## 1.0.0 — 2026-11-16

### Added
- **50-State + DC National Census & Real Footprint Fusion (`scripts/ingest-us-census.ts`, `src/data/`)**: Fused audited flagship dossiers (`75` flagships) and `21` provisional 2025–2026 proposals with DOE/PNNL `IM3` (`IMMM-SFA/datacenter-atlas`), PeeringDB US (`country=US`), and EPA ECHO NAICS `518210` into `2,266` deduplicated campuses across all `51` US jurisdictions (`50` states + `DC`) and all `9` ISO/RTO territories (`PJM: 731`, `WECC: 439`, `SERC: 252`, `MISO: 229`, `ERCOT: 207`, `CAISO: 155`, `SPP: 95`, `ISO-NE: 84`, `NYISO: 74`), with nearest verified 4-char ICAO NOAA NWS stations and active 8-digit USGS `00060` streamgauges.
- **Zero Synthetic Rectangles & Segregated Fleet Accounting**: Deleted legacy synthetic 5-vertex footprint boxes (`footprints-east.json`, `footprints-west.json`); replaced with `1,915` real traced/IM3 building and campus polygons (`1,271` `verified_polygons`, `995` honest `point_only`) served lazily at `/data/footprints-us.geojson`, alongside strictly separated capacity accounting (`7,992 MW` verified operational, `36,493 MW` verified planned, and `30,885 MW` reported/proposed pipeline).
- **Live EIA Electric Grid Dispatch (`src/worker/grid.ts`, `GET /api/grid/live`)**: Polls EIA v2 `region-data` and `fuel-type-data` across all 9 US ISO/RTO regions with fuel-mix share calculation, `caches.default` + Cloudflare D1 `grid_snapshots` persistence, and explicit `live`/`stale`/`degraded` states.
- **Multi-Stream Live Infrastructure Pulse & D1 Persistence (`src/worker/pulse.ts`, `migrations/0001_live_observatory.sql`, `GET /api/pulse/live`)**: Aggregates Federal Register (`DOE`, `FERC`, `EPA`, `NRC` with normalized `<INF>`/`<SUP>`/`<E>` chemistry tags), SEC EDGAR (`efts.sec.gov`), and PeeringDB US facility deltas into Cloudflare D1 (`gridline-observatory`: `live_signals`, `grid_snapshots`, `ingest_runs`) with `stream` and `window` (`24h|7d|30d|90d|all`) filters.
- **50-Subrequest-Safe Observatory API & CLI (`src/worker/`, `scripts/cli.ts`)**: Added compact `FacilitiesIndexApiResponse` default on `GET /api/facilities` (`?view=legacy` preserved), `tier`/`verifiedOnly`/`window`/`state` filters, `gridSnapshot` hydration on `GET /api/facilities/:id`, <= 20-subrequest `/api/telemetry/summary` (top <= 18 NOAA + 1 batched USGS OGC call), and `bun run cli grid` / `pulse` commands.
- **NERV // MAGI Tactical Cartography UI (`src/client/`, `DESIGN.md`, `src/client/styles/tokens.css`)**: Upgraded to 135 design tokens across `NERV CRT` (dark default) and `GEHIRN Technical Schematic Paper` (light), 4 analytical lenses (`Capacity`, `Water`, `Grid`, `Activity`) with `New England (ISO-NE)` and `NY / NJ Metro` corridors, 50-state WebGL constellation with `<= 22` collision-culled corridor pills, NERV optical reticle on `point_only` campuses, `92px`-pitch virtualized `DirectoryRail`, adaptive `FacilityDrawer` with PeeringDB/EPA registry signals, and `LivePulseModal` replacing `RegulatoryModal`.

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
