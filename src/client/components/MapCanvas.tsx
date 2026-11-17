import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Layers, RotateCcw } from "lucide-react";
import maplibregl from "maplibre-gl";
import type {
  ActivityWindow,
  CampusFootprintProps,
  FacilityIndexItem,
  IsoRegion,
  IsoRegionProps,
  LiveGridFeed,
  LiveIsoGridSnapshot,
  LiveStationWeather,
} from "@shared/types";
import {
  BASEMAP_OPTIONS,
  ESRI_WORLD_IMAGERY_TILES,
  getMapPalette,
  ISO_ORDER,
  LAZY_FOOTPRINTS_ZOOM,
  LENS_OPTIONS,
  type MapColorPalette,
  RADAR_WINDOW_OPTIONS,
  TIER_MACRO_MAX_ZOOM,
  TIER_PARCEL_MIN_ZOOM,
  US_CONTIGUOUS_BOUNDS,
  USGS_IMAGERY_TILES,
  VECTOR_DARK_STYLE,
  VECTOR_LIGHT_STYLE,
} from "../lib/constants";
import {
  buildFacilitiesGeoJson,
  buildMarketClusters,
  buildMarketClustersGeoJson,
  isUndisclosedWater,
} from "../lib/filters";
import {
  CATALOG_TIER_SHORT_LABELS,
  computeCleanSharePct,
  COOLING_SHORT_LABELS,
  formatCoordHud,
  formatGw,
  formatGwOrMw,
  formatMw,
  formatNumber,
  formatShortClusterName,
  formatTempPair,
  formatWaterSummary,
  INTERCONNECTION_LABELS,
  THERMAL_REGIME_LABELS,
  WATERSHED_STRESS_LABELS,
  ZONE_KIND_LABELS,
} from "../lib/format";
import type {
  AnalyticalLens,
  BasemapMode,
  HoveredClusterState,
  HoveredFacilityState,
  HoveredFootprintState,
  HoveredIsoState,
  MapBoundsTuple,
  MapViewState,
  MarketClusterSummary,
  ResolvedTheme,
  ZoomTier,
} from "../lib/types";
import { StatusPill, TierBadge } from "./EpistemicBadge";

export interface MapFlyRequest {
  center?: [number, number];
  bounds?: MapBoundsTuple;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  nonce: number;
}

