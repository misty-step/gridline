# ADR 0003: Rename to Undercurrent and replace the borrowed visual theme

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The product shipped v1.0 as "Gridline" with a "NERV // MAGI" visual theme. Two problems:

1. "Gridline" describes a map feature, not the product, and says nothing about water, which is half of what the atlas tracks.
2. The theme borrowed names and styling from an existing anime franchise (interface labels such as `MAGI·01`, `GEHIRN`, chamfered CRT panels, scanlines). The labels hid plain facts behind jargon, the amber-on-everything wireframes left no visual hierarchy, and a product should not depend on someone else's fictional universe for its identity.

## Decision

- The product is **Undercurrent**: electric current, water current, and the undisclosed flows underneath the cloud.
- The design system is built on that pair: amber means power, cyan means water, solid means verified, hatched means reported only. Chrome is neutral. Details are in [DESIGN.md](../../DESIGN.md).
- All interface copy is plain sentence-case language.
- The launch-film pipeline under `video/` was removed. It rendered the old brand and theme; the published v0.1.0 film stays on its GitHub release and the pipeline stays in git history.

## Not renamed

Renaming these would change public URLs or require data migration, so they keep their original identifiers until that is done deliberately:

- GitHub repository `misty-step/gridline`
- Cloudflare Worker `gridline` (served at `gridline.misty-step.workers.dev`)
- D1 database `gridline-observatory`

ADRs 0001 and 0002 are historical records and keep the name they were written under.

## Consequences

- Stored theme preference moved from the `gridline:theme` to the `undercurrent:theme` localStorage key; existing visitors fall back to their OS theme once.
- Export filenames changed to `undercurrent-campuses.csv` and `.geojson`.
- Outbound `User-Agent` strings to NOAA, SEC and other upstreams now identify as Undercurrent.
- The name was checked only with a light web search. Other products use the word "Undercurrent" (none found as a data center atlas); no trademark clearance has been done.
