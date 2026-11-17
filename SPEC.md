# Gridline — US Data Center Infrastructure & Telemetry Atlas Specification

Gridline maps major operational, expanding, permitted, proposed, contested, and moratorium-affected data center campuses across the contiguous United States alongside live meteorological wet-bulb telemetry, basin streamgauge discharge, regulatory dockets, and symmetric evidence records.

For stack and architecture rationale, see [ADR 0001](docs/decisions/0001-stack-and-architecture.md). For visual tokens and surface specifications, see [DESIGN.md](DESIGN.md).

## Terms

- **Facility (`FacilityRecord`)**: A discrete hyperscale, colocation, or AI compute campus anchored to verified WGS84 coordinates, parcel metrics, power/grid interconnection metadata, water/cooling disclosures, regulatory permits, stakeholder claims, and primary sources.
- **Campus Footprint (`CampusFootprintProps`)**: A closed GeoJSON `Polygon` representing a facility sub-zone (`campus_boundary`, `operational_hall`, `planned_expansion`, `substation_yard`, or `cooling_yard`).
- **Epistemic Status (`EpistemicStatus`)**: An explicit provenance classification attached to metrics and tenant disclosures: `measured`, `permitted`, `filed`, `disclosed`, `estimated`, or `undisclosed`.
- **Lifecycle Status (`LifecycleStatus`)**: Campus execution state: `operational`, `expanding`, `under_construction`, `permitted`, `proposed`, `contested`, or `moratorium`.
- **ISO/RTO Region (`IsoRegion`)**: Regional electric grid operator territory (`PJM`, `ERCOT`, `MISO`, `WECC`, `CAISO`, `SERC`, `SPP`, `NYISO`, `ISO-NE`).
- **Wet-Bulb Temperature & Thermal Regime**: Stull (2011) empirical wet-bulb temperature derived from NOAA NWS dry-bulb temperature and relative humidity, classified into `free_economizer` (`< 13°C`), `adiabatic_assist` (`13°C–20°C`), `peak_chiller_evap` (`> 20°C`), or `unavailable`.
- **Degraded Telemetry**: An explicit upstream failure state (`status: "degraded"`) accompanied by a diagnostic `error` message and `null` for unmeasured telemetry fields.

## Domain Invariants

1. **Geospatial Bounds & Closed Parcels**: Every facility coordinate `[lon, lat]` lies within US bounds (`lon` in `[-170, -65]`, `lat` in `[18, 72]`). Every facility maps to at least one closed GeoJSON `Polygon` footprint whose vertices lie within US bounds.
2. **Epistemic Honesty**: Any `MetricValue` with `epistemic === "undisclosed"` MUST set `value: null`. Any `MetricValue` with `epistemic !== "undisclosed"` MUST carry a finite numeric `value`. No undisclosed water or MW figure is silently coerced to `0`.
3. **Referential & Protocol Integrity**: Every `sourceId` referenced by a metric, anchor tenant, or perspective point exists in `facility.sources`. Every URL in `facility.sources` and `facility.regulatory.permits` uses `https://` or `http://`.
4. **Live Telemetry Anchors**: Every facility specifies an 8-digit USGS streamgauge (`^\d{8}$`) and a 4-character ICAO NOAA weather station (`^[A-Z0-9]{4}$`).
5. **No Fabricated Telemetry**: Live weather, hydrology, and Federal Register endpoints enforce bounded timeouts and never synthesize synthetic fallback values when upstream APIs fail or return incomplete observations.

## Multi-Scale Cartographic Experience

1. **Macro National (`z 3.0–5.8`)**: Displays interactive ISO/RTO region polygons and dynamically aggregated market-cluster rings summarizing operational vs. planned capacity across the active filter set.
2. **Regional Corridor (`z 5.8–12.5`)**: Displays individual facility proportional rings with distinct outer dashed/halo geometry for `contested` and `moratorium` sites and supports three analytical lenses: `Capacity & Lifecycle`, `Water & Cooling Stress`, and `Grid & Ratepayer Impact`.
3. **Granular Parcel Inspection (`z 12.5–18.5`)**: Reveals parcel footprint sub-zones (`campus_boundary`, `operational_hall`, `planned_expansion`, `substation_yard`, `cooling_yard`), scale bars, cursor coordinates, and one-click `z ~16` satellite orthophoto inspection.

## Proponent & Critic Symmetry

Every facility dossier presents both `proponent` (industry, economic, reliability, or clean-energy arguments) and `critic` (grid cost-allocation, ratepayer, water-stress, emissions, or land-use scrutiny) arrays, each containing non-empty cited claims backed by primary `FacilitySource` records.

## Epistemic & Provenance Contract

- All UI surfaces render epistemic badges alongside quantitative metrics and clearly highlight `Undisclosed by Operator` metrics alongside their explanatory `basis`.
- All external links rendered in the UI validate `https:` or `http:` protocols before rendering interactive anchors.
- All filtered datasets are exportable as RFC 4180 CSV and GeoJSON via `/api/facilities?format=csv|geojson`.
