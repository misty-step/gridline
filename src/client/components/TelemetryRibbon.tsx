import { CORRIDOR_PRESETS } from "../lib/constants";
import { formatGwOrMw, formatNumber } from "../lib/format";
import type { CorridorPreset, ViewportMetrics } from "../lib/types";

interface TelemetryRibbonProps {
  metrics: ViewportMetrics;
  activeCorridorId: string | null;
  onSelectCorridor: (preset: CorridorPreset) => void;
}

export function TelemetryRibbon({
  metrics,
  activeCorridorId,
  onSelectCorridor,
}: TelemetryRibbonProps) {
  return (
    <section
      className="telemetry-ribbon"
      aria-label="Viewport infrastructure totals and corridor quick-jumps"
    >
      <div className="ribbon-metrics">
        <div className="ribbon-stat">
          <span className="ribbon-stat-label">In View</span>
          <span className="ribbon-stat-val mono">{metrics.facilityCount}</span>
        </div>
        <div className="ribbon-divider" aria-hidden="true" />
        <div className="ribbon-stat">
          <span className="ribbon-stat-label">Operational</span>
          <span className="ribbon-stat-val ribbon-stat-val--op mono">
            {formatGwOrMw(metrics.operationalMw)}
          </span>
        </div>
        <div className="ribbon-divider" aria-hidden="true" />
        <div className="ribbon-stat">
          <span className="ribbon-stat-label">Planned Pipeline</span>
          <span className="ribbon-stat-val mono">
            {formatGwOrMw(metrics.plannedMw)}
          </span>
        </div>
        <div className="ribbon-divider" aria-hidden="true" />
        <div className="ribbon-stat">
          <span className="ribbon-stat-label">Contested / Moratorium</span>
          <span
            className={`ribbon-stat-val mono${
              metrics.contestedOrMoratoriumCount > 0 ? " ribbon-stat-val--warn" : ""
            }`}
          >
            {metrics.contestedOrMoratoriumCount}
          </span>
        </div>
        <div className="ribbon-divider" aria-hidden="true" />
        <div className="ribbon-stat">
          <span className="ribbon-stat-label">Disclosed Peak Water</span>
          <span className="ribbon-stat-val mono">
            {formatNumber(metrics.disclosedPeakWaterMgd, 1)} MGD
          </span>
        </div>
        <div className="ribbon-divider" aria-hidden="true" />
        <div className="ribbon-stat">
          <span className="ribbon-stat-label">Undisclosed Water</span>
          <span
            className={`ribbon-stat-val mono${
              metrics.undisclosedWaterCount > 0 ? " ribbon-stat-val--undisclosed" : ""
            }`}
          >
            {metrics.undisclosedWaterCount}
          </span>
        </div>
      </div>

      <div className="ribbon-corridors" role="navigation" aria-label="Corridor quick-jump presets">
        {CORRIDOR_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`corridor-pill${
              activeCorridorId === preset.id ? " corridor-pill--active" : ""
            }`}
            onClick={() => onSelectCorridor(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}
