import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import type {
  CampusFootprintProps,
  FacilityRecord,
  IsoRegionProps,
  LiveBasinHydrology,
  LiveRegulatoryFeed,
  LiveStationWeather,
} from "@shared/types";
import { CompareDock, ComparisonModal } from "./components/ComparisonModal";
import { DirectoryRail } from "./components/DirectoryRail";
import { FacilityDrawer } from "./components/FacilityDrawer";
import { MapCanvas, type MapFlyRequest } from "./components/MapCanvas";
import { RegulatoryModal } from "./components/RegulatoryModal";
import { TopBar } from "./components/TopBar";
import {
  fetchFacilitiesBundle,
  fetchLiveRegulatory,
  fetchTelemetrySummary,
} from "./lib/api";
import { DEFAULT_FILTERS, US_CONTIGUOUS_BOUNDS } from "./lib/constants";
import {
  computeViewportMetrics,
  filterFacilities,
  isFacilityInBounds,
} from "./lib/filters";
import { formatGwOrMw } from "./lib/format";
import type {
  BasemapMode,
  CorridorPreset,
  FilterState,
  MapBoundsTuple,
  MapViewState,
  ResolvedTheme,
  ThemeMode,
} from "./lib/types";
import { readInitialUrlState, writeUrlState } from "./lib/urlState";

const EMPTY_FOOTPRINTS: GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CampusFootprintProps
> = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY_ISO: GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  IsoRegionProps
> = {
  type: "FeatureCollection",
  features: [],
};

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 768;
}

function isSinglePanelViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 1280;
}