interface MapCanvasProps {
  facilities: FacilityIndexItem[];
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  isoRegions: GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    IsoRegionProps
  >;
  stations: Record<string, LiveStationWeather>;
  gridFeed: LiveGridFeed | null;
  selectedFacility: FacilityIndexItem | null;
  selectedFacilityId: string | null;
  basemap: BasemapMode;
  previousBasemap: BasemapMode | null;
  onBasemapChange: (basemap: BasemapMode) => void;
  onRestoreBasemap: () => void;
  resolvedTheme: ResolvedTheme;
  lens: AnalyticalLens;
  onLensChange: (lens: AnalyticalLens) => void;
  radarWindow: ActivityWindow;
  onRadarWindowChange: (window: ActivityWindow) => void;
  initialView: MapViewState;
  fitUsOnLoad: boolean;
  flyRequest: MapFlyRequest | null;
  railOpen: boolean;
  drawerOpen: boolean;
  mobileDetent: "peek" | "expanded";
  hasCompareDock?: boolean;
  onNeedFootprints: () => void;
  onSelectFacility: (facility: FacilityIndexItem) => void;
  onViewChange: (view: MapViewState, bounds: MapBoundsTuple) => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function canPointerHover(): boolean {
  return (
    typeof window === "undefined" ||
    !window.matchMedia ||
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function getZoomTier(zoom: number): ZoomTier {
  if (zoom < TIER_MACRO_MAX_ZOOM) return "macro";
  if (zoom < TIER_PARCEL_MIN_ZOOM) return "regional";
  return "parcel";
}

function getZoomTierLabel(tier: ZoomTier): string {
  if (tier === "macro") return "MACRO NATIONAL";
  if (tier === "regional") return "REGIONAL CORRIDOR";
  return "PARCEL INSPECTION";
}

function buildRasterStyle(
  tiles: string[],
  attribution: string,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      "gridline-raster": {
        type: "raster",
        tiles,
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [
      {
        id: "gridline-raster-layer",
        type: "raster",
        source: "gridline-raster",
        paint: {
          "raster-saturation": -0.08,
        },
      },
    ],
  };
}

function getMapStyleSpec(
  basemap: BasemapMode,
  resolvedTheme: ResolvedTheme,
): string | maplibregl.StyleSpecification {
  if (basemap === "satellite") {
    return buildRasterStyle(
      [ESRI_WORLD_IMAGERY_TILES],
      "Esri, Maxar, Earthstar Geographics",
    );
  }
  if (basemap === "usgs") {
    return buildRasterStyle(
      [USGS_IMAGERY_TILES],
      "USGS The National Map Imagery",
    );
  }
  return resolvedTheme === "dark" ? VECTOR_DARK_STYLE : VECTOR_LIGHT_STYLE;
}

function createDashedRingImage(
  strokeColor: string,
  dash: number[],
  doubleRing = false,
): ImageData {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new ImageData(size, size);

  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = 4.2;
  ctx.strokeStyle = "rgba(6, 5, 8, 0.84)";
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2.6;
  ctx.strokeStyle = strokeColor;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.stroke();

  if (doubleRing) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 18.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

function ensureProceduralIcons(map: maplibregl.Map): void {
  if (!map.hasImage("halo-contested")) {
    map.addImage(
      "halo-contested",
      createDashedRingImage("#ffb300", [7, 5], false),
      { pixelRatio: 2 },
    );
  }
  if (!map.hasImage("halo-moratorium")) {
    map.addImage(
      "halo-moratorium",
      createDashedRingImage("#ff4d4d", [5, 4], true),
      { pixelRatio: 2 },
    );
  }
  if (!map.hasImage("ring-undisclosed-water")) {
    map.addImage(
      "ring-undisclosed-water",
      createDashedRingImage("#ff4d4d", [4, 4], false),
      { pixelRatio: 2 },
    );
  }
  if (!map.hasImage("halo-provisional")) {
    map.addImage(
      "halo-provisional",
      createDashedRingImage("#c084fc", [5, 5], false),
      { pixelRatio: 2 },
    );
  }
  if (!map.hasImage("halo-activity-target")) {
    map.addImage(
      "halo-activity-target",
      createDashedRingImage("#ff9e2c", [8, 4], false),
      { pixelRatio: 2 },
    );
  }
}

function softenVectorBasemapLabels(map: maplibregl.Map): void {
  try {
    const layers = map.getStyle()?.layers ?? [];
    for (const layer of layers) {
      if (
        layer.id.startsWith("iso-") ||
        layer.id.startsWith("clusters-") ||
        layer.id.startsWith("facilities-") ||
        layer.id.startsWith("footprints-")
      ) {
        continue;
      }
      if (layer.type === "symbol") {
        map.setPaintProperty(layer.id, "text-opacity", 0.5);
      }
    }
  } catch {
    // Ignore third-party style property guard
  }
}

function deriveLiveIsoStress(
  baseLevel: string,
  snap?: LiveIsoGridSnapshot | null,
): string {
  if (!snap || snap.status === "degraded" || snap.demandMw === null) {
    return baseLevel;
  }
  if (snap.netGenerationMw !== null && snap.demandMw > 0) {
    const importRatio = (snap.demandMw - snap.netGenerationMw) / snap.demandMw;
    if (importRatio > 0.16 && baseLevel === "severe") return "severe";
    if (importRatio > 0.12) return "high";
  }
  const cleanPct = computeCleanSharePct(snap.fuelMix);
  if (baseLevel === "severe") return "severe";
  if (cleanPct !== null && cleanPct >= 55 && baseLevel === "elevated") {
    return "moderate";
  }
  return baseLevel;
}

function buildFacilityColorExpression(
  lens: AnalyticalLens,
  palette: MapColorPalette,
): maplibregl.ExpressionSpecification {
  if (lens === "water") {
    return [
      "match",
      ["get", "watershedStress"],
      "low",
      palette.stress.low,
      "low_medium",
      palette.stress.low_medium,
      "medium_high",
      palette.stress.medium_high,
      "high",
      palette.stress.high,
      "extremely_high",
      palette.stress.extremely_high,
      "#9e917d",
    ];
  }
  if (lens === "grid") {
    return [
      "match",
      ["get", "interconnectionStatus"],
      "energized",
      palette.grid.energized,
      "phased_energization",
      palette.grid.phased_energization,
      "interconnection_queue",
      palette.grid.interconnection_queue,
      "transmission_upgrade_pending",
      palette.grid.transmission_upgrade_pending,
      "ferc_or_puc_contested",
      palette.grid.ferc_or_puc_contested,
      "#9e917d",
    ];
  }
  if (lens === "activity") {
    return [
      "case",
      ["==", ["get", "recentActivityFlag"], 1],
      [
        "match",
        ["get", "lifecycleStatus"],
        "moratorium",
        palette.lifecycle.moratorium,
        "contested",
        palette.lifecycle.contested,
        "proposed",
        palette.tier.provisional,
        palette.activityGlow,
      ],
      "#9e917d",
    ];
  }
  return [
    "case",
    ["==", ["get", "hasKnownMw"], 0],
    palette.tier.registry,
    [
      "match",
      ["get", "lifecycleStatus"],
      "operational",
      palette.lifecycle.operational,
      "expanding",
      palette.lifecycle.expanding,
      "under_construction",
      palette.lifecycle.under_construction,
      "permitted",
      palette.lifecycle.permitted,
      "proposed",
      palette.lifecycle.proposed,
      "contested",
      palette.lifecycle.contested,
      "moratorium",
      palette.lifecycle.moratorium,
      "#9e917d",
    ],
  ];
}

function buildClusterOuterColorExpression(
  lens: AnalyticalLens,
  palette: MapColorPalette,
): maplibregl.ExpressionSpecification {
  if (lens === "water") {
    return [
      "match",
      ["get", "maxWatershedStress"],
      "low",
      palette.stress.low,
      "low_medium",
      palette.stress.low_medium,
      "medium_high",
      palette.stress.medium_high,
      "high",
      palette.stress.high,
      "extremely_high",
      palette.stress.extremely_high,
      "#9e917d",
    ];
  }
  if (lens === "grid") {
    return [
      "match",
      ["get", "dominantGridStatus"],
      "energized",
      palette.grid.energized,
      "phased_energization",
      palette.grid.phased_energization,
      "interconnection_queue",
      palette.grid.interconnection_queue,
      "transmission_upgrade_pending",
      palette.grid.transmission_upgrade_pending,
      "ferc_or_puc_contested",
      palette.grid.ferc_or_puc_contested,
      "#9e917d",
    ];
  }
  if (lens === "activity") {
    return [
      "case",
      [">", ["get", "recentActivityCount"], 0],
      palette.activityGlow,
      "#9e917d",
    ];
  }
  return [
    "case",
    [">", ["get", "contestedCount"], 0],
    palette.warnRing,
    palette.accent,
  ];
}

function buildClusterStrokeColorExpression(
  lens: AnalyticalLens,
  palette: MapColorPalette,
): maplibregl.ExpressionSpecification {
  if (lens === "water") {
    return [
      "case",
      [">", ["get", "undisclosedWaterCount"], 0],
      palette.undisclosedRing,
      buildClusterOuterColorExpression("water", palette),
    ];
  }
  return buildClusterOuterColorExpression(lens, palette);
}

function buildClusterInnerColorExpression(
  lens: AnalyticalLens,
  palette: MapColorPalette,
): maplibregl.DataDrivenPropertyValueSpecification<string> {
  if (lens === "capacity") {
    return palette.lifecycle.operational;
  }
  return buildClusterOuterColorExpression(lens, palette);
}

function buildActivityOpacityExpression(
  lens: AnalyticalLens,
  activeOpacity: number,
  baselineDimmedOpacity = 0.16,
): maplibregl.ExpressionSpecification | number {
  if (lens !== "activity") return activeOpacity;
  return [
    "case",
    ["==", ["get", "recentActivityFlag"], 1],
    activeOpacity,
    baselineDimmedOpacity,
  ];
}

export function MapCanvas({
  facilities,
  footprints,
  isoRegions,
  stations,
  gridFeed,
  selectedFacility,
  selectedFacilityId,
  basemap,
  previousBasemap,
  onBasemapChange,
  onRestoreBasemap,
  resolvedTheme,
  lens,
  onLensChange,
  radarWindow,
  onRadarWindowChange,
  initialView,
  fitUsOnLoad,
  flyRequest,
  railOpen,
  drawerOpen,
  mobileDetent,
  hasCompareDock = false,
  onNeedFootprints,
  onSelectFacility,
  onViewChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const clusterMarkersRef = useRef<maplibregl.Marker[]>([]);
  const pointReticleMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hoveredIsoIdRef = useRef<string | null>(null);
  const pointerOverMapRef = useRef<boolean>(false);
  const didInitialUsFitRef = useRef<boolean>(false);
  const clustersRef = useRef<MarketClusterSummary[]>([]);
  const renderClusterMarkersRef = useRef<() => void>(() => {});
  const onNeedFootprintsRef = useRef(onNeedFootprints);
  onNeedFootprintsRef.current = onNeedFootprints;

  const [zoom, setZoom] = useState<number>(initialView.zoom);
  const [cursorCoord, setCursorCoord] = useState<[number, number]>([
    initialView.lng,
    initialView.lat,
  ]);
  const [hoveredFacility, setHoveredFacility] =
    useState<HoveredFacilityState | null>(null);
  const [hoveredFootprint, setHoveredFootprint] =
    useState<HoveredFootprintState | null>(null);
  const [hoveredCluster, setHoveredCluster] =
    useState<HoveredClusterState | null>(null);
  const [hoveredIso, setHoveredIso] = useState<HoveredIsoState | null>(null);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);

  const facilitiesByIdRef = useRef<Map<string, FacilityIndexItem>>(new Map());
  const clustersByNameRef = useRef<Map<string, MarketClusterSummary>>(new Map());
  const isoStatsRef = useRef<Map<IsoRegion, { count: number; mw: number }>>(
    new Map(),
  );
  const gridFeedRef = useRef<LiveGridFeed | null>(gridFeed);
  gridFeedRef.current = gridFeed;

  const onSelectRef = useRef(onSelectFacility);
  const onViewChangeRef = useRef(onViewChange);
  const lensRef = useRef(lens);
  const railOpenRef = useRef(railOpen);
  const drawerOpenRef = useRef(drawerOpen);
  const mobileDetentRef = useRef(mobileDetent);

  onSelectRef.current = onSelectFacility;
  onViewChangeRef.current = onViewChange;
  lensRef.current = lens;
  railOpenRef.current = railOpen;
  drawerOpenRef.current = drawerOpen;
  mobileDetentRef.current = mobileDetent;

  const palette = useMemo(
    () => getMapPalette(basemap, resolvedTheme),
    [basemap, resolvedTheme],
  );

  const enrichedIsoRegions = useMemo(() => {
    return {
      ...isoRegions,
      features: isoRegions.features.map((feat) => {
        const id = feat.properties.id;
        const snap = gridFeed?.regions?.[id] ?? null;
        const liveStress = deriveLiveIsoStress(feat.properties.gridStressLevel, snap);
        return {
          ...feat,
          properties: {
            ...feat.properties,
            liveStress,
          },
        };
      }),
    };
  }, [isoRegions, gridFeed]);

  const clusters = useMemo(
    () => buildMarketClusters(facilities, radarWindow),
    [facilities, radarWindow],
  );
  clustersRef.current = clusters;

  useEffect(() => {
    const map = new Map<string, MarketClusterSummary>();
    for (const c of clusters) map.set(c.clusterName, c);
    clustersByNameRef.current = map;
  }, [clusters]);

  const clustersGeoJson = useMemo(
    () => buildMarketClustersGeoJson(clusters),
    [clusters],
  );
  const facilitiesGeoJson = useMemo(
    () => buildFacilitiesGeoJson(facilities, radarWindow),
    [facilities, radarWindow],
  );

  const visibleFootprintsGeoJson = useMemo(() => {
    const activeIds = new Set(facilities.map((f) => f.id));
    return {
      ...footprints,
      features: footprints.features.filter((ft) =>
        activeIds.has(ft.properties.facilityId),
      ),
    };
  }, [facilities, footprints]);

  useEffect(() => {
    const map = new Map<string, FacilityIndexItem>();
    const isoAgg = new Map<IsoRegion, { count: number; mw: number }>();
    for (const f of facilities) {
      map.set(f.id, f);
      const prev = isoAgg.get(f.isoRegion) ?? { count: 0, mw: 0 };
      prev.count += 1;
      prev.mw += f.totalPlannedMw ?? f.operationalMw ?? 0;
      isoAgg.set(f.isoRegion, prev);
    }
    facilitiesByIdRef.current = map;
    isoStatsRef.current = isoAgg;
  }, [facilities]);

  const clearHoverStates = () => {
    setHoveredFacility(null);
    setHoveredFootprint(null);
    setHoveredCluster(null);
    setHoveredIso(null);
    const map = mapRef.current;
    if (map && hoveredIsoIdRef.current && map.getSource("iso-regions")) {
      try {
        map.setFeatureState(
          { source: "iso-regions", id: hoveredIsoIdRef.current },
          { hover: false },
        );
      } catch {
        // ignore if source/style swapped
      }
      hoveredIsoIdRef.current = null;
    }
  };

  useEffect(() => {
    clearHoverStates();
  }, [facilities, flyRequest, selectedFacilityId, drawerOpen, lens, basemap]);

  const dataRef = useRef({
    isoRegions: enrichedIsoRegions,
    clustersGeoJson,
    facilitiesGeoJson,
    visibleFootprintsGeoJson,
    lens,
    selectedFacilityId,
    basemap,
    resolvedTheme,
    palette,
  });
  dataRef.current = {
    isoRegions: enrichedIsoRegions,
    clustersGeoJson,
    facilitiesGeoJson,
    visibleFootprintsGeoJson,
    lens,
    selectedFacilityId,
    basemap,
    resolvedTheme,
    palette,
  };

  const styleKey =
    basemap === "vector" ? `vector-${resolvedTheme}` : basemap;
  const currentStyleKeyRef = useRef(styleKey);

  function syncLayersAndSources(map: maplibregl.Map) {
    ensureProceduralIcons(map);
    const snap = dataRef.current;
    const pal = snap.palette;
    const isLightVector = snap.basemap === "vector" && snap.resolvedTheme === "light";
    const borderColor = pal.border;
    const isoLineColor = isLightVector
      ? "rgba(20, 16, 24, 0.32)"
      : snap.basemap === "vector"
        ? "rgba(255, 145, 0, 0.34)"
        : "rgba(255, 180, 70, 0.45)";

    if (snap.basemap === "vector") {
      softenVectorBasemapLabels(map);
    }

    // 1. ISO Regions Source & Layers
    if (!map.getSource("iso-regions")) {
      map.addSource("iso-regions", {
        type: "geojson",
        data: snap.isoRegions,
        promoteId: "id",
      });
    } else {
      (map.getSource("iso-regions") as maplibregl.GeoJSONSource).setData(
        snap.isoRegions,
      );
    }

    if (!map.getLayer("iso-regions-fill")) {
      map.addLayer({
        id: "iso-regions-fill",
        type: "fill",
        source: "iso-regions",
        maxzoom: 7.4,
        layout: {
          visibility: snap.lens === "grid" ? "visible" : "none",
        },
        paint: {
          "fill-color": [
            "match",
            ["get", "liveStress"],
            "severe",
            pal.lifecycle.moratorium,
            "high",
            pal.lifecycle.contested,
            "elevated",
            pal.lifecycle.expanding,
            pal.lifecycle.operational,
          ],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.24,
              0.1,
            ],
            5.8,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.14,
              0.04,
            ],
            7.4,
            0,
          ],
        },
      });
    }

    if (!map.getLayer("iso-regions-line")) {
      map.addLayer({
        id: "iso-regions-line",
        type: "line",
        source: "iso-regions",
        maxzoom: 7.8,
        paint: {
          "line-color": isoLineColor,
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            2.0,
            0.9,
          ],
          "line-dasharray": [4, 3],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            0.68,
            6.2,
            0.3,
            7.8,
            0,
          ],
        },
      });
    }

