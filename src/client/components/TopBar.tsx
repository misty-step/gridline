import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Compass,
  Download,
  FileCode2,
  FileSpreadsheet,
  Monitor,
  Moon,
  MoreHorizontal,
  Radio,
  Search,
  Sun,
  X,
} from "lucide-react";
import { CORRIDOR_PRESETS, LENS_OPTIONS } from "../lib/constants";
import { buildFacilityExportUrl } from "../lib/filters";
import type {
  AnalyticalLens,
  CorridorPreset,
  FilterState,
  ThemeMode,
} from "../lib/types";

interface TopBarProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  filters: FilterState;
  onSearchChange: (q: string) => void;
  lens: AnalyticalLens;
  onLensChange: (lens: AnalyticalLens) => void;
  activeCorridorId: string | null;
  onSelectCorridor: (preset: CorridorPreset) => void;
  theme: ThemeMode;
  onCycleTheme: () => void;
  onOpenRegulatory: () => void;
  regulatoryCount: number | null;
}

function renderThemeIcon(theme: ThemeMode) {
  if (theme === "light") return <Sun size={14} aria-hidden="true" />;
  if (theme === "dark") return <Moon size={14} aria-hidden="true" />;
  return <Monitor size={14} aria-hidden="true" />;
}

function getThemeLabel(theme: ThemeMode): string {
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "Auto";
}

