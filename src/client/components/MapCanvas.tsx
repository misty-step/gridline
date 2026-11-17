import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type {
  CampusFootprintProps,
  FacilityRecord,
  IsoRegion,
  IsoRegionProps,
  LiveStationWeather,
} from "@shared/types";
import {
  ESRI_WORLD_IMAGERY_TILES,
  GRID_STATUS_COLORS,
  LIFECYCLE_COLORS,
  TIER_MACRO_MAX_ZOOM,
  TIER_PARCEL_MIN_ZOOM,
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
  formatTempPair,
  formatWaterMgd,
  THERMAL_REGIME_LABELS,
  ZONE_KIND_LABELS,
} from "../lib/format";
import type {
  AnalyticalLens,
  BasemapMode,
  HoveredFacilityState,
  HoveredFootprintState,
  HoveredIsoState,
  MapBoundsTuple,
  MapViewState,
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
  resolvedTheme: ResolvedTheme;
  lens: AnalyticalLens;
  initialView: MapViewState;
  flyRequest: MapFlyRequest | null;
  railOpen: boolean;
  drawerOpen: boolean;
  onSelectFacility: (facility: FacilityRecord) => void;
  onViewChange: (view: MapViewState, bounds: MapBoundsTuple) => void;
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
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(7, 11, 17, 0.72)";
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
  resolvedTheme,
  lens,
  initialView,
  flyRequest,
  railOpen,
  drawerOpen,
  onSelectFacility,
  onViewChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const clusterMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoveredIsoIdRef = useRef<string | null>(null);

  const [zoom, setZoom] = useState<number>(initialView.zoom);
  const [cursorCoord, setCursorCoord] = useState<[number, number]>([
    initialView.lng,
    initialView.lat,
  ]);
  const [hoveredFacility, setHoveredFacility] =
    useState<HoveredFacilityState | null>(null);
  const [hoveredFootprint, setHoveredFootprint] =
    useState<HoveredFootprintState | null>(null);
  const [hoveredIso, setHoveredIso] = useState<HoveredIsoState | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);

  // Refs so MapLibre event listeners always read fresh React state
  const facilitiesByIdRef = useRef<Map<string, FacilityRecord>>(new Map());
  const isoStatsRef = useRef<Map<IsoRegion, { count: number; mw: number }>>(
    new Map(),
  );
  const onSelectRef = useRef(onSelectFacility);
  const onViewChangeRef = useRef(onViewChange);
  const railOpenRef = useRef(railOpen);
  const drawerOpenRef = useRef(drawerOpen);

  onSelectRef.current = onSelectFacility;
  onViewChangeRef.current = onViewChange;
  railOpenRef.current = railOpen;
  drawerOpenRef.current = drawerOpen;

  const clusters = useMemo(() => buildMarketClusters(facilities), [facilities]);
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
      ? "rgba(15, 23, 42, 0.35)"
      : snap.basemap === "vector"
        ? "rgba(148, 163, 184, 0.38)"
        : "rgba(255, 255, 255, 0.52)";

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
              0.2,
              0.055,
            ],
            5.8,
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.1,
              0.02,
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
            2.2,
            1.1,
          ],
          "line-dasharray": [4, 3],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3.0,
            0.78,
            6.2,
            0.35,
            7.8,
            0,
          ],
        },
      });
    }

    // 2. Parcel Footprints Source & Layers (Tier 3: z >= 12.5, visible smoothly from z 11.8)
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
          "fill-opacity": 0.25,
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
          "fill-extrusion-opacity": 0.82,
        },
      });
    }

    // 3. Macro Market Cluster Proportional Rings (Tier 1: z < 5.8)
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

    if (!map.getLayer("clusters-outer")) {
      map.addLayer({
        id: "clusters-outer",
        type: "circle",
        source: "market-clusters",
        maxzoom: 6.2,
        paint: {
          "circle-radius": ["get", "radiusOuter"],
          "circle-color": [
            "case",
            [">", ["get", "contestedCount"], 0],
            "#f59e0b",
            "#38bdf8",
          ],
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.2,
            0.24,
            6.0,
            0,
          ],
          "circle-stroke-width": 1.8,
          "circle-stroke-color": [
            "case",
            [">", ["get", "contestedCount"], 0],
            "#f59e0b",
            "#38bdf8",
          ],
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.2,
            0.9,
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
          "circle-color": "#10b981",
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

    // 4. Individual Campus Glyphs (Tier 2: z 5.8 - 12.5, compact anchor above z 13)
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

    if (!map.getLayer("facilities-selected-ring")) {
      map.addLayer({
        id: "facilities-selected-ring",
        type: "circle",
        source: "facilities",
        minzoom: 5.2,
        filter: ["==", ["get", "id"], snap.selectedFacilityId ?? ""],
        paint: {
          "circle-radius": ["+", ["get", "radiusOuter"], 7],
          "circle-color": "transparent",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": borderColor,
          "circle-stroke-opacity": 0.95,
        },
      });
    }

    if (!map.getLayer("facilities-contested-halo")) {
      map.addLayer({
        id: "facilities-contested-halo",
        type: "symbol",
        source: "facilities",
        minzoom: 5.4,
        maxzoom: 14.5,
        filter: ["==", ["get", "contestedFlag"], 1],
        layout: {
          "icon-image": [
            "match",
            ["get", "lifecycleStatus"],
            "moratorium",
            "halo-moratorium",
            "halo-contested",
          ],
          "icon-size": ["/", ["+", ["get", "radiusOuter"], 6], 18],
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
            0.85,
            14.5,
            0.15,
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
        maxzoom: 14.5,
        filter: ["==", ["get", "undisclosedWaterFlag"], 1],
        layout: {
          "icon-image": "ring-undisclosed-water",
          "icon-size": ["/", ["+", ["get", "radiusOuter"], 4], 18],
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
            0.95,
            14.0,
            0.25,
          ],
        },
      });
    }

    if (!map.getLayer("facilities-planned-ring")) {
      map.addLayer({
        id: "facilities-planned-ring",
        type: "circle",
        source: "facilities",
        minzoom: 5.4,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.6,
            ["get", "radiusOuter"],
            13.5,
            ["get", "radiusOuter"],
            15.5,
            8,
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
            0.1,
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
            13.2,
            0.85,
            14.8,
            0.35,
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
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.6,
            ["get", "radiusInner"],
            13.5,
            ["get", "radiusInner"],
            15.5,
            5,
          ],
          "circle-color": lensColorExpr,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5.4,
            0,
            6.0,
            0.92,
            13.5,
            0.85,
            15.0,
            0.65,
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
            0.8,
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
      minZoom: 2.8,
      maxZoom: 18.5,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 110, unit: "imperial" }),
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
      emitBounds();
    });

    map.on("move", () => {
      setZoom(map.getZoom());
    });

    map.on("moveend", emitBounds);

    map.on("mousemove", (e) => {
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
          setHoveredIso(null);
          return;
        }
      }

      const footprintHit = hits.find((h) => h.layer.id.startsWith("footprints-"));
      if (footprintHit && footprintHit.properties) {
        map.getCanvas().style.cursor = "pointer";
        setHoveredFacility(null);
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
      if (clusterHit) {
        map.getCanvas().style.cursor = "pointer";
        setHoveredFacility(null);
        setHoveredFootprint(null);
        setHoveredIso(null);
        return;
      }

      const isoHit = hits.find((h) => h.layer.id === "iso-regions-fill");
      if (isoHit && isoHit.properties?.id) {
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

      if (hoveredIsoIdRef.current) {
        map.setFeatureState(
          { source: "iso-regions", id: hoveredIsoIdRef.current },
          { hover: false },
        );
        hoveredIsoIdRef.current = null;
      }
      map.getCanvas().style.cursor = "";
      setHoveredFacility(null);
      setHoveredFootprint(null);
      setHoveredIso(null);
    });

    map.on("mouseleave", () => {
      setHoveredFacility(null);
      setHoveredFootprint(null);
      setHoveredIso(null);
    });

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
          duration: 850,
          essential: true,
        });
      }
    });

    return () => {
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
    map.setStyle(getMapStyleSpec(basemap, resolvedTheme));
  }, [basemap, resolvedTheme, styleKey]);

  // Update GeoJSON data & dynamic paint expressions when data/lens/selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

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

  // Render crisp DOM Cluster Callout pills in Macro National Tier (z < 5.8)
  const tier = getZoomTier(zoom);

  useEffect(() => {
    const map = mapRef.current;
    clusterMarkersRef.current.forEach((m) => m.remove());
    clusterMarkersRef.current = [];
    if (!map || tier !== "macro") return;

    const markers: maplibregl.Marker[] = [];
    for (const c of clusters) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `cluster-pill-marker${
        c.contestedCount > 0 ? " cluster-pill-marker--contested" : ""
      }`;
      el.setAttribute(
        "aria-label",
        `${c.clusterName}: ${formatGwOrMw(c.plannedMw)} across ${c.facilityCount} sites`,
      );

      const nameSpan = document.createElement("span");
      nameSpan.className = "cluster-pill-name";
      nameSpan.textContent = c.clusterName;

      const metaSpan = document.createElement("span");
      metaSpan.className = "cluster-pill-meta mono";
      metaSpan.textContent = `${formatGwOrMw(c.plannedMw)} · ${c.facilityCount}`;

      el.appendChild(nameSpan);
      el.appendChild(metaSpan);

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        map.flyTo({
          center: c.coordinates,
          zoom: 8.8,
          pitch: 0,
          duration: 850,
          essential: true,
        });
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: "top",
        offset: [0, 12],
      })
        .setLngLat(c.coordinates)
        .addTo(map);
      markers.push(marker);
    }

    clusterMarkersRef.current = markers;
    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [clusters, tier]);

  // Execute declarative fly requests (Inspect Parcel, Corridor Jump, Fit Bounds)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyRequest) return;

    const isMobile =
      typeof window !== "undefined" && window.innerWidth <= 768;
    const padding = isMobile
      ? { top: 20, bottom: 20, left: 20, right: 20 }
      : {
          top: 28,
          bottom: 44,
          left: railOpenRef.current ? 360 : 28,
          right: drawerOpenRef.current ? 536 : 28,
        };

    if (flyRequest.bounds) {
      map.fitBounds(
        [
          [flyRequest.bounds[0], flyRequest.bounds[1]],
          [flyRequest.bounds[2], flyRequest.bounds[3]],
        ],
        {
          padding,
          maxZoom: flyRequest.zoom ?? 10,
          duration: 850,
        },
      );
      return;
    }

    if (flyRequest.center) {
      map.flyTo({
        center: flyRequest.center,
        zoom: flyRequest.zoom ?? map.getZoom(),
        pitch: flyRequest.pitch ?? 0,
        bearing: flyRequest.bearing ?? 0,
        padding,
        duration: 950,
        essential: true,
      });
    }
  }, [flyRequest]);

  // Trigger map resize smoothly when rail/drawer collapse or expand
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.resize(), 180);
    return () => window.clearTimeout(id);
  }, [railOpen, drawerOpen]);

  const hoveredWeather = hoveredFacility
    ? stations[hoveredFacility.facility.waterAndCooling.nwsStationId]
    : undefined;

  return (
    <div
      className={`map-wrapper${railOpen ? " map-wrapper--rail-open" : ""}${
        drawerOpen ? " map-wrapper--drawer-open" : ""
      }`}
    >
      <div
        ref={containerRef}
        className="map-container"
        role="region"
        aria-label="Interactive US Data Center Infrastructure Map"
      />

      {/* Live Zoom Tier + Coordinates HUD Pill */}
      <div className="map-hud-pill" aria-live="polite">
        <span className="hud-tier">{getZoomTierLabel(tier)}</span>
        <span className="hud-sep" aria-hidden="true">
          ·
        </span>
        <span className="hud-zoom mono">z {zoom.toFixed(1)}</span>
        <span className="hud-sep" aria-hidden="true">
          ·
        </span>
        <span className="hud-coord mono">
          {formatCoordPair(cursorCoord[0], cursorCoord[1])}
        </span>
      </div>

      {/* Compact Contextual Legend Pill */}
      <div className="map-legend-pill" aria-label="Map symbology key">
        {tier === "macro" && (
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
              Contested Activity
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
              <span className="legend-dot legend-dot--const" />
              Building / Permitted
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
              Low Stress
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--warn" />
              Med–High Stress
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--crit" />
              Extreme Stress
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
              <span className="legend-dot legend-dot--const" />
              Queue / Tx Upgrade
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
            left: Math.min(
              hoveredFacility.point.x + 16,
              (containerRef.current?.clientWidth ?? 800) - 296,
            ),
            top: Math.max(12, hoveredFacility.point.y - 24),
          }}
        >
          <div className="hover-card-head">
            <strong>{hoveredFacility.facility.name}</strong>
            <StatusPill status={hoveredFacility.facility.lifecycleStatus} compact />
          </div>
          <div className="hover-card-sub">
            {hoveredFacility.facility.city}, {hoveredFacility.facility.state} ·{" "}
            <span className="mono">{hoveredFacility.facility.isoRegion}</span>
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
              <span className="hover-k">
                {COOLING_SHORT_LABELS[
                  hoveredFacility.facility.waterAndCooling.coolingArchitecture
                ]}
              </span>
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
            left: Math.min(
              hoveredFootprint.point.x + 14,
              (containerRef.current?.clientWidth ?? 800) - 250,
            ),
            top: Math.max(12, hoveredFootprint.point.y - 20),
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

      {/* Floating ISO Region Callout (Tier 1) */}
      {hoveredIso &&
        !hoveredFacility &&
        !hoveredFootprint &&
        tier === "macro" && (
          <div
            className="map-hover-card"
            style={{
              left: Math.min(
                hoveredIso.point.x + 16,
                (containerRef.current?.clientWidth ?? 800) - 290,
              ),
              top: Math.max(12, hoveredIso.point.y - 20),
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
