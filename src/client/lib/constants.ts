import type {
  ActivityWindow,
  CatalogTier,
  CoolingArchitecture,
  IsoRegion,
  LifecycleStatus,
} from "@shared/types";
import type {
  AnalyticalLens,
  BasemapMode,
  CorridorPreset,
  FilterState,
  MapViewState,
  ResolvedTheme,
  SortKey,
} from "./types";

export const VECTOR_DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
export const VECTOR_LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
export const ESRI_WORLD_IMAGERY_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const USGS_IMAGERY_TILES =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";

export const US_CONTIGUOUS_BOUNDS: [number, number, number, number] = [
  -124.8,
  24.4,
  -66.9,
  49.4,
];

export const DEFAULT_VIEW: MapViewState = {
  lng: -96.4,
  lat: 38.5,
  zoom: 3.9,
  pitch: 0,
  bearing: 0,
};

export const DEFAULT_FILTERS: FilterState = {
  q: "",
  statuses: [],
  tiers: [],
  verifiedOnly: false,
  proposalsOnly: false,
  window: "all",
  isos: [],
  states: [],
  coolings: [],
  contestedOnly: false,
  undisclosedWaterOnly: false,
  minMw: null,
  sort: "planned_mw",
};

export const CORRIDOR_PRESETS: CorridorPreset[] = [
  { id: "us", label: "US Overview", center: [-96.4, 38.5], zoom: 3.9, pitch: 0 },
  { id: "nova", label: "Northern VA", center: [-77.52, 38.94], zoom: 9.6, pitch: 0 },
  { id: "nynj", label: "NY / NJ Metro", center: [-74.12, 40.74], zoom: 9.7, pitch: 0 },
  {
    id: "new-england",
    label: "New England (ISO-NE)",
    center: [-71.35, 42.32],
    zoom: 8.2,
    pitch: 0,
  },
  { id: "ohio", label: "Central Ohio", center: [-82.8, 40.0], zoom: 9.7, pitch: 0 },
  { id: "memphis", label: "Memphis", center: [-90.12, 35.06], zoom: 10.6, pitch: 0 },
  { id: "louisiana", label: "Louisiana", center: [-91.68, 32.47], zoom: 10.0, pitch: 0 },
  { id: "texas", label: "Texas / Stargate", center: [-98.35, 31.75], zoom: 6.4, pitch: 0 },
  { id: "phoenix", label: "Phoenix", center: [-111.98, 33.39], zoom: 9.7, pitch: 0 },
  { id: "columbia", label: "Columbia Basin", center: [-119.95, 46.5], zoom: 7.3, pitch: 0 },
  { id: "sv", label: "Silicon Valley", center: [-121.97, 37.38], zoom: 11.4, pitch: 0 },
];

export const LIFECYCLE_ORDER: LifecycleStatus[] = [
  "operational",
  "expanding",
  "under_construction",
  "permitted",
  "proposed",
  "contested",
  "moratorium",
];

export const CATALOG_TIER_ORDER: CatalogTier[] = [
  "flagship",
  "registry",
  "provisional",
];

export const ACTIVITY_WINDOW_OPTIONS: { id: ActivityWindow; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

export const RADAR_WINDOW_OPTIONS: { id: ActivityWindow; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

export const ISO_ORDER: IsoRegion[] = [
  "PJM",
  "ERCOT",
  "WECC",
  "SERC",
  "MISO",
  "SPP",
  "CAISO",
  "NYISO",
  "ISO-NE",
];

export const COOLING_ORDER: CoolingArchitecture[] = [
  "closed_loop_liquid",
  "air_chiller_zero_evap",
  "adiabatic_hybrid",
  "hybrid_liquid_evap",
  "evaporative_tower",
  "undisclosed",
];

export const US_JURISDICTIONS: string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export const LENS_OPTIONS: {
  id: AnalyticalLens;
  label: string;
  shortLabel: string;
  mobileLabel: string;
}[] = [
  {
    id: "capacity",
    label: "Capacity",
    shortLabel: "Capacity",
    mobileLabel: "MW",
  },
  {
    id: "water",
    label: "Water",
    shortLabel: "Water",
    mobileLabel: "H2O",
  },
  {
    id: "grid",
    label: "Grid",
    shortLabel: "Grid",
    mobileLabel: "Grid",
  },
  {
    id: "activity",
    label: "Activity",
    shortLabel: "Activity",
    mobileLabel: "New",
  },
];

export const BASEMAP_OPTIONS: {
  id: BasemapMode;
  label: string;
  mobileLabel: string;
}[] = [
  { id: "vector", label: "Vector", mobileLabel: "Vec" },
  { id: "satellite", label: "Satellite", mobileLabel: "Sat" },
  { id: "usgs", label: "USGS", mobileLabel: "USGS" },
];

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "planned_mw", label: "Planned MW" },
  { id: "operational_mw", label: "Operational MW" },
  { id: "water_mgd", label: "Water MGD" },
  { id: "updated", label: "Recent Activity" },
  { id: "name", label: "Name (A–Z)" },
];

