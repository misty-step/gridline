import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, RotateCcw } from "lucide-react";
import maplibregl from "maplibre-gl";
import type {
  CampusFootprintProps,
  FacilityRecord,
  IsoRegion,
  IsoRegionProps,
  LiveStationWeather,
} from "@shared/types";
import {
  BASEMAP_OPTIONS,
  ESRI_WORLD_IMAGERY_TILES,
  GRID_STATUS_COLORS,
  LENS_OPTIONS,
  LIFECYCLE_COLORS,
  TIER_MACRO_MAX_ZOOM,
  TIER_PARCEL_MIN_ZOOM,
  US_CONTIGUOUS_BOUNDS,
  USGS_IMAGERY_TILES,
  VECTOR_DARK_STYLE,
  VECTOR_LIGHT_STYLE,
  WATERSHED_STRESS_COLORS,
} from "../lib/constants";
import {
  buildFacilitiesGeoJson,
  buildMarketClusters,
  buildMarketClustersGeoJson,
  isUndisclosedWater,
} from "../lib/filters";
import {
  COOLING_SHORT_LABELS,
  formatGwOrMw,
  formatMw,
  formatNumber,
  formatShortClusterName,
  formatTempPair,
  formatWaterMgd,
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
import { StatusPill } from "./EpistemicBadge";

export interface MapFlyRequest {
  center?: [number, number];
  bounds?: MapBoundsTuple;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  nonce: number;
}

interface MapCanvasProps {
  facilities: FacilityRecord[];
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  isoRegions: GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    IsoRegionProps
  >;
  stations: Record<string, LiveStationWeather>;
  selectedFacilityId: string | null;
  basemap: BasemapMode;
  previousBasemap: BasemapMode | null;
  onBasemapChange: (basemap: BasemapMode) => void;
  onRestoreBasemap: () => void;
  resolvedTheme: ResolvedTheme;
  lens: AnalyticalLens;
  onLensChange: (lens: AnalyticalLens) => void;
  initialView: MapViewState;
  fitUsOnLoad: boolean;
  flyRequest: MapFlyRequest | null;
  railOpen: boolean;
  drawerOpen: boolean;
  mobileDetent: "peek" | "expanded";
  hasCompareDock?: boolean;
  onSelectFacility: (facility: FacilityRecord) => void;
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
  if (tier === "macro") return "Macro National";
  if (tier === "regional") return "Regional Corridor";
  return "Parcel Inspection";
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
          "raster-saturation": -0.05,
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
  ctx.strokeStyle = "rgba(7, 11, 17, 0.78)";
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
      createDashedRingImage("#f59e0b", [7, 5], false),
      { pixelRatio: 2 },
    );
  }
  if (!map.hasImage("halo-moratorium")) {
    map.addImage(
      "halo-moratorium",
      createDashedRingImage("#ef4444", [5, 4], true),
      { pixelRatio: 2 },
    );
  }
  if (!map.hasImage("ring-undisclosed-water")) {
    map.addImage(
      "ring-undisclosed-water",
      createDashedRingImage("#fb7185", [4, 4], false),
      { pixelRatio: 2 },
    );
  }
}

function softenVectorBasemapLabels(map: maplibregl.Map): void {
  try {
    const layers = map.getStyle()?.layers ?? [];
    for (const layer of layers) {
      if (layer.id.startsWith("iso-") || layer.id.startsWith("clusters-") || layer.id.startsWith("facilities-") || layer.id.startsWith("footprints-")) {
        continue;
      }
      if (layer.type === "symbol") {
        map.setPaintProperty(layer.id, "text-opacity", 0.52);
      }
    }
  } catch {
    // Ignore third-party style property guard
  }
}

