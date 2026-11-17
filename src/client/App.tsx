import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import type {
  ActivityWindow,
  CampusFootprintProps,
  FacilityDetailApiResponse,
  FacilityIndexItem,
  FleetSummaryMetadata,
  IsoRegionProps,
  LiveBasinHydrology,
  LiveGridFeed,
  LivePulseFeed,
  LiveStationWeather,
} from "@shared/types";
import { CompareDock, ComparisonModal } from "./components/ComparisonModal";
import { DirectoryRail } from "./components/DirectoryRail";
import { FacilityDrawer } from "./components/FacilityDrawer";
import { LivePulseModal } from "./components/LivePulseModal";
import { MapCanvas, type MapFlyRequest } from "./components/MapCanvas";
import { TopBar } from "./components/TopBar";
import {
  facilityRecordToIndexItem,
  fetchFacilitiesIndex,
  fetchFacilityDetail,
  fetchLiveGrid,
  fetchLivePulse,
  fetchNationalFootprints,
  fetchTelemetrySummary,
} from "./lib/api";
import { DEFAULT_FILTERS, US_CONTIGUOUS_BOUNDS } from "./lib/constants";
import {
  computeViewportMetrics,
  filterFacilities,
  isFacilityInBounds,
} from "./lib/filters";
import { formatGwOrMw, formatNumber } from "./lib/format";
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

