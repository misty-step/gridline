import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Crosshair,
  Filter,
  GitCompareArrows,
  RotateCcw,
} from "lucide-react";
import type { ActivityWindow, FacilityIndexItem } from "@shared/types";
import {
  ACTIVITY_WINDOW_OPTIONS,
  CATALOG_TIER_ORDER,
  COOLING_ORDER,
  ISO_ORDER,
  LIFECYCLE_ORDER,
  SORT_OPTIONS,
  US_JURISDICTIONS,
} from "../lib/constants";
import { hasActiveFilters, isUndisclosedWater, toggleArrayItem } from "../lib/filters";
import {
  CATALOG_TIER_SHORT_LABELS,
  COOLING_SHORT_LABELS,
  formatGwOrMw,
  formatMw,
  formatNumber,
  formatWaterSummary,
  LIFECYCLE_LABELS,
} from "../lib/format";
import type { FilterState, SortKey, ViewportMetrics } from "../lib/types";
import { StatusPill, TierBadge } from "./EpistemicBadge";

const CARD_PITCH_PX = 92;
const DEFAULT_OVERSCAN = 8;
const MAX_MOUNTED_ROWS = 26;

interface DirectoryRailProps {
  onCollapse: () => void;
  visibleFacilities: FacilityIndexItem[];
  totalFilteredCount: number;
  viewportMetrics: ViewportMetrics;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onResetFilters: () => void;
  selectedFacilityId: string | null;
  onSelectFacility: (facility: FacilityIndexItem) => void;
  compareIds: string[];
  onToggleCompare: (facilityId: string) => void;
  onFitFilteredBounds: () => void;
}

/**
 * Totals for the campuses in the current map view. Verified capacity and
 * reported (unverified) capacity are never summed into one figure: the bar
 * draws reported capacity hatched, beside the verified segments.
 */
function ViewLedger({ metrics }: { metrics: ViewportMetrics }) {
  const op = metrics.verifiedOperationalMw;
  const planned = Math.max(metrics.verifiedPlannedMw, op);
  const reported = metrics.reportedOrProposedMw;
  const total = planned + reported;
  const pct = (mw: number) => (total > 0 ? `${(mw / total) * 100}%` : "0%");

  return (
    <section className="ledger" aria-label="Totals for campuses in view">
      <dl className="ledger-figures">
        <div className="ledger-figure ledger-figure--op">
          <dd className="mono">{formatGwOrMw(op)}</dd>
          <dt>operating</dt>
        </div>
        <div className="ledger-figure ledger-figure--plan">
          <dd className="mono">{formatGwOrMw(planned)}</dd>
          <dt>verified planned</dt>
        </div>
        <div className="ledger-figure ledger-figure--reported">
          <dd className="mono">+{formatGwOrMw(reported)}</dd>
          <dt>reported only</dt>
        </div>
      </dl>

      <div className="ledger-bar" aria-hidden="true">
        <span className="ledger-bar-op" style={{ width: pct(op) }} />
        <span className="ledger-bar-plan" style={{ width: pct(planned - op) }} />
        <span className="ledger-bar-reported" style={{ width: pct(reported) }} />
      </div>

      <p className="ledger-line">
        <span className="ledger-water mono">
          {formatNumber(metrics.disclosedPeakWaterMgd, 1)} MGD
        </span>{" "}
        peak water disclosed
        {metrics.undisclosedWaterCount > 0 && (
          <>
            {" · "}
            <span className="ledger-undisclosed">
              <span className="mono">{formatNumber(metrics.undisclosedWaterCount)}</span>{" "}
              undisclosed
            </span>
          </>
        )}
      </p>
      <p className="ledger-line">
        <span className="mono">{metrics.statesCovered}</span>{" "}
        {metrics.statesCovered === 1 ? "state" : "states"}
        {metrics.contestedOrMoratoriumCount > 0 && (
          <>
            {" · "}
            <span className="ledger-contested">
              <span className="mono">{metrics.contestedOrMoratoriumCount}</span> contested
              or under moratorium
            </span>
          </>
        )}
      </p>
    </section>
  );
}

