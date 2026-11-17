# Undercurrent design system

Every token below exists in [src/client/styles/tokens.css](src/client/styles/tokens.css) with the same name and value, and nothing is declared here that the stylesheet omits. `./scripts/check doctor` fails if the two drift.

## Identity

Undercurrent maps the two currents every data center draws on: electric power and water. The visual system is built on that pair.

- **Amber is power, cyan is water.** `--power` colors megawatt and gigawatt figures, `--water` colors gallons. Neither hue is used for decoration, so a colored number always tells you which resource it measures.
- **Verified is solid, reported is hatched.** Capacity that rests on a permit, filing, disclosure or measurement is drawn as a solid fill. Capacity that only appears in press reports or unpermitted proposals is drawn with `--hatch-reported` and the proposed violet, and it is never added into a verified total.
- **Hazard stripes mean something is wrong.** `--hazard-stripe-amber` and `--hazard-stripe-crimson` appear only on contested or moratorium status, active litigation, and stale or degraded live data.
- **Quiet chrome, loud data.** Surfaces are near-black (dark) or chart paper (light) with neutral hairline borders. Color is reserved for the data and for one primary action per surface.
- **Plain words.** Labels are sentence case and say what a thing is ("Water undisclosed", "No traced footprint"). No code names, no slash-separated jargon.

Theme follows the operating system by default; the top bar cycles dark, light and auto. The choice is stored in `localStorage` and never written into shared links.

## Layout

- **One top bar** (`--topbar-height`): wordmark, search (`/` focuses it), the four lenses (Capacity, Water, Grid, Activity), Jump to, Live, Export, theme.
- **Three columns at 1280px and wider**: directory rail (`--rail-width`), map, campus dossier (`--drawer-width`). They are flex siblings and never overlap.
- **Below 1280px** opening a dossier collapses the rail to a single button. **At 768px and below** the dossier is a two-stop bottom sheet (42% and 88% of the viewport) and touch targets are at least 44px.
- **The rail opens with the view ledger**: operating, verified planned and reported-only capacity for the campuses in the current map view, a proportional bar of the three, then disclosed water and counts of undisclosed and contested campuses.
- **Map overlays use the HUD tokens**, which stay dark in both themes so they read over paper, dark vector tiles and satellite imagery. The legend is generated from the same palette object that paints the map, so the two cannot disagree.

## Typography

| Token | Value |
| --- | --- |
| `--font-display` | gradient, see `tokens.css` |
| `--font-sans` | gradient, see `tokens.css` |
| `--font-mono` | gradient, see `tokens.css` |

`--font-display` (Archivo, slightly expanded) is for the wordmark, campus names and modal titles. `--font-sans` is for interface text. `--font-mono` with tabular figures is for every quantity, coordinate and identifier.

| Token | Value |
| --- | --- |
| `--text-2xs` | `10px` |
| `--text-xs` | `11px` |
| `--text-sm` | `12px` |
| `--text-base` | `13px` |
| `--text-md` | `14px` |
| `--text-lg` | `16px` |
| `--text-xl` | `18px` |
| `--text-2xl` | `26px` |
| `--leading-tight` | `1.2` |
| `--leading-snug` | `1.35` |
| `--leading-normal` | `1.5` |

## Radii, spacing, layout, motion, z-index

| Token | Value |
| --- | --- |
| `--radius-xs` | `2px` |
| `--radius-sm` | `3px` |
| `--radius-md` | `4px` |
| `--radius-lg` | `6px` |
| `--radius-full` | `999px` |
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-8` | `32px` |
| `--topbar-height` | `48px` |
| `--rail-width` | `320px` |
| `--drawer-width` | `456px` |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--duration-fast` | `120ms` |
| `--duration-base` | `180ms` |
| `--z-map` | `0` |
| `--z-hud` | `10` |
| `--z-controls` | `20` |
| `--z-rail` | `30` |
| `--z-drawer` | `40` |
| `--z-topbar` | `50` |
| `--z-popover` | `60` |
| `--z-modal` | `70` |
| `--z-tooltip` | `80` |

