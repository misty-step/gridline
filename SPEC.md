# Gridline — US Data Center Infrastructure & Live Grid Observatory Specification

Gridline is a national cartographic observatory mapping operational, expanding, permitted, proposed, contested, and moratorium-affected data center campuses across all 50 US states and the District of Columbia alongside live regional electric grid dispatch, meteorological wet-bulb telemetry, basin streamgauge discharge, federal and corporate evidence streams, and epistemic provenance records.

For architecture decisions, see [ADR 0001](docs/decisions/0001-stack-and-architecture.md) and [ADR 0002](docs/decisions/0002-comprehensive-census-and-live-observatory.md). For visual tokens and surface rules, see [DESIGN.md](DESIGN.md).

## Purpose

Gridline provides researchers, grid planners, municipal reviewers, journalists, and operators with a single auditable system of record for US data center infrastructure that:

1. Combines a 50-state + DC spatial census of hyperscale, colocation, AI compute, and enterprise campuses with verified building and campus geometry where mapped.
2. Pairs static infrastructure inventories with continuous live telemetry from regional electric grids, nearest weather stations, and streamgauges.
3. Surfaces real-time policy, regulatory, corporate disclosure, and interconnection registry deltas in one synchronized observatory.
4. Separates verified, permitted, and metered capacity from unconfirmed media reports, proposals, and operator non-disclosures so planning totals never conflate verified load with speculative pipelines.

## Non-Goals

- **No Non-Commercial or Restricted Bulk Scraping:** Gridline excludes datasets or bulk exports carrying non-commercial restrictions (such as FracTracker) or opaque licensing.
- **No Synthetic Geometry or Filler Prose:** Gridline never fabricates parcel rectangles around unmapped coordinates and never generates templated stakeholder commentary on facilities lacking primary documentary evidence.
- **No Fabricated Live Telemetry:** Gridline never interpolates or substitutes synthetic weather, river discharge, grid dispatch, or filing records when upstream services time out or fail.
- **No Sub-Minute SCADA or Proprietary Trading Telemetry:** Gridline tracks public grid balancing-authority dispatch, public regulatory dockets, and public environmental observations rather than sub-second substation telemetry or proprietary locational marginal pricing feeds.

## Terms

- **Campus:** A discrete US data center site or multi-building colocation hub anchored to verified WGS84 coordinates, assigned a `Catalog Tier` and `Lifecycle Status`, and linked to parcel metrics, electric utility and grid interconnection posture, water and cooling disclosures, regulatory records, provenance sources, and live telemetry anchors.
- **Catalog Tier:** Three-level classification reflecting documentary and spatial verification depth:
  - `flagship`: Deep-research dossiers carrying audited parcel/infrastructure sub-zones, primary regulatory dockets, full power/water provenance, and balanced proponent and critic stakeholder evidence.
  - `registry`: Verified national facilities fused from commercial-safe federal energy, environmental, and interconnection registries (such as DOE/PNNL infrastructure atlases, PeeringDB colocation facilities, and EPA regulated-facility records), preserving real mapped polygons and registry identifiers without invented commentary.
  - `provisional`: Newly announced, proposed, or emerging developments ingested from corporate securities filings, federal dockets, or public reporting pending full parcel and registry verification.
- **Structure Footprint:** A closed polygon representing a real surveyed or orthophoto-traced structure or parcel boundary classified as `building`, `campus`, `operational_hall`, `planned_expansion`, `substation_yard`, or `cooling_yard`. Campuses without traced geometry carry explicit `point_only` coverage.
- **Evidence Signal:** A timestamped live intelligence item captured from federal regulatory dockets, corporate public disclosures, or colocation registry updates, tagged with provenance stream, affected jurisdictions or grid regions, and campus linkages when matched.
- **Epistemic Status:** An explicit provenance classification attached to metrics, tenant attributions, capacity figures, and evidence signals:
  - `measured`: Direct metered environmental, utility, or physical telemetry observation.
  - `permitted`: Numerical capacity, emissions, or withdrawal ceiling authorized in an issued regulatory permit.
  - `filed`: Submitted in an official regulatory docket, utility interconnection request, or municipal site plan.
  - `disclosed`: Published directly by the operator, developer, or electric utility in formal reports or filings.
  - `estimated`: Transparently modeled engineering or agency figure accompanied by a stated derivation basis.
  - `reported`: Capacity, investment, or expansion figure reported in secondary press or unconfirmed announcements, strictly segregated from verified MW totals.
  - `undisclosed`: Withheld by the operator or absent from public filings, represented with an explicit null numeric value and an explanatory `basis`.