function mergeFootprintCollections(
  base: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>,
  incoming: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>,
): GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> {
  if (incoming.features.length === 0) return base;
  if (base.features.length === 0) return incoming;
  const seen = new Set<string>();
  for (const ft of base.features) {
    const ring0 = ft.geometry.coordinates[0]?.[0];
    seen.add(
      `${ft.properties.facilityId}:${ft.properties.zoneKind}:${ft.properties.label}:${ring0?.[0] ?? ""}:${ring0?.[1] ?? ""}`,
    );
  }
  const merged = [...base.features];
  for (const ft of incoming.features) {
    const ring0 = ft.geometry.coordinates[0]?.[0];
    const key = `${ft.properties.facilityId}:${ft.properties.zoneKind}:${ft.properties.label}:${ring0?.[0] ?? ""}:${ring0?.[1] ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(ft);
    }
  }
  return {
    type: "FeatureCollection",
    features: merged,
  };
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

  // National Index & Lazy Spatial Bundles
  const [facilities, setFacilities] = useState<FacilityIndexItem[]>([]);
  const [fleetSummary, setFleetSummary] = useState<FleetSummaryMetadata | null>(
    null,
  );
  const [footprints, setFootprints] = useState(EMPTY_FOOTPRINTS);
  const [isoRegions, setIsoRegions] = useState(EMPTY_ISO);
  const [bundleLoading, setBundleLoading] = useState(true);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const nationalFootprintsRequestedRef = useRef(false);
  const hasLegacyAllFootprintsRef = useRef(false);

  // Per-facility Detail Cache
  const [detailsById, setDetailsById] = useState<
    Record<string, FacilityDetailApiResponse>
  >({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<Record<string, boolean>>(
    {},
  );
  const [detailErrorById, setDetailErrorById] = useState<Record<string, string>>(
    {},
  );
  const detailsByIdRef = useRef(detailsById);
  detailsByIdRef.current = detailsById;
  const inflightDetailsRef = useRef<Set<string>>(new Set());

  // Live Telemetry & Grid Dispatch
  const [stations, setStations] = useState<Record<string, LiveStationWeather>>(
    {},
  );
  const [gauges, setGauges] = useState<Record<string, LiveBasinHydrology>>({});
  const [gridFeed, setGridFeed] = useState<LiveGridFeed | null>(null);

  // Live Observatory Pulse
  const [pulseFeed, setPulseFeed] = useState<LivePulseFeed | null>(null);
  const [pulseWindow, setPulseWindow] = useState<ActivityWindow>("30d");
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseError, setPulseError] = useState<string | null>(null);
  const [pulseModalOpen, setPulseModalOpen] = useState(false);

  // Interactive Map & UI state
  const [basemap, setBasemap] = useState<BasemapMode>(initial.basemap);
  const [previousBasemap, setPreviousBasemap] = useState<BasemapMode | null>(
    null,
  );
  const [lens, setLens] = useState(initial.lens);
  const [radarWindow, setRadarWindow] = useState<ActivityWindow>("all");
  const [filters, setFilters] = useState<FilterState>(initial.filters);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(
    initial.facilityId,
  );
  const [compareIds, setCompareIds] = useState<string[]>(initial.compareIds);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [railOpen, setRailOpen] = useState<boolean>(
    () =>
      !isMobileViewport() &&
      !(Boolean(initial.facilityId) && isSinglePanelViewport()),
  );
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

  // Sync rail collapse on narrow viewports & single-panel drawer mode (< 1280px)
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncSinglePanel = () => {
      if (selectedFacilityId && isSinglePanelViewport()) {
        setRailOpen(false);
      }
    };
    syncSinglePanel();
    if (!window.matchMedia) return;
    const mqSingle = window.matchMedia("(max-width: 1279px)");
    mqSingle.addEventListener("change", syncSinglePanel);
    return () => mqSingle.removeEventListener("change", syncSinglePanel);
  }, [selectedFacilityId]);

  // Sync theme attributes to <html> & localStorage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-resolved-theme", resolvedTheme);
    try {
      window.localStorage.setItem("undercurrent:theme", theme);
    } catch {
      // ignore storage failures
    }
  }, [theme, resolvedTheme]);

  // Lazy load national traced footprints once on parcel zoom / inspect / verified_polygons selection
  const ensureNationalFootprints = useCallback(() => {
    if (hasLegacyAllFootprintsRef.current) return;
    if (nationalFootprintsRequestedRef.current) return;
    nationalFootprintsRequestedRef.current = true;
    fetchNationalFootprints().then((fc) => {
      if (fc && fc.features.length > 0) {
        setFootprints((prev) => mergeFootprintCollections(prev, fc));
      }
    });
  }, []);

  // On-demand campus detail hydration
  const ensureFacilityDetail = useCallback((facilityId: string) => {
    if (!facilityId) return;
    if (
      detailsByIdRef.current[facilityId] ||
      inflightDetailsRef.current.has(facilityId)
    ) {
      return;
    }
    inflightDetailsRef.current.add(facilityId);
    setDetailLoadingIds((prev) => ({ ...prev, [facilityId]: true }));
    setDetailErrorById((prev) => {
      if (!prev[facilityId]) return prev;
      const next = { ...prev };
      delete next[facilityId];
      return next;
    });

    fetchFacilityDetail(facilityId)
      .then((detail) => {
        setDetailsById((prev) => ({ ...prev, [facilityId]: detail }));
        if (detail.footprints?.features?.length) {
          setFootprints((prev) =>
            mergeFootprintCollections(prev, detail.footprints),
          );
        }
        if (detail.telemetry?.weather) {
          setStations((prev) => ({
            ...prev,
            [detail.telemetry.weather.stationId]: detail.telemetry.weather,
          }));
        }
        if (detail.telemetry?.hydrology) {
          setGauges((prev) => ({
            ...prev,
            [detail.telemetry.hydrology.siteId]: detail.telemetry.hydrology,
          }));
        }
        if (detail.gridSnapshot) {
          setGridFeed((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              regions: {
                ...prev.regions,
                [detail.gridSnapshot!.isoRegion]: detail.gridSnapshot!,
              },
            };
          });
        }
      })
      .catch((err: unknown) => {
        setDetailErrorById((prev) => ({
          ...prev,
          [facilityId]:
            err instanceof Error ? err.message : "Failed to load facility dossier",
        }));
      })
      .finally(() => {
        inflightDetailsRef.current.delete(facilityId);
        setDetailLoadingIds((prev) => ({ ...prev, [facilityId]: false }));
      });
  }, []);

  // Initial parallel boot: Index + Live Grid + Live Pulse + Telemetry Summary
  const loadInitialData = useCallback(() => {
    setBundleLoading(true);
    setBundleError(null);
    const controller = new AbortController();

    fetchFacilitiesIndex(controller.signal)
      .then((boot) => {
        hasLegacyAllFootprintsRef.current = Boolean(
          boot.legacyFootprints && boot.legacyFootprints.features.length > 0,
        );
        setFacilities(boot.indexResponse.facilities);
        setFleetSummary(boot.indexResponse.summary);
        setIsoRegions(boot.indexResponse.isoRegions);

        if (boot.legacyFootprints && boot.legacyFootprints.features.length > 0) {
          setFootprints((prev) =>
            mergeFootprintCollections(prev, boot.legacyFootprints!),
          );
        }

        if (initial.facilityId && !initial.hasExplicitCoords) {
          const target = boot.indexResponse.facilities.find(
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
          err instanceof Error ? err.message : "Failed to load observatory index",
        );
      })
      .finally(() => {
        setBundleLoading(false);
      });

    fetchLiveGrid(false, controller.signal)
      .then((feed) => {
        if (feed) setGridFeed(feed);
      })
      .catch(() => {
        // Non-fatal: 404 or degraded upstream handled cleanly
      });

    fetchLivePulse({ window: "30d" }, controller.signal)
      .then((feed) => {
        setPulseFeed(feed);
      })
      .catch(() => {
        // Handled cleanly when LivePulseModal opens
      });

    fetchTelemetrySummary(controller.signal)
      .then((summary) => {
        setStations((prev) => ({ ...summary.stations, ...prev }));
        setGauges((prev) => ({ ...summary.gauges, ...prev }));
      })
      .catch(() => {
        // Non-fatal: facility detail fetches live NOAA/USGS directly
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return loadInitialData();
  }, [loadInitialData]);

  // Hydrate selected facility + lazy footprints if verified_polygons
  useEffect(() => {
    if (!selectedFacilityId) return;
    ensureFacilityDetail(selectedFacilityId);
    const item = facilities.find((f) => f.id === selectedFacilityId);
    if (item?.footprintCoverage === "verified_polygons") {
      ensureNationalFootprints();
    }
  }, [selectedFacilityId, facilities, ensureFacilityDetail, ensureNationalFootprints]);

  // Hydrate pinned compare facilities on demand
  useEffect(() => {
    for (const id of compareIds) {
      ensureFacilityDetail(id);
    }
  }, [compareIds, ensureFacilityDetail]);

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
        if (pulseModalOpen || compareModalOpen) return;
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
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [pulseModalOpen, compareModalOpen, selectedFacilityId]);

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
    () => filteredFacilities.filter((f) => isFacilityInBounds(f, mapBounds)),
    [filteredFacilities, mapBounds],
  );

  const viewportMetrics = useMemo(
    () => computeViewportMetrics(visibleFacilities),
    [visibleFacilities],
  );

  const selectedFacility = useMemo(() => {
    if (!selectedFacilityId) return null;
    const found = facilities.find((f) => f.id === selectedFacilityId);
    if (found) return found;
    const detail = detailsById[selectedFacilityId];
    return detail ? facilityRecordToIndexItem(detail.facility) : null;
  }, [facilities, selectedFacilityId, detailsById]);

  const pinnedFacilities = useMemo(
    () =>
      compareIds
        .map((id) => facilities.find((f) => f.id === id))
        .filter((f): f is FacilityIndexItem => Boolean(f)),
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
    (facility: FacilityIndexItem) => {
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

  const handleSelectFacilityById = useCallback(
    (facilityId: string) => {
      const target = facilities.find((f) => f.id === facilityId);
      if (target) {
        handleSelectFacility(target);
      } else {
        setSelectedFacilityId(facilityId);
      }
    },
    [facilities, handleSelectFacility],
  );

  const handleInspectParcel = useCallback(
    (facility: FacilityIndexItem) => {
      ensureNationalFootprints();
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
    [basemap, triggerFly, ensureNationalFootprints],
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
      prev === "dark" ? "light" : prev === "light" ? "system" : "dark",
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

  const loadPulseStreams = useCallback(
    (windowArg: ActivityWindow, refresh: boolean) => {
      setPulseLoading(true);
      setPulseError(null);
      Promise.allSettled([
        fetchLivePulse({ window: windowArg, refresh }),
        refresh ? fetchLiveGrid(true) : Promise.resolve(null),
      ])
        .then(([pulseRes, gridRes]) => {
          if (pulseRes.status === "fulfilled") {
            setPulseFeed(pulseRes.value);
          } else {
            setPulseError(
              pulseRes.reason instanceof Error
                ? pulseRes.reason.message
                : "Failed to load Live Pulse feed",
            );
          }
          if (gridRes.status === "fulfilled" && gridRes.value) {
            setGridFeed(gridRes.value);
          }
        })
        .finally(() => {
          setPulseLoading(false);
        });
    },
    [],
  );

  const handleOpenPulse = useCallback(() => {
    setPulseModalOpen(true);
    if (!pulseFeed) {
      loadPulseStreams(pulseWindow, false);
    }
  }, [pulseFeed, pulseWindow, loadPulseStreams]);

  const handlePulseWindowChange = useCallback(
    (nextWindow: ActivityWindow) => {
      setPulseWindow(nextWindow);
      loadPulseStreams(nextWindow, false);
    },
    [loadPulseStreams],
  );

  const handleRefreshPulse = useCallback(() => {
    loadPulseStreams(pulseWindow, true);
  }, [pulseWindow, loadPulseStreams]);

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
        onOpenPulse={handleOpenPulse}
        pulseCount={pulseFeed?.items.length ?? null}
        pulseStatus={pulseFeed?.status ?? gridFeed?.status ?? null}
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
              <span>Could not load the campus index: {bundleError}</span>
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
              Loading campuses…
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
                <span className="rail-tab-count mono">
                  {formatNumber(visibleFacilities.length)}
                </span>
              </button>

              <div className="map-collapsed-stats mono" aria-label="Viewport totals">
                <span className="map-stat-op">
                  {formatGwOrMw(viewportMetrics.verifiedOperationalMw)} operating
                </span>
                <span className="hud-sep" aria-hidden="true">
                  ·
                </span>
                <span className="map-stat-plan">
                  {formatGwOrMw(viewportMetrics.verifiedPlannedMw)} planned
                </span>
                {viewportMetrics.reportedOrProposedMw > 0 && (
                  <>
                    <span className="hud-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="map-stat-prop">
                      +{formatGwOrMw(viewportMetrics.reportedOrProposedMw)} reported
                    </span>
                  </>
                )}
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
            gridFeed={gridFeed}
            selectedFacility={selectedFacility}
            selectedFacilityId={selectedFacilityId}
            basemap={basemap}
            previousBasemap={previousBasemap}
            onBasemapChange={handleBasemapChange}
            onRestoreBasemap={handleRestoreBasemap}
            resolvedTheme={resolvedTheme}
            lens={lens}
            onLensChange={setLens}
            radarWindow={radarWindow}
            onRadarWindowChange={setRadarWindow}
            initialView={initial.view}
            fitUsOnLoad={!initial.hasExplicitCoords && !initial.facilityId}
            flyRequest={flyRequest}
            railOpen={railOpen}
            drawerOpen={Boolean(selectedFacility)}
            mobileDetent={mobileDetent}
            hasCompareDock={pinnedFacilities.length > 0}
            onNeedFootprints={ensureNationalFootprints}
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
            indexItem={selectedFacility}
            detail={detailsById[selectedFacility.id] ?? null}
            detailLoading={Boolean(detailLoadingIds[selectedFacility.id])}
            detailError={detailErrorById[selectedFacility.id] ?? null}
            summaryWeather={stations[selectedFacility.nwsStationId]}
            summaryHydrology={gauges[selectedFacility.usgsGaugeSiteId]}
            summaryGridSnapshot={
              gridFeed?.regions?.[selectedFacility.isoRegion] ?? null
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
          detailsById={detailsById}
          stations={stations}
          gauges={gauges}
          gridFeed={gridFeed}
          onClose={() => setCompareModalOpen(false)}
          onRemove={(id) =>
            setCompareIds((prev) => prev.filter((item) => item !== id))
          }
          onSelectFacility={handleSelectFacility}
          onInspectParcel={handleInspectParcel}
        />
      )}

      <LivePulseModal
        open={pulseModalOpen}
        gridFeed={gridFeed}
        pulseFeed={pulseFeed}
        fleetSummary={fleetSummary}
        pulseWindow={pulseWindow}
        loading={pulseLoading}
        error={pulseError}
        onPulseWindowChange={handlePulseWindowChange}
        onRefresh={handleRefreshPulse}
        onSelectFacilityById={handleSelectFacilityById}
        facilityNameById={(id) => facilities.find((f) => f.id === id)?.name}
        onClose={() => setPulseModalOpen(false)}
      />
    </div>
  );
}