Motion is limited to state feedback: hover and press transitions at `--duration-fast`, the ledger bar and modal entrance at `--duration-base` with `--ease-out`. Data stays still while it is being read. `prefers-reduced-motion: reduce` removes transitions, animations and map fly-to easing.

## Surfaces, borders, text, accent

| Token | Light | Dark |
| --- | --- | --- |
| `--bg-canvas` | `#e6e9ed` | `#05080c` |
| `--bg-surface` | `#f5f6f8` | `#0a0f15` |
| `--bg-surface-elevated` | `#ffffff` | `#101721` |
| `--bg-surface-glass` | `rgba(245, 246, 248, 0.94)` | `rgba(10, 15, 21, 0.92)` |
| `--bg-surface-hover` | `#ebeef2` | `#162030` |
| `--bg-surface-active` | `#dfe4ea` | `#1c2a3d` |
| `--bg-inset` | `#eceef2` | `#070b10` |
| `--border-subtle` | `rgba(16, 24, 40, 0.1)` | `rgba(160, 188, 220, 0.1)` |
| `--border-default` | `rgba(16, 24, 40, 0.2)` | `rgba(160, 188, 220, 0.18)` |
| `--border-strong` | `rgba(16, 24, 40, 0.52)` | `rgba(160, 188, 220, 0.52)` |
| `--border-focus` | `#a85d00` | `#ffb020` |
| `--text-primary` | `#0d1420` | `#e9eef5` |
| `--text-secondary` | `#333d4b` | `#b4c0cf` |
| `--text-muted` | `#5a6675` | `#8492a5` |
| `--text-inverse` | `#ffffff` | `#05080c` |
| `--accent-primary` | `#a85d00` | `#ffb020` |
| `--accent-primary-hover` | `#8a4b00` | `#ffc247` |
| `--accent-primary-muted` | `rgba(168, 93, 0, 0.12)` | `rgba(255, 176, 32, 0.14)` |
| `--accent-primary-text` | `#8f4e00` | `#ffbe45` |
| `--shadow-sm` | `0 1px 2px rgba(16, 24, 40, 0.08)` | `0 1px 2px rgba(0, 0, 0, 0.5)` |
| `--shadow-md` | `0 4px 14px rgba(16, 24, 40, 0.12), 0 1px 3px rgba(16, 24, 40, 0.08)` | `0 6px 18px rgba(0, 0, 0, 0.6)` |
| `--shadow-lg` | `0 18px 44px rgba(16, 24, 40, 0.2), 0 4px 12px rgba(16, 24, 40, 0.1)` | `0 22px 48px rgba(0, 0, 0, 0.72), 0 0 0 1px rgba(160, 188, 220, 0.08)` |

## The two currents

| Token | Light | Dark |
| --- | --- | --- |
| `--power` | `#8f4e00` | `#ffb020` |
| `--water` | `#0b6a94` | `#38c8ff` |

## Map HUD

| Token | Light | Dark |
| --- | --- | --- |
| `--hud-bg` | `rgba(8, 12, 17, 0.9)` | `rgba(8, 12, 17, 0.9)` |
| `--hud-border` | `rgba(160, 188, 220, 0.26)` | `rgba(160, 188, 220, 0.26)` |
| `--hud-text` | `#e9eef5` | `#e9eef5` |
| `--hud-text-muted` | `#a9b6c6` | `#a9b6c6` |
| `--hud-power` | `#ffb020` | `#ffb020` |
| `--hud-water` | `#38c8ff` | `#38c8ff` |
| `--hud-ok` | `#3ddc97` | `#3ddc97` |
| `--hud-proposed` | `#b79cff` | `#b79cff` |
| `--hud-warn` | `#ff8a3d` | `#ff8a3d` |
| `--hud-crit` | `#ff5a5f` | `#ff5a5f` |

## Lifecycle status

Each status also has its own glyph shape in `.status-glyph--*`, so status never depends on color alone.