    // 2. Parcel Footprints Source & Layers (Tier 3: z >= 11.4, real polygons only)
    if (!map.getSource("footprints")) {
      map.addSource("footprints", {
        type: "geojson",
        data: snap.visibleFootprintsGeoJson,
      });
    } else {
      (map.getSource("footprints") as maplibregl.GeoJSONSource).setData(
        snap.visibleFootprintsGeoJson,
      );
    }

    if (!map.getLayer("footprints-campus-fill")) {
      map.addLayer({
        id: "footprints-campus-fill",
        type: "fill",
        source: "footprints",
        minzoom: 11.4,
        filter: ["in", ["get", "zoneKind"], ["literal", ["campus_boundary", "campus"]]],
        paint: {
          "fill-color": pal.zones.boundary,
          "fill-opacity": 0.1,
        },
      });
    }

    if (!map.getLayer("footprints-campus-line")) {
      map.addLayer({
        id: "footprints-campus-line",
        type: "line",
        source: "footprints",
        minzoom: 11.4,
        filter: ["in", ["get", "zoneKind"], ["literal", ["campus_boundary", "campus"]]],
        paint: {
          "line-color": pal.zones.boundary,
          "line-width": 2.2,
          "line-dasharray": [5, 3],
          "line-opacity": 0.94,
        },
      });
    }

    if (!map.getLayer("footprints-expansion-fill")) {
      map.addLayer({
        id: "footprints-expansion-fill",
        type: "fill",
        source: "footprints",
        minzoom: 11.6,
        filter: ["==", ["get", "zoneKind"], "planned_expansion"],
        paint: {
          "fill-color": pal.zones.expansion,
          "fill-opacity": 0.22,
        },
      });
    }

    if (!map.getLayer("footprints-expansion-line")) {
      map.addLayer({
        id: "footprints-expansion-line",
        type: "line",
        source: "footprints",
        minzoom: 11.6,
        filter: ["==", ["get", "zoneKind"], "planned_expansion"],
        paint: {
          "line-color": pal.zones.expansion,
          "line-width": 1.8,
          "line-dasharray": [3, 2],
        },
      });
    }

    if (!map.getLayer("footprints-substation")) {
      map.addLayer({
        id: "footprints-substation",
        type: "fill",
        source: "footprints",
        minzoom: 11.8,
        filter: ["==", ["get", "zoneKind"], "substation_yard"],
        paint: {
          "fill-color": pal.zones.substation,
          "fill-opacity": 0.36,
          "fill-outline-color": pal.zones.substation,
        },
      });
    }

    if (!map.getLayer("footprints-cooling")) {
      map.addLayer({
        id: "footprints-cooling",
        type: "fill",
        source: "footprints",
        minzoom: 11.8,
        filter: ["==", ["get", "zoneKind"], "cooling_yard"],
        paint: {
          "fill-color": pal.zones.cooling,
          "fill-opacity": 0.4,
          "fill-outline-color": pal.zones.cooling,
        },
      });
    }

    if (!map.getLayer("footprints-halls-extrusion")) {
      map.addLayer({
        id: "footprints-halls-extrusion",
        type: "fill-extrusion",
        source: "footprints",
        minzoom: 11.8,
        filter: ["in", ["get", "zoneKind"], ["literal", ["operational_hall", "building"]]],
        paint: {
          "fill-extrusion-color": pal.zones.operational,
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11.8,
            0,
            13.2,
            ["case", ["==", ["get", "zoneKind"], "operational_hall"], 15, 11],
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.84,
        },
      });
    }

    // 3. Facilities Source (Powers BOTH Macro 50-State Constellation AND Regional Glyphs)
    if (!map.getSource("facilities")) {
      map.addSource("facilities", {
        type: "geojson",
        data: snap.facilitiesGeoJson,
      });
    } else {
      (map.getSource("facilities") as maplibregl.GeoJSONSource).setData(
        snap.facilitiesGeoJson,
      );
    }

    const lensColorExpr = buildFacilityColorExpression(snap.lens, pal);

