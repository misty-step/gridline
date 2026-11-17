import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileCode2,
  Layers,
  Monitor,
  Moon,
  Radio,
  Search,
  Sun,
  X,
} from "lucide-react";
import { BASEMAP_OPTIONS, LENS_OPTIONS } from "../lib/constants";
import { buildFacilityExportUrl } from "../lib/filters";
import type {
  AnalyticalLens,
  BasemapMode,
  FilterState,
  ThemeMode,
} from "../lib/types";

interface TopBarProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  filters: FilterState;
  onSearchChange: (q: string) => void;
  lens: AnalyticalLens;
  onLensChange: (lens: AnalyticalLens) => void;
  basemap: BasemapMode;
  onBasemapChange: (basemap: BasemapMode) => void;
  previousBasemap: BasemapMode | null;
  onRestoreBasemap: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onOpenRegulatory: () => void;
  regulatoryCount: number | null;
}

export function TopBar({
  searchInputRef,
  filters,
  onSearchChange,
  lens,
  onLensChange,
  basemap,
  onBasemapChange,
  previousBasemap,
  onRestoreBasemap,
  theme,
  onThemeChange,
  onOpenRegulatory,
  regulatoryCount,
}: TopBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number }>({
    top: 48,
    right: 12,
  });
  const exportRef = useRef<HTMLDivElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    if (exportBtnRef.current) {
      const rect = exportBtnRef.current.getBoundingClientRect();
      setPopoverPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    function handleOutsideClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [exportOpen]);

  const csvUrl = buildFacilityExportUrl("csv", filters);
  const geojsonUrl = buildFacilityExportUrl("geojson", filters);

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <div className="brand-mark" title="Gridline — US Data Center Infrastructure & Telemetry Atlas">
          <span className="brand-pulse" aria-hidden="true" />
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
            placeholder="Search facility, city, county, tenant, utility, docket..."
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

      <div className="topbar-controls">
        <div className="segmented-group" role="group" aria-label="Analytical Lens">
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

        <div className="segmented-group" role="group" aria-label="Basemap Style">
          <span className="seg-prefix" aria-hidden="true">
            <Layers size={12} />
          </span>
          {BASEMAP_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`seg-btn${basemap === opt.id ? " seg-btn--active" : ""}`}
              onClick={() => onBasemapChange(opt.id)}
              aria-pressed={basemap === opt.id}
            >
              {opt.label}
            </button>
          ))}
          {previousBasemap && previousBasemap !== basemap && (
            <button
              type="button"
              className="seg-btn seg-btn--restore"
              onClick={onRestoreBasemap}
              title={`Return to ${previousBasemap} basemap`}
            >
              Back
            </button>
          )}
        </div>

        <div className="segmented-group segmented-group--theme" role="group" aria-label="Theme Mode">
          <button
            type="button"
            className={`seg-btn seg-btn--icon${theme === "system" ? " seg-btn--active" : ""}`}
            onClick={() => onThemeChange("system")}
            aria-pressed={theme === "system"}
            title="System theme"
            aria-label="System theme"
          >
            <Monitor size={13} aria-hidden="true" />
            <span className="seg-theme-text">System</span>
          </button>
          <button
            type="button"
            className={`seg-btn seg-btn--icon${theme === "light" ? " seg-btn--active" : ""}`}
            onClick={() => onThemeChange("light")}
            aria-pressed={theme === "light"}
            title="Light theme"
            aria-label="Light theme"
          >
            <Sun size={13} aria-hidden="true" />
            <span className="seg-theme-text">Light</span>
          </button>
          <button
            type="button"
            className={`seg-btn seg-btn--icon${theme === "dark" ? " seg-btn--active" : ""}`}
            onClick={() => onThemeChange("dark")}
            aria-pressed={theme === "dark"}
            title="Dark theme"
            aria-label="Dark theme"
          >
            <Moon size={13} aria-hidden="true" />
            <span className="seg-theme-text">Dark</span>
          </button>
        </div>

        <button
          type="button"
          className="topbar-action-btn"
          onClick={onOpenRegulatory}
          title="Live Federal Regulatory Pulse (FERC / DOE / EPA)"
        >
          <Radio size={13} aria-hidden="true" />
          <span>Federal Pulse</span>
          {regulatoryCount !== null && regulatoryCount > 0 && (
            <span className="topbar-badge mono">{regulatoryCount}</span>
          )}
        </button>

        <div className="export-menu-wrap" ref={exportRef}>
          <button
            ref={exportBtnRef}
            type="button"
            className="topbar-action-btn"
            onClick={() => setExportOpen((prev) => !prev)}
            aria-expanded={exportOpen}
            aria-haspopup="menu"
          >
            <Download size={13} aria-hidden="true" />
            <span>Export</span>
          </button>
          {exportOpen && (
            <div
              className="export-popover"
              role="menu"
              style={{ top: popoverPos.top, right: popoverPos.right }}
            >
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
                  <div className="export-item-sub">Tabular power, water &amp; docket summary</div>
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
                  <div className="export-item-sub">WGS84 points with full facility metadata</div>
                </div>
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