| Token | Light | Dark |
| --- | --- | --- |
| `--status-operational` | `#07663f` | `#3ddc97` |
| `--status-operational-bg` | `rgba(7, 102, 63, 0.1)` | `rgba(61, 220, 151, 0.12)` |
| `--status-operational-border` | `rgba(7, 102, 63, 0.36)` | `rgba(61, 220, 151, 0.36)` |
| `--status-expanding` | `#07655d` | `#2dd4bf` |
| `--status-expanding-bg` | `rgba(7, 101, 93, 0.1)` | `rgba(45, 212, 191, 0.12)` |
| `--status-expanding-border` | `rgba(7, 101, 93, 0.36)` | `rgba(45, 212, 191, 0.36)` |
| `--status-under-construction` | `#1d5fc4` | `#6cb2ff` |
| `--status-under-construction-bg` | `rgba(29, 95, 196, 0.1)` | `rgba(108, 178, 255, 0.13)` |
| `--status-under-construction-border` | `rgba(29, 95, 196, 0.36)` | `rgba(108, 178, 255, 0.38)` |
| `--status-permitted` | `#4347c9` | `#8f9bff` |
| `--status-permitted-bg` | `rgba(67, 71, 201, 0.1)` | `rgba(143, 155, 255, 0.14)` |
| `--status-permitted-border` | `rgba(67, 71, 201, 0.36)` | `rgba(143, 155, 255, 0.4)` |
| `--status-proposed` | `#6b4fc0` | `#b79cff` |
| `--status-proposed-bg` | `rgba(107, 79, 192, 0.1)` | `rgba(183, 156, 255, 0.14)` |
| `--status-proposed-border` | `rgba(107, 79, 192, 0.36)` | `rgba(183, 156, 255, 0.4)` |
| `--status-contested` | `#9c3f0e` | `#ff8a3d` |
| `--status-contested-bg` | `rgba(156, 63, 14, 0.11)` | `rgba(255, 138, 61, 0.14)` |
| `--status-contested-border` | `rgba(156, 63, 14, 0.42)` | `rgba(255, 138, 61, 0.46)` |
| `--status-moratorium` | `#c02626` | `#ff5a5f` |
| `--status-moratorium-bg` | `rgba(192, 38, 38, 0.11)` | `rgba(255, 90, 95, 0.14)` |
| `--status-moratorium-border` | `rgba(192, 38, 38, 0.42)` | `rgba(255, 90, 95, 0.46)` |

## Epistemic provenance

How a figure is known. `undisclosed` always renders as the word "Undisclosed", never as zero.

| Token | Light | Dark |
| --- | --- | --- |
| `--epistemic-measured` | `#07663f` | `#3ddc97` |
| `--epistemic-measured-bg` | `rgba(7, 102, 63, 0.1)` | `rgba(61, 220, 151, 0.12)` |
| `--epistemic-permitted` | `#1d5fc4` | `#6cb2ff` |
| `--epistemic-permitted-bg` | `rgba(29, 95, 196, 0.1)` | `rgba(108, 178, 255, 0.13)` |
| `--epistemic-filed` | `#4347c9` | `#8f9bff` |
| `--epistemic-filed-bg` | `rgba(67, 71, 201, 0.1)` | `rgba(143, 155, 255, 0.14)` |
| `--epistemic-disclosed` | `#07655d` | `#2dd4bf` |
| `--epistemic-disclosed-bg` | `rgba(7, 101, 93, 0.1)` | `rgba(45, 212, 191, 0.12)` |
| `--epistemic-estimated` | `#7a5c00` | `#e6c84a` |
| `--epistemic-estimated-bg` | `rgba(122, 92, 0, 0.12)` | `rgba(230, 200, 74, 0.13)` |
| `--epistemic-reported` | `#9c3f0e` | `#ff8a3d` |
| `--epistemic-reported-bg` | `rgba(156, 63, 14, 0.11)` | `rgba(255, 138, 61, 0.14)` |
| `--epistemic-reported-border` | `rgba(156, 63, 14, 0.42)` | `rgba(255, 138, 61, 0.46)` |
| `--epistemic-undisclosed` | `#c02626` | `#ff5a5f` |
| `--epistemic-undisclosed-bg` | `rgba(192, 38, 38, 0.11)` | `rgba(255, 90, 95, 0.14)` |

