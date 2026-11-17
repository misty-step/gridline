# Gridline Design System (`DESIGN.md` — `v1.0.0` // `NERV // MAGI TACTICAL CARTOGRAPHY`)

All design tokens in this document match [src/client/styles/tokens.css](src/client/styles/tokens.css) **1:1**. Light mode (**GEHIRN // NERV TECHNICAL SCHEMATIC PAPER**) is `:root` (active when `data-resolved-theme="light"` or OS light under `"system"`); dark mode (**NERV CRT // CENTRAL DOGMA**) is the initial unconfigured fallback and applies via `:root[data-resolved-theme="dark"]` and `@media (prefers-color-scheme: dark)` when `data-resolved-theme` is not `"light"`.

## NERV // MAGI Tactical Cartography Grammar

- **Condensed Matisse-Inspired Display + Technical Mono Hierarchy**: Primary telemetry titles, region callouts, and dossier headers pair high-contrast condensed serif display typography (`--font-display`, `"Noto Serif Display"`, weights `700–900`, tight tracking) with neutral UI sans (`--font-sans`) and tabular precision monospace (`--font-mono` with `font-variant-numeric: tabular-nums`) on every MW, MGD, MGY, PUE, acreage, `ft3/s`, `°C`/`°F`, coordinate, fuel share, and docket/registry code.
- **Rectilinear Phosphor Wireframes & Chamfered Corners**: Tactical instrument panels, badges, switches, and modals replace soft rounded pills with crisp `1px–3px` radii (`--radius-xs` through `--radius-full`), high-contrast phosphor wireframe rules (`--border-default`, `--border-strong`), and optional `45deg` chamfered corner clips on primary command frames and MAGI consensus panels.
- **Semantic-Only Hazard Caution Stripes**: Diagonal NERV hazard stripes (`--hazard-stripe-amber` and `--hazard-stripe-crimson`) are strictly reserved for semantic alerts—`contested` status, `moratorium` zones, `severe` grid/watershed alerts, and `undisclosed` water warnings—never applied decoratively to healthy metrics.
- **Atmospheric CRT & Drafting Grid Layer**: `--scanline-overlay` provides an ultra-subtle `<= 3.5%` opacity horizontal CRT raster / drafting line texture on terminal backdrop surfaces without reducing text contrast, disabled cleanly under reduced-motion preferences when animated scan effects are paused.
- **MAGI Tri-Core Freshness Consensus Strip**: Live observatory headers surface three synchronized diagnostic status cells—`PHYSICS` (NOAA/USGS/EIA `<= 60 min`), `FILINGS` (Federal Register/SEC/PeeringDB `<= 24 hr`), and `CENSUS` (National Spatial Index `<= 7 days`)—reporting `LIVE`, `STALE`, or `DEGRADED` consensus state directly without fabricated numbers.

## Spatial Architecture & Shell Principles

- **Single Command Bar**: One `48px` (`--topbar-height`) top command bar houses Gridline NERV reticle identity, `/` search omnibox, the 4-mode analytical lens switcher (`Capacity & Lifecycle`, `Water & Cooling Stress`, `Grid & Live Dispatch`, `Live Activity & Proposals`), corridor quick-jumps (`Region ▾`), `Live Pulse`, `Export`, and theme cycling (`Dark` / `Light` / `System`); basemap selection (`Vector`, `Satellite`, `USGS`) lives directly on the map canvas.
- **Flex-Sibling Workspace & Conditional Virtualized Directory (`>= 1280px`)**: The collapsible directory rail (`312px`), interactive map canvas (`flex: 1`), and facility dossier (`456px`) sit as non-overlapping flex siblings with `ResizeObserver` synchronization. The directory rail applies conditional list virtualization for thousands of national campuses while surfacing separated Verified MW vs. Reported/Proposed MW totals and a one-action `Verified Only` toggle.
- **Focused Mutual Exclusion (`< 1280px`) & Mobile Peek Sheet (`<= 768px`)**: Below `1280px`, opening a facility dossier collapses the directory rail cleanly into a single-click return pill; on narrow phones (`<= 768px`), facility inspection uses a 2-detent bottom sheet (`peek 42%` / `expanded 88%`) snapping automatically to `peek` on `Inspect Parcel`, with `>= 44px` touch controls.

## Typography & Scale

- Font families:
  - `--font-display`: `"Noto Serif Display", Georgia, "Times New Roman", serif`
  - `--font-sans`: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
  - `--font-mono`: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
- Type sizes & line heights:
  - `--text-2xs`: `10px`
  - `--text-xs`: `11px`
  - `--text-sm`: `12px`
  - `--text-base`: `13px`
  - `--text-md`: `14px`
  - `--text-lg`: `16px`
  - `--text-xl`: `18px`
  - `--leading-tight`: `1.2`
  - `--leading-snug`: `1.35`
  - `--leading-normal`: `1.5`

## Radii, Spacing, Layout & Z-Index

| Category | Token | Value |
| --- | --- | --- |
| Radii | `--radius-xs` | `1px` |
| Radii | `--radius-sm` | `2px` |
| Radii | `--radius-md` | `2px` |
| Radii | `--radius-lg` | `3px` |
| Radii | `--radius-full` | `2px` |
| Spacing | `--space-1` | `4px` |
| Spacing | `--space-2` | `8px` |
| Spacing | `--space-3` | `12px` |
| Spacing | `--space-4` | `16px` |
| Spacing | `--space-5` | `20px` |
| Spacing | `--space-6` | `24px` |
| Spacing | `--space-8` | `32px` |
| Layout | `--topbar-height` | `48px` |
| Layout | `--rail-width` | `312px` |
| Layout | `--drawer-width` | `456px` |
| Z-Index | `--z-map` | `0` |
| Z-Index | `--z-hud` | `10` |
| Z-Index | `--z-controls` | `20` |
| Z-Index | `--z-rail` | `30` |
| Z-Index | `--z-drawer` | `40` |
| Z-Index | `--z-topbar` | `50` |
| Z-Index | `--z-popover` | `60` |
| Z-Index | `--z-modal` | `70` |
| Z-Index | `--z-tooltip` | `80` |

## Surface, Border, Text, Accent & Map HUD Tokens

| Token | Light (`GEHIRN // NERV TECHNICAL SCHEMATIC PAPER`) | Dark (`NERV CRT // CENTRAL DOGMA`) |
| --- | --- | --- |
| `--bg-canvas` | `#eae4d7` | `#060508` |
| `--bg-surface` | `#f6f2e8` | `#0d0b12` |
| `--bg-surface-elevated` | `#fcfaf4` | `#15111d` |
| `--bg-surface-glass` | `rgba(246, 242, 232, 0.94)` | `rgba(13, 11, 18, 0.92)` |
| `--bg-surface-hover` | `#ece6d8` | `#1d1728` |
| `--bg-surface-active` | `#dfd7c5` | `#271f36` |
| `--bg-inset` | `#e4decb` | `#09070d` |
| `--border-subtle` | `rgba(20, 16, 24, 0.12)` | `rgba(255, 145, 0, 0.16)` |
| `--border-default` | `rgba(20, 16, 24, 0.48)` | `rgba(255, 145, 0, 0.34)` |
| `--border-strong` | `rgba(20, 16, 24, 0.60)` | `rgba(255, 152, 0, 0.72)` |
| `--border-focus` | `#c2410c` | `#ff9800` |
| `--text-primary` | `#141018` | `#f6f1e7` |
| `--text-secondary` | `#312938` | `#d1c6b4` |
| `--text-muted` | `#554b5e` | `#9e917d` |
| `--text-inverse` | `#fcfaf4` | `#060508` |
| `--accent-primary` | `#c2410c` | `#ff7b00` |
| `--accent-primary-hover` | `#9a3412` | `#ff9800` |
| `--accent-primary-muted` | `rgba(194, 65, 12, 0.12)` | `rgba(255, 123, 0, 0.16)` |
| `--accent-primary-text` | `#9a3412` | `#ff9e2c` |
| `--shadow-sm` | `0 1px 2px rgba(20, 16, 24, 0.08), 0 1px 3px rgba(20, 16, 24, 0.1)` | `0 1px 2px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 145, 0, 0.12)` |
| `--shadow-md` | `0 4px 12px rgba(20, 16, 24, 0.12), 0 1px 3px rgba(20, 16, 24, 0.08)` | `0 6px 18px rgba(0, 0, 0, 0.72), 0 0 14px rgba(255, 123, 0, 0.08)` |
| `--shadow-lg` | `0 14px 34px rgba(20, 16, 24, 0.18), 0 4px 12px rgba(20, 16, 24, 0.1)` | `0 20px 44px rgba(0, 0, 0, 0.85), 0 0 24px rgba(255, 123, 0, 0.12)` |
| `--hud-bg` | `rgba(13, 11, 18, 0.92)` | `rgba(13, 11, 18, 0.92)` |
| `--hud-border` | `rgba(255, 145, 0, 0.42)` | `rgba(255, 145, 0, 0.42)` |
| `--hud-text` | `#f6f1e7` | `#f6f1e7` |
| `--hud-text-muted` | `#d1c6b4` | `#d1c6b4` |

## Semantic Lifecycle Status Tokens

| Status | Color Token | Background Token | Border Token |
| --- | --- | --- | --- |
| `operational` | `--status-operational` (`#065f46` / `#39ff88`) | `--status-operational-bg` (`rgba(6, 95, 70, 0.11)` / `rgba(57, 255, 136, 0.14)`) | `--status-operational-border` (`rgba(6, 95, 70, 0.38)` / `rgba(57, 255, 136, 0.42)`) |
| `expanding` | `--status-expanding` (`#155e75` / `#00e5ff`) | `--status-expanding-bg` (`rgba(21, 94, 117, 0.11)` / `rgba(0, 229, 255, 0.14)`) | `--status-expanding-border` (`rgba(21, 94, 117, 0.38)` / `rgba(0, 229, 255, 0.42)`) |
| `under_construction` | `--status-under-construction` (`#1e40af` / `#38bdf8`) | `--status-under-construction-bg` (`rgba(30, 64, 175, 0.11)` / `rgba(56, 189, 248, 0.15)`) | `--status-under-construction-border` (`rgba(30, 64, 175, 0.38)` / `rgba(56, 189, 248, 0.44)`) |
| `permitted` | `--status-permitted` (`#5b21b6` / `#ff9e2c`) | `--status-permitted-bg` (`rgba(91, 33, 182, 0.11)` / `rgba(255, 123, 0, 0.15)`) | `--status-permitted-border` (`rgba(91, 33, 182, 0.38)` / `rgba(255, 152, 0, 0.45)`) |
| `proposed` | `--status-proposed` (`#475569` / `#c084fc`) | `--status-proposed-bg` (`rgba(71, 85, 105, 0.11)` / `rgba(192, 132, 252, 0.16)`) | `--status-proposed-border` (`rgba(71, 85, 105, 0.38)` / `rgba(192, 132, 252, 0.44)`) |
| `contested` | `--status-contested` (`#92400e` / `#ffb300`) | `--status-contested-bg` (`rgba(180, 83, 9, 0.12)` / `rgba(255, 179, 0, 0.15)`) | `--status-contested-border` (`rgba(146, 64, 14, 0.44)` / `rgba(255, 179, 0, 0.48)`) |
| `moratorium` | `--status-moratorium` (`#b91c1c` / `#ff4d4d`) | `--status-moratorium-bg` (`rgba(185, 28, 28, 0.12)` / `rgba(255, 59, 48, 0.16)`) | `--status-moratorium-border` (`rgba(185, 28, 28, 0.44)` / `rgba(255, 59, 48, 0.5)`) |

## Epistemic Provenance, Thermal Regime, Watershed, Grid, Tier, Fuel Mix & Tactical Overlay Tokens

- **Epistemic Provenance**:
  - `--epistemic-measured` (`#065f46` / `#39ff88`), `--epistemic-measured-bg` (`rgba(6, 95, 70, 0.11)` / `rgba(57, 255, 136, 0.14)`)
  - `--epistemic-permitted` (`#1e40af` / `#ff9e2c`), `--epistemic-permitted-bg` (`rgba(30, 64, 175, 0.11)` / `rgba(255, 123, 0, 0.15)`)
  - `--epistemic-filed` (`#5b21b6` / `#38bdf8`), `--epistemic-filed-bg` (`rgba(91, 33, 182, 0.11)` / `rgba(56, 189, 248, 0.15)`)
  - `--epistemic-disclosed` (`#155e75` / `#00e5ff`), `--epistemic-disclosed-bg` (`rgba(21, 94, 117, 0.11)` / `rgba(0, 229, 255, 0.14)`)
  - `--epistemic-estimated` (`#92400e` / `#ffb300`), `--epistemic-estimated-bg` (`rgba(180, 83, 9, 0.12)` / `rgba(255, 179, 0, 0.15)`)
  - `--epistemic-reported` (`#9a3412` / `#ff9e2c`), `--epistemic-reported-bg` (`rgba(194, 65, 12, 0.12)` / `rgba(255, 123, 0, 0.15)`), `--epistemic-reported-border` (`rgba(154, 52, 18, 0.42)` / `rgba(255, 179, 0, 0.45)`) — light mode achieves `5.91:1` contrast over elevated tinted pills on `#fcfaf4`; strictly distinguishes reported press/unconfirmed MW from verified sums
  - `--epistemic-undisclosed` (`#b91c1c` / `#ff4d4d`), `--epistemic-undisclosed-bg` (`rgba(185, 28, 28, 0.12)` / `rgba(255, 59, 48, 0.16)`)
- **Live Thermal Regime**:
  - `--thermal-free` (`#065f46` / `#39ff88`), `--thermal-free-bg` (`rgba(6, 95, 70, 0.11)` / `rgba(57, 255, 136, 0.14)`)
  - `--thermal-adiabatic` (`#92400e` / `#ffb300`), `--thermal-adiabatic-bg` (`rgba(180, 83, 9, 0.12)` / `rgba(255, 179, 0, 0.15)`)
  - `--thermal-peak` (`#b91c1c` / `#ff4d4d`), `--thermal-peak-bg` (`rgba(185, 28, 28, 0.12)` / `rgba(255, 59, 48, 0.16)`)
  - `--thermal-unavailable` (`#554b5e` / `#9e917d`), `--thermal-unavailable-bg` (`rgba(85, 75, 94, 0.12)` / `rgba(158, 145, 125, 0.15)`)
- **Watershed Baseline Stress**:
  - `--stress-low` (`#065f46` / `#39ff88`)
  - `--stress-low-medium` (`#155e75` / `#00e5ff`)
  - `--stress-medium-high` (`#92400e` / `#ffb300`)
  - `--stress-high` (`#c2410c` / `#ff7b00`)
  - `--stress-extremely-high` (`#b91c1c` / `#ff3b30`)
- **Grid Interconnection Status**:
  - `--grid-energized` (`#065f46` / `#39ff88`)
  - `--grid-phased` (`#155e75` / `#00e5ff`)
  - `--grid-queue` (`#1e40af` / `#38bdf8`)
  - `--grid-contested` (`#b91c1c` / `#ff3b30`)
  - `--grid-upgrade` (`#92400e` / `#ffb300`)
- **Parcel Footprint Zones** (real surveyed `building` and `campus` structure footprints alongside audited sub-zones):
  - `--zone-boundary` (`#c2410c` / `#ff7b00`)
  - `--zone-operational` (`#065f46` / `#39ff88`)
  - `--zone-expansion` (`#5b21b6` / `#c084fc`)
  - `--zone-substation` (`#92400e` / `#ffb300`)
  - `--zone-cooling` (`#155e75` / `#00e5ff`)
- **Catalog Tier Visual Grammar**:
  - `--tier-flagship` (`#9a3412` / `#ff7b00`) — audited flagship campuses; full core ring + solid phosphor amber wireframe + dossier citation badge
  - `--tier-registry` (`#155e75` / `#00e5ff`) — national registry campuses fused from IM3/PeeringDB/EPA; medium-weight pattern-blue node + crisp outer border
  - `--tier-provisional` (`#5b21b6` / `#c084fc`) — provisional filings & announcements; dashed Unit-01 violet perimeter beacon + `"Provisional"` pill
- **ISO Live Dispatch Fuel Mix Bars**:
  - `--fuel-nuclear` (`#5b21b6` / `#c084fc`)
  - `--fuel-gas` (`#c2410c` / `#ff7b00`)
  - `--fuel-coal` (`#312938` / `#9e917d`)
  - `--fuel-wind` (`#065f46` / `#39ff88`)
  - `--fuel-solar` (`#854d0e` / `#ffb300`)
  - `--fuel-hydro` (`#155e75` / `#00e5ff`)
- **Live Pulse, Semantic Hazard Stripes & Scanlines**:
  - `--pulse-delta-glow` (`rgba(194, 65, 12, 0.3)` / `rgba(255, 123, 0, 0.44)`)
  - `--hazard-stripe-amber` (diagonal `45deg` caution gradient for `contested` / `estimated` / alert frames)
  - `--hazard-stripe-crimson` (diagonal `45deg` emergency gradient for `moratorium` / `severe` / `undisclosed` alerts)
  - `--scanline-overlay` (horizontal `3px` drafting/CRT scan texture for terminal framing)

## Multi-Scale Cartography, Optical Reticle & Accessibility Rules

- **Constellation vs. Corridor Pill Hierarchy (`Macro z 3.0–5.8`)**: All 50-state + DC campuses render as a luminous WebGL constellation (`2–4px` points colored by active lens and tier) beneath ISO territory outlines and proportional market-cluster rings. Collision-culled rectilinear corridor pills sit cleanly atop major hubs without overlapping neighboring hubs and separate verified MW from `reported`/proposed MW when present.
- **Four Analytical Lenses (`z 3.0–18.5`)**: `Capacity & Lifecycle`, `Water & Cooling Stress`, `Grid & Live Dispatch` (ISO balancing-authority demand, generation, interchange, and stacked fuel-mix bars via `--fuel-nuclear`, `--fuel-gas`, `--fuel-coal`, `--fuel-wind`, `--fuel-solar`, and `--fuel-hydro`), and `Live Activity & Proposals` (filtering/pulsing sites within `24h | 7d | 30d | 90d | all` via `--pulse-delta-glow`) maintain exact 1:1 `.map-legend-pill` parity across every tier and lens.
- **Parcel Inspection & `point_only` Optical Crosshair Reticle (`z 12.2–18.5`)**: Campuses with `verified_polygons` render real traced footprints (`building`, `campus`, `operational_hall`, `planned_expansion`, `substation_yard`, `cooling_yard`) using `--zone-boundary`, `--zone-operational`, `--zone-expansion`, `--zone-substation`, and `--zone-cooling`. Campuses marked `point_only` render a crisp GeoFront-style concentric optical crosshair locator reticle (`--accent-primary`) with an honest `"No Traced Building Footprint"` notice—never synthetic rectangles.
- **Live Pulse Modal**: Consolidates live ISO dispatch snapshots (with stacked fuel-mix bars and tabular MW shares) alongside filterable streams from DOE/FERC/EPA/NRC Federal Register dockets, SEC EDGAR filings, and PeeringDB colocation deltas, surfacing explicit `stale` or `degraded` banners when upstreams fail.
- **Accessibility & Contrast**: All light-mode text tokens achieve `>= 4.9:1` contrast over tinted pills on `#fcfaf4`, all dark-mode phosphor text achieves `>= 4.8:1` on `#15111d`, interactive boundaries maintain `>= 3:1` contrast (`--border-strong` clears `4.7:1` in both themes), `:focus-visible` outlines use `--border-focus`, keyboard shortcuts work cleanly (`/` focuses search without inserting a slash, `Escape` closes drawers/modals and restores opener focus, `aria-modal="true"` traps focus), and `prefers-reduced-motion: reduce` disables transitions, pulses, and animated raster effects. Map HUD overlays use `--hud-bg` / `--hud-text` / `--hud-border` for WCAG AA legibility over Light Vector, Dark Vector, Esri World Imagery, and USGS Imagery basemaps.
