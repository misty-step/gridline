import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Filter,
  GitCompareArrows,
  RotateCcw,
  Satellite,
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
  formatMw,
  formatWaterMgd,
  LIFECYCLE_LABELS,
} from "../lib/format";
import type { FilterState, SortKey } from "../lib/types";
import { StatusPill } from "./EpistemicBadge";

interface DirectoryRailProps {
  open: boolean;
  onToggleOpen: () => void;
  visibleFacilities: FacilityRecord[];
  totalFilteredCount: number;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onResetFilters: () => void;
  selectedFacilityId: string | null;
  onSelectFacility: (facility: FacilityRecord) => void;
  onInspectParcel: (facility: FacilityRecord) => void;
  compareIds: string[];
  onToggleCompare: (facilityId: string) => void;
  onFitFilteredBounds: () => void;
}

export function DirectoryRail({
  open,
  onToggleOpen,
  visibleFacilities,
  totalFilteredCount,
  filters,
  onFiltersChange,
  onResetFilters,
  selectedFacilityId,
  onSelectFacility,
  onInspectParcel,
  compareIds,
  onToggleCompare,
  onFitFilteredBounds,
}: DirectoryRailProps) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const chipFilterCount =
    filters.statuses.length + filters.isos.length + filters.coolings.length;
  const anyFilters = hasActiveFilters(filters);

  if (!open) {
    return (
      <button
        type="button"
        className="rail-collapsed-tab"
        onClick={onToggleOpen}
        aria-label="Open facility directory and filters"
      >
        <ChevronRight size={14} aria-hidden="true" />
        <span>Directory</span>
        <span className="rail-tab-count mono">{visibleFacilities.length}</span>
      </button>
    );
  }

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
            onClick={onToggleOpen}
            aria-label="Collapse directory rail"
            title="Collapse directory"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
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
            Contested / Moratorium
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

        <div className="rail-sort-row">
          <button
            type="button"
            className={`filter-drawer-btn${
              filtersExpanded || chipFilterCount > 0 ? " filter-drawer-btn--active" : ""
            }`}
            aria-expanded={filtersExpanded}
            onClick={() => setFiltersExpanded((prev) => !prev)}
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
        </div>

        {filtersExpanded && (
          <div className="filter-panel">
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

      <div className="rail-list" role="list">
        {visibleFacilities.length === 0 ? (
          <div className="rail-empty">
            <p className="rail-empty-title">No facilities in current viewport</p>
            {totalFilteredCount > 0 ? (
              <button
                type="button"
                className="rail-empty-action"
                onClick={onFitFilteredBounds}
              >
                <Crosshair size={13} aria-hidden="true" />
                <span>Zoom to {totalFilteredCount} matching sites</span>
              </button>
            ) : (
              <button
                type="button"
                className="rail-empty-action"
                onClick={onResetFilters}
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span>Clear active filters</span>
              </button>
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
                <div
                  className="facility-card-main"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectFacility(f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectFacility(f);
                    }
                  }}
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
                      <span className="mw-plan">{formatMw(f.power.totalPlannedMw.value)}</span>
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
                </div>

                <div className="facility-card-actions">
                  <button
                    type="button"
                    className="card-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectParcel(f);
                    }}
                    title="Inspect parcel in Satellite z16 2.5D view"
                  >
                    <Satellite size={12} aria-hidden="true" />
                    <span>Inspect Parcel</span>
                  </button>

                  <button
                    type="button"
                    className={`card-action-btn${
                      isPinned ? " card-action-btn--pinned" : ""
                    }`}
                    disabled={compareFull}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCompare(f.id);
                    }}
                    title={
                      compareFull
                        ? "Maximum 3 facilities pinned for comparison"
                        : isPinned
                          ? "Remove from comparison"
                          : "Add to side-by-side comparison"
                    }
                  >
                    <GitCompareArrows size={12} aria-hidden="true" />
                    <span>{isPinned ? "Pinned" : "+ Compare"}</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
