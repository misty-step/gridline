# ADR 0002: Comprehensive US Census Fusion and Live Observatory Architecture

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Expanding Gridline from a 45-campus curated atlas into a comprehensive 50-state + DC national census (~2,500–3,500 campuses) and live electric grid and evidence observatory introduces four architectural constraints:

1. **Multi-Source Open Registry Fusion:** No single public US dataset spans hyperscale parcels, multi-tenant colocation hubs, environmental permits, and announced proposals with consistent provenance:
   - DOE/PNNL `IMMM-SFA/datacenter-atlas` contributes `1,850` US facility centroids and `1,636` `Polygon` + `254` `MultiPolygon` real footprints (`MIT` / `CC-BY-4.0` / `ODbL`).
   - PeeringDB US API (`peeringdb.com/api/fac?country=US`) contributes `1,381` active US colocation/interconnection facilities (`1,345` coordinate-verified across all 50 states + DC).
   - EPA ECHO (`echodata.epa.gov/echo/echo_rest_services.get_facility_info?output=JSON&p_ncs=518210`) contributes `977` NAICS `518210` regulated facility records carrying `RegistryID`, `NPDESIDs`, `CamdIDs`, and `RCRAIDs`.
   - Non-commercial bulk exports (e.g., FracTracker) are explicitly excluded to preserve commercial-safe open provenance.
2. **Cold-Boot Payload & Client Rendering Scale:** Shipping 3,000+ full nested `FacilityRecord` dossiers (including sources, permits, and prose arrays) plus thousands of detailed polygon footprints on initial page load inflates bundle transfer size to tens of megabytes and degrades startup and list rendering performance.
3. **Cloudflare Workers Subrequest Limits (`50` subrequests/invocation):** Across thousands of facilities spanning hundreds of unique NOAA NWS stations and USGS streamgauges, a naive `/api/telemetry/summary` fan-out would immediately breach Cloudflare Workers' per-request subrequest cap and trigger upstream rate limits.
4. **Live Grid & Proposal Intelligence:** The observatory requires continuous hourly monitoring across verified public endpoints—EIA API v2 (`/v2/electricity/rto/region-data/data/` and `fuel-type-data/data/`), SEC EDGAR Full-Text Search (`efts.sec.gov/LATEST/search-index`), Federal Register (`DOE/FERC/EPA/NRC`), PeeringDB deltas, NOAA NWS (`api.weather.gov`), and USGS Water Data OGC API (`00060`)—with explicit freshness budgets and zero fabricated fallbacks.

## Decision

We adopt a **two-tier offline-fused census + D1-backed live observatory** architecture extending ADR 0001:

1. **Offline Deterministic Census Fusion (`scripts/ingest-us-census.ts`):**
   - Deterministically fuses the audited `flagship` datasets with DOE/PNNL `IMMM-SFA/datacenter-atlas`, PeeringDB US facilities, and EPA ECHO NAICS `518210` records using spatial proximity, normalized operator/facility name similarity, and deterministic identifier generation.
   - Assigns each campus a `CatalogTier` (`flagship`, `registry`, or `provisional`), a `FootprintCoverage` (`verified_polygons` when backed by audited/IM3 traced geometry, normalizing IM3 `MultiPolygon` features into `Polygon` `CampusFootprintProps` with `zoneKind: "building" | "campus"`, or `point_only` when unmapped), and deterministic linkages to its nearest verified 4-character ICAO NOAA station, 8-digit USGS `00060` streamgauge, watershed stress tier, and one of the 9 `ISO/RTO Region` territories.
   - Emits three build artifacts optimized for progressive loading:
     - Compact `FacilityIndexItem[]` national index paired with `FleetSummaryMetadata` (preserving strictly separated `verifiedOperationalMwTotal`, `verifiedPlannedMwTotal`, and `reportedOrProposedMwTotal`).
     - Lazy `/data/footprints-us.geojson` containing only real surveyed or traced polygons (never synthetic rectangles).
     - Complete `FacilityRecord` payloads for on-demand hydration when inspecting or exporting specific campuses.