export interface MapColorPalette {
  lifecycle: Record<LifecycleStatus, string>;
  stress: Record<string, string>;
  grid: Record<string, string>;
  tier: Record<CatalogTier, string>;
  zones: {
    boundary: string;
    operational: string;
    expansion: string;
    substation: string;
    cooling: string;
  };
  border: string;
  accent: string;
  warnRing: string;
  moratoriumRing: string;
  undisclosedRing: string;
  activityGlow: string;
}

// Map paint cannot read CSS custom properties, so these mirror tokens.css.
// tests/tokens.test.ts fails if a value here differs from its token.
export const DARK_MAP_PALETTE: MapColorPalette = {
  lifecycle: {
    operational: "#3ddc97",
    expanding: "#2dd4bf",
    under_construction: "#6cb2ff",
    permitted: "#8f9bff",
    proposed: "#b79cff",
    contested: "#ff8a3d",
    moratorium: "#ff5a5f",
  },
  stress: {
    low: "#3ddc97",
    low_medium: "#2dd4bf",
    medium_high: "#e6c84a",
    high: "#ff8a3d",
    extremely_high: "#ff5a5f",
  },
  grid: {
    energized: "#3ddc97",
    phased_energization: "#2dd4bf",
    interconnection_queue: "#6cb2ff",
    transmission_upgrade_pending: "#e6c84a",
    ferc_or_puc_contested: "#ff5a5f",
  },
  tier: {
    flagship: "#ffbe45",
    registry: "#b4c0cf",
    provisional: "#b79cff",
  },
  zones: {
    boundary: "#ffb020",
    operational: "#3ddc97",
    expansion: "#b79cff",
    substation: "#e6c84a",
    cooling: "#38c8ff",
  },
  border: "#e9eef5",
  accent: "#ffb020",
  warnRing: "#ff8a3d",
  moratoriumRing: "#ff5a5f",
  undisclosedRing: "#ff5a5f",
  activityGlow: "#ffb020",
};

export const LIGHT_MAP_PALETTE: MapColorPalette = {
  lifecycle: {
    operational: "#07663f",
    expanding: "#07655d",
    under_construction: "#1d5fc4",
    permitted: "#4347c9",
    proposed: "#6b4fc0",
    contested: "#9c3f0e",
    moratorium: "#c02626",
  },
  stress: {
    low: "#07663f",
    low_medium: "#07655d",
    medium_high: "#7a5c00",
    high: "#9c3f0e",
    extremely_high: "#c02626",
  },
  grid: {
    energized: "#07663f",
    phased_energization: "#07655d",
    interconnection_queue: "#1d5fc4",
    transmission_upgrade_pending: "#7a5c00",
    ferc_or_puc_contested: "#c02626",
  },
  tier: {
    flagship: "#8f4e00",
    registry: "#333d4b",
    provisional: "#6b4fc0",
  },
  zones: {
    boundary: "#a85d00",
    operational: "#07663f",
    expansion: "#6b4fc0",
    substation: "#7a5c00",
    cooling: "#0b6a94",
  },
  border: "#0d1420",
  accent: "#a85d00",
  warnRing: "#9c3f0e",
  moratoriumRing: "#c02626",
  undisclosedRing: "#c02626",
  activityGlow: "#a85d00",
};

export function getMapPalette(
  basemap: BasemapMode,
  resolvedTheme: ResolvedTheme,
): MapColorPalette {
  if (basemap === "vector" && resolvedTheme === "light") {
    return LIGHT_MAP_PALETTE;
  }
  return DARK_MAP_PALETTE;
}

export const TIER_MACRO_MAX_ZOOM = 5.8;
export const TIER_PARCEL_MIN_ZOOM = 12.2;
export const LAZY_FOOTPRINTS_ZOOM = 11.8;
