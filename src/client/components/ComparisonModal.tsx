import { GitCompareArrows, Satellite, Trash2, X } from "lucide-react";
import type {
  EpistemicStatus,
  FacilityRecord,
  LiveBasinHydrology,
  LiveStationWeather,
} from "@shared/types";
import {
  COOLING_LABELS,
  EPISTEMIC_LABELS,
  formatDischargeCfs,
  formatMetricValue,
  formatNumber,
  formatTempPair,
  INTERCONNECTION_LABELS,
  THERMAL_REGIME_LABELS,
  WATERSHED_STRESS_LABELS,
} from "../lib/format";
import { useModalDialog } from "../lib/useModalDialog";
import { EpistemicPill, StatusPill } from "./EpistemicBadge";

function InlineProvenance({ status }: { status: EpistemicStatus }) {
  if (status === "undisclosed") {
    return <EpistemicPill status="undisclosed" />;
  }
  return (
    <span className="compare-prov" title={`Provenance tier: ${EPISTEMIC_LABELS[status]}`}>
      <span className={`compare-prov-dot compare-prov-dot--${status}`} aria-hidden="true" />
      {EPISTEMIC_LABELS[status]}
    </span>
  );
}

interface CompareDockProps {
  pinnedFacilities: FacilityRecord[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpenMatrix: () => void;
}

export function CompareDock({
  pinnedFacilities,
  onRemove,
  onClear,
  onOpenMatrix,
}: CompareDockProps) {
  if (pinnedFacilities.length === 0) return null;

  return (
    <div
      className="compare-dock"
      role="region"
      aria-label="Pinned facilities for comparison"
    >
      <div className="compare-dock-items">
        <span className="compare-dock-label mono">
          Compare {pinnedFacilities.length}/3
        </span>
        {pinnedFacilities.map((f) => (
          <span key={f.id} className="compare-chip">
            <span className="compare-chip-name">{f.name}</span>
            <button
              type="button"
              className="compare-chip-remove"
              onClick={() => onRemove(f.id)}
              aria-label={`Remove ${f.name} from comparison`}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="compare-dock-actions">
        <button
          type="button"
          className="compare-open-btn"
          disabled={pinnedFacilities.length < 2}
          onClick={onOpenMatrix}
          title={
            pinnedFacilities.length < 2
              ? "Pin at least 2 facilities to open the comparison matrix"
              : "Open side-by-side comparison matrix"
          }
        >
          <GitCompareArrows size={13} aria-hidden="true" />
          <span>
            {pinnedFacilities.length < 2 ? "Pin 1 more to compare" : "Compare Matrix"}
          </span>
        </button>
        <button
          type="button"
          className="compare-clear-btn"
          onClick={onClear}
          title="Clear pinned facilities"
          aria-label="Clear pinned facilities"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface ComparisonModalProps {
  facilities: FacilityRecord[];
  stations: Record<string, LiveStationWeather>;
  gauges: Record<string, LiveBasinHydrology>;
  onClose: () => void;
  onRemove: (id: string) => void;
  onSelectFacility: (f: FacilityRecord) => void;
  onInspectParcel: (f: FacilityRecord) => void;
}

export function ComparisonModal({
  facilities,
  stations,
  gauges,
  onClose,
  onRemove,
  onSelectFacility,
  onInspectParcel,
}: ComparisonModalProps) {
  const panelRef = useModalDialog(facilities.length >= 2, onClose);

  if (facilities.length < 2) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel modal-panel--wide" ref={panelRef} tabIndex={-1}>
        <div className="modal-header">
          <div className="modal-title-group">
            <GitCompareArrows size={16} aria-hidden="true" />
            <h2 id="compare-modal-title" className="modal-title">
              Side-by-Side Facility Comparison
            </h2>
            <span className="modal-count mono">{facilities.length} campuses</span>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close comparison matrix"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body compare-table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Metric / Dimension</th>
                {facilities.map((f) => (
                  <th key={f.id}>
                    <div className="compare-col-head">
                      <div className="compare-col-title-row">
                        <button
                          type="button"
                          className="compare-col-link"
                          onClick={() => {
                            onSelectFacility(f);
                            onClose();
                          }}
                        >
                          {f.name}
                        </button>
                        <button
                          type="button"
                          className="compare-col-remove"
                          onClick={() => onRemove(f.id)}
                          aria-label={`Unpin ${f.name}`}
                          title="Remove from comparison"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="compare-col-sub">
                        {f.city}, {f.state} · <span className="mono">{f.isoRegion}</span>
                      </div>
                      <div className="compare-col-actions">
                        <StatusPill status={f.lifecycleStatus} compact />
                        <button
                          type="button"
                          className="compare-inspect-btn"
                          onClick={() => {
                            onInspectParcel(f);
                            onClose();
                          }}
                        >
                          <Satellite size={11} aria-hidden="true" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Operational MW</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div className="compare-cell-val mono">
                      {formatMetricValue(f.power.operationalMw)}
                    </div>
                    <InlineProvenance status={f.power.operationalMw.epistemic} />
                  </td>
                ))}
              </tr>
              <tr>
                <th>Total Planned MW</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div className="compare-cell-val mono">
                      {formatMetricValue(f.power.totalPlannedMw)}
                    </div>
                    <InlineProvenance status={f.power.totalPlannedMw.epistemic} />
                  </td>
                ))}
              </tr>
              <tr>
                <th>Utility &amp; Interconnection</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div>{f.power.utilityProvider}</div>
                    <div className="compare-sub-note">
                      {INTERCONNECTION_LABELS[f.power.interconnectionStatus] ??
                        f.power.interconnectionStatus}
                      {" · "}
                      <span className="mono">{f.power.substationVoltage}</span>
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <th>Backup Generators</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div className="compare-cell-val mono">
                      {f.power.backupGeneratorsPermitted !== null
                        ? formatNumber(f.power.backupGeneratorsPermitted)
                        : "Undisclosed"}
                    </div>
                    <div className="compare-sub-note">{f.power.backupFuelNote}</div>
                  </td>
                ))}
              </tr>
              <tr>
                <th>Cooling Architecture</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    {COOLING_LABELS[f.waterAndCooling.coolingArchitecture]}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Peak / Avg Water</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div className="compare-cell-val mono">
                      {formatMetricValue(f.waterAndCooling.peakOrAvgWaterMgd)}
                    </div>
                    <InlineProvenance
                      status={f.waterAndCooling.peakOrAvgWaterMgd.epistemic}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <th>Annual Water</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div className="compare-cell-val mono">
                      {formatMetricValue(f.waterAndCooling.annualWaterMgy)}
                    </div>
                    <InlineProvenance
                      status={f.waterAndCooling.annualWaterMgy.epistemic}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <th>Design PUE</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div className="compare-cell-val mono">
                      {formatMetricValue(f.waterAndCooling.pue)}
                    </div>
                    <InlineProvenance status={f.waterAndCooling.pue.epistemic} />
                  </td>
                ))}
              </tr>
              <tr>
                <th>Watershed &amp; Stress</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div>{f.waterAndCooling.watershedName}</div>
                    <span
                      className={`stress-pill stress-pill--${f.waterAndCooling.watershedStress}`}
                    >
                      {WATERSHED_STRESS_LABELS[f.waterAndCooling.watershedStress]}
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <th>Live Wet-Bulb &amp; Regime</th>
                {facilities.map((f) => {
                  const st = stations[f.waterAndCooling.nwsStationId];
                  return (
                    <td key={f.id}>
                      {st ? (
                        <>
                          <div className="compare-cell-val mono">
                            {formatTempPair(st.wetBulbF, st.wetBulbC)}
                          </div>
                          <span
                            className={`thermal-pill thermal-pill--${st.thermalRegime}`}
                          >
                            {THERMAL_REGIME_LABELS[st.thermalRegime] ?? st.thermalRegime}
                          </span>
                        </>
                      ) : (
                        <span className="compare-sub-note">Station pending</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Live USGS Gauge</th>
                {facilities.map((f) => {
                  const g = gauges[f.waterAndCooling.usgsGaugeSiteId];
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {g ? formatDischargeCfs(g.dischargeCfs) : "Pending"}
                      </div>
                      <div className="compare-sub-note mono">
                        USGS-{f.waterAndCooling.usgsGaugeSiteId}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Parcel Footprint</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div className="compare-cell-val mono">
                      {formatMetricValue(f.parcel.acreage)}
                    </div>
                    <div className="compare-sub-note mono">
                      {formatMetricValue(f.parcel.grossSqFt)}
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <th>Regulatory &amp; Permits</th>
                {facilities.map((f) => (
                  <td key={f.id}>
                    <div>{f.regulatory.permittingStage}</div>
                    <div className="compare-sub-note mono">
                      {f.regulatory.permits.length} filings
                      {f.regulatory.moratoriumOrLitigationActive
                        ? " · Active Litigation/Moratorium"
                        : ""}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