- **Lifecycle Status:** Campus execution and legal posture: `operational`, `expanding`, `under_construction`, `permitted`, `proposed`, `contested`, or `moratorium`.
- **ISO/RTO Region:** One of the nine US wholesale grid operator or reliability territories spanning the 50 states and DC (`PJM`, `ERCOT`, `MISO`, `WECC`, `CAISO`, `SERC`, `SPP`, `NYISO`, `ISO-NE`).
- **Live Grid Snapshot:** Near-real-time hourly operating state for an `ISO/RTO Region`, capturing balancing-authority demand (MW), net generation (MW), interchange (MW), observation timestamp, upstream freshness status (`live`, `stale`, or `degraded`), and generation fuel-mix shares (`nuclear`, `gas`, `coal`, `wind`, `solar`, `hydro`, `other`).
- **Wet-Bulb Temperature & Thermal Regime:** Stull (2011) empirical psychrometric wet-bulb temperature derived from nearest 4-character ICAO weather station dry-bulb temperature and relative humidity, classified into `free_economizer` (`< 13°C`), `adiabatic_assist` (`13°C–20°C`), `peak_chiller_evap` (`> 20°C`), or `unavailable`.
- **Activity Delta:** A selectable time window (`24h`, `7d`, `30d`, `90d`, or `all`) highlighting newly added campuses, capacity revisions, regulatory dockets, corporate disclosures, and registry updates occurring within that lookback horizon.

## Domain Invariants

1. **50-State + DC National Coverage & Spatial Bounds:** The national catalog spans all 50 US states plus the District of Columbia (`51` jurisdictions). Every campus coordinate `[lon, lat]` and every `Structure Footprint` polygon vertex lies strictly within US geographic bounds (`lon` in `[-170, -65]`, `lat` in `[18, 72]`), and every polygon ring is geometrically closed (`firstVertex === lastVertex` with at least 4 coordinate pairs).
2. **Epistemic Honesty & Separated Pipeline Totals:** Any metric with `Epistemic Status` equal to `undisclosed` carries `null` for its numeric value and a non-empty explanatory basis; non-`undisclosed` metrics carry finite numeric values. No undisclosed water or power value is ever coerced to `0`. All national summaries, regional aggregates, viewport ribbons, and exports strictly separate **Verified MW** (`measured`, `permitted`, `filed`, `disclosed`, `estimated` on non-speculative builds) from **Reported / Unpermitted Proposed MW** (`reported` capacity or unpermitted `proposed` pipeline). A one-action **Verified Only** filter isolates strictly verified campuses and capacity totals across map, directory, and export views.
3. **Zero Fabricated Geometry or Prose:** Only real surveyed or orthophoto-traced polygons render at parcel inspection zoom. Campuses lacking traced boundaries carry `point_only` coverage and render a crisp coordinate locator reticle accompanied by an honest absence notice—never synthetic rectangles or buffered bounding boxes. Balanced `proponent` and `critic` stakeholder arrays with primary citations are mandatory on `flagship` campuses and strictly optional and evidence-only on `registry` and `provisional` sites, with zero synthetic filler prose.
4. **Universal Weather, Hydrology, and Grid Linkage:** Every `Campus` binds deterministically to a valid 4-character ICAO weather station (`^[A-Z0-9]{4}$`), an 8-digit hydrologic streamgauge (`^\d{8}$`), a watershed baseline stress tier, and one of the nine `ISO/RTO Region` territories.
5. **Explicit Freshness SLAs & Non-Fabricated Degradation:** Live observatory streams enforce explicit freshness budgets—`Live Physics <= 60 min` (station weather, streamgauge discharge, regional electric grid dispatch), `Filings & Proposals <= 24 hr` (federal regulatory notices, corporate securities filings, colocation registry deltas), and `Spatial Census <= 7 days` (national spatial fusion index). Upstream errors, rate limits, or expired budgets surface explicit `degraded` or `stale` status with diagnostic errors and `null` unmeasured readings, never fabricated fallback values.
6. **Commercial-Safe Open Provenance & Link Safety:** All bundled spatial, environmental, and registry attributes derive exclusively from commercial-safe open sources (`US Public Domain`, `CC-BY-4.0`, `ODbL`, `PeeringDB`), excluding non-commercial bulk exports. Every source reference and permit link passes strict `http:` or `https:` protocol validation before persistence or interactive rendering.