export function DirectoryRail({
  onCollapse,
  visibleFacilities,
  totalFilteredCount,
  viewportMetrics,
  filters,
  onFiltersChange,
  onResetFilters,
  selectedFacilityId,
  onSelectFacility,
  compareIds,
  onToggleCompare,
  onFitFilteredBounds,
}: DirectoryRailProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const [listViewportHeight, setListViewportHeight] = useState(640);
  const [scrollTop, setScrollTop] = useState(0);

  const chipFilterCount =
    filters.statuses.length +
    filters.tiers.length +
    filters.isos.length +
    filters.states.length +
    filters.coolings.length +
    (filters.window !== "all" ? 1 : 0);
  const anyFilters = hasActiveFilters(filters);

  useEffect(() => {
    if (!filtersOpen) return;
    function handleOutside(e: MouseEvent) {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setFiltersOpen(false);
        filterBtnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc, { capture: true });
    };
  }, [filtersOpen]);

  // Observe virtual scroll container height
  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const updateHeight = () => {
      const next = el.clientHeight || 640;
      setListViewportHeight(next);
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clamp scrollTop cleanly when visibleFacilities shrinks
  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(
      0,
      visibleFacilities.length * CARD_PITCH_PX - listViewportHeight,
    );
    if (el.scrollTop > maxScroll) {
      el.scrollTop = 0;
      setScrollTop(0);
    }
  }, [visibleFacilities.length, listViewportHeight]);

  // Bring newly selected facility into virtual scroll window when selected from map
  useEffect(() => {
    if (!selectedFacilityId) return;
    const el = listScrollRef.current;
    if (!el) return;
    const idx = visibleFacilities.findIndex((f) => f.id === selectedFacilityId);
    if (idx < 0) return;
    const itemTop = idx * CARD_PITCH_PX;
    const itemBottom = itemTop + CARD_PITCH_PX;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;
    if (itemTop < viewTop || itemBottom > viewBottom) {
      el.scrollTop = Math.max(0, itemTop - CARD_PITCH_PX);
      setScrollTop(el.scrollTop);
    }
  }, [selectedFacilityId, visibleFacilities]);

  const { startIndex, endIndex } = useMemo(() => {
    const total = visibleFacilities.length;
    if (total === 0) return { startIndex: 0, endIndex: 0 };
    const firstVisible = Math.floor(scrollTop / CARD_PITCH_PX);
    const visibleCount = Math.max(1, Math.ceil(listViewportHeight / CARD_PITCH_PX));
    const maxOverscan = Math.max(
      1,
      Math.min(DEFAULT_OVERSCAN, Math.floor((MAX_MOUNTED_ROWS - visibleCount) / 2)),
    );
    const start = Math.max(0, firstVisible - maxOverscan);
    const end = Math.min(total, start + MAX_MOUNTED_ROWS, firstVisible + visibleCount + maxOverscan);
    return { startIndex: start, endIndex: end };
  }, [visibleFacilities.length, scrollTop, listViewportHeight]);

  const mountedItems = useMemo(
    () => visibleFacilities.slice(startIndex, endIndex),
    [visibleFacilities, startIndex, endIndex],
  );

  const selectedStateValue = filters.states.length === 1 ? filters.states[0] : "";

  return (
    <aside className="rail" aria-label="Facility directory and filters">
      <div className="rail-header">
        <h2 className="rail-title">
          <span className="mono">{formatNumber(visibleFacilities.length)}</span>{" "}
          {visibleFacilities.length === 1 ? "campus" : "campuses"} in view
          {visibleFacilities.length !== totalFilteredCount && (
            <span className="rail-title-of mono">
              {" "}
              of {formatNumber(totalFilteredCount)}
            </span>
          )}
        </h2>
        <div className="rail-header-actions">
          {anyFilters && (
            <button
              type="button"
              className="rail-reset-btn"
              onClick={onResetFilters}
              title="Reset all filters"
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            className="rail-collapse-btn"
            onClick={onCollapse}
            aria-label="Collapse directory"
            title="Collapse directory"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ViewLedger metrics={viewportMetrics} />

      <div className="rail-controls">
        <div className="rail-quick-row">
          <button
            type="button"
            className={`filter-toggle-chip${
              filters.verifiedOnly ? " filter-toggle-chip--verified" : ""
            }`}
            aria-pressed={filters.verifiedOnly}
            aria-label="Show verified registries and filings only (exclude reported and unpermitted proposals)"
            title="Show verified registries & filings only (exclude reported/unpermitted proposals)"
            onClick={() =>
              onFiltersChange({
                ...filters,
                verifiedOnly: !filters.verifiedOnly,
                proposalsOnly: !filters.verifiedOnly ? false : filters.proposalsOnly,
              })
            }
          >
            Verified only
          </button>
          <button
            type="button"
            className={`filter-toggle-chip${
              filters.proposalsOnly ? " filter-toggle-chip--proposal" : ""
            }`}
            aria-pressed={filters.proposalsOnly}
            onClick={() =>
              onFiltersChange({
                ...filters,
                proposalsOnly: !filters.proposalsOnly,
                verifiedOnly: !filters.proposalsOnly ? false : filters.verifiedOnly,
              })
            }
          >
            Proposals
          </button>
          <button
            type="button"
            className={`filter-toggle-chip${
              filters.contestedOnly ? " filter-toggle-chip--warn" : ""
            }`}
            aria-pressed={filters.contestedOnly}
            onClick={() =>
              onFiltersChange({ ...filters, contestedOnly: !filters.contestedOnly })
            }
          >
            Contested
          </button>
          <button
            type="button"
            className={`filter-toggle-chip${
              filters.undisclosedWaterOnly ? " filter-toggle-chip--undisclosed" : ""
            }`}
            aria-pressed={filters.undisclosedWaterOnly}
            onClick={() =>
              onFiltersChange({
                ...filters,
                undisclosedWaterOnly: !filters.undisclosedWaterOnly,
              })
            }
          >
            Water undisclosed
          </button>
        </div>

        <div className="rail-sort-row" ref={filterWrapRef}>
          <button
            ref={filterBtnRef}
            type="button"
            className={`filter-drawer-btn${
              filtersOpen || chipFilterCount > 0 ? " filter-drawer-btn--active" : ""
            }`}
            aria-expanded={filtersOpen}
            aria-haspopup="dialog"
            onClick={() => setFiltersOpen((prev) => !prev)}
          >
            <Filter size={12} aria-hidden="true" />
            <span>Filters</span>
            {chipFilterCount > 0 && (
              <span className="filter-badge mono">{chipFilterCount}</span>
            )}
          </button>

          <label className="sort-label">
            <span className="sr-only">Sort facilities</span>
            <select
              className="sort-select"
              value={filters.sort}
              onChange={(e) =>
                onFiltersChange({ ...filters, sort: e.target.value as SortKey })
              }
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </label>

          {filtersOpen && (
            <div
              className="filter-popover"
              role="dialog"
              aria-label="Multi-facet facility filters"
            >
              <div className="filter-group">
                <div className="filter-group-label">Catalog Tier</div>
                <div className="filter-chips">
                  {CATALOG_TIER_ORDER.map((tier) => {
                    const active = filters.tiers.includes(tier);
                    return (
                      <button
                        key={tier}
                        type="button"
                        className={`chip-btn${active ? " chip-btn--active" : ""}`}
                        aria-pressed={active}
                        onClick={() =>
                          onFiltersChange({
                            ...filters,
                            tiers: toggleArrayItem(filters.tiers, tier),
                          })
                        }
                      >
                        {CATALOG_TIER_SHORT_LABELS[tier]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-group-label">State / Jurisdiction</div>
                <select
                  className="filter-state-select"
                  aria-label="Filter by US state or DC"
                  value={selectedStateValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    onFiltersChange({
                      ...filters,
                      states: val ? [val] : [],
                    });
                  }}
                >
                  <option value="">All States &amp; DC (51)</option>
                  {US_JURISDICTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <div className="filter-group-label">Activity Window</div>
                <div className="filter-chips">
                  {ACTIVITY_WINDOW_OPTIONS.map((opt) => {
                    const active = filters.window === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`chip-btn mono${active ? " chip-btn--active" : ""}`}
                        aria-pressed={active}
                        onClick={() =>
                          onFiltersChange({
                            ...filters,
                            window: opt.id as ActivityWindow,
                          })
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-group-label">Lifecycle</div>
                <div className="filter-chips">
                  {LIFECYCLE_ORDER.map((st) => {
                    const active = filters.statuses.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        className={`chip-btn${active ? " chip-btn--active" : ""}`}
                        aria-pressed={active}
                        onClick={() =>
                          onFiltersChange({
                            ...filters,
                            statuses: toggleArrayItem(filters.statuses, st),
                          })
                        }
                      >
                        {LIFECYCLE_LABELS[st]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-group-label">ISO / RTO</div>
                <div className="filter-chips">
                  {ISO_ORDER.map((iso) => {
                    const active = filters.isos.includes(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={`chip-btn mono${active ? " chip-btn--active" : ""}`}
                        aria-pressed={active}
                        onClick={() =>
                          onFiltersChange({
                            ...filters,
                            isos: toggleArrayItem(filters.isos, iso),
                          })
                        }
                      >
                        {iso}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-group-label">Cooling Architecture</div>
                <div className="filter-chips">
                  {COOLING_ORDER.map((cool) => {
                    const active = filters.coolings.includes(cool);
                    return (
                      <button
                        key={cool}
                        type="button"
                        className={`chip-btn${active ? " chip-btn--active" : ""}`}
                        aria-pressed={active}
                        onClick={() =>
                          onFiltersChange({
                            ...filters,
                            coolings: toggleArrayItem(filters.coolings, cool),
                          })
                        }
                      >
                        {COOLING_SHORT_LABELS[cool]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        ref={listScrollRef}
        className="rail-list"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {visibleFacilities.length === 0 ? (
          <div className="rail-empty">
            {totalFilteredCount === 0 ? (
              <>
                <p className="rail-empty-title">
                  {filters.q.trim()
                    ? `No campuses match "${filters.q.trim()}"`
                    : "No campuses match the active filters"}
                </p>
                <p className="rail-empty-sub">
                  Clear or relax your search query and facet filters to restore results.
                </p>
                <button
                  type="button"
                  className="rail-empty-action"
                  onClick={onResetFilters}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  <span>Reset all filters</span>
                </button>
              </>
            ) : (
              <>
                <p className="rail-empty-title">
                  0 of {formatNumber(totalFilteredCount)} matching campuses in view
                </p>
                <p className="rail-empty-sub">
                  Matching sites lie outside the current map bounds.
                </p>
                <button
                  type="button"
                  className="rail-empty-action"
                  onClick={onFitFilteredBounds}
                >
                  <Crosshair size={13} aria-hidden="true" />
                  <span>Zoom to {formatNumber(totalFilteredCount)} matching sites</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            className="rail-virtual-spacer"
            role="list"
            style={{ height: `${visibleFacilities.length * CARD_PITCH_PX}px` }}
          >
            {mountedItems.map((f, offset) => {
              const idx = startIndex + offset;
              const isSelected = selectedFacilityId === f.id;
              const isPinned = compareIds.includes(f.id);
              const compareFull = compareIds.length >= 3 && !isPinned;
              const opMw = f.operationalMw ?? 0;
              const planMw = f.totalPlannedMw ?? opMw;
              const opRatio =
                planMw > 0 ? Math.min(100, Math.round((opMw / planMw) * 100)) : 0;
              const undisclosedWater = isUndisclosedWater(f);

              return (
                <article
                  key={f.id}
                  role="listitem"
                  style={{
                    position: "absolute",
                    top: `${idx * CARD_PITCH_PX}px`,
                    left: 0,
                    right: 0,
                    height: `${CARD_PITCH_PX}px`,
                  }}
                  className={`facility-card${
                    isSelected ? " facility-card--selected" : ""
                  }${
                    f.catalogTier === "provisional"
                      ? " facility-card--provisional"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="facility-card-main"
                    onClick={() => onSelectFacility(f)}
                    onKeyDown={(e) => {
                      if (
                        (e.key === "c" || e.key === "C") &&
                        !e.metaKey &&
                        !e.ctrlKey &&
                        !e.altKey &&
                        !compareFull
                      ) {
                        e.preventDefault();
                        onToggleCompare(f.id);
                      }
                    }}
                    aria-current={isSelected ? "true" : undefined}
                  >
                    <div className="facility-card-top">
                      <h3 className="facility-card-name">{f.name}</h3>
                      <StatusPill status={f.lifecycleStatus} compact />
                    </div>

                    <div className="facility-card-meta">
                      <TierBadge tier={f.catalogTier} compact />
                      <span className="meta-dot" aria-hidden="true">
                        ·
                      </span>
                      <span className="facility-card-loc">
                        {f.city}, {f.state}
                      </span>
                      <span className="meta-dot" aria-hidden="true">
                        ·
                      </span>
                      <span className="mono">{f.isoRegion}</span>
                    </div>

                    <div className="facility-card-metrics">
                      {f.operationalMw === null && f.totalPlannedMw === null ? (
                        <div className="facility-readout-none">Capacity not public</div>
                      ) : (
                        <div className="facility-mw-readout mono">
                          <span className="mw-op">
                            {f.operationalMw !== null ? `${Math.round(opMw)}` : "—"}
                          </span>
                          <span className="mw-sep">/</span>
                          <span
                            className={`mw-plan${
                              f.totalPlannedMwEpistemic === "reported"
                                ? " mw-plan--reported"
                                : ""
                            }`}
                          >
                            {formatMw(f.totalPlannedMw)}
                          </span>
                        </div>
                      )}

                      {undisclosedWater ? (
                        <div className="facility-readout-none">Water undisclosed</div>
                      ) : (
                        <div className="facility-water-readout mono">
                          {formatWaterSummary(
                            f.peakOrAvgWaterMgd,
                            f.annualWaterMgy,
                            f.waterEpistemic,
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mw-bar" aria-hidden="true">
                      <div
                        className="mw-bar-fill"
                        style={{ width: `${opRatio}%` }}
                      />
                    </div>
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    className={`card-pin-btn${isPinned ? " card-pin-btn--pinned" : ""}`}
                    disabled={compareFull}
                    onClick={() => onToggleCompare(f.id)}
                    aria-label={
                      compareFull
                        ? `Compare limit reached for ${f.name}`
                        : isPinned
                          ? `Unpin ${f.name} from comparison`
                          : `Pin ${f.name} for comparison`
                    }
                    title={
                      compareFull
                        ? "Maximum 3 facilities pinned"
                        : isPinned
                          ? "Remove from comparison (C)"
                          : "Pin to comparison (C)"
                    }
                  >
                    {isPinned ? (
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      <GitCompareArrows size={12} aria-hidden="true" />
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
