import { useMemo, useState } from "react";
import {
  AlertTriangle,
  FileText,
  Radio,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import type {
  ActivityWindow,
  FleetSummaryMetadata,
  LiveGridFeed,
  LivePulseFeed,
  PulseStream,
} from "@shared/types";
import { ACTIVITY_WINDOW_OPTIONS, ISO_ORDER } from "../lib/constants";
import { isWithinActivityWindow } from "../lib/filters";
import {
  computeCleanSharePct,
  formatGw,
  formatNumber,
  formatTimestamp,
  PULSE_STREAM_LABELS,
} from "../lib/format";
import { useModalDialog } from "../lib/useModalDialog";
import { EpistemicPill, SafeExternalLink } from "./EpistemicBadge";

interface LivePulseModalProps {
  open: boolean;
  gridFeed: LiveGridFeed | null;
  pulseFeed: LivePulseFeed | null;
  fleetSummary: FleetSummaryMetadata | null;
  pulseWindow: ActivityWindow;
  loading: boolean;
  error: string | null;
  onPulseWindowChange: (window: ActivityWindow) => void;
  onRefresh: () => void;
  onSelectFacilityById: (facilityId: string) => void;
  onClose: () => void;
}

type PulseTab = "all" | PulseStream;

function evaluateCensusStatus(
  summary: FleetSummaryMetadata | null,
): "live" | "stale" | "degraded" {
  if (!summary?.censusGeneratedAt) return "degraded";
  const ts = Date.parse(summary.censusGeneratedAt);
  if (!Number.isFinite(ts)) return "live";
  const ageDays = (Date.now() - ts) / (24 * 3600_000);
  return ageDays <= 7 ? "live" : "stale";
}

export function LivePulseModal({
  open,
  gridFeed,
  pulseFeed,
  fleetSummary,
  pulseWindow,
  loading,
  error,
  onPulseWindowChange,
  onRefresh,
  onSelectFacilityById,
  onClose,
}: LivePulseModalProps) {
  const panelRef = useModalDialog(open, onClose);
  const [activeTab, setActiveTab] = useState<PulseTab>("all");

  const filteredItems = useMemo(() => {
    const raw = pulseFeed?.items ?? [];
    return raw.filter((item) => {
      if (activeTab !== "all" && item.stream !== activeTab) return false;
      if (pulseWindow !== "all" && !isWithinActivityWindow(item.publishedAt, pulseWindow)) {
        return false;
      }
      return true;
    });
  }, [pulseFeed, activeTab, pulseWindow]);

  const streamCounts = useMemo(() => {
    const counts: Record<PulseTab, number> = {
      all: 0,
      federal_register: 0,
      sec_edgar: 0,
      peeringdb: 0,
    };
    for (const item of pulseFeed?.items ?? []) {
      if (pulseWindow !== "all" && !isWithinActivityWindow(item.publishedAt, pulseWindow)) {
        continue;
      }
      counts.all += 1;
      counts[item.stream] += 1;
    }
    return counts;
  }, [pulseFeed, pulseWindow]);

  if (!open) return null;

  const physicsStatus = gridFeed?.status ?? "degraded";
  const filingsStatus = error ? "degraded" : pulseFeed?.status ?? "degraded";
  const censusStatus = evaluateCensusStatus(fleetSummary);
  const activeStreamDegraded =
    activeTab !== "all" && pulseFeed?.streamStatus?.[activeTab] === "degraded";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pulse-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel modal-panel--wide" ref={panelRef} tabIndex={-1}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Radio size={16} aria-hidden="true" />
            <h2 id="pulse-modal-title" className="modal-title">
              Live Observatory Pulse
            </h2>
            <span className="modal-count mono">
              MAGI // DISPATCH &amp; EVIDENCE STREAMS
            </span>
          </div>

          <div className="modal-head-actions">
            <button
              type="button"
              className="live-refresh-btn"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw
                size={12}
                className={loading ? "spin" : ""}
                aria-hidden="true"
              />
              <span>{loading ? "Syncing..." : "Refresh"}</span>
            </button>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={onClose}
              aria-label="Close Live Observatory Pulse"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* MAGI Tri-Core Consensus Freshness Strip */}
        <div
          className="magi-consensus-strip"
          aria-label="MAGI Tri-Core Freshness Consensus"
        >
          <div className={`magi-core magi-core--${physicsStatus}`}>
            <div className="magi-core-top mono">
              <span className={`pulse-status-dot pulse-status-dot--${physicsStatus}`} />
              <span>MAGI·01 // PHYSICS &lt;=60M</span>
              <span className="magi-state">{physicsStatus.toUpperCase()}</span>
            </div>
            <div className="magi-core-sub mono">
              {gridFeed?.fetchedAt
                ? `EIA Grid ${formatTimestamp(gridFeed.fetchedAt)}`
                : "EIA dispatch endpoint unavailable"}
            </div>
          </div>

          <div className={`magi-core magi-core--${filingsStatus}`}>
            <div className="magi-core-top mono">
              <span className={`pulse-status-dot pulse-status-dot--${filingsStatus}`} />
              <span>MAGI·02 // FILINGS &lt;=24H</span>
              <span className="magi-state">{filingsStatus.toUpperCase()}</span>
            </div>
            <div className="magi-core-sub mono">
              {pulseFeed?.fetchedAt
                ? `Dockets & SEC ${formatTimestamp(pulseFeed.fetchedAt)}`
                : "Fetching live filings..."}
            </div>
          </div>

          <div className={`magi-core magi-core--${censusStatus}`}>
            <div className="magi-core-top mono">
              <span className={`pulse-status-dot pulse-status-dot--${censusStatus}`} />
              <span>MAGI·03 // CENSUS &lt;=7D</span>
              <span className="magi-state">{censusStatus.toUpperCase()}</span>
            </div>
            <div className="magi-core-sub mono">
              {fleetSummary
                ? `${formatNumber(fleetSummary.totalFacilities)} campuses · ${fleetSummary.statesCovered} jurisdictions`
                : "Index loaded"}
            </div>
          </div>
        </div>

        <div className="modal-body pulse-modal-body">
          {/* 9-ISO Live Electric Dispatch Grid */}
          <section
            className="pulse-section"
            aria-labelledby="pulse-grid-heading"
          >
            <div className="pulse-section-head">
              <div className="pulse-section-title-wrap">
                <Zap size={14} aria-hidden="true" />
                <h3 id="pulse-grid-heading" className="pulse-section-title">
                  9-ISO Live Electric Dispatch &amp; Fuel Mix
                </h3>
              </div>
              {gridFeed?.sourceUrl && (
                <SafeExternalLink
                  href={gridFeed.sourceUrl}
                  className="live-ext-link"
                >
                  EIA API v2
                </SafeExternalLink>
              )}
            </div>

            {(!gridFeed || Object.keys(gridFeed.regions ?? {}).length === 0) && (
              <div className="degraded-banner" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                <div>
                  <strong>Live Grid Dispatch Unavailable:</strong>{" "}
                  {gridFeed?.error ||
                    "Regional EIA balancing-authority snapshot endpoint did not return live telemetry."}
                </div>
              </div>
            )}

            {gridFeed && Object.keys(gridFeed.regions ?? {}).length > 0 && (
              <>
                <div className="iso-dispatch-grid">
                  {ISO_ORDER.map((iso) => {
                    const snap = gridFeed.regions?.[iso];
                    const cleanPct = snap ? computeCleanSharePct(snap.fuelMix) : null;
                    const status = snap?.status ?? "degraded";
                    return (
                      <div
                        key={iso}
                        className={`iso-dispatch-card iso-dispatch-card--${status}`}
                      >
                        <div className="iso-dispatch-head mono">
                          <span className="iso-dispatch-id">
                            <span
                              className={`pulse-status-dot pulse-status-dot--${status}`}
                              aria-hidden="true"
                            />
                            {iso}
                          </span>
                          <span className="iso-dispatch-demand">
                            {snap ? formatGw(snap.demandMw) : "Unavailable"}
                          </span>
                        </div>

                        <div className="iso-dispatch-metrics mono">
                          <span>
                            Gen: {snap ? formatGw(snap.netGenerationMw) : "—"}
                          </span>
                          <span>
                            {cleanPct !== null ? `${cleanPct}% clean` : status}
                          </span>
                        </div>

                        {snap && snap.fuelMix.length > 0 ? (
                          <div
                            className="fuel-bar"
                            role="img"
                            aria-label={`${iso} fuel mix`}
                          >
                            {snap.fuelMix.map((seg) => (
                              <span
                                key={seg.fuel}
                                className={`fuel-seg fuel-seg--${seg.fuel}`}
                                style={{ width: `${Math.max(0, seg.sharePct)}%` }}
                                title={`${seg.label}: ${seg.sharePct.toFixed(1)}% (${formatNumber(seg.mw)} MW)`}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="fuel-bar fuel-bar--empty mono">
                            {snap?.error || "Fuel mix unavailable"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="fuel-legend mono" aria-hidden="true">
                  <span className="fuel-legend-item">
                    <span className="fuel-swatch fuel-seg--nuclear" />
                    Nuclear
                  </span>
                  <span className="fuel-legend-item">
                    <span className="fuel-swatch fuel-seg--wind" />
                    Wind
                  </span>
                  <span className="fuel-legend-item">
                    <span className="fuel-swatch fuel-seg--solar" />
                    Solar
                  </span>
                  <span className="fuel-legend-item">
                    <span className="fuel-swatch fuel-seg--hydro" />
                    Hydro
                  </span>
                  <span className="fuel-legend-item">
                    <span className="fuel-swatch fuel-seg--gas" />
                    Gas
                  </span>
                  <span className="fuel-legend-item">
                    <span className="fuel-swatch fuel-seg--coal" />
                    Coal
                  </span>
                </div>
              </>
            )}
          </section>

          {/* Tabbed Evidence Signals + Activity Delta Selector */}
          <section
            className="pulse-section"
            aria-labelledby="pulse-signals-heading"
          >
            <div className="pulse-signals-toolbar">
              <div
                className="pulse-stream-tabs"
                role="tablist"
                aria-label="Evidence stream filter"
              >
                {(
                  [
                    { id: "all", label: "All Signals" },
                    { id: "federal_register", label: "Federal Register" },
                    { id: "sec_edgar", label: "SEC EDGAR 8-K/10-Q" },
                    { id: "peeringdb", label: "PeeringDB Deltas" },
                  ] as const
                ).map((tab) => {
                  const streamStat =
                    tab.id === "all"
                      ? null
                      : pulseFeed?.streamStatus?.[tab.id] ?? null;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      className={`pulse-tab-btn${
                        activeTab === tab.id ? " pulse-tab-btn--active" : ""
                      }`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {streamStat && (
                        <span
                          className={`pulse-status-dot pulse-status-dot--${streamStat}`}
                          aria-hidden="true"
                        />
                      )}
                      <span>{tab.label}</span>
                      <span className="pulse-tab-count mono">
                        {streamCounts[tab.id]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className="pulse-window-group"
                role="group"
                aria-label="Activity Delta window"
              >
                <span className="pulse-window-label mono">DELTA</span>
                {ACTIVITY_WINDOW_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`chip-btn mono${
                      pulseWindow === opt.id ? " chip-btn--active" : ""
                    }`}
                    aria-pressed={pulseWindow === opt.id}
                    onClick={() => onPulseWindowChange(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {(error || activeStreamDegraded || pulseFeed?.status === "degraded") && (
              <div className="degraded-banner" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                <div>
                  <strong>Evidence Stream Degraded:</strong>{" "}
                  {error ||
                    pulseFeed?.error ||
                    "One or more live filing streams failed or exceeded freshness budget; remaining verified streams are shown."}
                </div>
              </div>
            )}

            {loading && !pulseFeed && (
              <div className="modal-loading">
                Synchronizing Federal Register, SEC EDGAR, and PeeringDB streams...
              </div>
            )}

            {pulseFeed && filteredItems.length === 0 && !loading && (
              <div className="modal-empty">
                No evidence signals match the active stream and{" "}
                {pulseWindow === "all" ? "all-time" : pulseWindow} delta window.
              </div>
            )}

            {filteredItems.length > 0 && (
              <ul className="reg-list">
                {filteredItems.map((item) => (
                  <li key={item.id} className="reg-item">
                    <div className="reg-item-meta">
                      <span
                        className={`pulse-stream-pill pulse-stream-pill--${item.stream} mono`}
                      >
                        {PULSE_STREAM_LABELS[item.stream]}
                      </span>
                      <EpistemicPill status={item.epistemic} />
                      {item.documentNumber && (
                        <span className="reg-doc-num mono">
                          {item.documentNumber}
                        </span>
                      )}
                      {item.tickerOrCik && (
                        <span className="reg-doc-num mono">{item.tickerOrCik}</span>
                      )}
                      {item.peeringDbFacId && (
                        <span className="reg-doc-num mono">
                          FAC #{item.peeringDbFacId}
                        </span>
                      )}
                      {item.pdfUrl && (
                        <SafeExternalLink
                          href={item.pdfUrl}
                          className="reg-pdf-pill"
                          showIcon={false}
                        >
                          <FileText size={11} aria-hidden="true" />
                          <span>PDF</span>
                        </SafeExternalLink>
                      )}
                      <span className="reg-date mono">{item.publishedAt}</span>
                    </div>

                    <h4 className="reg-item-title">
                      <SafeExternalLink href={item.url}>
                        {item.title}
                      </SafeExternalLink>
                    </h4>

                    {(item.publisher ||
                      (item.isoRegions && item.isoRegions.length > 0) ||
                      (item.states && item.states.length > 0) ||
                      (item.matchedFacilityIds &&
                        item.matchedFacilityIds.length > 0)) && (
                      <div className="reg-agencies">
                        {item.publisher && (
                          <span className="reg-agency-pill">{item.publisher}</span>
                        )}
                        {item.isoRegions?.map((iso) => (
                          <span key={iso} className="registry-tag mono">
                            {iso}
                          </span>
                        ))}
                        {item.states?.map((st) => (
                          <span key={st} className="registry-tag mono">
                            {st}
                          </span>
                        ))}
                        {item.matchedFacilityIds?.slice(0, 3).map((fid) => (
                          <button
                            key={fid}
                            type="button"
                            className="pulse-facility-jump mono"
                            onClick={() => {
                              onSelectFacilityById(fid);
                              onClose();
                            }}
                          >
                            Inspect: {fid}
                          </button>
                        ))}
                      </div>
                    )}

                    {item.summary && (
                      <p className="reg-abstract">{item.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
