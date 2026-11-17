import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Droplets,
  FileText,
  GitCompareArrows,
  RefreshCw,
  Satellite,
  Scale,
  Thermometer,
  Users,
  X,
  Zap,
} from "lucide-react";
import type {
  FacilityRecord,
  LiveBasinHydrology,
  LiveFacilityTelemetry,
  LiveStationWeather,
  MetricValue,
} from "@shared/types";
import { fetchLiveFacilityTelemetry } from "../lib/api";
import {
  COOLING_LABELS,
  EPISTEMIC_LABELS,
  formatDischargeCfs,
  formatMetricValue,
  formatNumber,
  formatTempPair,
  formatTimestamp,
  INTERCONNECTION_LABELS,
  SOURCE_KIND_LABELS,
  TENANT_ROLE_LABELS,
  THERMAL_REGIME_LABELS,
  WATERSHED_STRESS_LABELS,
} from "../lib/format";
import {
  EpistemicPill,
  SafeExternalLink,
  SourceRefButton,
  StatusPill,
} from "./EpistemicBadge";

interface FacilityDrawerProps {
  facility: FacilityRecord;
  summaryWeather?: LiveStationWeather;
  summaryHydrology?: LiveBasinHydrology;
  isPinnedCompare: boolean;
  compareDisabled: boolean;
  mobileDetent: "peek" | "expanded";
  onToggleMobileDetent: () => void;
  onToggleCompare: (facilityId: string) => void;
  onInspectParcel: (facility: FacilityRecord) => void;
  onClose: () => void;
}

function KpiStatCell({
  label,
  metric,
  onJumpToSource,
}: {
  label: string;
  metric: MetricValue;
  onJumpToSource: (id: string) => void;
}) {
  const isUndisclosed =
    metric.epistemic === "undisclosed" || metric.value === null;
  const shortVal = isUndisclosed
    ? "Undisclosed"
    : metric.unit === "PUE" || metric.unit === "ratio"
      ? formatNumber(metric.value, 2)
      : formatMetricValue(metric);

  return (
    <div
      className={`drawer-kpi-cell${isUndisclosed ? " drawer-kpi-cell--undisclosed" : ""}`}
      title={`${metric.basis}${metric.asOf ? ` (${metric.asOf})` : ""}`}
    >
      <div className="drawer-kpi-label">{label}</div>
      <div
        className={`drawer-kpi-value mono${
          isUndisclosed ? " drawer-kpi-value--undisclosed" : ""
        }`}
      >
        {shortVal}
      </div>
      <div className="drawer-kpi-meta">
        {isUndisclosed ? (
          <EpistemicPill status="undisclosed" />
        ) : (
          <span className="drawer-kpi-prov">{EPISTEMIC_LABELS[metric.epistemic]}</span>
        )}
        <SourceRefButton sourceId={metric.sourceId} onJumpToSource={onJumpToSource} />
      </div>
    </div>
  );
}

function MetricRow({
  label,
  metric,
  onJumpToSource,
}: {
  label: string;
  metric: MetricValue;
  onJumpToSource: (id: string) => void;
}) {
  const isUndisclosed =
    metric.epistemic === "undisclosed" || metric.value === null;
  return (
    <div className={`metric-row${isUndisclosed ? " metric-row--undisclosed" : ""}`}>
      <div className="metric-row-top">
        <span className="metric-label">{label}</span>
        <div className="metric-badges">
          <EpistemicPill status={metric.epistemic} />
          <SourceRefButton sourceId={metric.sourceId} onJumpToSource={onJumpToSource} />
        </div>
      </div>
      <div className={`metric-value mono${isUndisclosed ? " metric-value--undisclosed" : ""}`}>
        {formatMetricValue(metric)}
      </div>
      <div className="metric-basis">
        {metric.basis}
        {metric.asOf ? ` (${metric.asOf})` : ""}
      </div>
    </div>
  );
}