    // 3a. Macro 50-state luminous WebGL constellation (renders UNDER cluster rings & pills)
    if (!map.getLayer("facilities-constellation")) {
      map.addLayer({
        id: "facilities-constellation",
        type: "circle",
        source: "facilities",
        minzoom: 2.5,
        maxzoom: 6.2,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            [
              "case",
              ["==", ["get", "catalogTier"], "flagship"],
              3.4,
              ["==", ["get", "hasKnownMw"], 1],
              2.8,
              2.0,
            ],
            5.6,
            [
              "case",
              ["==", ["get", "catalogTier"], "flagship"],
              4.8,
              ["==", ["get", "hasKnownMw"], 1],
              3.8,
              2.8,
            ],
          ],
          "circle-color": lensColorExpr,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.95, 0.16]
              : 0.78,
            5.4,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.92, 0.16]
              : 0.72,
            6.1,
            0,
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "catalogTier"], "flagship"],
            0.9,
            0,
          ],
          "circle-stroke-color": borderColor,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.7, 0]
              : 0.5,
            6.1,
            0,
          ],
        },
      });
    }

    // 4. Macro Market Cluster Proportional Rings (Tier 1: z < 6.2, OVER constellation)
    if (!map.getSource("market-clusters")) {
      map.addSource("market-clusters", {
        type: "geojson",
        data: snap.clustersGeoJson,
      });
    } else {
      (map.getSource("market-clusters") as maplibregl.GeoJSONSource).setData(
        snap.clustersGeoJson,
      );
    }

    const clusterOuterColor = buildClusterOuterColorExpression(snap.lens, pal);
    const clusterStrokeColor = buildClusterStrokeColorExpression(snap.lens, pal);
    const clusterInnerColor = buildClusterInnerColorExpression(snap.lens, pal);

    if (!map.getLayer("clusters-outer")) {
      map.addLayer({
        id: "clusters-outer",
        type: "circle",
        source: "market-clusters",
        maxzoom: 6.2,
        paint: {
          "circle-radius": ["get", "radiusOuter"],
          "circle-color": clusterOuterColor,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.2,
            0.22,
            6.0,
            0,
          ],
          "circle-stroke-width":
            snap.lens === "water"
              ? ["case", [">", ["get", "undisclosedWaterCount"], 0], 2.2, 1.6]
              : 1.8,
          "circle-stroke-color": clusterStrokeColor,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.2,
            0.92,
            6.0,
            0,
          ],
        },
      });
    }

    if (!map.getLayer("clusters-inner")) {
      map.addLayer({
        id: "clusters-inner",
        type: "circle",
        source: "market-clusters",
        maxzoom: 6.2,
        paint: {
          "circle-radius": ["get", "radiusInner"],
          "circle-color": clusterInnerColor,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.2,
            0.88,
            6.0,
            0,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": borderColor,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.2,
            0.75,
            6.0,
            0,
          ],
        },
      });
    }

    // 5. Regional Corridor Glyphs (Tier 2: z 5.4 - 14.3)
    // 5a. Proportional MW outer rings (known-MW campuses)
    if (!map.getLayer("facilities-planned-ring")) {
      map.addLayer({
        id: "facilities-planned-ring",
        type: "circle",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: ["==", ["get", "hasKnownMw"], 1],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.6,
            ["get", "radiusOuter"],
            13.2,
            ["get", "radiusOuter"],
            14.2,
            6,
          ],
          "circle-color": lensColorExpr,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            snap.lens === "activity"
              ? [
                  "case",
                  ["==", ["get", "recentActivityFlag"], 1],
                  ["case", ["==", ["get", "isProvisionalOrProposed"], 1], 0.14, 0.3],
                  0.06,
                ]
              : ["case", ["==", ["get", "isProvisionalOrProposed"], 1], 0.08, 0.26],
            12.8,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.28, 0.06]
              : ["case", ["==", ["get", "isProvisionalOrProposed"], 1], 0.08, 0.24],
            14.2,
            0,
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "isProvisionalOrProposed"], 1],
            1.2,
            1.7,
          ],
          "circle-stroke-color": lensColorExpr,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.94, 0.16]
              : ["case", ["==", ["get", "isProvisionalOrProposed"], 1], 0.45, 0.92],
            13.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.9, 0.16]
              : ["case", ["==", ["get", "isProvisionalOrProposed"], 1], 0.45, 0.88],
            14.2,
            0,
          ],
        },
      });
    }

    // 5b. Crisp 4px luminous dots for undisclosed-MW registry colocation facilities
    if (!map.getLayer("facilities-registry-dot")) {
      map.addLayer({
        id: "facilities-registry-dot",
        type: "circle",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: ["==", ["get", "hasKnownMw"], 0],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.6,
            3.5,
            9.0,
            4.2,
            13.2,
            4.5,
            14.2,
            3,
          ],
          "circle-color": lensColorExpr,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.92, 0.16]
              : 0.9,
            13.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.88, 0.16]
              : 0.85,
            14.2,
            0,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": borderColor,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.72, 0.12]
              : 0.68,
            14.2,
            0,
          ],
        },
      });
    }

    // 5c. Inner operational core for known-MW facilities
    if (!map.getLayer("facilities-operational-core")) {
      map.addLayer({
        id: "facilities-operational-core",
        type: "circle",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: [
          "all",
          ["==", ["get", "hasKnownMw"], 1],
          [">", ["get", "operationalMw"], 0],
        ],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.6,
            ["get", "radiusInner"],
            13.2,
            ["get", "radiusInner"],
            14.2,
            4,
          ],
          "circle-color": lensColorExpr,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.94, 0.16]
              : 0.94,
            13.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.88, 0.16]
              : 0.88,
            14.2,
            0,
          ],
          "circle-stroke-width": 1.2,
          "circle-stroke-color": borderColor,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.82, 0.16]
              : 0.82,
            13.0,
            snap.lens === "activity"
              ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.75, 0.16]
              : 0.75,
            14.2,
            0,
          ],
        },
      });
    }

    // 5d. Dashed EVA Violet perimeter halo for provisional / proposed campuses
    if (!map.getLayer("facilities-provisional-halo")) {
      map.addLayer({
        id: "facilities-provisional-halo",
        type: "symbol",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: ["==", ["get", "isProvisionalOrProposed"], 1],
        layout: {
          "icon-image": "halo-provisional",
          "icon-size": ["/", ["+", ["get", "radiusOuter"], 2], 12],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          visibility:
            snap.lens === "capacity" || snap.lens === "activity" ? "visible" : "none",
        },
        paint: {
          "icon-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            0.94,
            13.0,
            0.88,
            14.2,
            0,
          ],
        },
      });
    }

    // 5e. Activity radar target ring
    if (!map.getLayer("facilities-activity-halo")) {
      map.addLayer({
        id: "facilities-activity-halo",
        type: "symbol",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: ["==", ["get", "recentActivityFlag"], 1],
        layout: {
          "icon-image": "halo-activity-target",
          "icon-size": ["/", ["+", ["get", "radiusOuter"], 4.5], 12],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          visibility: snap.lens === "activity" ? "visible" : "none",
        },
        paint: {
          "icon-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            0.92,
            13.0,
            0.84,
            14.2,
            0,
          ],
        },
      });
    }

    // 5f. Contested / Moratorium halos strictly outside cores
    if (!map.getLayer("facilities-contested-halo")) {
      map.addLayer({
        id: "facilities-contested-halo",
        type: "symbol",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: ["==", ["get", "contestedFlag"], 1],
        layout: {
          "icon-image": [
            "match",
            ["get", "lifecycleStatus"],
            "moratorium",
            "halo-moratorium",
            "halo-contested",
          ],
          "icon-size": ["/", ["+", ["get", "radiusOuter"], 3.5], 12],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            0.95,
            13.0,
            0.88,
            14.2,
            0,
          ],
        },
      });
    }

    // 5g. Undisclosed Water Alert Ring (flagships / proposals / >= 20 MW) strictly above core fills
    if (!map.getLayer("facilities-water-undisclosed-ring")) {
      map.addLayer({
        id: "facilities-water-undisclosed-ring",
        type: "symbol",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: ["==", ["get", "undisclosedWaterAlertFlag"], 1],
        layout: {
          "icon-image": "ring-undisclosed-water",
          "icon-size": ["/", ["+", ["get", "radiusOuter"], 5.5], 12],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          visibility: snap.lens === "water" ? "visible" : "none",
        },
        paint: {
          "icon-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            0.96,
            13.0,
            0.88,
            14.2,
            0,
          ],
        },
      });
    }

    // 5h. Selected facility highlight ring
    if (!map.getLayer("facilities-selected-ring")) {
      map.addLayer({
        id: "facilities-selected-ring",
        type: "circle",
        source: "facilities",
        minzoom: 2.5,
        maxzoom: 14.3,
        filter: ["==", ["get", "id"], snap.selectedFacilityId ?? ""],
        paint: {
          "circle-radius": ["+", ["get", "radiusOuter"], 7],
          "circle-color": "transparent",
          "circle-stroke-width": 2.4,
          "circle-stroke-color": pal.accent,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            0.95,
            13.0,
            0.92,
            14.2,
            0,
          ],
        },
      });
    }
  }

  // Initialize MapLibre once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: getMapStyleSpec(basemap, resolvedTheme),
      center: [initialView.lng, initialView.lat],
      zoom: initialView.zoom,
      pitch: initialView.pitch,
      bearing: initialView.bearing,
      minZoom: 2.6,
      maxZoom: 18.5,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: "imperial" }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    const emitBounds = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      const z = map.getZoom();
      setZoom(z);
      if (z >= LAZY_FOOTPRINTS_ZOOM) {
        onNeedFootprintsRef.current();
      }
      if (!pointerOverMapRef.current) {
        setCursorCoord([c.lng, c.lat]);
      }
      renderClusterMarkersRef.current();
      onViewChangeRef.current(
        {
          lng: c.lng,
          lat: c.lat,
          zoom: z,
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        },
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      );
    };

    map.on("style.load", () => {
      syncLayersAndSources(map);
      setStyleVersion((v) => v + 1);
    });

    map.on("load", () => {
      if (fitUsOnLoad && !didInitialUsFitRef.current) {
        didInitialUsFitRef.current = true;
        const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
        map.fitBounds(
          [
            [US_CONTIGUOUS_BOUNDS[0], US_CONTIGUOUS_BOUNDS[1]],
            [US_CONTIGUOUS_BOUNDS[2], US_CONTIGUOUS_BOUNDS[3]],
          ],
          {
            padding: isMobile
              ? { top: 68, bottom: 72, left: 20, right: 20 }
              : { top: 56, bottom: 52, left: 32, right: 32 },
            maxZoom: 4.9,
            duration: 0,
          },
        );
      }
      emitBounds();
    });

    map.on("movestart", () => {
      clearHoverStates();
    });

    map.on("zoomstart", () => {
      clearHoverStates();
    });

    map.on("move", () => {
      const z = map.getZoom();
      setZoom(z);
      if (z >= LAZY_FOOTPRINTS_ZOOM) {
        onNeedFootprintsRef.current();
      }
      if (!pointerOverMapRef.current) {
        const c = map.getCenter();
        setCursorCoord([c.lng, c.lat]);
      }
    });

    map.on("moveend", emitBounds);
    map.on("resize", () => {
      renderClusterMarkersRef.current();
    });

    map.on("mousemove", (e) => {
      if (!canPointerHover()) return;
      pointerOverMapRef.current = true;
      setCursorCoord([e.lngLat.lng, e.lngLat.lat]);

      const queryLayers = [
        "facilities-planned-ring",
        "facilities-operational-core",
        "facilities-registry-dot",
        "facilities-constellation",
        "footprints-halls-extrusion",
        "footprints-expansion-fill",
        "footprints-substation",
        "footprints-cooling",
        "footprints-campus-fill",
        "clusters-outer",
        "iso-regions-fill",
      ].filter((id) => Boolean(map.getLayer(id)));

      if (queryLayers.length === 0) return;

      const hits = map.queryRenderedFeatures(e.point, { layers: queryLayers });

      const facilityHit = hits.find(
        (h) =>
          h.layer.id === "facilities-planned-ring" ||
          h.layer.id === "facilities-operational-core" ||
          h.layer.id === "facilities-registry-dot" ||
          h.layer.id === "facilities-constellation",
      );

      if (facilityHit && facilityHit.properties?.id) {
        const rec = facilitiesByIdRef.current.get(String(facilityHit.properties.id));
        if (rec) {
          map.getCanvas().style.cursor = "pointer";
          setHoveredFacility({ facility: rec, point: e.point });
          setHoveredFootprint(null);
          setHoveredCluster(null);
          setHoveredIso(null);
          return;
        }
      }

      const footprintHit = hits.find((h) => h.layer.id.startsWith("footprints-"));
      if (footprintHit && footprintHit.properties) {
        map.getCanvas().style.cursor = "pointer";
        setHoveredFacility(null);
        setHoveredCluster(null);
        setHoveredIso(null);
        const rawSqft = Number(footprintHit.properties.sqft);
        setHoveredFootprint({
          facilityId: String(footprintHit.properties.facilityId ?? ""),
          label: String(footprintHit.properties.label ?? "Zone"),
          zoneKind: String(footprintHit.properties.zoneKind ?? ""),
          mwLabel: footprintHit.properties.mwLabel
            ? String(footprintHit.properties.mwLabel)
            : undefined,
          sqft: Number.isFinite(rawSqft) && rawSqft > 0 ? rawSqft : null,
          status: footprintHit.properties.status,
          point: e.point,
        });
        return;
      }

      const clusterHit = hits.find((h) => h.layer.id === "clusters-outer");
      if (clusterHit && clusterHit.properties?.clusterName) {
        const summary = clustersByNameRef.current.get(
          String(clusterHit.properties.clusterName),
        );
        if (summary) {
          map.getCanvas().style.cursor = "pointer";
          setHoveredFacility(null);
          setHoveredFootprint(null);
          setHoveredIso(null);
          setHoveredCluster({ cluster: summary, point: e.point });
          return;
        }
      }

      const isoHit = hits.find((h) => h.layer.id === "iso-regions-fill");
      if (isoHit && isoHit.properties?.id && lensRef.current === "grid") {
        const isoId = String(isoHit.properties.id) as IsoRegion;
        if (hoveredIsoIdRef.current && hoveredIsoIdRef.current !== isoId) {
          map.setFeatureState(
            { source: "iso-regions", id: hoveredIsoIdRef.current },
            { hover: false },
          );
        }
        hoveredIsoIdRef.current = isoId;
        map.setFeatureState({ source: "iso-regions", id: isoId }, { hover: true });
        map.getCanvas().style.cursor = "default";
        const stats = isoStatsRef.current.get(isoId) ?? { count: 0, mw: 0 };
        const gridSnap = gridFeedRef.current?.regions?.[isoId] ?? null;
        setHoveredFacility(null);
        setHoveredFootprint(null);
        setHoveredCluster(null);
        setHoveredIso({
          id: isoId,
          fullName: String(isoHit.properties.fullName ?? isoId),
          queueNote: String(isoHit.properties.queueNote ?? ""),
          gridStressLevel: String(
            isoHit.properties.liveStress ??
              isoHit.properties.gridStressLevel ??
              "elevated",
          ),
          facilityCount: stats.count,
          plannedMw: stats.mw,
          gridSnapshot: gridSnap,
          point: e.point,
        });
        return;
      }

      map.getCanvas().style.cursor = "";
      clearHoverStates();
    });

    const handleLeave = () => {
      pointerOverMapRef.current = false;
      const c = map.getCenter();
      setCursorCoord([c.lng, c.lat]);
      map.getCanvas().style.cursor = "";
      clearHoverStates();
    };

    map.on("mouseleave", handleLeave);
    container.addEventListener("pointerleave", handleLeave);

    map.on("click", (e) => {
      const clickLayers = [
        "facilities-planned-ring",
        "facilities-operational-core",
        "facilities-registry-dot",
        "facilities-constellation",
        "footprints-halls-extrusion",
        "footprints-expansion-fill",
        "footprints-substation",
        "footprints-cooling",
        "footprints-campus-fill",
        "clusters-outer",
      ].filter((id) => Boolean(map.getLayer(id)));

      if (clickLayers.length === 0) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: clickLayers });
      if (hits.length === 0) return;

      const facilityHit = hits.find(
        (h) =>
          h.layer.id === "facilities-planned-ring" ||
          h.layer.id === "facilities-operational-core" ||
          h.layer.id === "facilities-registry-dot" ||
          h.layer.id === "facilities-constellation",
      );
      if (facilityHit && facilityHit.properties?.id) {
        const rec = facilitiesByIdRef.current.get(String(facilityHit.properties.id));
        if (rec) {
          onSelectRef.current(rec);
          return;
        }
      }

      const footprintHit = hits.find((h) => h.layer.id.startsWith("footprints-"));
      if (footprintHit && footprintHit.properties?.facilityId) {
        const rec = facilitiesByIdRef.current.get(
          String(footprintHit.properties.facilityId),
        );
        if (rec) {
          onSelectRef.current(rec);
          return;
        }
      }

      const clusterHit = hits.find((h) => h.layer.id === "clusters-outer");
      if (clusterHit && clusterHit.geometry.type === "Point") {
        const coords = clusterHit.geometry.coordinates as [number, number];
        map.flyTo({
          center: coords,
          zoom: 8.8,
          pitch: 0,
          duration: prefersReducedMotion() ? 0 : 850,
          essential: true,
        });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      renderClusterMarkersRef.current();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("pointerleave", handleLeave);
      clusterMarkersRef.current.forEach((m) => m.remove());
      clusterMarkersRef.current = [];
      pointReticleMarkerRef.current?.remove();
      pointReticleMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch basemap or theme style when styleKey changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (currentStyleKeyRef.current === styleKey) return;
    currentStyleKeyRef.current = styleKey;
    map.setStyle(getMapStyleSpec(basemap, resolvedTheme), { diff: false });
  }, [basemap, resolvedTheme, styleKey]);

  // Update GeoJSON data & lens-driven paint expressions whenever data/lens/selection/theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("facilities")) return;

    const isoSrc = map.getSource("iso-regions") as maplibregl.GeoJSONSource | undefined;
    if (isoSrc) isoSrc.setData(enrichedIsoRegions);

    const clusterSrc = map.getSource("market-clusters") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (clusterSrc) clusterSrc.setData(clustersGeoJson);

    const facSrc = map.getSource("facilities") as maplibregl.GeoJSONSource | undefined;
    if (facSrc) facSrc.setData(facilitiesGeoJson);

    const footSrc = map.getSource("footprints") as maplibregl.GeoJSONSource | undefined;
    if (footSrc) footSrc.setData(visibleFootprintsGeoJson);

    if (map.getLayer("iso-regions-fill")) {
      map.setLayoutProperty(
        "iso-regions-fill",
        "visibility",
        lens === "grid" ? "visible" : "none",
      );
      map.setPaintProperty("iso-regions-fill", "fill-color", [
        "match",
        ["get", "liveStress"],
        "severe",
        palette.lifecycle.moratorium,
        "high",
        palette.lifecycle.contested,
        "elevated",
        palette.lifecycle.expanding,
        palette.lifecycle.operational,
      ]);
    }

    if (map.getLayer("clusters-outer")) {
      map.setPaintProperty(
        "clusters-outer",
        "circle-color",
        buildClusterOuterColorExpression(lens, palette),
      );
      map.setPaintProperty(
        "clusters-outer",
        "circle-stroke-color",
        buildClusterStrokeColorExpression(lens, palette),
      );
      map.setPaintProperty(
        "clusters-outer",
        "circle-stroke-width",
        lens === "water"
          ? ["case", [">", ["get", "undisclosedWaterCount"], 0], 2.2, 1.6]
          : 1.8,
      );
    }
    if (map.getLayer("clusters-inner")) {
      map.setPaintProperty(
        "clusters-inner",
        "circle-color",
        buildClusterInnerColorExpression(lens, palette),
      );
    }

    const lensColor = buildFacilityColorExpression(lens, palette);

    if (map.getLayer("facilities-constellation")) {
      map.setPaintProperty("facilities-constellation", "circle-color", lensColor);
      map.setPaintProperty("facilities-constellation", "circle-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        3.0,
        lens === "activity"
          ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.95, 0.16]
          : 0.78,
        5.4,
        lens === "activity"
          ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.92, 0.16]
          : 0.72,
        6.1,
        0,
      ]);
      map.setPaintProperty("facilities-constellation", "circle-stroke-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        3.0,
        lens === "activity"
          ? ["case", ["==", ["get", "recentActivityFlag"], 1], 0.7, 0]
          : 0.5,
        6.1,
        0,
      ]);
    }

    if (map.getLayer("facilities-planned-ring")) {
      map.setPaintProperty("facilities-planned-ring", "circle-color", lensColor);
      map.setPaintProperty("facilities-planned-ring", "circle-stroke-color", lensColor);
      map.setPaintProperty("facilities-planned-ring", "circle-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        5.4,
        0,
        6.0,
        buildActivityOpacityExpression(lens, 0.26, 0.06),
        12.8,
        buildActivityOpacityExpression(lens, 0.24, 0.06),
        14.2,
        0,
      ]);
      map.setPaintProperty("facilities-planned-ring", "circle-stroke-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        5.4,
        0,
        6.0,
        buildActivityOpacityExpression(lens, 0.92, 0.16),
        13.0,
        buildActivityOpacityExpression(lens, 0.88, 0.16),
        14.2,
        0,
      ]);
    }

    if (map.getLayer("facilities-registry-dot")) {
      map.setPaintProperty("facilities-registry-dot", "circle-color", lensColor);
      map.setPaintProperty("facilities-registry-dot", "circle-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        5.4,
        0,
        6.0,
        buildActivityOpacityExpression(lens, 0.9, 0.16),
        13.0,
        buildActivityOpacityExpression(lens, 0.85, 0.16),
        14.2,
        0,
      ]);
      map.setPaintProperty("facilities-registry-dot", "circle-stroke-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        5.4,
        0,
        6.0,
        buildActivityOpacityExpression(lens, 0.68, 0.12),
        14.2,
        0,
      ]);
    }

    if (map.getLayer("facilities-operational-core")) {
      map.setPaintProperty("facilities-operational-core", "circle-color", lensColor);
      map.setPaintProperty("facilities-operational-core", "circle-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        5.4,
        0,
        6.0,
        buildActivityOpacityExpression(lens, 0.94, 0.16),
        13.0,
        buildActivityOpacityExpression(lens, 0.88, 0.16),
        14.2,
        0,
      ]);
      map.setPaintProperty("facilities-operational-core", "circle-stroke-opacity", [
        "interpolate",
        ["linear"],
        ["zoom"],
        5.4,
        0,
        6.0,
        buildActivityOpacityExpression(lens, 0.82, 0.16),
        13.0,
        buildActivityOpacityExpression(lens, 0.75, 0.16),
        14.2,
        0,
      ]);
    }

    if (map.getLayer("facilities-provisional-halo")) {
      map.setLayoutProperty(
        "facilities-provisional-halo",
        "visibility",
        lens === "capacity" || lens === "activity" ? "visible" : "none",
      );
    }

    if (map.getLayer("facilities-activity-halo")) {
      map.setLayoutProperty(
        "facilities-activity-halo",
        "visibility",
        lens === "activity" ? "visible" : "none",
      );
    }

    if (map.getLayer("facilities-selected-ring")) {
      map.setFilter("facilities-selected-ring", [
        "==",
        ["get", "id"],
        selectedFacilityId ?? "",
      ]);
    }
    if (map.getLayer("facilities-water-undisclosed-ring")) {
      map.setLayoutProperty(
        "facilities-water-undisclosed-ring",
        "visibility",
        lens === "water" ? "visible" : "none",
      );
    }
  }, [
    enrichedIsoRegions,
    clustersGeoJson,
    facilitiesGeoJson,
    visibleFootprintsGeoJson,
    lens,
    selectedFacilityId,
    palette,
    styleVersion,
  ]);

  const tier = getZoomTier(zoom);

  // Render <= 22 collision-culled chamfered DOM Cluster Callout pills in Macro National Tier (z < 5.8)
  renderClusterMarkersRef.current = () => {
    const map = mapRef.current;
    clusterMarkersRef.current.forEach((m) => m.remove());
    clusterMarkersRef.current = [];
    if (!map || map.getZoom() >= TIER_MACRO_MAX_ZOOM) return;

    const canvasW = containerRef.current?.clientWidth ?? 1100;
    const canvasH = containerRef.current?.clientHeight ?? 800;
    const isNarrow = canvasW < 500;
    const topSafe = isNarrow ? 58 : 54;
    const bottomSafe = canvasH - (isNarrow ? 92 : 58);
    const minX = 10;
    const maxX = canvasW - 10;

    const multiSite = clustersRef.current.filter((c) => c.facilityCount >= 2);
    const candidatePool =
      multiSite.length > 0
        ? multiSite
        : clustersRef.current.length <= 4
          ? clustersRef.current
          : [];

    const sorted = [...candidatePool].sort(
      (a, b) =>
        b.plannedMw + b.reportedOrProposedMw - (a.plannedMw + a.reportedOrProposedMw) ||
        b.facilityCount - a.facilityCount ||
        a.clusterName.localeCompare(b.clusterName),
    );

    const placed: Array<{
      left: number;
      top: number;
      right: number;
      bottom: number;
    }> = [];
    const markers: maplibregl.Marker[] = [];

    for (const c of sorted) {
      if (markers.length >= 22) break;
      const pt = map.project(c.coordinates);
      if (pt.x < -12 || pt.x > canvasW + 12 || pt.y < topSafe || pt.y > bottomSafe) {
        continue;
      }

      const shortName = formatShortClusterName(c.clusterName);
      const activeLens = lensRef.current;
      let metaText = `${formatGwOrMw(c.plannedMw)} · ${c.facilityCount}`;
      if (c.reportedOrProposedMw > 0 && activeLens === "capacity") {
        metaText = `${formatGwOrMw(c.plannedMw)} +${formatGwOrMw(c.reportedOrProposedMw)} · ${c.facilityCount}`;
      } else if (activeLens === "water") {
        metaText =
          c.undisclosedWaterCount === c.facilityCount
            ? `${c.facilityCount}/${c.facilityCount} Undisclosed`
            : c.undisclosedWaterCount > 0
              ? `${formatNumber(c.disclosedWaterMgd, 1)} MGD · ${c.undisclosedWaterCount} NDA`
              : `${formatNumber(c.disclosedWaterMgd, 1)} MGD · ${c.facilityCount}`;
      } else if (activeLens === "grid") {
        metaText = `${c.primaryIso} · ${formatGwOrMw(c.plannedMw + c.reportedOrProposedMw)}`;
      } else if (activeLens === "activity") {
        metaText = `${c.recentActivityCount} active · ${c.facilityCount} total`;
      }

      const estChars = Math.max(shortName.length, metaText.length);
      const boxW = Math.max(118, Math.min(182, estChars * 6.6 + 24));
      const boxH = 38;

      const candidates: Array<{
        anchor: maplibregl.PositionAnchor;
        offset: [number, number];
        box: { left: number; top: number; right: number; bottom: number };
      }> = [
        {
          anchor: "top",
          offset: [0, 12],
          box: {
            left: pt.x - boxW / 2 - 4,
            right: pt.x + boxW / 2 + 4,
            top: pt.y + 10,
            bottom: pt.y + 10 + boxH + 6,
          },
        },
        {
          anchor: "bottom",
          offset: [0, -12],
          box: {
            left: pt.x - boxW / 2 - 4,
            right: pt.x + boxW / 2 + 4,
            top: pt.y - 10 - boxH - 6,
            bottom: pt.y - 10,
          },
        },
        {
          anchor: "left",
          offset: [14, 0],
          box: {
            left: pt.x + 12,
            right: pt.x + 12 + boxW + 6,
            top: pt.y - boxH / 2 - 4,
            bottom: pt.y + boxH / 2 + 4,
          },
        },
        {
          anchor: "right",
          offset: [-14, 0],
          box: {
            left: pt.x - 12 - boxW - 6,
            right: pt.x - 12,
            top: pt.y - boxH / 2 - 4,
            bottom: pt.y + boxH / 2 + 4,
          },
        },
      ];

      const chosen = candidates.find(
        (cand) =>
          cand.box.left >= minX &&
          cand.box.right <= maxX &&
          cand.box.top >= topSafe &&
          cand.box.bottom <= bottomSafe &&
          !placed.some(
            (other) =>
              !(
                cand.box.right < other.left ||
                cand.box.left > other.right ||
                cand.box.bottom < other.top ||
                cand.box.top > other.bottom
              ),
          ),
      );
      if (!chosen) continue;
      placed.push(chosen.box);

      const isAlertCluster =
        (activeLens === "capacity" && c.contestedCount > 0) ||
        (activeLens === "water" && c.undisclosedWaterCount > 0) ||
        (activeLens === "grid" && c.dominantGridStatus === "ferc_or_puc_contested") ||
        (activeLens === "activity" && c.recentActivityCount > 0);

      const el = document.createElement("button");
      el.type = "button";
      el.className = `cluster-pill-marker${
        isAlertCluster ? " cluster-pill-marker--contested" : ""
      }`;
      el.setAttribute(
        "aria-label",
        `${c.clusterName}: ${formatGwOrMw(c.plannedMw)} verified across ${c.facilityCount} sites`,
      );

      const nameSpan = document.createElement("span");
      nameSpan.className = "cluster-pill-name";
      nameSpan.textContent = shortName;

      const metaSpan = document.createElement("span");
      metaSpan.className = "cluster-pill-meta mono";
      metaSpan.textContent = metaText;

      el.appendChild(nameSpan);
      el.appendChild(metaSpan);

      el.addEventListener("mouseenter", () => {
        if (!canPointerHover()) return;
        const p = map.project(c.coordinates);
        setHoveredCluster({ cluster: c, point: { x: p.x, y: p.y } });
      });

      el.addEventListener("mouseleave", () => {
        setHoveredCluster(null);
      });

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setHoveredCluster(null);
        map.flyTo({
          center: c.coordinates,
          zoom: 8.8,
          pitch: 0,
          duration: prefersReducedMotion() ? 0 : 850,
          essential: true,
        });
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: chosen.anchor,
        offset: chosen.offset,
      })
        .setLngLat(c.coordinates)
        .addTo(map);
      markers.push(marker);
    }

    clusterMarkersRef.current = markers;
  };

  useEffect(() => {
    renderClusterMarkersRef.current();
    return () => {
      clusterMarkersRef.current.forEach((m) => m.remove());
      clusterMarkersRef.current = [];
    };
  }, [clusters, tier, lens]);

  // NERV Optical Target Reticle over imagery for point_only campuses at parcel zoom (z >= 11.8)
  const showPointReticle = useMemo(() => {
    if (zoom < LAZY_FOOTPRINTS_ZOOM || !selectedFacility) return false;
    const hasMatchingFootprint = visibleFootprintsGeoJson.features.some(
      (ft) => ft.properties.facilityId === selectedFacility.id,
    );
    return (
      selectedFacility.footprintCoverage === "point_only" || !hasMatchingFootprint
    );
  }, [zoom, selectedFacility, visibleFootprintsGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    pointReticleMarkerRef.current?.remove();
    pointReticleMarkerRef.current = null;

    if (!map || !showPointReticle || !selectedFacility) return;

    const root = document.createElement("div");
    root.className = "nerv-optical-reticle";
    root.setAttribute("aria-hidden", "true");

    root.innerHTML = `
      <svg class="nerv-reticle-svg" width="144" height="144" viewBox="0 0 144 144">
        <circle cx="72" cy="72" r="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.78" />
        <circle cx="72" cy="72" r="34" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.92" />
        <circle cx="72" cy="72" r="6" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M72 4v26M72 114v26M4 72h26M114 72h26" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
        <path d="M22 22h14M22 22v14M122 22h-14M122 22v14M22 122h14M22 122v-14M122 122h-14M122 122v-14" stroke="currentColor" stroke-width="1.8" fill="none" />
        <polygon points="72,56 88,72 72,88 56,72" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.72" />
      </svg>
      <div class="nerv-reticle-badge mono">
        OPEN GIS FOOTPRINT UNMAPPED // COORDINATE VERIFIED
      </div>
    `;

    const marker = new maplibregl.Marker({
      element: root,
      anchor: "center",
    })
      .setLngLat(selectedFacility.coordinates)
      .addTo(map);
    pointReticleMarkerRef.current = marker;

    return () => {
      marker.remove();
      if (pointReticleMarkerRef.current === marker) {
        pointReticleMarkerRef.current = null;
      }
    };
  }, [showPointReticle, selectedFacility]);

  // Declarative fly requests
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyRequest) return;
    pointerOverMapRef.current = false;

    const isMobile =
      typeof window !== "undefined" && window.innerWidth <= 768;
    const bottomSheetPad =
      isMobile && drawerOpenRef.current && mobileDetentRef.current === "peek"
        ? Math.round(window.innerHeight * 0.42)
        : isMobile
          ? 64
          : 44;

    const padding = isMobile
      ? { top: 56, bottom: bottomSheetPad, left: 18, right: 18 }
      : { top: 52, bottom: 48, left: 28, right: 28 };

    const reduced = prefersReducedMotion();

    if (flyRequest.bounds) {
      map.fitBounds(
        [
          [flyRequest.bounds[0], flyRequest.bounds[1]],
          [flyRequest.bounds[2], flyRequest.bounds[3]],
        ],
        {
          padding,
          maxZoom: flyRequest.zoom ?? 10,
          duration: reduced ? 0 : 850,
        },
      );
      return;
    }

    if (flyRequest.center) {
      setCursorCoord(flyRequest.center);
      map.flyTo({
        center: flyRequest.center,
        zoom: flyRequest.zoom ?? map.getZoom(),
        pitch: flyRequest.pitch ?? 0,
        bearing: flyRequest.bearing ?? 0,
        padding,
        duration: reduced ? 0 : 900,
        essential: true,
      });
    }
  }, [flyRequest]);

  const hoveredWeather = hoveredFacility
    ? stations[hoveredFacility.facility.nwsStationId]
    : undefined;

  const containerW = containerRef.current?.clientWidth ?? 900;
  const containerH = containerRef.current?.clientHeight ?? 760;

  const liveGridRegionsSummary = useMemo(() => {
    if (!gridFeed || lens !== "grid") return [];
    return ISO_ORDER.map((iso) => {
      const snap = gridFeed.regions?.[iso];
      if (!snap || snap.demandMw === null) return null;
      return {
        iso,
        demandGw: formatGw(snap.demandMw),
        cleanPct: computeCleanSharePct(snap.fuelMix),
        status: snap.status,
      };
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [gridFeed, lens]);

  return (
    <div
      className={`map-wrapper${
        hasCompareDock ? " map-wrapper--has-compare" : ""
      }`}
    >
      <div
        ref={containerRef}
        className="map-container"
        role="region"
        aria-label="Interactive US Data Center Infrastructure Map"
      />

      {/* NERV CRT 4-corner amber reticle L-brackets + subtle drafting scanline overlay */}
      <div className="map-stage-brackets" aria-hidden="true">
        <span className="map-bracket map-bracket--tl" />
        <span className="map-bracket map-bracket--tr" />
        <span className="map-bracket map-bracket--bl" />
        <span className="map-bracket map-bracket--br" />
      </div>
      <div className="map-scanline-overlay" aria-hidden="true" />

      {/* Mobile-Only Map Floating Lens & Basemap Strip */}
      <div
        className="map-mobile-bar"
        role="region"
        aria-label="Map analytical lens and basemap"
      >
        <div className="map-mobile-group" role="group" aria-label="Analytical Lens">
          {LENS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`map-float-btn${lens === opt.id ? " map-float-btn--active" : ""}`}
              onClick={() => onLensChange(opt.id)}
              aria-pressed={lens === opt.id}
              title={opt.label}
            >
              {opt.mobileLabel}
            </button>
          ))}
        </div>

        <div className="map-mobile-group" role="group" aria-label="Basemap Style">
          {BASEMAP_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`map-float-btn${
                basemap === opt.id ? " map-float-btn--active" : ""
              }`}
              onClick={() => onBasemapChange(opt.id)}
              aria-pressed={basemap === opt.id}
              title={opt.label}
            >
              {opt.mobileLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Lens Floating Time-Window Selector */}
      {lens === "activity" && (
        <div
          className="map-activity-window"
          role="group"
          aria-label="Activity Radar Window"
        >
          <span className="map-activity-tag mono">PULSE DELTA</span>
          {RADAR_WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`map-float-btn mono${
                radarWindow === opt.id ? " map-float-btn--active" : ""
              }`}
              aria-pressed={radarWindow === opt.id}
              onClick={() => onRadarWindowChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Grid Lens Live ISO Telemetry Summary Pills */}
      {lens === "grid" && liveGridRegionsSummary.length > 0 && (
        <div
          className="map-grid-telemetry-bar mono"
          aria-label="Live ISO dispatch summary"
        >
          {liveGridRegionsSummary.map((row) => (
            <span key={row.iso} className="map-grid-iso-chip">
              <strong>{row.iso}</strong> {row.demandGw}
              {row.cleanPct !== null ? ` · ${row.cleanPct}%` : ""}
            </span>
          ))}
        </div>
      )}

      {/* Top-Right Map Layers (Basemap) & Live Coordinate HUD */}
      <div className="map-top-right">
        <div
          className="map-basemap-pill"
          role="group"
          aria-label="Basemap Style"
        >
          <span className="map-basemap-icon" aria-hidden="true">
            <Layers size={12} />
          </span>
          {BASEMAP_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`map-float-btn${
                basemap === opt.id ? " map-float-btn--active" : ""
              }`}
              onClick={() => onBasemapChange(opt.id)}
              aria-pressed={basemap === opt.id}
            >
              {opt.label}
            </button>
          ))}
          {previousBasemap && previousBasemap !== basemap && (
            <button
              type="button"
              className="map-float-btn map-float-btn--restore"
              onClick={onRestoreBasemap}
              title={`Return to ${previousBasemap} basemap`}
            >
              <RotateCcw size={11} aria-hidden="true" />
              <span>{previousBasemap === "vector" ? "Vector" : previousBasemap}</span>
            </button>
          )}
        </div>

        <div className="map-hud-pill" aria-live="polite">
          <span className="hud-tier mono">{getZoomTierLabel(tier)}</span>
          <span className="hud-sep" aria-hidden="true">
            //
          </span>
          <span className="hud-coord mono">
            {formatCoordHud(cursorCoord[0], cursorCoord[1], zoom)}
          </span>
          <span className="hud-zoom-mobile mono">z {zoom.toFixed(1)}</span>
        </div>

        {showPointReticle && selectedFacility && (
          <div className="map-point-only-hud mono">
            <Crosshair size={12} aria-hidden="true" />
            <span>
              {selectedFacility.name}: OPEN GIS FOOTPRINT UNMAPPED // COORDINATE
              VERIFIED
            </span>
          </div>
        )}
      </div>

      {/* Mobile Legend Toggle Chip */}
      <button
        type="button"
        className="map-legend-toggle"
        onClick={() => setMobileLegendOpen((prev) => !prev)}
        aria-expanded={mobileLegendOpen}
        aria-label="Toggle map legend"
      >
        Legend
      </button>

      {/* Compact Contextual Legend Pill (1:1 parity across all 3 tiers & 4 lenses) */}
      <div
        className={`map-legend-pill${
          mobileLegendOpen ? " map-legend-pill--mobile-open" : ""
        }`}
        aria-label="Map symbology key"
      >
        {tier === "macro" && lens === "capacity" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--op" />
              Operational Core
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--plan" />
              Planned MW
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--cyan" />
              Registry Colocation
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--provisional" />
              Provisional
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--warn" />
              Contested Hub
            </span>
          </>
        )}

        {tier === "macro" && lens === "water" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--op" />
              Low
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--cyan" />
              Low–Med
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--warn" />
              Med–High
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--high" />
              High / Extreme
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--undisclosed" />
              Undisclosed (&gt;=20MW / Flagship)
            </span>
          </>
        )}

        {tier === "macro" && lens === "grid" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--op" />
              Energized
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--cyan" />
              Phased
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--const" />
              Queue
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--warn" />
              Tx Upgrade
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--crit" />
              Contested
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--iso" />
              Live ISO Stress
            </span>
          </>
        )}

        {tier === "macro" && lens === "activity" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--amber" />
              Recent Delta / Building
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--provisional" />
              Provisional / Proposed
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--warn" />
              Contested / Moratorium
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--dim" />
              Static Baseline (16%)
            </span>
          </>
        )}

        {tier === "regional" && lens === "capacity" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--op" />
              Operational
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--cyan" />
              Expanding / Registry
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--const" />
              Building
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--amber" />
              Permitted
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--provisional" />
              Provisional / Proposed
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--dashed" />
              Contested / Moratorium
            </span>
          </>
        )}

        {tier === "regional" && lens === "water" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--op" />
              Low
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--cyan" />
              Low–Med
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--warn" />
              Med–High
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--high" />
              High / Extreme
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--undisclosed" />
              Undisclosed (&gt;=20MW / Flagship)
            </span>
          </>
        )}

        {tier === "regional" && lens === "grid" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--op" />
              Energized
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--cyan" />
              Phased
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--const" />
              Queue
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--warn" />
              Tx Upgrade
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--crit" />
              FERC / PUC Contested
            </span>
          </>
        )}

        {tier === "regional" && lens === "activity" && (
          <>
            <span className="legend-item">
              <span className="legend-dot legend-dot--amber" />
              Active Delta ({radarWindow})
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--provisional" />
              Provisional / Proposed
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--warn" />
              Contested / Moratorium
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--dim" />
              Baseline Fleet (16%)
            </span>
          </>
        )}

        {tier === "parcel" && (
          <>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--hall" />
              Hall / Building (2.5D)
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--exp" />
              Planned Expansion
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--sub" />
              Substation
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--cool" />
              Cooling Yard
            </span>
            <span className="legend-item">
              <span className="legend-ring legend-ring--reticle" />
              Point Only Reticle
            </span>
          </>
        )}
      </div>

      {/* Floating Facility Hover Card (ALL 3 zoom tiers: constellation dots & regional glyphs) */}
      {hoveredFacility && (
        <div
          className="map-hover-card"
          style={{
            left: Math.max(
              12,
              Math.min(hoveredFacility.point.x + 16, containerW - 298),
            ),
            top: Math.max(
              52,
              Math.min(hoveredFacility.point.y - 24, containerH - 200),
            ),
          }}
        >
          <div className="hover-card-head">
            <strong>{hoveredFacility.facility.name}</strong>
            <StatusPill status={hoveredFacility.facility.lifecycleStatus} compact />
          </div>
          <div className="hover-card-sub">
            <TierBadge tier={hoveredFacility.facility.catalogTier} compact /> ·{" "}
            {hoveredFacility.facility.city}, {hoveredFacility.facility.state} ·{" "}
            <span className="mono">{hoveredFacility.facility.isoRegion}</span> ·{" "}
            {COOLING_SHORT_LABELS[hoveredFacility.facility.coolingArchitecture]}
          </div>
          <div className="hover-card-grid mono">
            <div>
              <span className="hover-k">Op / Plan</span>
              <span className="hover-v">
                {hoveredFacility.facility.operationalMw !== null
                  ? Math.round(hoveredFacility.facility.operationalMw)
                  : "—"}
                {" / "}
                {formatMw(hoveredFacility.facility.totalPlannedMw)}
                {hoveredFacility.facility.totalPlannedMwEpistemic === "reported"
                  ? " (Rep)"
                  : ""}
              </span>
            </div>
            <div>
              <span className="hover-k">Peak Water</span>
              <span
                className={`hover-v${
                  isUndisclosedWater(hoveredFacility.facility)
                    ? " hover-v--warn"
                    : ""
                }`}
              >
                {formatWaterSummary(
                  hoveredFacility.facility.peakOrAvgWaterMgd,
                  hoveredFacility.facility.annualWaterMgy,
                  hoveredFacility.facility.waterEpistemic,
                )}
              </span>
            </div>
          </div>
          <div className="hover-card-live">
            <span className="mono">
              {hoveredWeather && hoveredWeather.status === "live"
                ? `WB ${formatTempPair(hoveredWeather.wetBulbF, hoveredWeather.wetBulbC)}`
                : `${CATALOG_TIER_SHORT_LABELS[hoveredFacility.facility.catalogTier]} · ${
                    hoveredFacility.facility.footprintCoverage === "verified_polygons"
                      ? `${hoveredFacility.facility.mappedPolygonCount || "Mapped"} poly`
                      : "Point Only"
                  }`}
            </span>
            {hoveredWeather && hoveredWeather.status === "live" && (
              <span
                className={`thermal-pill thermal-pill--${hoveredWeather.thermalRegime}`}
              >
                {THERMAL_REGIME_LABELS[hoveredWeather.thermalRegime] ??
                  hoveredWeather.thermalRegime}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Floating Parcel Zone Tooltip (Tier 3) */}
      {hoveredFootprint && !hoveredFacility && (
        <div
          className="map-hover-card map-hover-card--compact"
          style={{
            left: Math.max(
              12,
              Math.min(hoveredFootprint.point.x + 14, containerW - 252),
            ),
            top: Math.max(
              52,
              Math.min(hoveredFootprint.point.y - 20, containerH - 120),
            ),
          }}
        >
          <div className="hover-card-head">
            <strong>{hoveredFootprint.label}</strong>
            <StatusPill status={hoveredFootprint.status} compact />
          </div>
          <div className="hover-card-sub">
            {ZONE_KIND_LABELS[hoveredFootprint.zoneKind] ??
              hoveredFootprint.zoneKind}
            {hoveredFootprint.mwLabel && (
              <span className="mono"> · {hoveredFootprint.mwLabel}</span>
            )}
            {hoveredFootprint.sqft && (
              <span className="mono">
                {" "}
                · {formatNumber(hoveredFootprint.sqft)} sq ft
              </span>
            )}
          </div>
        </div>
      )}

      {/* Floating Cluster Summary Card (Tier 1) */}
      {hoveredCluster && !hoveredFacility && !hoveredFootprint && tier === "macro" && (
        <div
          className="map-hover-card"
          style={{
            left: Math.max(
              12,
              Math.min(hoveredCluster.point.x + 16, containerW - 298),
            ),
            top: Math.max(
              52,
              Math.min(hoveredCluster.point.y - 24, containerH - 190),
            ),
          }}
        >
          <div className="hover-card-head">
            <strong>{hoveredCluster.cluster.clusterName}</strong>
            <span className="iso-stress-tag mono">
              {hoveredCluster.cluster.primaryIso} · {hoveredCluster.cluster.facilityCount}
            </span>
          </div>
          <div className="hover-card-grid mono">
            <div>
              <span className="hover-k">Verified Op / Plan</span>
              <span className="hover-v">
                {formatGwOrMw(hoveredCluster.cluster.operationalMw)} /{" "}
                {formatGwOrMw(hoveredCluster.cluster.plannedMw)}
              </span>
            </div>
            <div>
              <span className="hover-k">
                {lens === "grid"
                  ? "Grid Bottleneck"
                  : hoveredCluster.cluster.reportedOrProposedMw > 0 &&
                      lens === "capacity"
                    ? "Proposed Pipeline"
                    : "Peak Water"}
              </span>
              <span
                className={`hover-v${
                  lens === "water" &&
                  hoveredCluster.cluster.undisclosedWaterCount ===
                    hoveredCluster.cluster.facilityCount
                    ? " hover-v--warn"
                    : ""
                }`}
              >
                {lens === "grid"
                  ? INTERCONNECTION_LABELS[hoveredCluster.cluster.dominantGridStatus] ??
                    hoveredCluster.cluster.dominantGridStatus
                  : hoveredCluster.cluster.reportedOrProposedMw > 0 &&
                      lens === "capacity"
                    ? `+${formatGwOrMw(hoveredCluster.cluster.reportedOrProposedMw)}`
                    : hoveredCluster.cluster.undisclosedWaterCount ===
                        hoveredCluster.cluster.facilityCount
                      ? `${hoveredCluster.cluster.facilityCount}/${hoveredCluster.cluster.facilityCount} Undisclosed`
                      : `${formatNumber(hoveredCluster.cluster.disclosedWaterMgd, 1)} MGD`}
              </span>
            </div>
          </div>
          <div className="hover-card-sub">
            Watershed max:{" "}
            {WATERSHED_STRESS_LABELS[hoveredCluster.cluster.maxWatershedStress]}
            {hoveredCluster.cluster.contestedCount > 0 &&
              ` · ${hoveredCluster.cluster.contestedCount} contested`}
          </div>
        </div>
      )}

      {/* Floating ISO Region Callout (Tier 1 under Grid lens with live EIA snapshot) */}
      {hoveredIso &&
        !hoveredFacility &&
        !hoveredFootprint &&
        !hoveredCluster &&
        tier === "macro" &&
        lens === "grid" && (
          <div
            className="map-hover-card"
            style={{
              left: Math.max(
                12,
                Math.min(hoveredIso.point.x + 16, containerW - 298),
              ),
              top: Math.max(
                52,
                Math.min(hoveredIso.point.y - 20, containerH - 210),
              ),
            }}
          >
            <div className="hover-card-head">
              <strong className="mono">ISO // {hoveredIso.id}</strong>
              <span className="iso-stress-tag">
                Stress: {hoveredIso.gridStressLevel}
              </span>
            </div>
            <div className="hover-card-sub">{hoveredIso.fullName}</div>
            <div className="hover-card-grid mono">
              <div>
                <span className="hover-k">
                  {hoveredIso.gridSnapshot ? "EIA Live Demand" : "Sites in Filter"}
                </span>
                <span className="hover-v">
                  {hoveredIso.gridSnapshot
                    ? formatGw(hoveredIso.gridSnapshot.demandMw)
                    : hoveredIso.facilityCount}
                </span>
              </div>
              <div>
                <span className="hover-k">
                  {hoveredIso.gridSnapshot ? "Clean Gen Share" : "Planned Load"}
                </span>
                <span className="hover-v">
                  {hoveredIso.gridSnapshot
                    ? (() => {
                        const pct = computeCleanSharePct(hoveredIso.gridSnapshot.fuelMix);
                        return pct !== null ? `${pct}% clean` : "Unavailable";
                      })()
                    : formatGwOrMw(hoveredIso.plannedMw)}
                </span>
              </div>
            </div>
            {hoveredIso.queueNote && (
              <div className="hover-card-note">{hoveredIso.queueNote}</div>
            )}
          </div>
        )}
    </div>
  );
}