2. **Cloudflare Worker + `D1` (`gridline-observatory`) + `caches.default` Live Observatory:**
   - Provisions a Cloudflare `D1` database (`gridline-observatory`) alongside `caches.default` to persist hourly `LiveIsoGridSnapshot` records (EIA v2 region demand, net generation, interchange, and fuel mix), `LivePulseSignal` records (Federal Register `DOE/FERC/EPA/NRC` dockets, SEC EDGAR corporate disclosures, and PeeringDB US deltas), `provisional` proposal signals, and batched NOAA/USGS station observations.
   - An hourly `scheduled` cron job refreshes EIA v2, SEC EDGAR, Federal Register, and PeeringDB deltas within `Filings & Proposals <= 24 hr` and `Live Physics <= 60 min` SLAs, and performs **50-subrequest-safe batched NOAA/USGS station/gauge refreshes** prioritized by facility density and staleness, writing results to `D1` and edge cache.
   - HTTP routes (`/api/facilities?view=index`, `/api/facilities/:id`, `/api/grid/live`, `/api/pulse/live`, `/api/telemetry/summary`) read cached/D1 snapshots with bounded timeouts and surface explicit `"live" | "stale" | "degraded"` states and `null` fields when upstream data is missing or expired.

3. **Progressive Client Hydration, WebGL Constellation & Virtualized Directory:**
   - Cold boot requests `FacilitiesIndexApiResponse` (`FacilityIndexItem[]` + `FleetSummaryMetadata` + `isoRegions`), immediately rendering the 50-state + DC MapLibre WebGL luminous constellation (`Macro z 3.0–5.8`) and collision-culled corridor cluster pills.
   - `DirectoryRail` uses conditional list virtualization above small viewport counts so searching and filtering thousands of national campuses stays responsive.
   - Selecting a campus hydrates `FacilityDetailApiResponse` (`FacilityRecord`, facility footprints, `LiveFacilityTelemetry`, and regional `LiveIsoGridSnapshot`) on demand, while parcel inspection (`z >= 12.2`) lazily loads `/data/footprints-us.geojson` (and renders an honest coordinate locator reticle for `point_only` sites).

## Alternatives Considered & Rejected

1. **Continental Runtime Overpass (`overpass-api.de`) Queries:** Rejected because public Overpass instances time out or rate-limit on continental queries and fail unpredictably in edge Workers. Real building/campus geometry comes from offline deterministic IM3/PNNL + curated footprint fusion.
2. **Eagerly Loading 3,000+ Full `FacilityRecord` Objects + Footprints on Cold Boot:** Rejected due to multi-megabyte initial payload bloat, slow JSON parse times on mobile devices, and large Cloudflare Worker memory footprints.
3. **Non-Commercial Bulk Exports / Scrapers (e.g., FracTracker):** Rejected because non-commercial license terms violate Gridline's commercial-safe open provenance invariant (`US Public Domain`, `CC-BY-4.0`, `ODbL`, `PeeringDB`).
4. **Synthetic Bounding Boxes or Templated Stakeholder Prose:** Rejected because fabricating parcel geometry for `point_only` campuses or generating filler `proponent`/`critic` prose for `registry` and `provisional` entries violates epistemic honesty.

## Consequences

- Cold boot remains sub-second and compact across all 50 states + DC while preserving instant search, `Verified Only` filtering, and separated verified vs. reported/proposed capacity metrics.
- Cloudflare Workers subrequest limits are respected via deduplication, `D1` persistence, and batched cron refreshes without sacrificing per-facility live telemetry accuracy on `/api/facilities/:id`.
- Wave 2 ingestion, backend persistence, and client UI components build against a single versioned contract in `src/shared/types.ts` and `src/shared/validate.ts`.