## Multi-Scale Cartographic & Observatory Experience

### Four Analytical Lenses

1. **Capacity & Lifecycle:** Encodes `Lifecycle Status` and verified operational vs. planned MW capacity, distinguishing `flagship`, `registry`, and `provisional` tiers via geometric hierarchy and framing `contested` and `moratorium` sites with outer dashed/double halos independent of color perception.
2. **Water & Cooling Stress:** Encodes cooling architecture and watershed baseline stress (`low` through `extremely_high`), marking `undisclosed` water operators with a distinct dashed warning ring and explicit `Undisclosed by Operator` labels.
3. **Grid & Live Dispatch:** Encodes utility interconnection status alongside live `ISO/RTO Region` load, net generation, interchange, and generation fuel-mix bars (`nuclear`, `gas`, `coal`, `wind`, `solar`, `hydro`).
4. **Live Activity & Proposals:** Highlights campuses and regions experiencing recent `Activity Delta` (`24h`, `7d`, `30d`, `90d`, `all`) across regulatory filings, corporate disclosures, colocation registry changes, and `provisional` proposals with subtle delta emphasis.

### Three Semantic Zoom Tiers

1. **Macro National (`z 3.0–5.8`):** Renders the full 50-state + DC luminous campus constellation overlaid with interactive `ISO/RTO Region` boundaries and dynamically computed market-cluster proportional rings. Collision-culled corridor callout pills display verified operational MW, verified planned MW, separated reported/proposed MW when present, and facility counts without overlapping neighboring hubs. Selecting a cluster zooms smoothly into its regional corridor.
2. **Regional Corridor (`z 5.8–12.2`):** Renders individual campus glyphs scaled by capacity with inner operational cores, tier-distinct visual treatments for `flagship`, `registry`, and `provisional` campuses, and non-color indicators for `contested`, `moratorium`, and `undisclosed` water sites. Hover previews display name, tier, MW split, water/cooling posture, and live wet-bulb thermal regime.
3. **Granular Parcel Inspection (`z 12.2–18.5`):** Lazily reveals real traced `Structure Footprint` sub-zones (`building`, `campus`, `operational_hall`, `planned_expansion`, `substation_yard`, `cooling_yard`), scale bars, live cursor/center coordinates, and one-click `z ~16` high-resolution satellite/orthophoto parcel inspection. For `point_only` campuses, the map displays a coordinate locator reticle and explicit unmapped-geometry notice rather than invented parcel boundaries.

### Workspace Choreography, Search, Comparison & Live Pulse

