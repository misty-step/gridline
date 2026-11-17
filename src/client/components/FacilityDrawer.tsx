import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
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
  FacilityDetailApiResponse,
  FacilityIndexItem,
  LiveBasinHydrology,
  LiveFacilityTelemetry,
  LiveIsoGridSnapshot,
  LiveStationWeather,
  MetricValue,
} from "@shared/types";
import { fetchLiveFacilityTelemetry } from "../lib/api";
import {
  computeCleanSharePct,
  COOLING_LABELS,
  EPISTEMIC_LABELS,
  formatDischargeCfs,
  formatGw,
  formatMetricValue,
  formatMw,
  formatNumber,
  formatTempPair,
  formatTimestamp,
  formatWaterSummary,
  INTERCONNECTION_LABELS,
  SOURCE_KIND_LABELS,
  TENANT_ROLE_LABELS,
  THERMAL_REGIME_LABELS,
  WATERSHED_STRESS_LABELS,
} from "../lib/format";
import {
  EpistemicPill,
  FootprintCoveragePill,
  SafeExternalLink,
  SourceRefButton,
  StatusPill,
  TierBadge,
} from "./EpistemicBadge";

interface FacilityDrawerProps {
  indexItem: FacilityIndexItem;
  detail: FacilityDetailApiResponse | null;
  detailLoading: boolean;
  detailError: string | null;
  summaryWeather?: LiveStationWeather;
  summaryHydrology?: LiveBasinHydrology;
  summaryGridSnapshot?: LiveIsoGridSnapshot | null;
  isPinnedCompare: boolean;
  compareDisabled: boolean;
  mobileDetent: "peek" | "expanded";
  onToggleMobileDetent: () => void;
  onToggleCompare: (facilityId: string) => void;
  onInspectParcel: (facility: FacilityIndexItem) => void;
  onClose: () => void;
}