export function FacilityDrawer({
  facility,
  summaryWeather,
  summaryHydrology,
  isPinnedCompare,
  compareDisabled,
  mobileDetent,
  onToggleMobileDetent,
  onToggleCompare,
  onInspectParcel,
  onClose,
}: FacilityDrawerProps) {
  const [liveTelemetry, setLiveTelemetry] = useState<LiveFacilityTelemetry | null>(
    null,
  );
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(
    null,
  );
  const [perspectiveTab, setPerspectiveTab] = useState<"all" | "proponent" | "critic">(
    "all",
  );

  useEffect(() => {
    const controller = new AbortController();
    setLiveTelemetry(null);
    setTelemetryError(null);
    setTelemetryLoading(true);
    setPerspectiveTab("all");

    fetchLiveFacilityTelemetry(facility.id, false, controller.signal)
      .then((res) => {
        setLiveTelemetry(res);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTelemetryError(err instanceof Error ? err.message : "Live fetch failed");
      })
      .finally(() => {
        setTelemetryLoading(false);
      });

    return () => controller.abort();
  }, [facility.id]);

  function handleRefreshTelemetry() {
    setTelemetryLoading(true);
    setTelemetryError(null);
    fetchLiveFacilityTelemetry(facility.id, true)
      .then((res) => {
        setLiveTelemetry(res);
      })
      .catch((err: unknown) => {
        setTelemetryError(err instanceof Error ? err.message : "Live refresh failed");
      })
      .finally(() => {
        setTelemetryLoading(false);
      });
  }

  function handleCopyLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).then(
        () => {
          setCopiedLink(true);
          window.setTimeout(() => setCopiedLink(false), 1800);
        },
        () => {
          // ignore clipboard errors
        },
      );
    }
  }

  function handleJumpToSource(sourceId: string) {
    const el = document.getElementById(`dossier-source-${sourceId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedSourceId(sourceId);
      window.setTimeout(() => {
        setHighlightedSourceId((curr) => (curr === sourceId ? null : curr));
      }, 2200);
    }
  }

  const weather = liveTelemetry?.weather ?? summaryWeather;
  const hydrology = liveTelemetry?.hydrology ?? summaryHydrology;
  const isDegraded =
    Boolean(telemetryError) ||
    weather?.status === "degraded" ||
    hydrology?.status === "degraded";

  const regimeKey = weather?.thermalRegime ?? "unavailable";

  return (
    <aside
      className={`drawer${mobileDetent === "peek" ? " drawer--peek" : " drawer--expanded"}`}
      aria-label={`Facility dossier: ${facility.name}`}
    >
      <div className="drawer-header">
        <div className="drawer-header-top">
          <div className="drawer-title-wrap">
            <h2 className="drawer-title">{facility.name}</h2>
            <div className="drawer-subtitle">
              <span>{facility.marketCluster}</span>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <span>
                {facility.county}, {facility.state}
              </span>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <span className="mono">{facility.isoRegion}</span>
            </div>
          </div>

          <div className="drawer-head-right">
            <button
              type="button"
              className="drawer-detent-btn"
              onClick={onToggleMobileDetent}
              aria-label={
                mobileDetent === "peek"
                  ? "Expand full facility dossier"
                  : "Minimize dossier to inspect map"
              }
            >
              {mobileDetent === "peek" ? (
                <>
                  <ChevronUp size={15} aria-hidden="true" />
                  <span>Full</span>
                </>
              ) : (
                <>
                  <ChevronDown size={15} aria-hidden="true" />
                  <span>Map</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={onClose}
              aria-label="Close facility dossier"
              title="Close (Esc)"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="drawer-actions-bar">
          <StatusPill status={facility.lifecycleStatus} />

          <div className="drawer-action-buttons">
            <button
              type="button"
              className="drawer-btn drawer-btn--primary"
              onClick={() => onInspectParcel(facility)}
              title="Fly to z15.8 Satellite + 2.5D Parcel Hybrid"
            >
              <Satellite size={13} aria-hidden="true" />
              <span>Inspect Parcel</span>
            </button>

            <button
              type="button"
              className={`drawer-btn${isPinnedCompare ? " drawer-btn--active" : ""}`}
              disabled={compareDisabled && !isPinnedCompare}
              onClick={() => onToggleCompare(facility.id)}
              title={
                compareDisabled && !isPinnedCompare
                  ? "Maximum 3 pinned facilities"
                  : "Pin to Side-by-Side Comparison"
              }
            >
              <GitCompareArrows size={13} aria-hidden="true" />
              <span>{isPinnedCompare ? "Pinned" : "Compare"}</span>
            </button>

            <button
              type="button"
              className="drawer-btn"
              onClick={handleCopyLink}
              title="Copy shareable URL"
            >
              {copiedLink ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <Copy size={13} aria-hidden="true" />
              )}
              <span>{copiedLink ? "Copied" : "Copy Link"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="drawer-body">
        {/* Executive KPI Strip Above Prose */}
        <section className="drawer-kpi-strip" aria-label="Core facility capacity and water KPIs">
          <KpiStatCell
            label="Operational"
            metric={facility.power.operationalMw}
            onJumpToSource={handleJumpToSource}
          />
          <KpiStatCell
            label="Total Planned"
            metric={facility.power.totalPlannedMw}
            onJumpToSource={handleJumpToSource}
          />
          <KpiStatCell
            label="Peak Water"
            metric={facility.waterAndCooling.peakOrAvgWaterMgd}
            onJumpToSource={handleJumpToSource}
          />
          <KpiStatCell
            label="Design PUE"
            metric={facility.waterAndCooling.pue}
            onJumpToSource={handleJumpToSource}
          />
        </section>

        {/* Compact Single-Band Live Environmental Telemetry */}
        <section className="live-strip" aria-label="Live station and watershed telemetry">
          <div className="live-strip-head">
            <div className="live-panel-title-wrap">
              <Thermometer size={13} aria-hidden="true" />
              <span className="live-panel-title">Live Telemetry</span>
              {weather && (
                <span className={`thermal-pill thermal-pill--${regimeKey}`}>
                  {THERMAL_REGIME_LABELS[regimeKey] ?? regimeKey}
                </span>
              )}
            </div>

            <div className="live-strip-actions">
              {weather && (
                <SafeExternalLink href={weather.sourceUrl} className="live-ext-link">
                  NOAA {facility.waterAndCooling.nwsStationId}
                </SafeExternalLink>
              )}
              {hydrology && (
                <SafeExternalLink href={hydrology.sourceUrl} className="live-ext-link">
                  USGS {facility.waterAndCooling.usgsGaugeSiteId}
                </SafeExternalLink>
              )}
              <button
                type="button"
                className="live-refresh-btn"
                onClick={handleRefreshTelemetry}
                disabled={telemetryLoading}
              >
                <RefreshCw
                  size={11}
                  className={telemetryLoading ? "spin" : ""}
                  aria-hidden="true"
                />
                <span>{telemetryLoading ? "..." : "Refresh"}</span>
              </button>
            </div>
          </div>

          {isDegraded && (
            <div className="degraded-banner" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <div>
                <strong>Upstream Telemetry Degraded:</strong>{" "}
                {telemetryError ||
                  weather?.error ||
                  hydrology?.error ||
                  "One or more upstream NOAA/USGS feeds did not return fresh observations."}
              </div>
            </div>
          )}

          <div className="live-strip-metrics mono">
            <div className="live-strip-stat">
              <span className="live-k">Dry-Bulb</span>
              <span className="live-v">
                {weather
                  ? formatTempPair(weather.tempF, weather.tempC)
                  : telemetryLoading
                    ? "Loading..."
                    : "Unavailable"}
              </span>
            </div>
            <div className="live-strip-stat">
              <span className="live-k">Stull Wet-Bulb</span>
              <span className="live-v">
                {weather ? formatTempPair(weather.wetBulbF, weather.wetBulbC) : "Unavailable"}
                {weather?.relativeHumidityPct !== null &&
                weather?.relativeHumidityPct !== undefined
                  ? ` (${formatNumber(weather.relativeHumidityPct, 0)}% RH)`
                  : ""}
              </span>
            </div>
            <div className="live-strip-stat">
              <span className="live-k">Basin Flow</span>
              <span className="live-v">
                {hydrology
                  ? formatDischargeCfs(hydrology.dischargeCfs)
                  : telemetryLoading
                    ? "Loading..."
                    : "Unavailable"}
              </span>
            </div>
          </div>

          <div className="live-strip-foot">
            <span>{hydrology?.siteName || facility.waterAndCooling.watershedName}</span>
            {weather?.observedAt && (
              <span className="mono">Obs {formatTimestamp(weather.observedAt)}</span>
            )}
          </div>
        </section>

        <p className="drawer-summary">{facility.summary}</p>

        {/* Section 1: Power & Grid Interconnection */}
        <section className="dossier-section" aria-labelledby="sec-power">
          <div className="section-heading">
            <Zap size={14} aria-hidden="true" />
            <h3 id="sec-power">Power &amp; Grid Interconnection</h3>
          </div>

          <div className="metric-stack">
            <MetricRow
              label="Operational Capacity"
              metric={facility.power.operationalMw}
              onJumpToSource={handleJumpToSource}
            />
            <MetricRow
              label="Total Planned Capacity"
              metric={facility.power.totalPlannedMw}
              onJumpToSource={handleJumpToSource}
            />
          </div>

          <dl className="spec-list">
            <div className="spec-row">
              <dt>Utility Provider</dt>
              <dd>{facility.power.utilityProvider}</dd>
            </div>
            <div className="spec-row">
              <dt>Interconnection</dt>
              <dd>
                <span
                  className={`grid-status-pill grid-status-pill--${facility.power.interconnectionStatus}`}
                >
                  {INTERCONNECTION_LABELS[facility.power.interconnectionStatus] ??
                    facility.power.interconnectionStatus}
                </span>
              </dd>
            </div>
            <div className="spec-row">
              <dt>Substation / Voltage</dt>
              <dd className="mono">{facility.power.substationVoltage}</dd>
            </div>
            <div className="spec-row">
              <dt>Backup Generators</dt>
              <dd>
                <span className="mono">
                  {facility.power.backupGeneratorsPermitted !== null
                    ? `${formatNumber(facility.power.backupGeneratorsPermitted)} permitted`
                    : "Undisclosed / Not Permitted Yet"}
                </span>
                <div className="spec-note">{facility.power.backupFuelNote}</div>
              </dd>
            </div>
            <div className="spec-row">
              <dt>Tariff &amp; Clean Supply</dt>
              <dd>{facility.power.cleanPowerAndTariffSummary}</dd>
            </div>
          </dl>
        </section>

        {/* Section 2: Water & Cooling Architecture */}
        <section className="dossier-section" aria-labelledby="sec-water">
          <div className="section-heading">
            <Droplets size={14} aria-hidden="true" />
            <h3 id="sec-water">Water &amp; Cooling Architecture</h3>
          </div>

          <div className="metric-stack">
            <MetricRow
              label="Peak / Avg Water"
              metric={facility.waterAndCooling.peakOrAvgWaterMgd}
              onJumpToSource={handleJumpToSource}
            />
            <MetricRow
              label="Annual Water"
              metric={facility.waterAndCooling.annualWaterMgy}
              onJumpToSource={handleJumpToSource}
            />
            <MetricRow
              label="Design PUE"
              metric={facility.waterAndCooling.pue}
              onJumpToSource={handleJumpToSource}
            />
          </div>

          <dl className="spec-list">
            <div className="spec-row">
              <dt>Cooling Architecture</dt>
              <dd>{COOLING_LABELS[facility.waterAndCooling.coolingArchitecture]}</dd>
            </div>
            <div className="spec-row">
              <dt>Water Source</dt>
              <dd>{facility.waterAndCooling.waterSource}</dd>
            </div>
            <div className="spec-row">
              <dt>Watershed &amp; Stress</dt>
              <dd className="spec-inline">
                <span>{facility.waterAndCooling.watershedName}</span>
                <span
                  className={`stress-pill stress-pill--${facility.waterAndCooling.watershedStress}`}
                >
                  {WATERSHED_STRESS_LABELS[facility.waterAndCooling.watershedStress]} Stress
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Section 3: Regulatory Status & Permitting Documentation */}
        <section className="dossier-section" aria-labelledby="sec-regulatory">
          <div className="section-heading">
            <FileText size={14} aria-hidden="true" />
            <h3 id="sec-regulatory">Regulatory Status &amp; Permitting</h3>
          </div>

          <div className="metric-stack">
            <MetricRow
              label="Parcel Acreage"
              metric={facility.parcel.acreage}
              onJumpToSource={handleJumpToSource}
            />
            <MetricRow
              label="Gross Building Area"
              metric={facility.parcel.grossSqFt}
              onJumpToSource={handleJumpToSource}
            />
          </div>

          <dl className="spec-list">
            <div className="spec-row">
              <dt>Permitting Stage</dt>
              <dd className="spec-inline">
                <span>{facility.regulatory.permittingStage}</span>
                {facility.regulatory.moratoriumOrLitigationActive && (
                  <span className="litigation-pill">Litigation / Moratorium Active</span>
                )}
              </dd>
            </div>
            <div className="spec-row">
              <dt>Zoning &amp; Halls</dt>
              <dd>
                <span>{facility.parcel.zoningDesignation}</span>
                {facility.parcel.dataHallCount !== null && (
                  <span className="mono">
                    {" "}
                    · {facility.parcel.dataHallCount} halls
                  </span>
                )}
                <div className="spec-note">{facility.parcel.parcelNote}</div>
              </dd>
            </div>
            <div className="spec-row">
              <dt>Community &amp; Legal</dt>
              <dd>{facility.regulatory.communityAndLegalSummary}</dd>
            </div>
          </dl>

          {facility.regulatory.permits.length > 0 && (
            <div className="permits-table-wrap">
              <table className="permits-table">
                <thead>
                  <tr>
                    <th>Agency &amp; Filing</th>
                    <th>Docket / ID</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {facility.regulatory.permits.map((p, idx) => (
                    <tr key={`${p.docketOrPermitId}-${idx}`}>
                      <td>
                        <div className="permit-agency">{p.agency}</div>
                        <div className="permit-title">
                          <SafeExternalLink href={p.url}>
                            {p.title}
                          </SafeExternalLink>
                        </div>
                      </td>
                      <td className="mono">{p.docketOrPermitId}</td>
                      <td className="mono">{p.date}</td>
                      <td>
                        <span className="permit-status">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 4: Stakeholders & Symmetric Perspectives */}
        <section className="dossier-section" aria-labelledby="sec-stakeholders">
          <div className="section-heading">
            <Users size={14} aria-hidden="true" />
            <h3 id="sec-stakeholders">Stakeholders &amp; Perspectives</h3>
            <div className="persp-filter-tabs" role="group" aria-label="Filter perspectives">
              {(["all", "proponent", "critic"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`persp-tab-btn${
                    perspectiveTab === tab ? " persp-tab-btn--active" : ""
                  }`}
                  onClick={() => setPerspectiveTab(tab)}
                  aria-pressed={perspectiveTab === tab}
                >
                  {tab === "all"
                    ? "Both"
                    : tab === "proponent"
                      ? "Proponents"
                      : "Critics"}
                </button>
              ))}
            </div>
          </div>

          <dl className="spec-list">
            <div className="spec-row">
              <dt>Developer / Operator</dt>
              <dd>
                {facility.stakeholders.developer} / {facility.stakeholders.operator}
              </dd>
            </div>
            <div className="spec-row">
              <dt>Anchor Tenants</dt>
              <dd>
                <div className="tenants-list">
                  {facility.stakeholders.anchorTenants.map((tenant, idx) => (
                    <div key={`${tenant.name}-${idx}`} className="tenant-row">
                      <span className="tenant-name">{tenant.name}</span>
                      <span className="tenant-role">
                        {TENANT_ROLE_LABELS[tenant.role]}
                      </span>
                      <EpistemicPill status={tenant.epistemic} />
                      <SourceRefButton
                        sourceId={tenant.sourceId}
                        onJumpToSource={handleJumpToSource}
                      />
                    </div>
                  ))}
                </div>
              </dd>
            </div>
          </dl>

          <div className="perspectives-stack">
            {(perspectiveTab === "all" || perspectiveTab === "proponent") && (
              <div className="perspective-block perspective-block--proponent">
                <div className="perspective-head">
                  <Scale size={13} aria-hidden="true" />
                  <h4>Industry &amp; Economic Case (Proponents)</h4>
                </div>
                <ul className="perspective-list">
                  {facility.perspectives.proponent.map((pt, idx) => (
                    <li key={idx} className="perspective-item">
                      <div className="perspective-claim">
                        {pt.claim}{" "}
                        <SourceRefButton
                          sourceId={pt.sourceId}
                          onJumpToSource={handleJumpToSource}
                        />
                      </div>
                      <p className="perspective-evidence">{pt.evidence}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(perspectiveTab === "all" || perspectiveTab === "critic") && (
              <div className="perspective-block perspective-block--critic">
                <div className="perspective-head">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <h4>Grid, Ratepayer &amp; Environmental Scrutiny (Critics)</h4>
                </div>
                <ul className="perspective-list">
                  {facility.perspectives.critic.map((pt, idx) => (
                    <li key={idx} className="perspective-item">
                      <div className="perspective-claim">
                        {pt.claim}{" "}
                        <SourceRefButton
                          sourceId={pt.sourceId}
                          onJumpToSource={handleJumpToSource}
                        />
                      </div>
                      <p className="perspective-evidence">{pt.evidence}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Primary Sources Register */}
        <section className="dossier-section" aria-labelledby="sec-sources">
          <div className="section-heading">
            <h3 id="sec-sources">Primary Sources &amp; Provenance</h3>
            <span className="verified-stamp mono">Verified {facility.lastVerified}</span>
          </div>

          <ul className="sources-list">
            {facility.sources.map((src) => (
              <li
                key={src.id}
                id={`dossier-source-${src.id}`}
                className={`source-item${
                  highlightedSourceId === src.id ? " source-item--highlight" : ""
                }`}
              >
                <div className="source-item-top">
                  <span className="source-id mono">{src.id}</span>
                  <span className="source-kind">
                    {SOURCE_KIND_LABELS[src.kind] ?? src.kind}
                  </span>
                  <span className="source-date mono">{src.date}</span>
                </div>
                <div className="source-title">
                  <SafeExternalLink href={src.url}>{src.title}</SafeExternalLink>
                </div>
                <div className="source-publisher">{src.publisher}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
