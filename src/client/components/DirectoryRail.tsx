import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Crosshair,
  Filter,
  GitCompareArrows,
  RotateCcw,
} from "lucide-react";
import type { FacilityRecord } from "@shared/types";
import {
  COOLING_ORDER,
  ISO_ORDER,
  LIFECYCLE_ORDER,
  SORT_OPTIONS,
} from "../lib/constants";
import { hasActiveFilters, isUndisclosedWater, toggleArrayItem } from "../lib/filters";
import {
  COOLING_SHORT_LABELS,
  formatGwOrMw,
  formatMw,
  formatNumber,
  formatWaterMgd,
  LIFECYCLE_LABELS,
} from "../lib/format";
import type { FilterState, SortKey, ViewportMetrics } from "../lib/types";
import { StatusPill } from "./EpistemicBadge";

interface DirectoryRailProps {
  onCollapse: () => void;
  visibleFacilities: FacilityRecord[];
  totalFilteredCount: number;
  viewportMetrics: ViewportMetrics;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onResetFilters: () => void;
  selectedFacilityId: string | null;
  onSelectFacility: (facility: FacilityRecord) => void;
  compareIds: string[];
  onToggleCompare: (facilityId: string) => void;
  onFitFilteredBounds: () => void;
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

  const chipFilterCount =
    filters.statuses.length + filters.isos.length + filters.coolings.length;
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

  return (
    <aside className="rail" aria-label="Facility directory and filters">
      <div className="rail-header">
        <div className="rail-title-row">
          <span className="rail-title">Directory</span>
          <span className="rail-count mono">
            {visibleFacilities.length}
            {visibleFacilities.length !== totalFilteredCount
              ? ` / ${totalFilteredCount}`
              : ""}
          </span>
        </div>
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
            aria-label="Collapse directory rail"
            title="Collapse directory"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Synchronized Viewport Totals (lives inside Directory instead of a full-width top bar) */}
      <div
        className="rail-summary"
        aria-label="Viewport infrastructure totals"
        title={`Disclosed peak water in view: ${formatNumber(viewportMetrics.disclosedPeakWaterMgd, 1)} MGD`}
      >
        <div className="rail-summary-item">
          <span className="rail-summary-k">Op</span>
          <span className="rail-summary-v rail-summary-v--op mono">
            {formatGwOrMw(viewportMetrics.operationalMw)}
          </span>
        </div>
        <div className="rail-summary-item">
          <span className="rail-summary-k">Plan</span>
          <span className="rail-summary-v mono">
            {formatGwOrMw(viewportMetrics.plannedMw)}
          </span>
        </div>
        <div className="rail-summary-item">
          <span className="rail-summary-k">Contested</span>
          <span
            className={`rail-summary-v mono${
              viewportMetrics.contestedOrMoratoriumCount > 0
                ? " rail-summary-v--warn"
                : ""
            }`}
          >
            {viewportMetrics.contestedOrMoratoriumCount}
          </span>
        </div>
        <div className="rail-summary-item">
          <span className="rail-summary-k">No H2O Data</span>
          <span
            className={`rail-summary-v mono${
              viewportMetrics.undisclosedWaterCount > 0
                ? " rail-summary-v--undisclosed"
                : ""
            }`}
          >
            {viewportMetrics.undisclosedWaterCount}
          </span>
        </div>
      </div>

      <div className="rail-controls">
        <div className="rail-quick-row">
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
            Undisclosed Water
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

      <div className="rail-list" role="list">
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
                  0 of {totalFilteredCount} matching campuses in current view
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
                  <span>Zoom to {totalFilteredCount} matching sites</span>
                </button>
              </>
            )}
          </div>
        ) : (
          visibleFacilities.map((f) => {
            const isSelected = selectedFacilityId === f.id;
            const isPinned = compareIds.includes(f.id);
            const compareFull = compareIds.length >= 3 && !isPinned;
            const opMw = f.power.operationalMw.value ?? 0;
            const planMw = f.power.totalPlannedMw.value ?? opMw;
            const opRatio =
              planMw > 0 ? Math.min(100, Math.round((opMw / planMw) * 100)) : 0;
            const undisclosedWater = isUndisclosedWater(f);

            return (
              <article
                key={f.id}
                role="listitem"
                className={`facility-card${
                  isSelected ? " facility-card--selected" : ""
                }`}
              >
                <button
                  type="button"
                  className="facility-card-main"
                  onClick={() => onSelectFacility(f)}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <div className="facility-card-top">
                    <h3 className="facility-card-name">{f.name}</h3>
                    <StatusPill status={f.lifecycleStatus} compact />
                  </div>

                  <div className="facility-card-meta">
                    <span>
                      {f.city}, {f.state}
                    </span>
                    <span className="meta-dot" aria-hidden="true">
                      ·
                    </span>
                    <span className="mono">{f.isoRegion}</span>
                    <span className="meta-dot" aria-hidden="true">
                      ·
                    </span>
                    <span>
                      {COOLING_SHORT_LABELS[f.waterAndCooling.coolingArchitecture]}
                    </span>
                  </div>

                  <div className="facility-card-metrics">
                    <div className="facility-mw-readout mono">
                      <span className="mw-op">
                        {f.power.operationalMw.value !== null
                          ? `${Math.round(opMw)}`
                          : "—"}
                      </span>
                      <span className="mw-sep">/</span>
                      <span className="mw-plan">
                        {formatMw(f.power.totalPlannedMw.value)}
                      </span>
                    </div>

                    <div
                      className={`facility-water-readout mono${
                        undisclosedWater ? " facility-water-readout--undisclosed" : ""
                      }`}
                    >
                      {formatWaterMgd(f.waterAndCooling.peakOrAvgWaterMgd)}
                    </div>
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
                        ? "Remove from comparison"
                        : "Pin to comparison"
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
          })
        )}
      </div>
    </aside>
  );
}