function KpiStatCell({
  label,
  metric,
  fallbackText,
  fallbackProv,
  isUndisclosedFallback,
  onJumpToSource,
}: {
  label: string;
  metric?: MetricValue;
  fallbackText: string;
  fallbackProv: string;
  isUndisclosedFallback?: boolean;
  onJumpToSource: (id: string) => void;
}) {
  const isUndisclosed = metric
    ? metric.epistemic === "undisclosed" || metric.value === null
    : Boolean(isUndisclosedFallback);

  const shortVal = metric
    ? isUndisclosed
      ? "Undisclosed"
      : metric.unit === "PUE" || metric.unit === "ratio"
        ? formatNumber(metric.value, 2)
        : formatMetricValue(metric)
    : fallbackText;

  const provLabel = metric
    ? EPISTEMIC_LABELS[metric.epistemic]
    : fallbackProv;

  return (
    <div
      className={`drawer-kpi-cell${isUndisclosed ? " drawer-kpi-cell--undisclosed" : ""}`}
      title={metric ? `${metric.basis}${metric.asOf ? ` (${metric.asOf})` : ""}` : label}
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
        ) : metric?.epistemic === "reported" ? (
          <EpistemicPill status="reported" />
        ) : (
          <span className="drawer-kpi-prov">{provLabel}</span>
        )}
        {metric?.sourceId && (
          <SourceRefButton
            sourceId={metric.sourceId}
            onJumpToSource={onJumpToSource}
          />
        )}
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
  indexItem,
  detail,
  detailLoading,
  detailError,
  summaryWeather,
  summaryHydrology,
  summaryGridSnapshot,
  isPinnedCompare,
  compareDisabled,
  mobileDetent,
  onToggleMobileDetent,
  onToggleCompare,
  onInspectParcel,
  onClose,
}: FacilityDrawerProps) {
  const [refreshedTelemetry, setRefreshedTelemetry] =
    useState<LiveFacilityTelemetry | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(
    null,
  );
  const [perspectiveTab, setPerspectiveTab] = useState<
    "all" | "proponent" | "critic"
  >("all");

  useEffect(() => {
    setRefreshedTelemetry(null);
    setRefreshError(null);
    setRefreshing(false);
    setPerspectiveTab("all");
  }, [indexItem.id]);

  function handleRefreshTelemetry() {
    setRefreshing(true);
    setRefreshError(null);
    fetchLiveFacilityTelemetry(indexItem.id, true)
      .then((res) => {
        setRefreshedTelemetry(res);
      })
      .catch((err: unknown) => {
        setRefreshError(
          err instanceof Error ? err.message : "Live telemetry refresh failed",
        );
      })
      .finally(() => {
        setRefreshing(false);
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

  const facility = detail?.facility ?? null;
  const telemetry = refreshedTelemetry ?? detail?.telemetry ?? null;
  const weather = telemetry?.weather ?? summaryWeather;
  const hydrology = telemetry?.hydrology ?? summaryHydrology;
  const gridSnapshot = detail?.gridSnapshot ?? summaryGridSnapshot ?? null;

  const isTelemetryLoading = (detailLoading && !telemetry) || refreshing;
  const isDegraded =
    Boolean(refreshError) ||
    weather?.status === "degraded" ||
    hydrology?.status === "degraded";
  const regimeKey = weather?.thermalRegime ?? "unavailable";

  const isMoratoriumHazard =
    indexItem.lifecycleStatus === "moratorium" ||
    indexItem.moratoriumOrLitigationActive;
  const isContestedHazard =
    !isMoratoriumHazard && indexItem.lifecycleStatus === "contested";

  const mappedFootprintSqFt = useMemo(() => {
    if (facility?.registryMetadata?.im3SqFt) {
      return facility.registryMetadata.im3SqFt;
    }
    const feats = detail?.footprints?.features ?? [];
    if (feats.length > 0) {
      const sum = feats.reduce((acc, ft) => acc + (ft.properties.sqft ?? 0), 0);
      if (sum > 0) return sum;
    }
    return indexItem.grossSqFt;
  }, [facility, detail, indexItem.grossSqFt]);

  const mappedPolygonCount =
    facility?.registryMetadata?.mappedPolygonCount ??
    (detail?.footprints?.features.length || indexItem.mappedPolygonCount);

  const regMeta = facility?.registryMetadata;
  const hasPeeringDb = Boolean(
    regMeta?.peeringDbFacId ||
      regMeta?.netCount !== undefined ||
      regMeta?.ixCount !== undefined ||
      regMeta?.carrierCount !== undefined ||
      regMeta?.clli,
  );
  const hasEpa = Boolean(
    regMeta?.epaRegistryId || regMeta?.airIds || regMeta?.npdesIds,
  );

  const cleanPct = gridSnapshot ? computeCleanSharePct(gridSnapshot.fuelMix) : null;

  const hasPerspectives = Boolean(
    facility &&
      (facility.perspectives.proponent.length > 0 ||
        facility.perspectives.critic.length > 0),
  );

  return (
    <aside
      className={`drawer${
        mobileDetent === "peek" ? " drawer--peek" : " drawer--expanded"
      }`}
      aria-label={`Facility dossier: ${indexItem.name}`}
    >
      <div className="drawer-header">
        <div className="drawer-header-top">
          <div className="drawer-title-wrap">
            <h2 className="drawer-title">{facility?.name ?? indexItem.name}</h2>
            <div className="drawer-subtitle">
              <span>{indexItem.marketCluster}</span>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <span>
                {indexItem.county}, {indexItem.state}
              </span>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <span className="mono">ISO // {indexItem.isoRegion}</span>
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
          <div className="drawer-pill-pair">
            <TierBadge tier={indexItem.catalogTier} />
            <StatusPill status={indexItem.lifecycleStatus} />
          </div>

          <div className="drawer-action-buttons">
            <button
              type="button"
              className="drawer-btn drawer-btn--primary"
              onClick={() => onInspectParcel(indexItem)}
              title="Fly to z15.8 Satellite + 2.5D Parcel Inspection"
            >
              <Satellite size={13} aria-hidden="true" />
              <span>Inspect Parcel</span>
            </button>

            <button
              type="button"
              className={`drawer-btn${isPinnedCompare ? " drawer-btn--active" : ""}`}
              disabled={compareDisabled && !isPinnedCompare}
              onClick={() => onToggleCompare(indexItem.id)}
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

      {/* Semantic-Only NERV Hazard Caution Stripe */}
      {(isMoratoriumHazard || isContestedHazard) && (
        <div
          className={`nerv-hazard-banner ${
            isMoratoriumHazard
              ? "nerv-hazard-banner--crimson"
              : "nerv-hazard-banner--amber"
          } mono`}
          role="status"
        >
          <AlertTriangle size={13} aria-hidden="true" />
          <span>
            {isMoratoriumHazard
              ? "ALERT // MORATORIUM OR ACTIVE LITIGATION RECORDED"
              : "CAUTION // CONTESTED PERMIT OR COMMUNITY OPPOSITION"}
          </span>
        </div>
      )}

      <div className="drawer-body">
        {/* Executive 2x2 KPI Strip (Zero-Flicker via FacilityIndexItem fallback) */}
        <section
          className="drawer-kpi-strip"
          aria-label="Core facility capacity and water KPIs"
        >
          <KpiStatCell
            label="Operational"
            metric={facility?.power.operationalMw}
            fallbackText={formatMw(indexItem.operationalMw)}
            fallbackProv={EPISTEMIC_LABELS[indexItem.operationalMwEpistemic]}
            isUndisclosedFallback={
              indexItem.operationalMwEpistemic === "undisclosed" ||
              indexItem.operationalMw === null
            }
            onJumpToSource={handleJumpToSource}
          />
          <KpiStatCell
            label="Total Planned"
            metric={facility?.power.totalPlannedMw}
            fallbackText={formatMw(indexItem.totalPlannedMw)}
            fallbackProv={EPISTEMIC_LABELS[indexItem.totalPlannedMwEpistemic]}
            isUndisclosedFallback={
              indexItem.totalPlannedMwEpistemic === "undisclosed" ||
              indexItem.totalPlannedMw === null
            }
            onJumpToSource={handleJumpToSource}
          />
          <KpiStatCell
            label="Peak Water"
            metric={facility?.waterAndCooling.peakOrAvgWaterMgd}
            fallbackText={formatWaterSummary(
              indexItem.peakOrAvgWaterMgd,
              indexItem.annualWaterMgy,
              indexItem.waterEpistemic,
            )}
            fallbackProv={EPISTEMIC_LABELS[indexItem.waterEpistemic]}
            isUndisclosedFallback={
              indexItem.waterEpistemic === "undisclosed" ||
              (indexItem.peakOrAvgWaterMgd === null &&
                indexItem.annualWaterMgy === null)
            }
            onJumpToSource={handleJumpToSource}
          />
          <KpiStatCell
            label="Design PUE"
            metric={facility?.waterAndCooling.pue}
            fallbackText={detailLoading ? "Loading..." : "Undisclosed"}
            fallbackProv={detailLoading ? "Hydrating" : "Undisclosed"}
            isUndisclosedFallback={!detailLoading}
            onJumpToSource={handleJumpToSource}
          />
        </section>

        {/* Live Weather + River Flow + Regional Grid Dispatch Band */}
        <section
          className="live-strip"
          aria-label="Live weather, streamgauge, and regional grid dispatch telemetry"
        >
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
                  NOAA {indexItem.nwsStationId}
                </SafeExternalLink>
              )}
              {hydrology && (
                <SafeExternalLink href={hydrology.sourceUrl} className="live-ext-link">
                  USGS {indexItem.usgsGaugeSiteId}
                </SafeExternalLink>
              )}
              <button
                type="button"
                className="live-refresh-btn"
                onClick={handleRefreshTelemetry}
                disabled={isTelemetryLoading}
              >
                <RefreshCw
                  size={11}
                  className={isTelemetryLoading ? "spin" : ""}
                  aria-hidden="true"
                />
                <span>{isTelemetryLoading ? "..." : "Refresh"}</span>
              </button>
            </div>
          </div>

          {isDegraded && (
            <div className="degraded-banner" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <div>
                <strong>Upstream Telemetry Degraded:</strong>{" "}
                {refreshError ||
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
                  : isTelemetryLoading
                    ? "Loading..."
                    : "Unavailable"}
              </span>
            </div>
            <div className="live-strip-stat">
              <span className="live-k">Stull Wet-Bulb</span>
              <span className="live-v">
                {weather
                  ? formatTempPair(weather.wetBulbF, weather.wetBulbC)
                  : "Unavailable"}
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
                  : isTelemetryLoading
                    ? "Loading..."
                    : "Unavailable"}
              </span>
            </div>
          </div>

          <div className="live-strip-foot">
            <span>
              {hydrology?.siteName ||
                facility?.waterAndCooling.watershedName ||
                `Gauge USGS-${indexItem.usgsGaugeSiteId}`}
            </span>
            {weather?.observedAt && (
              <span className="mono">Obs {formatTimestamp(weather.observedAt)}</span>
            )}
          </div>

          {/* Regional Grid Dispatch Sub-Band */}
          {gridSnapshot && (
            <div className="live-grid-subband">
              <div className="live-grid-subhead">
                <span className="live-grid-iso mono">
                  <span
                    className={`pulse-status-dot pulse-status-dot--${gridSnapshot.status}`}
                    aria-hidden="true"
                  />
                  ISO // {gridSnapshot.isoRegion} DISPATCH
                </span>
                <span className="live-grid-meta mono">
                  {formatGw(gridSnapshot.demandMw)} load ·{" "}
                  {formatGw(gridSnapshot.netGenerationMw)} gen
                  {cleanPct !== null ? ` · ${cleanPct}% clean` : ""}
                </span>
                <SafeExternalLink
                  href={gridSnapshot.sourceUrl}
                  className="live-ext-link"
                >
                  EIA
                </SafeExternalLink>
              </div>
              {gridSnapshot.fuelMix.length > 0 && (
                <div
                  className="fuel-bar"
                  role="img"
                  aria-label={`${gridSnapshot.isoRegion} generation fuel mix`}
                >
                  {gridSnapshot.fuelMix.map((seg) => (
                    <span
                      key={seg.fuel}
                      className={`fuel-seg fuel-seg--${seg.fuel}`}
                      style={{ width: `${Math.max(0, seg.sharePct)}%` }}
                      title={`${seg.label}: ${seg.sharePct.toFixed(1)}% (${formatNumber(seg.mw)} MW)`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Registry & Interconnection Signals + Footprint Provenance */}
        <section
          className="dossier-section"
          aria-labelledby="sec-registry-signals"
        >
          <div className="section-heading">
            <Database size={14} aria-hidden="true" />
            <h3 id="sec-registry-signals">Registry &amp; Spatial Signals</h3>
            <FootprintCoveragePill coverage={indexItem.footprintCoverage} />
          </div>

          <dl className="spec-list">
            <div className="spec-row">
              <dt>Footprint Geometry</dt>
              <dd>
                {indexItem.footprintCoverage === "verified_polygons" ? (
                  <span className="mono">
                    {mappedPolygonCount > 0
                      ? `${formatNumber(mappedPolygonCount)} traced polygon${
                          mappedPolygonCount === 1 ? "" : "s"
                        }`
                      : "Surveyed polygons"}
                    {mappedFootprintSqFt
                      ? ` · ${formatNumber(mappedFootprintSqFt)} sq ft`
                      : ""}
                  </span>
                ) : (
                  <span className="point-only-notice mono">
                    OPEN GIS FOOTPRINT UNMAPPED // COORDINATE VERIFIED (no
                    synthetic box)
                  </span>
                )}
              </dd>
            </div>

            {hasPeeringDb && regMeta && (
              <div className="spec-row">
                <dt>PeeringDB IX / Net</dt>
                <dd>
                  <div className="registry-inline mono">
                    {regMeta.netCount !== null && regMeta.netCount !== undefined && (
                      <span>{formatNumber(regMeta.netCount)} nets</span>
                    )}
                    {regMeta.ixCount !== null && regMeta.ixCount !== undefined && (
                      <span>{formatNumber(regMeta.ixCount)} IXPs</span>
                    )}
                    {regMeta.carrierCount !== null &&
                      regMeta.carrierCount !== undefined && (
                        <span>{formatNumber(regMeta.carrierCount)} carriers</span>
                      )}
                    {regMeta.clli && <span>CLLI: {regMeta.clli}</span>}
                  </div>
                  {regMeta.peeringDbFacId && (
                    <div className="registry-link-row">
                      <SafeExternalLink
                        href={`https://www.peeringdb.com/fac/${regMeta.peeringDbFacId}`}
                      >
                        PeeringDB Facility #{regMeta.peeringDbFacId}
                      </SafeExternalLink>
                    </div>
                  )}
                </dd>
              </div>
            )}

            {hasEpa && regMeta && (
              <div className="spec-row">
                <dt>EPA ECHO / FRS</dt>
                <dd>
                  <div className="registry-inline mono">
                    {regMeta.epaRegistryId && (
                      <span>FRS {regMeta.epaRegistryId}</span>
                    )}
                    {regMeta.airIds && <span>AIR: {regMeta.airIds}</span>}
                    {regMeta.npdesIds && <span>NPDES: {regMeta.npdesIds}</span>}
                  </div>
                  {regMeta.epaRegistryId && (
                    <div className="registry-link-row">
                      <SafeExternalLink
                        href={`https://echo.epa.gov/detailed-facility-report?fid=${encodeURIComponent(regMeta.epaRegistryId)}`}
                      >
                        EPA Detailed Facility Report
                      </SafeExternalLink>
                    </div>
                  )}
                </dd>
              </div>
            )}

            {indexItem.sourceTags.length > 0 && (
              <div className="spec-row">
                <dt>Provenance Tags</dt>
                <dd className="tag-list">
                  {indexItem.sourceTags.map((tag) => (
                    <span key={tag} className="registry-tag mono">
                      {tag}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {detailError && (
          <div className="degraded-banner" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            <div>
              <strong>Dossier Detail Unavailable:</strong> {detailError}
            </div>
          </div>
        )}

        {detailLoading && !facility && (
          <div className="drawer-loading-note mono">
            Hydrating full dossier permits, sources &amp; telemetry...
          </div>
        )}

        {facility && (
          <>
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
                  <dd>
                    {COOLING_LABELS[facility.waterAndCooling.coolingArchitecture]}
                  </dd>
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
                      {
                        WATERSHED_STRESS_LABELS[
                          facility.waterAndCooling.watershedStress
                        ]
                      }{" "}
                      Stress
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            {/* Section 3: Regulatory Status & Permitting Documentation */}
            <section
              className="dossier-section"
              aria-labelledby="sec-regulatory"
            >
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
                      <span className="litigation-pill">
                        Litigation / Moratorium Active
                      </span>
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

            {/* Section 4: Stakeholders & Evidence-Only Perspectives */}
            <section
              className="dossier-section"
              aria-labelledby="sec-stakeholders"
            >
              <div className="section-heading">
                <Users size={14} aria-hidden="true" />
                <h3 id="sec-stakeholders">Stakeholders &amp; Evidence</h3>
                {hasPerspectives && (
                  <div
                    className="persp-filter-tabs"
                    role="group"
                    aria-label="Filter perspectives"
                  >
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
                )}
              </div>

              <dl className="spec-list">
                <div className="spec-row">
                  <dt>Developer / Operator</dt>
                  <dd>
                    {facility.stakeholders.developer} /{" "}
                    {facility.stakeholders.operator}
                  </dd>
                </div>
                {facility.stakeholders.anchorTenants.length > 0 && (
                  <div className="spec-row">
                    <dt>Anchor Tenants</dt>
                    <dd>
                      <div className="tenants-list">
                        {facility.stakeholders.anchorTenants.map((tenant, idx) => (
                          <div
                            key={`${tenant.name}-${idx}`}
                            className="tenant-row"
                          >
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
                )}
              </dl>

              {hasPerspectives ? (
                <div className="perspectives-stack">
                  {(perspectiveTab === "all" ||
                    perspectiveTab === "proponent") &&
                    facility.perspectives.proponent.length > 0 && (
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
                              <p className="perspective-evidence">
                                {pt.evidence}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {(perspectiveTab === "all" || perspectiveTab === "critic") &&
                    facility.perspectives.critic.length > 0 && (
                      <div className="perspective-block perspective-block--critic">
                        <div className="perspective-head">
                          <AlertTriangle size={13} aria-hidden="true" />
                          <h4>
                            Grid, Ratepayer &amp; Environmental Scrutiny (Critics)
                          </h4>
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
                              <p className="perspective-evidence">
                                {pt.evidence}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              ) : (
                <div className="evidence-neutral-notice">
                  No audited stakeholder commentary recorded — this{" "}
                  {indexItem.catalogTier} entry reflects verified facility
                  identifiers, spatial footprints, and primary regulatory records
                  only.
                </div>
              )}
            </section>

            {/* Primary Sources Register */}
            <section className="dossier-section" aria-labelledby="sec-sources">
              <div className="section-heading">
                <h3 id="sec-sources">Primary Sources &amp; Provenance</h3>
                <span className="verified-stamp mono">
                  Verified {facility.lastVerified}
                </span>
              </div>

              <ul className="sources-list">
                {facility.sources.map((src) => (
                  <li
                    key={src.id}
                    id={`dossier-source-${src.id}`}
                    className={`source-item${
                      highlightedSourceId === src.id
                        ? " source-item--highlight"
                        : ""
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
                      <SafeExternalLink href={src.url}>
                        {src.title}
                      </SafeExternalLink>
                    </div>
                    <div className="source-publisher">{src.publisher}</div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
