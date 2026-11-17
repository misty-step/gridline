import { GitCompareArrows, Satellite, Trash2, X } from "lucide-react";
import type {
  EpistemicStatus,
  FacilityDetailApiResponse,
  FacilityIndexItem,
  LiveBasinHydrology,
  LiveGridFeed,
  LiveStationWeather,
} from "@shared/types";
import {
  computeCleanSharePct,
  COOLING_LABELS,
  EPISTEMIC_LABELS,
  FOOTPRINT_COVERAGE_LABELS,
  formatDischargeCfs,
  formatGw,
  formatMetricValue,
  formatMw,
  formatNumber,
  formatTempPair,
  formatWaterSummary,
  INTERCONNECTION_LABELS,
  THERMAL_REGIME_LABELS,
  WATERSHED_STRESS_LABELS,
} from "../lib/format";
import { useModalDialog } from "../lib/useModalDialog";
import { EpistemicPill, StatusPill, TierBadge } from "./EpistemicBadge";

function InlineProvenance({ status }: { status: EpistemicStatus }) {
  if (status === "undisclosed") {
    return <EpistemicPill status="undisclosed" />;
  }
  if (status === "reported") {
    return <EpistemicPill status="reported" />;
  }
  return (
    <span className="compare-prov" title={`Provenance tier: ${EPISTEMIC_LABELS[status]}`}>
      <span className={`compare-prov-dot compare-prov-dot--${status}`} aria-hidden="true" />
      {EPISTEMIC_LABELS[status]}
    </span>
  );
}

interface CompareDockProps {
  pinnedFacilities: FacilityIndexItem[];
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
  facilities: FacilityIndexItem[];
  detailsById: Record<string, FacilityDetailApiResponse>;
  stations: Record<string, LiveStationWeather>;
  gauges: Record<string, LiveBasinHydrology>;
  gridFeed: LiveGridFeed | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  onSelectFacility: (f: FacilityIndexItem) => void;
  onInspectParcel: (f: FacilityIndexItem) => void;
}

export function ComparisonModal({
  facilities,
  detailsById,
  stations,
  gauges,
  gridFeed,
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
                        <TierBadge tier={f.catalogTier} compact />
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
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {rec ? formatMetricValue(rec.power.operationalMw) : formatMw(f.operationalMw)}
                      </div>
                      <InlineProvenance status={f.operationalMwEpistemic} />
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Total Planned MW</th>
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {rec ? formatMetricValue(rec.power.totalPlannedMw) : formatMw(f.totalPlannedMw)}
                      </div>
                      <InlineProvenance status={f.totalPlannedMwEpistemic} />
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Utility &amp; Interconnection</th>
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div>{rec?.power.utilityProvider ?? f.utilityProvider}</div>
                      <div className="compare-sub-note">
                        {INTERCONNECTION_LABELS[f.interconnectionStatus] ??
                          f.interconnectionStatus}
                        {rec ? ` · ${rec.power.substationVoltage}` : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Regional Grid Dispatch</th>
                {facilities.map((f) => {
                  const snap =
                    detailsById[f.id]?.gridSnapshot ??
                    gridFeed?.regions?.[f.isoRegion] ??
                    null;
                  const cleanPct = snap ? computeCleanSharePct(snap.fuelMix) : null;
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {f.isoRegion}
                        {snap ? ` · ${formatGw(snap.demandMw)}` : ""}
                      </div>
                      <div className="compare-sub-note mono">
                        {snap
                          ? `${cleanPct !== null ? `${cleanPct}% clean` : snap.status} · ${snap.status.toUpperCase()}`
                          : "Live grid snapshot pending"}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Cooling Architecture</th>
                {facilities.map((f) => (
                  <td key={f.id}>{COOLING_LABELS[f.coolingArchitecture]}</td>
                ))}
              </tr>
              <tr>
                <th>Peak / Avg Water</th>
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {rec
                          ? formatMetricValue(rec.waterAndCooling.peakOrAvgWaterMgd)
                          : formatWaterSummary(
                              f.peakOrAvgWaterMgd,
                              f.annualWaterMgy,
                              f.waterEpistemic,
                            )}
                      </div>
                      <InlineProvenance status={f.waterEpistemic} />
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Design PUE</th>
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {rec ? formatMetricValue(rec.waterAndCooling.pue) : "Hydrating..."}
                      </div>
                      {rec && <InlineProvenance status={rec.waterAndCooling.pue.epistemic} />}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Watershed &amp; Stress</th>
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div>
                        {rec?.waterAndCooling.watershedName ?? `USGS-${f.usgsGaugeSiteId}`}
                      </div>
                      <span
                        className={`stress-pill stress-pill--${f.watershedStress}`}
                      >
                        {WATERSHED_STRESS_LABELS[f.watershedStress]}
                      </span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Live Wet-Bulb &amp; Regime</th>
                {facilities.map((f) => {
                  const st =
                    detailsById[f.id]?.telemetry.weather ?? stations[f.nwsStationId];
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
                  const g =
                    detailsById[f.id]?.telemetry.hydrology ?? gauges[f.usgsGaugeSiteId];
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {g ? formatDischargeCfs(g.dischargeCfs) : "Pending"}
                      </div>
                      <div className="compare-sub-note mono">
                        USGS-{f.usgsGaugeSiteId}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Footprint &amp; Area</th>
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div className="compare-cell-val mono">
                        {FOOTPRINT_COVERAGE_LABELS[f.footprintCoverage]}
                      </div>
                      <div className="compare-sub-note mono">
                        {rec
                          ? `${formatMetricValue(rec.parcel.acreage)} · ${formatMetricValue(rec.parcel.grossSqFt)}`
                          : f.grossSqFt !== null
                            ? `${formatNumber(f.grossSqFt)} sq ft`
                            : "Area undisclosed"}
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Regulatory &amp; Permits</th>
                {facilities.map((f) => {
                  const rec = detailsById[f.id]?.facility;
                  return (
                    <td key={f.id}>
                      <div>
                        {rec?.regulatory.permittingStage ??
                          (f.moratoriumOrLitigationActive
                            ? "Active Litigation / Moratorium"
                            : "Standard Regulatory Record")}
                      </div>
                      <div className="compare-sub-note mono">
                        {rec
                          ? `${rec.regulatory.permits.length} filings`
                          : f.sourceTags.join(", ") || f.catalogTier}
                        {f.moratoriumOrLitigationActive
                          ? " · Active Litigation/Moratorium"
                          : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