export function App() {
  const initial = useMemo(() => readInitialUrlState(), []);

  // Theme
  const [theme, setTheme] = useState<ThemeMode>(initial.theme);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    getSystemPrefersDark(),
  );
  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // Data bundles
  const [facilities, setFacilities] = useState<FacilityRecord[]>([]);
  const [footprints, setFootprints] = useState(EMPTY_FOOTPRINTS);
  const [isoRegions, setIsoRegions] = useState(EMPTY_ISO);
  const [bundleLoading, setBundleLoading] = useState(true);
  const [bundleError, setBundleError] = useState<string | null>(null);

  const [stations, setStations] = useState<Record<string, LiveStationWeather>>(
    {},
  );
  const [gauges, setGauges] = useState<Record<string, LiveBasinHydrology>>({});

  // Regulatory Pulse
  const [regFeed, setRegFeed] = useState<LiveRegulatoryFeed | null>(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regModalOpen, setRegModalOpen] = useState(false);

  // Interactive Map & UI state
  const [basemap, setBasemap] = useState<BasemapMode>(initial.basemap);
  const [previousBasemap, setPreviousBasemap] = useState<BasemapMode | null>(
    null,
  );
  const [lens, setLens] = useState(initial.lens);
  const [filters, setFilters] = useState<FilterState>(initial.filters);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(
    initial.facilityId,
  );
  const [compareIds, setCompareIds] = useState<string[]>(initial.compareIds);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [railOpen, setRailOpen] = useState<boolean>(() => !isMobileViewport());
  const [mobileDetent, setMobileDetent] = useState<"peek" | "expanded">(
    "expanded",
  );

  const [mapView, setMapView] = useState<MapViewState>(initial.view);
  const [mapBounds, setMapBounds] = useState<MapBoundsTuple | null>(null);
  const [activeCorridorId, setActiveCorridorId] = useState<string | null>("us");
  const [flyRequest, setFlyRequest] = useState<MapFlyRequest | null>(null);
  const flyNonceRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const slashShortcutArmedUntilRef = useRef(0);

  // Listen for OS prefers-color-scheme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Sync rail collapse when viewport transitions across mobile / compact breakpoints
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mqMobile = window.matchMedia("(max-width: 768px)");
    const onMobileChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setRailOpen(false);
      }
    };
    mqMobile.addEventListener("change", onMobileChange);
    return () => mqMobile.removeEventListener("change", onMobileChange);
  }, []);

  // Sync theme attributes to <html> & localStorage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-resolved-theme", resolvedTheme);
    try {
      window.localStorage.setItem("gridline:theme", theme);
    } catch {
      // ignore storage failures
    }
  }, [theme, resolvedTheme]);

  // Initial fetch: Facilities + Telemetry Summary + Background Regulatory Pulse
  const loadInitialData = useCallback(() => {
    setBundleLoading(true);
    setBundleError(null);
    const controller = new AbortController();

    fetchFacilitiesBundle(controller.signal)
      .then((bundle) => {
        setFacilities(bundle.facilities);
        setFootprints(bundle.footprints);
        setIsoRegions(bundle.isoRegions);
        if (initial.facilityId && !initial.hasExplicitCoords) {
          const target = bundle.facilities.find(
            (f) => f.id === initial.facilityId,
          );
          if (target) {
            flyNonceRef.current += 1;
            setFlyRequest({
              center: target.coordinates,
              zoom: 9.8,
              pitch: 0,
              nonce: flyNonceRef.current,
            });
          }
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setBundleError(
          err instanceof Error ? err.message : "Failed to load atlas dataset",
        );
      })
      .finally(() => {
        setBundleLoading(false);
      });

    fetchTelemetrySummary(controller.signal)
      .then((summary) => {
        setStations(summary.stations);
        setGauges(summary.gauges);
      })
      .catch(() => {
        // Non-fatal: individual facility drawers still query /api/telemetry/live directly
      });

    fetchLiveRegulatory(false, controller.signal)
      .then((feed) => {
        setRegFeed(feed);
      })
      .catch(() => {
        // Handled cleanly when RegulatoryModal opens
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return loadInitialData();
  }, [loadInitialData]);

  // Global keyboard shortcuts (`/` focuses search without inserting slash; Escape closes drawer)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "/" && !isEditing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        slashShortcutArmedUntilRef.current = performance.now() + 300;
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
        return;
      }

      if (e.key === "Escape") {
        // Modal dialogs manage their own Escape handling & opener focus restoration
        if (regModalOpen || compareModalOpen) return;
        if (selectedFacilityId) {
          setSelectedFacilityId(null);
          return;
        }
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [regModalOpen, compareModalOpen, selectedFacilityId]);

  // Debounced URL search param synchronization
  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeUrlState({
        facilityId: selectedFacilityId,
        view: mapView,
        basemap,
        lens,
        theme,
        filters,
        compareIds,
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [selectedFacilityId, mapView, basemap, lens, theme, filters, compareIds]);

  const filteredFacilities = useMemo(
    () => filterFacilities(facilities, filters),
    [facilities, filters],
  );

  const visibleFacilities = useMemo(
    () =>
      filteredFacilities.filter((f) => isFacilityInBounds(f, mapBounds)),
    [filteredFacilities, mapBounds],
  );

  const viewportMetrics = useMemo(
    () => computeViewportMetrics(visibleFacilities),
    [visibleFacilities],
  );

  const selectedFacility = useMemo(
    () => facilities.find((f) => f.id === selectedFacilityId) ?? null,
    [facilities, selectedFacilityId],
  );

  const pinnedFacilities = useMemo(
    () =>
      compareIds
        .map((id) => facilities.find((f) => f.id === id))
        .filter((f): f is FacilityRecord => Boolean(f)),
    [compareIds, facilities],
  );

  useEffect(() => {
    if (compareIds.length < 2 && compareModalOpen) {
      setCompareModalOpen(false);
    }
  }, [compareIds.length, compareModalOpen]);

  const triggerFly = useCallback((req: Omit<MapFlyRequest, "nonce">) => {
    flyNonceRef.current += 1;
    setFlyRequest({ ...req, nonce: flyNonceRef.current });
  }, []);

  const handleSelectFacility = useCallback(
    (facility: FacilityRecord) => {
      setSelectedFacilityId(facility.id);
      setMobileDetent("expanded");
      if (isSinglePanelViewport()) {
        setRailOpen(false);
      }
      if (!isFacilityInBounds(facility, mapBounds) || mapView.zoom < 6) {
        triggerFly({
          center: facility.coordinates,
          zoom: Math.max(mapView.zoom, 9.2),
          pitch: 0,
        });
      }
    },
    [mapBounds, mapView.zoom, triggerFly],
  );

  const handleInspectParcel = useCallback(
    (facility: FacilityRecord) => {
      setSelectedFacilityId(facility.id);
      setRailOpen(false);
      setMobileDetent("peek");
      if (basemap !== "satellite") {
        setPreviousBasemap(basemap);
        setBasemap("satellite");
      }
      setActiveCorridorId(null);
      triggerFly({
        center: facility.coordinates,
        zoom: 15.8,
        pitch: 35,
        bearing: 0,
      });
    },
    [basemap, triggerFly],
  );

  const handleBasemapChange = useCallback((next: BasemapMode) => {
    setBasemap(next);
    setPreviousBasemap(null);
  }, []);

  const handleRestoreBasemap = useCallback(() => {
    if (!previousBasemap) return;
    setBasemap(previousBasemap);
    setPreviousBasemap(null);
  }, [previousBasemap]);

  const handleCycleTheme = useCallback(() => {
    setTheme((prev) =>
      prev === "system" ? "light" : prev === "light" ? "dark" : "system",
    );
  }, []);

  const handleSelectCorridor = useCallback(
    (preset: CorridorPreset) => {
      setActiveCorridorId(preset.id);
      if (preset.id === "us") {
        triggerFly({
          bounds: US_CONTIGUOUS_BOUNDS,
          zoom: 5.5,
          pitch: 0,
        });
        return;
      }
      triggerFly({
        center: preset.center,
        zoom: preset.zoom,
        pitch: preset.pitch ?? 0,
        bearing: 0,
      });
    },
    [triggerFly],
  );

  const handleFitFilteredBounds = useCallback(() => {
    if (filteredFacilities.length === 0) return;
    if (filteredFacilities.length === 1) {
      triggerFly({
        center: filteredFacilities[0].coordinates,
        zoom: 10.5,
        pitch: 0,
      });
      return;
    }
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const f of filteredFacilities) {
      const [lon, lat] = f.coordinates;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
    triggerFly({
      bounds: [minLon, minLat, maxLon, maxLat],
      zoom: 10,
    });
  }, [filteredFacilities, triggerFly]);

  const handleToggleCompare = useCallback((facilityId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(facilityId)) {
        return prev.filter((id) => id !== facilityId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, facilityId];
    });
  }, []);

  const handleViewChange = useCallback(
    (nextView: MapViewState, nextBounds: MapBoundsTuple) => {
      setMapView(nextView);
      setMapBounds(nextBounds);
    },
    [],
  );

  const handleOpenRegulatory = useCallback(() => {
    setRegModalOpen(true);
    if (!regFeed) {
      setRegLoading(true);
      setRegError(null);
      fetchLiveRegulatory(false)
        .then((feed) => setRegFeed(feed))
        .catch((err: unknown) =>
          setRegError(
            err instanceof Error ? err.message : "Failed to load regulatory feed",
          ),
        )
        .finally(() => setRegLoading(false));
    }
  }, [regFeed]);

  const handleRefreshRegulatory = useCallback(() => {
    setRegLoading(true);
    setRegError(null);
    fetchLiveRegulatory(true)
      .then((feed) => setRegFeed(feed))
      .catch((err: unknown) =>
        setRegError(
          err instanceof Error ? err.message : "Failed to refresh regulatory feed",
        ),
      )
      .finally(() => setRegLoading(false));
  }, []);

  const handleToggleRail = useCallback(() => {
    setRailOpen((prev) => {
      const next = !prev;
      if (next && isSinglePanelViewport()) {
        setSelectedFacilityId(null);
      }
      return next;
    });
  }, []);

  const handleSearchChange = useCallback(
    (nextQ: string) => {
      if (
        performance.now() <= slashShortcutArmedUntilRef.current &&
        (nextQ === "/" || nextQ === `${filters.q}/`)
      ) {
        slashShortcutArmedUntilRef.current = 0;
        if (searchInputRef.current) {
          searchInputRef.current.value = filters.q;
        }
        return;
      }
      slashShortcutArmedUntilRef.current = 0;
      setFilters((prev) => ({ ...prev, q: nextQ }));
    },
    [filters.q],
  );

  return (
    <div className="app-shell">
      <TopBar
        searchInputRef={searchInputRef}
        filters={filters}
        onSearchChange={handleSearchChange}
        lens={lens}
        onLensChange={setLens}
        activeCorridorId={activeCorridorId}
        onSelectCorridor={handleSelectCorridor}
        theme={theme}
        onCycleTheme={handleCycleTheme}
        onOpenRegulatory={handleOpenRegulatory}
        regulatoryCount={regFeed?.items.length ?? null}
      />

      <main
        className={`workspace${selectedFacility ? " workspace--drawer-open" : ""}`}
      >
        {railOpen && (
          <DirectoryRail
            onCollapse={handleToggleRail}
            visibleFacilities={visibleFacilities}
            totalFilteredCount={filteredFacilities.length}
            viewportMetrics={viewportMetrics}
            filters={filters}
            onFiltersChange={setFilters}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
            selectedFacilityId={selectedFacilityId}
            onSelectFacility={handleSelectFacility}
            compareIds={compareIds}
            onToggleCompare={handleToggleCompare}
            onFitFilteredBounds={handleFitFilteredBounds}
          />
        )}

        <div
          className={`map-stage${
            pinnedFacilities.length > 0 ? " map-stage--has-compare" : ""
          }`}
        >
          {bundleError && (
            <div className="workspace-error-banner" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Failed to load infrastructure atlas: {bundleError}</span>
              <button
                type="button"
                className="workspace-retry-btn"
                onClick={loadInitialData}
              >
                <RefreshCw size={12} aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {bundleLoading && facilities.length === 0 && (
            <div className="workspace-loading-pill" aria-live="polite">
              Loading US facility telemetry...
            </div>
          )}

          {!railOpen && (
            <div className="map-collapsed-bar">
              <button
                type="button"
                className="rail-collapsed-tab"
                onClick={handleToggleRail}
                aria-label="Open facility directory and filters"
              >
                <ChevronRight size={14} aria-hidden="true" />
                <span>Directory</span>
                <span className="rail-tab-count mono">{visibleFacilities.length}</span>
              </button>

              <div className="map-collapsed-stats mono" aria-label="Viewport totals">
                <span className="map-stat-op">
                  {formatGwOrMw(viewportMetrics.operationalMw)} op
                </span>
                <span className="hud-sep" aria-hidden="true">
                  ·
                </span>
                <span>{formatGwOrMw(viewportMetrics.plannedMw)} plan</span>
                <span className="hud-sep" aria-hidden="true">
                  ·
                </span>
                <span className="map-stat-warn">
                  {viewportMetrics.contestedOrMoratoriumCount} contested
                </span>
              </div>
            </div>
          )}

          <MapCanvas
            facilities={filteredFacilities}
            footprints={footprints}
            isoRegions={isoRegions}
            stations={stations}
            selectedFacilityId={selectedFacilityId}
            basemap={basemap}
            previousBasemap={previousBasemap}
            onBasemapChange={handleBasemapChange}
            onRestoreBasemap={handleRestoreBasemap}
            resolvedTheme={resolvedTheme}
            lens={lens}
            onLensChange={setLens}
            initialView={initial.view}
            fitUsOnLoad={!initial.hasExplicitCoords && !initial.facilityId}
            flyRequest={flyRequest}
            railOpen={railOpen}
            drawerOpen={Boolean(selectedFacility)}
            mobileDetent={mobileDetent}
            hasCompareDock={pinnedFacilities.length > 0}
            onSelectFacility={handleSelectFacility}
            onViewChange={handleViewChange}
          />

          <CompareDock
            pinnedFacilities={pinnedFacilities}
            onRemove={(id) =>
              setCompareIds((prev) => prev.filter((item) => item !== id))
            }
            onClear={() => {
              setCompareIds([]);
              setCompareModalOpen(false);
            }}
            onOpenMatrix={() => setCompareModalOpen(true)}
          />
        </div>

        {selectedFacility && (
          <FacilityDrawer
            facility={selectedFacility}
            summaryWeather={stations[selectedFacility.waterAndCooling.nwsStationId]}
            summaryHydrology={
              gauges[selectedFacility.waterAndCooling.usgsGaugeSiteId]
            }
            isPinnedCompare={compareIds.includes(selectedFacility.id)}
            compareDisabled={compareIds.length >= 3}
            mobileDetent={mobileDetent}
            onToggleMobileDetent={() =>
              setMobileDetent((d) => (d === "peek" ? "expanded" : "peek"))
            }
            onToggleCompare={handleToggleCompare}
            onInspectParcel={handleInspectParcel}
            onClose={() => setSelectedFacilityId(null)}
          />
        )}
      </main>

      {compareModalOpen && (
        <ComparisonModal
          facilities={pinnedFacilities}
          stations={stations}
          gauges={gauges}
          onClose={() => setCompareModalOpen(false)}
          onRemove={(id) =>
            setCompareIds((prev) => prev.filter((item) => item !== id))
          }
          onSelectFacility={handleSelectFacility}
          onInspectParcel={handleInspectParcel}
        />
      )}

      <RegulatoryModal
        open={regModalOpen}
        feed={regFeed}
        loading={regLoading}
        error={regError}
        onRefresh={handleRefreshRegulatory}
        onClose={() => setRegModalOpen(false)}
      />
    </div>
  );
}
