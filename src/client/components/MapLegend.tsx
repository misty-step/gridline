import type { ActivityWindow } from "@shared/types";
import type { MapColorPalette } from "../lib/constants";
import type { AnalyticalLens, ZoomTier } from "../lib/types";

type Mark = "dot" | "ring" | "dashed" | "swatch" | "hatch";

interface LegendEntry {
  mark: Mark;
  color: string;
  label: string;
}

const DIM = "rgba(132, 146, 165, 0.45)";

/**
 * The legend is derived from the same palette object that paints the map,
 * so a swatch can never drift from the mark it explains.
 */
function legendEntries(
  tier: ZoomTier,
  lens: AnalyticalLens,
  palette: MapColorPalette,
  radarWindow: ActivityWindow,
): LegendEntry[] {
  if (tier === "parcel") {
    return [
      { mark: "swatch", color: palette.zones.operational, label: "Hall / building" },
      { mark: "hatch", color: palette.zones.expansion, label: "Planned expansion" },
      { mark: "swatch", color: palette.zones.substation, label: "Substation" },
      { mark: "swatch", color: palette.zones.cooling, label: "Cooling yard" },
      { mark: "dashed", color: palette.accent, label: "No traced footprint" },
    ];
  }

  if (lens === "water") {
    return [
      { mark: "dot", color: palette.stress.low, label: "Low stress" },
      { mark: "dot", color: palette.stress.low_medium, label: "Low–medium" },
      { mark: "dot", color: palette.stress.medium_high, label: "Medium–high" },
      { mark: "dot", color: palette.stress.high, label: "High" },
      { mark: "dot", color: palette.stress.extremely_high, label: "Extreme" },
      { mark: "dashed", color: palette.undisclosedRing, label: "Water undisclosed" },
    ];
  }

  if (lens === "grid") {
    return [
      { mark: "dot", color: palette.grid.energized, label: "Energized" },
      { mark: "dot", color: palette.grid.phased_energization, label: "Phased" },
      { mark: "dot", color: palette.grid.interconnection_queue, label: "In queue" },
      {
        mark: "dot",
        color: palette.grid.transmission_upgrade_pending,
        label: "Awaiting transmission",
      },
      { mark: "dot", color: palette.grid.ferc_or_puc_contested, label: "Contested" },
      ...(tier === "macro"
        ? [{ mark: "swatch" as const, color: palette.accent, label: "Grid region stress" }]
        : []),
    ];
  }

  if (lens === "activity") {
    return [
      {
        mark: "dot",
        color: palette.activityGlow,
        label: radarWindow === "all" ? "Any recorded activity" : `Active in ${radarWindow}`,
      },
      { mark: "dashed", color: palette.tier.provisional, label: "Proposed" },
      { mark: "ring", color: palette.warnRing, label: "Contested / moratorium" },
      { mark: "dot", color: DIM, label: "No activity in window" },
    ];
  }

  if (tier === "macro") {
    return [
      { mark: "dot", color: palette.lifecycle.operational, label: "Operating" },
      { mark: "ring", color: palette.accent, label: "Verified planned" },
      { mark: "dot", color: palette.tier.registry, label: "Capacity not public" },
      { mark: "dashed", color: palette.tier.provisional, label: "Proposed" },
      { mark: "ring", color: palette.warnRing, label: "Contested hub" },
    ];
  }

  return [
    { mark: "dot", color: palette.lifecycle.operational, label: "Operating" },
    { mark: "dot", color: palette.lifecycle.expanding, label: "Expanding" },
    { mark: "dot", color: palette.lifecycle.under_construction, label: "Building" },
    { mark: "dot", color: palette.lifecycle.permitted, label: "Permitted" },
    { mark: "dashed", color: palette.lifecycle.proposed, label: "Proposed" },
    { mark: "dashed", color: palette.warnRing, label: "Contested / moratorium" },
  ];
}

interface MapLegendProps {
  tier: ZoomTier;
  lens: AnalyticalLens;
  palette: MapColorPalette;
  radarWindow: ActivityWindow;
  /** True when the palette is the dark-on-paper one, so the legend needs a light surface. */
  onPaper: boolean;
  mobileOpen: boolean;
}

export function MapLegend({
  tier,
  lens,
  palette,
  radarWindow,
  onPaper,
  mobileOpen,
}: MapLegendProps) {
  const entries = legendEntries(tier, lens, palette, radarWindow);
  return (
    <ul
      className={`map-legend${onPaper ? " map-legend--paper" : ""}${
        mobileOpen ? " map-legend--mobile-open" : ""
      }`}
      aria-label="Map legend"
    >
      {entries.map((entry) => (
        <li key={entry.label} className="legend-item">
          <span
            className={`legend-mark legend-mark--${entry.mark}`}
            style={{ color: entry.color }}
            aria-hidden="true"
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