function buildFacilityColorExpression(
  lens: AnalyticalLens,
): maplibregl.ExpressionSpecification {
  if (lens === "water") {
    return [
      "match",
      ["get", "watershedStress"],
      "low",
      WATERSHED_STRESS_COLORS.low,
      "low_medium",
      WATERSHED_STRESS_COLORS.low_medium,
      "medium_high",
      WATERSHED_STRESS_COLORS.medium_high,
      "high",
      WATERSHED_STRESS_COLORS.high,
      "extremely_high",
      WATERSHED_STRESS_COLORS.extremely_high,
      "#94a3b8",
    ];
  }
  if (lens === "grid") {
    return [
      "match",
      ["get", "interconnectionStatus"],
      "energized",
      GRID_STATUS_COLORS.energized,
      "phased_energization",
      GRID_STATUS_COLORS.phased_energization,
      "interconnection_queue",
      GRID_STATUS_COLORS.interconnection_queue,
      "transmission_upgrade_pending",
      GRID_STATUS_COLORS.transmission_upgrade_pending,
      "ferc_or_puc_contested",
      GRID_STATUS_COLORS.ferc_or_puc_contested,
      "#94a3b8",
    ];
  }
  return [
    "match",
    ["get", "lifecycleStatus"],
    "operational",
    LIFECYCLE_COLORS.operational,
    "expanding",
    LIFECYCLE_COLORS.expanding,
    "under_construction",
    LIFECYCLE_COLORS.under_construction,
    "permitted",
    LIFECYCLE_COLORS.permitted,
    "proposed",
    LIFECYCLE_COLORS.proposed,
    "contested",
    LIFECYCLE_COLORS.contested,
    "moratorium",
    LIFECYCLE_COLORS.moratorium,
    "#94a3b8",
  ];
}

function buildClusterOuterColorExpression(
  lens: AnalyticalLens,
): maplibregl.ExpressionSpecification {
  if (lens === "water") {
    return [
      "match",
      ["get", "maxWatershedStress"],
      "low",
      WATERSHED_STRESS_COLORS.low,
      "low_medium",
      WATERSHED_STRESS_COLORS.low_medium,
      "medium_high",
      WATERSHED_STRESS_COLORS.medium_high,
      "high",
      WATERSHED_STRESS_COLORS.high,
      "extremely_high",
      WATERSHED_STRESS_COLORS.extremely_high,
      "#94a3b8",
    ];
  }
  if (lens === "grid") {
    return [
      "match",
      ["get", "dominantGridStatus"],
      "energized",
      GRID_STATUS_COLORS.energized,
      "phased_energization",
      GRID_STATUS_COLORS.phased_energization,
      "interconnection_queue",
      GRID_STATUS_COLORS.interconnection_queue,
      "transmission_upgrade_pending",
      GRID_STATUS_COLORS.transmission_upgrade_pending,
      "ferc_or_puc_contested",
      GRID_STATUS_COLORS.ferc_or_puc_contested,
      "#94a3b8",
    ];
  }
  return [
    "case",
    [">", ["get", "contestedCount"], 0],
    "#f59e0b",
    "#38bdf8",
  ];
}

function buildClusterStrokeColorExpression(
  lens: AnalyticalLens,
): maplibregl.ExpressionSpecification {
  if (lens === "water") {
    return [
      "case",
      [">", ["get", "undisclosedWaterCount"], 0],
      "#fb7185",
      buildClusterOuterColorExpression("water"),
    ];
  }
  return buildClusterOuterColorExpression(lens);
}

function buildClusterInnerColorExpression(
  lens: AnalyticalLens,
): maplibregl.DataDrivenPropertyValueSpecification<string> {
  if (lens === "capacity") {
    return "#10b981";
  }
  return buildClusterOuterColorExpression(lens);
}

