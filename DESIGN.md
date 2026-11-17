# Gridline Design System (`DESIGN.md`)

All design tokens in this document match [src/client/styles/tokens.css](src/client/styles/tokens.css) **1:1**. Light mode ("Cartographic Paper") is `:root`; dark mode ("Cartographic Obsidian") applies via `:root[data-resolved-theme="dark"]` and `@media (prefers-color-scheme: dark)` when `data-resolved-theme` is not `"light"`.

## Typography & Scale

- Font families:
  - `--font-sans`: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
  - `--font-mono`: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
- Numeric precision: all MW, MGD, MGY, PUE, acreage, `ft3/s`, `°C`/`°F`, coordinates, and docket identifiers use `--font-mono` with `font-variant-numeric: tabular-nums`.
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
| Radii | `--radius-xs` | `3px` |
| Radii | `--radius-sm` | `5px` |
| Radii | `--radius-md` | `8px` |
| Radii | `--radius-lg` | `12px` |
| Radii | `--radius-full` | `9999px` |
| Spacing | `--space-1` | `4px` |
| Spacing | `--space-2` | `8px` |
| Spacing | `--space-3` | `12px` |
| Spacing | `--space-4` | `16px` |
| Spacing | `--space-5` | `20px` |
| Spacing | `--space-6` | `24px` |
| Spacing | `--space-8` | `32px` |
| Layout | `--topbar-height` | `48px` |
| Layout | `--ribbon-height` | `40px` |
| Layout | `--rail-width` | `344px` |
| Layout | `--drawer-width` | `520px` |
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

| Token | Light (`Cartographic Paper`) | Dark (`Cartographic Obsidian`) |
| --- | --- | --- |
| `--bg-canvas` | `#eef2f6` | `#070b11` |
| `--bg-surface` | `#ffffff` | `#0d131d` |
| `--bg-surface-elevated` | `#f8fafc` | `#121a27` |
| `--bg-surface-glass` | `rgba(255, 255, 255, 0.9)` | `rgba(13, 19, 29, 0.9)` |
| `--bg-surface-hover` | `#f1f5f9` | `#182233` |
| `--bg-surface-active` | `#e2e8f0` | `#1f2c42` |
| `--bg-inset` | `#f1f5f9` | `#090e16` |
| `--border-subtle` | `rgba(15, 23, 42, 0.08)` | `rgba(148, 163, 184, 0.12)` |
| `--border-default` | `rgba(15, 23, 42, 0.14)` | `rgba(148, 163, 184, 0.2)` |
| `--border-strong` | `rgba(15, 23, 42, 0.24)` | `rgba(148, 163, 184, 0.34)` |
| `--border-focus` | `#0284c7` | `#38bdf8` |
| `--text-primary` | `#0f172a` | `#f1f5f9` |
| `--text-secondary` | `#334155` | `#cbd5e1` |
| `--text-muted` | `#475569` | `#94a3b8` |
| `--text-inverse` | `#ffffff` | `#070b11` |
| `--accent-primary` | `#0284c7` | `#38bdf8` |
| `--accent-primary-hover` | `#0369a1` | `#7dd3fc` |
| `--accent-primary-muted` | `rgba(2, 132, 199, 0.12)` | `rgba(56, 189, 248, 0.14)` |
| `--accent-primary-text` | `#0369a1` | `#7dd3fc` |
| `--shadow-sm` | `0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)` | `0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.45)` |
| `--shadow-md` | `0 4px 12px rgba(15, 23, 42, 0.1), 0 1px 3px rgba(15, 23, 42, 0.06)` | `0 6px 18px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.35)` |
| `--shadow-lg` | `0 14px 34px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.08)` | `0 20px 44px rgba(0, 0, 0, 0.65), 0 6px 16px rgba(0, 0, 0, 0.45)` |
| `--hud-bg` | `rgba(15, 23, 42, 0.86)` | `rgba(9, 13, 21, 0.88)` |
| `--hud-border` | `rgba(248, 250, 252, 0.18)` | `rgba(148, 163, 184, 0.24)` |
| `--hud-text` | `#f8fafc` | `#f1f5f9` |
| `--hud-text-muted` | `#cbd5e1` | `#94a3b8` |

## Semantic Lifecycle Status Tokens