export function TopBar({
  searchInputRef,
  filters,
  onSearchChange,
  lens,
  onLensChange,
  activeCorridorId,
  onSelectCorridor,
  theme,
  onCycleTheme,
  onOpenRegulatory,
  regulatoryCount,
}: TopBarProps) {
  const [corridorOpen, setCorridorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  const corridorWrapRef = useRef<HTMLDivElement>(null);
  const corridorBtnRef = useRef<HTMLButtonElement>(null);
  const exportWrapRef = useRef<HTMLDivElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const mobileWrapRef = useRef<HTMLDivElement>(null);
  const mobileBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!corridorOpen && !exportOpen && !mobileToolsOpen) return;

    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        corridorOpen &&
        corridorWrapRef.current &&
        !corridorWrapRef.current.contains(target)
      ) {
        setCorridorOpen(false);
      }
      if (
        exportOpen &&
        exportWrapRef.current &&
        !exportWrapRef.current.contains(target)
      ) {
        setExportOpen(false);
      }
      if (
        mobileToolsOpen &&
        mobileWrapRef.current &&
        !mobileWrapRef.current.contains(target)
      ) {
        setMobileToolsOpen(false);
      }
    }

    function handleEsc(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (corridorOpen) {
        e.preventDefault();
        e.stopPropagation();
        setCorridorOpen(false);
        corridorBtnRef.current?.focus();
      } else if (exportOpen) {
        e.preventDefault();
        e.stopPropagation();
        setExportOpen(false);
        exportBtnRef.current?.focus();
      } else if (mobileToolsOpen) {
        e.preventDefault();
        e.stopPropagation();
        setMobileToolsOpen(false);
        mobileBtnRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc, { capture: true });
    };
  }, [corridorOpen, exportOpen, mobileToolsOpen]);

  const csvUrl = buildFacilityExportUrl("csv", filters);
  const geojsonUrl = buildFacilityExportUrl("geojson", filters);
  const activeCorridor =
    CORRIDOR_PRESETS.find((c) => c.id === activeCorridorId) ?? null;

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <div
          className="brand-mark"
          title="Gridline — US Data Center Infrastructure & Telemetry Atlas"
        >
          <svg
            className="brand-glyph"
            width="18"
            height="18"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <rect
              x="1.5"
              y="1.5"
              width="29"
              height="29"
              rx="6"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="2"
            />
            <path
              d="M6 16h4.5l3-7.5 5 15 3-7.5H26"
              fill="none"
              stroke="var(--status-operational)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="brand-name">Gridline</span>
        </div>

        <div className="omnibox">
          <Search size={14} className="omnibox-icon" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            className="omnibox-input"
            value={filters.q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search campus, city, utility, tenant, docket..."
            aria-label="Search facilities, operators, tenants, utilities, or docket IDs"
          />
          {filters.q ? (
            <button
              type="button"
              className="omnibox-clear"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="omnibox-kbd mono" aria-hidden="true">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Desktop / Tablet Command Controls */}
      <div className="topbar-controls">
        <div
          className="segmented-group"
          role="group"
          aria-label="Analytical Lens"
        >
          {LENS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`seg-btn${lens === opt.id ? " seg-btn--active" : ""}`}
              onClick={() => onLensChange(opt.id)}
              aria-pressed={lens === opt.id}
              title={opt.label}
            >
              <span className="seg-label-full">{opt.label}</span>
              <span className="seg-label-short">{opt.shortLabel}</span>
            </button>
          ))}
        </div>

        <div className="topbar-menu-wrap" ref={corridorWrapRef}>
          <button
            ref={corridorBtnRef}
            type="button"
            className="topbar-action-btn"
            onClick={() => {
              setExportOpen(false);
              setCorridorOpen((prev) => !prev);
            }}
            aria-expanded={corridorOpen}
            aria-haspopup="menu"
            title="Jump to regional corridor"
          >
            <Compass size={13} aria-hidden="true" />
            <span>{activeCorridor ? activeCorridor.label : "Corridors"}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {corridorOpen && (
            <div className="topbar-popover corridor-popover" role="menu">
              {CORRIDOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeCorridorId === preset.id}
                  className={`popover-item${
                    activeCorridorId === preset.id ? " popover-item--active" : ""
                  }`}
                  onClick={() => {
                    onSelectCorridor(preset);
                    setCorridorOpen(false);
                  }}
                >
                  <span>{preset.label}</span>
                  {activeCorridorId === preset.id && (
                    <span className="popover-active-dot" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="topbar-action-btn"
          onClick={onOpenRegulatory}
          title="Live Federal Regulatory Pulse (DOE / FERC / EPA / NRC)"
        >
          <Radio size={13} aria-hidden="true" />
          <span>Federal Pulse</span>
          {regulatoryCount !== null && regulatoryCount > 0 && (
            <span className="topbar-badge mono">{regulatoryCount}</span>
          )}
        </button>

        <div className="topbar-menu-wrap" ref={exportWrapRef}>
          <button
            ref={exportBtnRef}
            type="button"
            className="topbar-action-btn"
            onClick={() => {
              setCorridorOpen(false);
              setExportOpen((prev) => !prev);
            }}
            aria-expanded={exportOpen}
            aria-haspopup="menu"
          >
            <Download size={13} aria-hidden="true" />
            <span>Export</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {exportOpen && (
            <div className="topbar-popover export-popover" role="menu">
              <a
                href={csvUrl}
                download="gridline-facilities.csv"
                className="export-item"
                role="menuitem"
                onClick={() => setExportOpen(false)}
              >
                <FileSpreadsheet size={14} aria-hidden="true" />
                <div>
                  <div className="export-item-title">Export Filtered CSV</div>
                  <div className="export-item-sub">
                    Tabular power, water &amp; docket summary
                  </div>
                </div>
              </a>
              <a
                href={geojsonUrl}
                download="gridline-facilities.geojson"
                className="export-item"
                role="menuitem"
                onClick={() => setExportOpen(false)}
              >
                <FileCode2 size={14} aria-hidden="true" />
                <div>
                  <div className="export-item-title">Export Filtered GeoJSON</div>
                  <div className="export-item-sub">
                    WGS84 points with full facility metadata
                  </div>
                </div>
              </a>
            </div>
          )}
        </div>

        <button
          type="button"
          className="topbar-action-btn topbar-theme-btn"
          onClick={onCycleTheme}
          title={`Theme: ${getThemeLabel(theme)} (click to cycle Auto / Light / Dark)`}
          aria-label={`Theme: ${getThemeLabel(theme)}. Click to switch theme`}
        >
          {renderThemeIcon(theme)}
          <span className="topbar-theme-label">{getThemeLabel(theme)}</span>
        </button>
      </div>

      {/* Mobile Compact Tools Trigger (keeps TopBar single-row <= 52px on narrow viewports) */}
      <div className="topbar-mobile-tools" ref={mobileWrapRef}>
        <button
          ref={mobileBtnRef}
          type="button"
          className="topbar-mobile-btn"
          onClick={() => setMobileToolsOpen((prev) => !prev)}
          aria-expanded={mobileToolsOpen}
          aria-haspopup="menu"
          aria-label="Regions, Federal Pulse, Export and Theme menu"
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>

        {mobileToolsOpen && (
          <div className="topbar-popover mobile-tools-popover" role="menu">
            <div className="popover-section-label">Jump Corridor</div>
            <div className="mobile-corridor-grid">
              {CORRIDOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="menuitem"
                  className={`mobile-popover-chip${
                    activeCorridorId === preset.id
                      ? " mobile-popover-chip--active"
                      : ""
                  }`}
                  onClick={() => {
                    onSelectCorridor(preset);
                    setMobileToolsOpen(false);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="popover-divider" />

            <button
              type="button"
              role="menuitem"
              className="popover-item"
              onClick={() => {
                setMobileToolsOpen(false);
                onOpenRegulatory();
              }}
            >
              <span className="popover-item-inline">
                <Radio size={14} aria-hidden="true" />
                <span>Federal Pulse</span>
              </span>
              {regulatoryCount !== null && regulatoryCount > 0 && (
                <span className="topbar-badge mono">{regulatoryCount}</span>
              )}
            </button>

            <button
              type="button"
              role="menuitem"
              className="popover-item"
              onClick={onCycleTheme}
            >
              <span className="popover-item-inline">
                {renderThemeIcon(theme)}
                <span>Theme: {getThemeLabel(theme)}</span>
              </span>
            </button>

            <a
              href={csvUrl}
              download="gridline-facilities.csv"
              role="menuitem"
              className="popover-item"
              onClick={() => setMobileToolsOpen(false)}
            >
              <span className="popover-item-inline">
                <FileSpreadsheet size={14} aria-hidden="true" />
                <span>Export CSV</span>
              </span>
            </a>

            <a
              href={geojsonUrl}
              download="gridline-facilities.geojson"
              role="menuitem"
              className="popover-item"
              onClick={() => setMobileToolsOpen(false)}
            >
              <span className="popover-item-inline">
                <FileCode2 size={14} aria-hidden="true" />
                <span>Export GeoJSON</span>
              </span>
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