## Thermal regime, watershed stress, grid interconnection

| Token | Light | Dark |
| --- | --- | --- |
| `--thermal-free` | `#07663f` | `#3ddc97` |
| `--thermal-free-bg` | `rgba(7, 102, 63, 0.1)` | `rgba(61, 220, 151, 0.12)` |
| `--thermal-adiabatic` | `#7a5c00` | `#e6c84a` |
| `--thermal-adiabatic-bg` | `rgba(122, 92, 0, 0.12)` | `rgba(230, 200, 74, 0.13)` |
| `--thermal-peak` | `#c02626` | `#ff5a5f` |
| `--thermal-peak-bg` | `rgba(192, 38, 38, 0.11)` | `rgba(255, 90, 95, 0.14)` |
| `--thermal-unavailable` | `#5a6675` | `#8492a5` |
| `--thermal-unavailable-bg` | `rgba(90, 102, 117, 0.12)` | `rgba(132, 146, 165, 0.14)` |
| `--stress-low` | `#07663f` | `#3ddc97` |
| `--stress-low-medium` | `#07655d` | `#2dd4bf` |
| `--stress-medium-high` | `#7a5c00` | `#e6c84a` |
| `--stress-high` | `#9c3f0e` | `#ff8a3d` |
| `--stress-extremely-high` | `#c02626` | `#ff5a5f` |
| `--grid-energized` | `#07663f` | `#3ddc97` |
| `--grid-phased` | `#07655d` | `#2dd4bf` |
| `--grid-queue` | `#1d5fc4` | `#6cb2ff` |
| `--grid-contested` | `#c02626` | `#ff5a5f` |
| `--grid-upgrade` | `#7a5c00` | `#e6c84a` |

## Parcel zones, catalog tier, fuel mix

| Token | Light | Dark |
| --- | --- | --- |
| `--zone-boundary` | `#a85d00` | `#ffb020` |
| `--zone-operational` | `#07663f` | `#3ddc97` |
| `--zone-expansion` | `#6b4fc0` | `#b79cff` |
| `--zone-substation` | `#7a5c00` | `#e6c84a` |
| `--zone-cooling` | `#0b6a94` | `#38c8ff` |
| `--tier-flagship` | `#8f4e00` | `#ffbe45` |
| `--tier-registry` | `#333d4b` | `#b4c0cf` |
| `--tier-provisional` | `#6b4fc0` | `#b79cff` |
| `--fuel-nuclear` | `#6b4fc0` | `#b79cff` |
| `--fuel-gas` | `#9c3f0e` | `#ff8a3d` |
| `--fuel-coal` | `#4a5563` | `#7b8696` |
| `--fuel-wind` | `#07663f` | `#3ddc97` |
| `--fuel-solar` | `#8a6a00` | `#ffd23f` |
| `--fuel-hydro` | `#0b6a94` | `#38c8ff` |

## Semantic patterns

| Token | Light | Dark |
| --- | --- | --- |
| `--hazard-stripe-amber` | gradient, see `tokens.css` | gradient, see `tokens.css` |
| `--hazard-stripe-crimson` | gradient, see `tokens.css` | gradient, see `tokens.css` |
| `--hatch-reported` | gradient, see `tokens.css` | gradient, see `tokens.css` |

## Map palette

MapLibre paint properties cannot read CSS custom properties, so `DARK_MAP_PALETTE` and `LIGHT_MAP_PALETTE` in [src/client/lib/constants.ts](src/client/lib/constants.ts) repeat the lifecycle, stress, grid, tier and zone hex values above. `tests/tokens.test.ts` fails if they differ. The light palette is used only on the light vector basemap; imagery basemaps always use the dark palette.

## Accessibility

- Text, status and provenance colors meet WCAG AA (4.5:1) on every surface token in both themes. `--border-strong` meets 3:1 and marks form field boundaries.
- `:focus-visible` draws a 2px `--border-focus` outline on every interactive element.
- `/` focuses search, `Escape` closes the open popover, modal or dossier and returns focus to what opened it, and modals trap focus.
- Status, tier and provenance are always stated in text beside any color or pattern.