| Status | Color Token | Background Token | Border Token |
| --- | --- | --- | --- |
| `operational` | `--status-operational` (`#047857` / `#34d399`) | `--status-operational-bg` (`rgba(4, 120, 87, 0.11)` / `rgba(16, 185, 129, 0.15)`) | `--status-operational-border` (`rgba(4, 120, 87, 0.32)` / `rgba(52, 211, 153, 0.36)`) |
| `expanding` | `--status-expanding` (`#0e7490` / `#22d3ee`) | `--status-expanding-bg` (`rgba(14, 116, 144, 0.11)` / `rgba(6, 182, 212, 0.15)`) | `--status-expanding-border` (`rgba(14, 116, 144, 0.32)` / `rgba(34, 211, 238, 0.36)`) |
| `under_construction` | `--status-under-construction` (`#1d4ed8` / `#60a5fa`) | `--status-under-construction-bg` (`rgba(29, 78, 216, 0.11)` / `rgba(59, 130, 246, 0.16)`) | `--status-under-construction-border` (`rgba(29, 78, 216, 0.32)` / `rgba(96, 165, 250, 0.38)`) |
| `permitted` | `--status-permitted` (`#6d28d9` / `#a78bfa`) | `--status-permitted-bg` (`rgba(109, 40, 217, 0.11)` / `rgba(139, 92, 246, 0.16)`) | `--status-permitted-border` (`rgba(109, 40, 217, 0.32)` / `rgba(167, 139, 250, 0.38)`) |
| `proposed` | `--status-proposed` (`#475569` / `#94a3b8`) | `--status-proposed-bg` (`rgba(71, 85, 105, 0.11)` / `rgba(148, 163, 184, 0.14)`) | `--status-proposed-border` (`rgba(71, 85, 105, 0.32)` / `rgba(148, 163, 184, 0.34)`) |
| `contested` | `--status-contested` (`#b45309` / `#fbbf24`) | `--status-contested-bg` (`rgba(180, 83, 9, 0.12)` / `rgba(245, 158, 11, 0.16)`) | `--status-contested-border` (`rgba(180, 83, 9, 0.38)` / `rgba(251, 191, 36, 0.4)`) |
| `moratorium` | `--status-moratorium` (`#b91c1c` / `#f87171`) | `--status-moratorium-bg` (`rgba(185, 28, 28, 0.12)` / `rgba(239, 68, 68, 0.16)`) | `--status-moratorium-border` (`rgba(185, 28, 28, 0.38)` / `rgba(248, 113, 113, 0.42)`) |

## Epistemic Provenance, Thermal Regime, Watershed, Grid & Parcel Zone Tokens

- **Epistemic Provenance**:
  - `--epistemic-measured` (`#047857` / `#34d399`), `--epistemic-measured-bg` (`rgba(4, 120, 87, 0.11)` / `rgba(16, 185, 129, 0.15)`)
  - `--epistemic-permitted` (`#1d4ed8` / `#60a5fa`), `--epistemic-permitted-bg` (`rgba(29, 78, 216, 0.11)` / `rgba(59, 130, 246, 0.16)`)
  - `--epistemic-filed` (`#6d28d9` / `#a78bfa`), `--epistemic-filed-bg` (`rgba(109, 40, 217, 0.11)` / `rgba(139, 92, 246, 0.16)`)
  - `--epistemic-disclosed` (`#0e7490` / `#22d3ee`), `--epistemic-disclosed-bg` (`rgba(14, 116, 144, 0.11)` / `rgba(6, 182, 212, 0.15)`)
  - `--epistemic-estimated` (`#b45309` / `#fbbf24`), `--epistemic-estimated-bg` (`rgba(180, 83, 9, 0.12)` / `rgba(245, 158, 11, 0.16)`)
  - `--epistemic-undisclosed` (`#be123c` / `#fb7185`), `--epistemic-undisclosed-bg` (`rgba(190, 18, 60, 0.11)` / `rgba(244, 63, 94, 0.16)`)
- **Live Thermal Regime**:
  - `--thermal-free` (`#047857` / `#34d399`), `--thermal-free-bg` (`rgba(4, 120, 87, 0.11)` / `rgba(16, 185, 129, 0.15)`)
  - `--thermal-adiabatic` (`#b45309` / `#fbbf24`), `--thermal-adiabatic-bg` (`rgba(180, 83, 9, 0.12)` / `rgba(245, 158, 11, 0.16)`)
  - `--thermal-peak` (`#b91c1c` / `#f87171`), `--thermal-peak-bg` (`rgba(185, 28, 28, 0.12)` / `rgba(239, 68, 68, 0.16)`)
  - `--thermal-unavailable` (`#475569` / `#94a3b8`), `--thermal-unavailable-bg` (`rgba(71, 85, 105, 0.12)` / `rgba(148, 163, 184, 0.14)`)
- **Watershed Baseline Stress**:
  - `--stress-low` (`#047857` / `#34d399`)
  - `--stress-low-medium` (`#0e7490` / `#22d3ee`)
  - `--stress-medium-high` (`#b45309` / `#fbbf24`)
  - `--stress-high` (`#c2410c` / `#fb923c`)
  - `--stress-extremely-high` (`#b91c1c` / `#f87171`)
- **Grid Interconnection Status**:
  - `--grid-energized` (`#047857` / `#34d399`)
  - `--grid-phased` (`#0e7490` / `#22d3ee`)
  - `--grid-queue` (`#1d4ed8` / `#60a5fa`)
  - `--grid-contested` (`#b91c1c` / `#f87171`)
  - `--grid-upgrade` (`#b45309` / `#fbbf24`)
- **Parcel Footprint Zones**:
  - `--zone-boundary` (`#0284c7` / `#38bdf8`)
  - `--zone-operational` (`#059669` / `#10b981`)
  - `--zone-expansion` (`#7c3aed` / `#a78bfa`)
  - `--zone-substation` (`#d97706` / `#f59e0b`)
  - `--zone-cooling` (`#0891b2` / `#06b6d4`)

## Cartographic & Accessibility Rules

- Contested and moratorium facilities carry non-color encodings (dashed/double rings on map glyphs + explicit status badges) alongside color coding.
- Undisclosed water facilities surface a distinct warning indicator under the `Water & Cooling Stress` lens and render `"Undisclosed by Operator"` with explanatory `basis`.
- All interactive controls maintain visible `:focus-visible` focus rings (`--border-focus`) and keyboard shortcuts (`/` focuses search, `Escape` closes active modals/drawers).
- Map HUD pills use `--hud-bg` / `--hud-text` / `--hud-border` for WCAG AA legibility over Light Vector, Dark Vector, Esri World Imagery, and USGS Imagery basemaps.