function formatCoordPair(lng: number, lat: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

export function MapCanvas({
  facilities,
  footprints,
  isoRegions,
  stations,
  selectedFacilityId,
  basemap,
  previousBasemap,
  onBasemapChange,
  onRestoreBasemap,
  resolvedTheme,
  lens,
  onLensChange,
  initialView,
  fitUsOnLoad,
  flyRequest,
  railOpen,
  drawerOpen,
  mobileDetent,
  hasCompareDock = false,
  onSelectFacility,
  onViewChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const clusterMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoveredIsoIdRef = useRef<string | null>(null);
  const pointerOverMapRef = useRef<boolean>(false);
  const didInitialUsFitRef = useRef<boolean>(false);
  const clustersRef = useRef<MarketClusterSummary[]>([]);
  const renderClusterMarkersRef = useRef<() => void>(() => {});

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

  const facilitiesByIdRef = useRef<Map<string, FacilityRecord>>(new Map());
  const clustersByNameRef = useRef<Map<string, MarketClusterSummary>>(new Map());
  const isoStatsRef = useRef<Map<IsoRegion, { count: number; mw: number }>>(
    new Map(),
  );
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

  const clusters = useMemo(() => buildMarketClusters(facilities), [facilities]);
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
    () => buildFacilitiesGeoJson(facilities),
    [facilities],
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
    const map = new Map<string, FacilityRecord>();
    const isoAgg = new Map<IsoRegion, { count: number; mw: number }>();
    for (const f of facilities) {
      map.set(f.id, f);
      const prev = isoAgg.get(f.isoRegion) ?? { count: 0, mw: 0 };
      prev.count += 1;
      prev.mw += f.power.totalPlannedMw.value ?? f.power.operationalMw.value ?? 0;
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

  // Clear floating tooltips whenever filters, camera fly, selection, drawer, lens, or basemap changes
  useEffect(() => {
    clearHoverStates();
  }, [facilities, flyRequest, selectedFacilityId, drawerOpen, lens, basemap]);

  const dataRef = useRef({
    isoRegions,
    clustersGeoJson,
    facilitiesGeoJson,
    visibleFootprintsGeoJson,
    lens,
    selectedFacilityId,
    basemap,
    resolvedTheme,
  });
  dataRef.current = {
    isoRegions,
    clustersGeoJson,
    facilitiesGeoJson,
    visibleFootprintsGeoJson,
    lens,
    selectedFacilityId,
    basemap,
    resolvedTheme,
  };

  const styleKey =
    basemap === "vector" ? `vector-${resolvedTheme}` : basemap;
  const currentStyleKeyRef = useRef(styleKey);

  function syncLayersAndSources(map: maplibregl.Map) {
    ensureProceduralIcons(map);
    const snap = dataRef.current;
    const isLightVector = snap.basemap === "vector" && snap.resolvedTheme === "light";
    const borderColor = isLightVector ? "#0f172a" : "#f8fafc";
    const isoLineColor = isLightVector
      ? "rgba(15, 23, 42, 0.3)"
      : snap.basemap === "vector"
        ? "rgba(148, 163, 184, 0.32)"
        : "rgba(255, 255, 255, 0.45)";

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
            ["get", "gridStressLevel"],
            "severe",
            "#ef4444",
            "high",
            "#f59e0b",
            "elevated",
            "#38bdf8",
            "#10b981",
          ],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.22,
              0.09,
            ],
            5.8,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.12,
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
            0.65,
            6.2,
            0.3,
            7.8,
            0,
          ],
        },
      });
    }

    // 2. Parcel Footprints Source & Layers (Tier 3: z >= 11.4)
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
        filter: ["==", ["get", "zoneKind"], "campus_boundary"],
        paint: {
          "fill-color": "#38bdf8",
          "fill-opacity": 0.08,
        },
      });
    }

    if (!map.getLayer("footprints-campus-line")) {
      map.addLayer({
        id: "footprints-campus-line",
        type: "line",
        source: "footprints",
        minzoom: 11.4,
        filter: ["==", ["get", "zoneKind"], "campus_boundary"],
        paint: {
          "line-color": "#38bdf8",
          "line-width": 2.2,
          "line-dasharray": [5, 3],
          "line-opacity": 0.92,
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
          "fill-color": "#8b5cf6",
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
          "line-color": "#a78bfa",
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
          "fill-color": "#f59e0b",
          "fill-opacity": 0.36,
          "fill-outline-color": "#fbbf24",
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
          "fill-color": "#06b6d4",
          "fill-opacity": 0.4,
          "fill-outline-color": "#22d3ee",
        },
      });
    }

    if (!map.getLayer("footprints-halls-extrusion")) {
      map.addLayer({
        id: "footprints-halls-extrusion",
        type: "fill-extrusion",
        source: "footprints",
        minzoom: 11.8,
        filter: ["==", ["get", "zoneKind"], "operational_hall"],
        paint: {
          "fill-extrusion-color": "#10b981",
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11.8,
            0,
            13.2,
            15,
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.84,
        },
      });
    }

    // 3. Macro Market Cluster Proportional Rings (Tier 1: z < 5.8, lens-aware)
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

    const clusterOuterColor = buildClusterOuterColorExpression(snap.lens);
    const clusterStrokeColor = buildClusterStrokeColorExpression(snap.lens);
    const clusterInnerColor = buildClusterInnerColorExpression(snap.lens);

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
            0.25,
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

    // 4. Individual Campus Glyphs (Tier 2: z 5.4 - 14.2, fades smoothly before Parcel zones take over)
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

    const lensColorExpr = buildFacilityColorExpression(snap.lens);

    if (!map.getLayer("facilities-planned-ring")) {
      map.addLayer({
        id: "facilities-planned-ring",
        type: "circle",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
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
            0.26,
            12.8,
            0.24,
            14.2,
            0,
          ],
          "circle-stroke-width": 1.6,
          "circle-stroke-color": lensColorExpr,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            0.92,
            13.0,
            0.88,
            14.2,
            0,
          ],
        },
      });
    }

    if (!map.getLayer("facilities-operational-core")) {
      map.addLayer({
        id: "facilities-operational-core",
        type: "circle",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
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
            0.94,
            13.0,
            0.88,
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
            0.82,
            13.0,
            0.75,
            14.2,
            0,
          ],
        },
      });
    }

    // Halos rendered strictly AFTER & OUTSIDE operational core (r = radiusOuter + offset)
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

    if (!map.getLayer("facilities-water-undisclosed-ring")) {
      map.addLayer({
        id: "facilities-water-undisclosed-ring",
        type: "symbol",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.3,
        filter: ["==", ["get", "undisclosedWaterFlag"], 1],
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

    if (!map.getLayer("facilities-selected-ring")) {
      map.addLayer({
        id: "facilities-selected-ring",
        type: "circle",
        source: "facilities",
        minzoom: 5.2,
        maxzoom: 14.3,
        filter: ["==", ["get", "id"], snap.selectedFacilityId ?? ""],
        paint: {
          "circle-radius": ["+", ["get", "radiusOuter"], 7],
          "circle-color": "transparent",
          "circle-stroke-width": 2.4,
          "circle-stroke-color": borderColor,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0.95,
            13.0,
            0.9,
            14.2,
            0,
          ],
        },
      });
    }
  }

  // Initialize MapLibre once inside flex map container
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
      setZoom(map.getZoom());
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
          h.layer.id === "facilities-operational-core",
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
        setHoveredFootprint({
          facilityId: String(footprintHit.properties.facilityId ?? ""),
          label: String(footprintHit.properties.label ?? "Zone"),
          zoneKind: String(footprintHit.properties.zoneKind ?? ""),
          mwLabel: footprintHit.properties.mwLabel
            ? String(footprintHit.properties.mwLabel)
            : undefined,
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
        setHoveredFacility(null);
        setHoveredFootprint(null);
        setHoveredCluster(null);
        setHoveredIso({
          id: isoId,
          fullName: String(isoHit.properties.fullName ?? isoId),
          queueNote: String(isoHit.properties.queueNote ?? ""),
          gridStressLevel: String(isoHit.properties.gridStressLevel ?? "elevated"),
          facilityCount: stats.count,
          plannedMw: stats.mw,
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
          h.layer.id === "facilities-operational-core",
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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch basemap or theme style only when styleKey actually changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (currentStyleKeyRef.current === styleKey) return;
    currentStyleKeyRef.current = styleKey;
    map.setStyle(getMapStyleSpec(basemap, resolvedTheme), { diff: false });
  }, [basemap, resolvedTheme, styleKey]);

  // Update GeoJSON data & lens-driven paint expressions whenever data/lens/selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("facilities")) return;

    const isoSrc = map.getSource("iso-regions") as maplibregl.GeoJSONSource | undefined;
    if (isoSrc) isoSrc.setData(isoRegions);

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
    }

    if (map.getLayer("clusters-outer")) {
      map.setPaintProperty(
        "clusters-outer",
        "circle-color",
        buildClusterOuterColorExpression(lens),
      );
      map.setPaintProperty(
        "clusters-outer",
        "circle-stroke-color",
        buildClusterStrokeColorExpression(lens),
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
        buildClusterInnerColorExpression(lens),
      );
    }

    const lensColor = buildFacilityColorExpression(lens);
    if (map.getLayer("facilities-planned-ring")) {
      map.setPaintProperty("facilities-planned-ring", "circle-color", lensColor);
      map.setPaintProperty("facilities-planned-ring", "circle-stroke-color", lensColor);
    }
    if (map.getLayer("facilities-operational-core")) {
      map.setPaintProperty("facilities-operational-core", "circle-color", lensColor);
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
    isoRegions,
    clustersGeoJson,
    facilitiesGeoJson,
    visibleFootprintsGeoJson,
    lens,
    selectedFacilityId,
    styleVersion,
  ]);

  const tier = getZoomTier(zoom);

  // Render crisp DOM Cluster Callout pills in Macro National Tier (z < 5.8)
  // clamped cleanly inside unobscured canvas with 4-quadrant offset attempts
  renderClusterMarkersRef.current = () => {
    const map = mapRef.current;
    clusterMarkersRef.current.forEach((m) => m.remove());
    clusterMarkersRef.current = [];
    if (!map || map.getZoom() >= TIER_MACRO_MAX_ZOOM) return;

    const canvasW = containerRef.current?.clientWidth ?? 1100;
    const canvasH = containerRef.current?.clientHeight ?? 800;
    const isNarrow = canvasW < 500;
    const topSafe = isNarrow ? 56 : 52;
    const bottomSafe = canvasH - (isNarrow ? 88 : 54);
    const minX = 8;
    const maxX = canvasW - 8;

    const sorted = [...clustersRef.current].sort(
      (a, b) =>
        b.plannedMw - a.plannedMw ||
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
      const pt = map.project(c.coordinates);
      if (pt.x < -12 || pt.x > canvasW + 12 || pt.y < topSafe || pt.y > bottomSafe) {
        continue;
      }

      const shortName = formatShortClusterName(c.clusterName);
      const activeLens = lensRef.current;
      let metaText = `${formatGwOrMw(c.plannedMw)} · ${c.facilityCount}`;
      if (activeLens === "water") {
        metaText =
          c.undisclosedWaterCount === c.facilityCount
            ? `${c.facilityCount}/${c.facilityCount} Undisclosed`
            : c.undisclosedWaterCount > 0
              ? `${formatNumber(c.disclosedWaterMgd, 1)} MGD · ${c.undisclosedWaterCount} NDA`
              : `${formatNumber(c.disclosedWaterMgd, 1)} MGD · ${c.facilityCount}`;
      } else if (activeLens === "grid") {
        metaText = `${c.primaryIso} · ${formatGwOrMw(c.plannedMw)}`;
      }

      const estChars = Math.max(shortName.length, metaText.length);
      const boxW = Math.max(114, Math.min(168, estChars * 6.5 + 22));
      const boxH = 34;

      const candidates: Array<{
        anchor: maplibregl.PositionAnchor;
        offset: [number, number];
        box: { left: number; top: number; right: number; bottom: number };
      }> = [
        {
          anchor: "top",
          offset: [0, 12],
          box: {
            left: pt.x - boxW / 2 - 3,
            right: pt.x + boxW / 2 + 3,
            top: pt.y + 10,
            bottom: pt.y + 10 + boxH + 4,
          },
        },
        {
          anchor: "bottom",
          offset: [0, -12],
          box: {
            left: pt.x - boxW / 2 - 3,
            right: pt.x + boxW / 2 + 3,
            top: pt.y - 10 - boxH - 4,
            bottom: pt.y - 10,
          },
        },
        {
          anchor: "left",
          offset: [14, 0],
          box: {
            left: pt.x + 12,
            right: pt.x + 12 + boxW + 4,
            top: pt.y - boxH / 2 - 2,
            bottom: pt.y + boxH / 2 + 2,
          },
        },
        {
          anchor: "right",
          offset: [-14, 0],
          box: {
            left: pt.x - 12 - boxW - 4,
            right: pt.x - 12,
            top: pt.y - boxH / 2 - 2,
            bottom: pt.y + boxH / 2 + 2,
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
        (activeLens === "grid" && c.dominantGridStatus === "ferc_or_puc_contested");

      const el = document.createElement("button");
      el.type = "button";
      el.className = `cluster-pill-marker${
        isAlertCluster ? " cluster-pill-marker--contested" : ""
      }`;
      el.setAttribute(
        "aria-label",
        `${c.clusterName}: ${formatGwOrMw(c.plannedMw)} across ${c.facilityCount} sites`,
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

  // Execute declarative fly requests (unobscured container means simple symmetric padding!)
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
    ? stations[hoveredFacility.facility.waterAndCooling.nwsStationId]
    : undefined;

  const containerW = containerRef.current?.clientWidth ?? 900;
  const containerH = containerRef.current?.clientHeight ?? 760;

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

      {/* Mobile-Only Map Floating Lens & Basemap Strip (keeps TopBar 1-row <= 52px) */}
      <div className="map-mobile-bar" role="region" aria-label="Map analytical lens and basemap">
        <div className="map-mobile-group" role="group" aria-label="Analytical Lens">
          {LENS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`map-float-btn${lens === opt.id ? " map-float-btn--active" : ""}`}
              onClick={() => onLensChange(opt.id)}
              aria-pressed={lens === opt.id}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>

        <div className="map-mobile-group" role="group" aria-label="Basemap Style">
          {BASEMAP_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`map-float-btn${basemap === opt.id ? " map-float-btn--active" : ""}`}
              onClick={() => onBasemapChange(opt.id)}
              aria-pressed={basemap === opt.id}
            >
              {opt.id === "satellite" ? "Sat" : opt.label}
            </button>
          ))}
        </div>
      </div>

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
              className={`map-float-btn${basemap === opt.id ? " map-float-btn--active" : ""}`}
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
          <span className="hud-tier">{getZoomTierLabel(tier)}</span>
          <span className="hud-sep" aria-hidden="true">
            ·
          </span>
          <span className="hud-zoom mono">z {zoom.toFixed(1)}</span>
          <span className="hud-sep hud-coord-sep" aria-hidden="true">
            ·
          </span>
          <span className="hud-coord mono">
            {formatCoordPair(cursorCoord[0], cursorCoord[1])}
          </span>
        </div>
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

      {/* Compact Contextual Legend Pill (1:1 parity across all tiers & lenses) */}
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
              Planned Pipeline
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
              Undisclosed Sites
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
              ISO Stress Fill
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
              Expanding
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--const" />
              Building
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--perm" />
              Permitted
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--prop" />
              Proposed
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
              Undisclosed Water
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

        {tier === "parcel" && (
          <>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--hall" />
              Operational Hall (2.5D)
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
          </>
        )}
      </div>

      {/* Floating Facility Hover Card (Tier 2/3) */}
      {hoveredFacility && (
        <div
          className="map-hover-card"
          style={{
            left: Math.max(
              12,
              Math.min(hoveredFacility.point.x + 16, containerW - 292),
            ),
            top: Math.max(
              52,
              Math.min(hoveredFacility.point.y - 24, containerH - 180),
            ),
          }}
        >
          <div className="hover-card-head">
            <strong>{hoveredFacility.facility.name}</strong>
            <StatusPill status={hoveredFacility.facility.lifecycleStatus} compact />
          </div>
          <div className="hover-card-sub">
            {hoveredFacility.facility.city}, {hoveredFacility.facility.state} ·{" "}
            <span className="mono">{hoveredFacility.facility.isoRegion}</span> ·{" "}
            {
              COOLING_SHORT_LABELS[
                hoveredFacility.facility.waterAndCooling.coolingArchitecture
              ]
            }
          </div>
          <div className="hover-card-grid mono">
            <div>
              <span className="hover-k">Op / Plan</span>
              <span className="hover-v">
                {hoveredFacility.facility.power.operationalMw.value !== null
                  ? Math.round(hoveredFacility.facility.power.operationalMw.value)
                  : "—"}
                {" / "}
                {formatMw(hoveredFacility.facility.power.totalPlannedMw.value)}
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
                {formatWaterMgd(
                  hoveredFacility.facility.waterAndCooling.peakOrAvgWaterMgd,
                )}
              </span>
            </div>
          </div>
          {hoveredWeather && hoveredWeather.status === "live" && (
            <div className="hover-card-live">
              <span className="mono">
                WB {formatTempPair(hoveredWeather.wetBulbF, hoveredWeather.wetBulbC)}
              </span>
              <span
                className={`thermal-pill thermal-pill--${hoveredWeather.thermalRegime}`}
              >
                {THERMAL_REGIME_LABELS[hoveredWeather.thermalRegime] ??
                  hoveredWeather.thermalRegime}
              </span>
            </div>
          )}
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
          </div>
        </div>
      )}

      {/* Floating Cluster Summary Card (Tier 1: ensures culled macro clusters are inspectable on hover) */}
      {hoveredCluster && !hoveredFacility && !hoveredFootprint && tier === "macro" && (
        <div
          className="map-hover-card"
          style={{
            left: Math.max(
              12,
              Math.min(hoveredCluster.point.x + 16, containerW - 292),
            ),
            top: Math.max(
              52,
              Math.min(hoveredCluster.point.y - 24, containerH - 180),
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
              <span className="hover-k">Op / Plan</span>
              <span className="hover-v">
                {formatGwOrMw(hoveredCluster.cluster.operationalMw)} /{" "}
                {formatGwOrMw(hoveredCluster.cluster.plannedMw)}
              </span>
            </div>
            <div>
              <span className="hover-k">
                {lens === "grid" ? "Grid Bottleneck" : "Peak Water"}
              </span>
              <span
                className={`hover-v${
                  lens !== "grid" &&
                  hoveredCluster.cluster.undisclosedWaterCount ===
                    hoveredCluster.cluster.facilityCount
                    ? " hover-v--warn"
                    : ""
                }`}
              >
                {lens === "grid"
                  ? INTERCONNECTION_LABELS[hoveredCluster.cluster.dominantGridStatus] ??
                    hoveredCluster.cluster.dominantGridStatus
                  : hoveredCluster.cluster.undisclosedWaterCount ===
                      hoveredCluster.cluster.facilityCount
                    ? `${hoveredCluster.cluster.facilityCount}/${hoveredCluster.cluster.facilityCount} Undisclosed`
                    : `${formatNumber(hoveredCluster.cluster.disclosedWaterMgd, 1)} MGD`}
              </span>
            </div>
          </div>
          <div className="hover-card-sub">
            Watershed max: {WATERSHED_STRESS_LABELS[hoveredCluster.cluster.maxWatershedStress]}
            {hoveredCluster.cluster.contestedCount > 0 &&
              ` · ${hoveredCluster.cluster.contestedCount} contested`}
          </div>
        </div>
      )}

      {/* Floating ISO Region Callout (Tier 1 under Grid lens) */}
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
                Math.min(hoveredIso.point.x + 16, containerW - 292),
              ),
              top: Math.max(
                52,
                Math.min(hoveredIso.point.y - 20, containerH - 180),
              ),
            }}
          >
            <div className="hover-card-head">
              <strong className="mono">{hoveredIso.id}</strong>
              <span className="iso-stress-tag">
                Grid Stress: {hoveredIso.gridStressLevel}
              </span>
            </div>
            <div className="hover-card-sub">{hoveredIso.fullName}</div>
            <div className="hover-card-grid mono">
              <div>
                <span className="hover-k">Sites in Filter</span>
                <span className="hover-v">{hoveredIso.facilityCount}</span>
              </div>
              <div>
                <span className="hover-k">Planned Load</span>
                <span className="hover-v">{formatGwOrMw(hoveredIso.plannedMw)}</span>
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