- **Responsive Single-Panel & Mobile-Peek Choreography:** On wide viewports (`>= 1280px`), the directory rail, interactive map canvas, and facility dossier operate as non-overlapping flex siblings. Below `1280px`, opening a dossier collapses the directory rail cleanly into a single-click return pill so the map remains unobstructed. On narrow mobile viewports (`<= 768px`), campus inspection uses a 2-detent bottom sheet (`peek` at `42%` height, `expanded` at `88%` height) that automatically snaps to `peek` when triggering parcel inspection, with `>= 44px` touch targets throughout.
- **Virtualized Directory & Multi-Faceted Filtering:** The directory searches across campus names, cities, counties, states, operators, developers, utilities, tenants, registry identifiers, and permit dockets, virtualizing long lists for smooth scrolling across thousands of national campuses. Filters cover `Verified Only`, `Catalog Tier`, `Lifecycle Status`, `ISO/RTO Region`, `Cooling Architecture`, `Contested / Moratorium Only`, `Undisclosed Water Only`, `Activity Delta` window, and sort order. A synchronized viewport telemetry summary continuously separates verified operational MW, verified planned MW, and reported/proposed MW for the active map bounds and filter set.
- **Side-by-Side Comparison Matrix:** Users can pin 2 to 3 campuses into a persistent dock and open an accessible comparison matrix contrasting tier, lifecycle, verified vs. reported MW, interconnection posture, water disclosures, cooling architecture, watershed stress, live weather/wet-bulb telemetry, live streamgauge discharge, regional grid snapshot, and permitting posture.
- **Unified Live Pulse View:** A dedicated observatory modal unifies live regional electric grid dispatch and fuel-mix snapshots across all 9 ISO/RTO regions with filtered `Evidence Signal` streams from DOE/FERC/EPA/NRC federal dockets, SEC corporate filings, and PeeringDB colocation registry deltas, filterable by stream and `Activity Delta` window.

## Dossier & Epistemic Evidence Contract

- **Live Environmental & Grid Telemetry Panel:** Every campus dossier displays live station temperature (`°C`/`°F`), relative humidity, computed Stull wet-bulb temperature and cooling regime pill, nearest streamgauge discharge (`ft3/s`), and regional `Live Grid Snapshot` demand, net generation, interchange, and fuel-mix breakdown with exact observation timestamps, on-demand refresh, clickable upstream source links, and explicit `degraded` or `stale` diagnostics when observations are unavailable.
- **Epistemic Badges & Separated Totals:** Every quantitative metric renders alongside its `Epistemic Status` badge, clickable primary source citation, and explanatory `basis` note. Undisclosed metrics display `"Undisclosed by Operator"` with full provenance context.
- **Registry Cross-References:** Where fused from national registries, dossiers surface verifiable identifiers such as PeeringDB facility/campus IDs, network/IX/carrier counts, CLLI codes, EPA ECHO `RegistryID` / air / NPDES permit identifiers, and IM3 surveyed building square footage.
- **Symmetric Evidence vs. Zero Filler:** `flagship` dossiers present equal-weight two-column **Proponent** and **Critic** evidence matrices backed by primary source citations. `registry` and `provisional` dossiers render only verifiable registry records, permits, and linked `Evidence Signal` items, omitting perspective blocks cleanly when no audited stakeholder claims exist.

## Live Freshness SLAs & CLI/Export Parity

### Freshness Service-Level Targets

| Stream | Freshness SLA | Behavior on Expiry or Failure |
| --- | --- | --- |
| **Live Physics** (NOAA NWS weather, USGS streamgauge `00060`, EIA regional grid dispatch & fuel mix) | `<= 60 min` | Marks observation `stale` beyond budget or `degraded` on upstream error/timeout; preserves `null` for unmeasured numeric fields and surfaces diagnostic message. |
| **Filings & Proposals** (Federal Register dockets, SEC EDGAR filings, PeeringDB facility deltas) | `<= 24 hr` | Surfaces per-stream `stale` or `degraded` indicator with last successful sync timestamp; never invents placeholder notices or proposals. |
| **Spatial Census** (National 50-state + DC campus index and traced structure footprints) | `<= 7 days` | Records census generation timestamp in fleet summary metadata and re-validates all spatial/epistemic invariants on every rebuild. |

### Export & CLI Parity

- **Dataset Exports:** Filtered campus datasets export as RFC 4180 CSV and RFC 7946 GeoJSON preserving `Catalog Tier`, `Footprint Coverage`, separated verified vs. reported capacity fields, `Epistemic Status` columns, registry identifiers, and live anchor identifiers.
- **Headless CLI Parity:** A command-line interface exposes full parity with the web observatory for national fleet summaries (with separated verified vs. reported MW totals), multi-faceted filtered queries across all 50 states + DC, complete single-campus inspection, live weather/hydrology/grid snapshot fetches, and unified `Live Pulse` signal queries in both human-readable tables and structured machine-readable output.
