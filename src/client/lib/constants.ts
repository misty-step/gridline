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
    label: "Capacity & Lifecycle",
    shortLabel: "Capacity",
    mobileLabel: "Cap",
  },
  {
    id: "water",
    label: "Water & Cooling Stress",
    shortLabel: "Water",
    mobileLabel: "H2O",
  },
  {
    id: "grid",
    label: "Grid & Live Dispatch",
    shortLabel: "Grid",
    mobileLabel: "Grid",
  },
  {
    id: "activity",
    label: "Proposals & Pulse",
    shortLabel: "Activity",
    mobileLabel: "Pulse",
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

export const NERV_DARK_MAP_PALETTE: MapColorPalette = {
  lifecycle: {
    operational: "#39ff88",
    expanding: "#00e5ff",
    under_construction: "#38bdf8",
    permitted: "#ff9e2c",
    proposed: "#c084fc",
    contested: "#ffb300",
    moratorium: "#ff4d4d",
  },
  stress: {
    low: "#39ff88",
    low_medium: "#00e5ff",
    medium_high: "#ffb300",
    high: "#ff7b00",
    extremely_high: "#ff3b30",
  },
  grid: {
    energized: "#39ff88",
    phased_energization: "#00e5ff",
    interconnection_queue: "#38bdf8",
    transmission_upgrade_pending: "#ffb300",
    ferc_or_puc_contested: "#ff3b30",
  },
  tier: {
    flagship: "#ff7b00",
    registry: "#00e5ff",
    provisional: "#c084fc",
  },
  zones: {
    boundary: "#ff7b00",
    operational: "#39ff88",
    expansion: "#c084fc",
    substation: "#ffb300",
    cooling: "#00e5ff",
  },
  border: "#f6f1e7",
  accent: "#ff7b00",
  warnRing: "#ffb300",
  moratoriumRing: "#ff4d4d",
  undisclosedRing: "#ff4d4d",
  activityGlow: "#ff9e2c",
};

export const GEHIRN_LIGHT_MAP_PALETTE: MapColorPalette = {
  lifecycle: {
    operational: "#065f46",
    expanding: "#155e75",
    under_construction: "#1e40af",
    permitted: "#5b21b6",
    proposed: "#475569",
    contested: "#92400e",
    moratorium: "#b91c1c",
  },
  stress: {
    low: "#065f46",
    low_medium: "#155e75",
    medium_high: "#92400e",
    high: "#c2410c",
    extremely_high: "#b91c1c",
  },
  grid: {
    energized: "#065f46",
    phased_energization: "#155e75",
    interconnection_queue: "#1e40af",
    transmission_upgrade_pending: "#92400e",
    ferc_or_puc_contested: "#b91c1c",
  },
  tier: {
    flagship: "#9a3412",
    registry: "#155e75",
    provisional: "#5b21b6",
  },
  zones: {
    boundary: "#c2410c",
    operational: "#065f46",
    expansion: "#5b21b6",
    substation: "#92400e",
    cooling: "#155e75",
  },
  border: "#141018",
  accent: "#c2410c",
  warnRing: "#92400e",
  moratoriumRing: "#b91c1c",
  undisclosedRing: "#b91c1c",
  activityGlow: "#c2410c",
};

export function getMapPalette(
  basemap: BasemapMode,
  resolvedTheme: ResolvedTheme,
): MapColorPalette {
  if (basemap === "vector" && resolvedTheme === "light") {
    return GEHIRN_LIGHT_MAP_PALETTE;
  }
  return NERV_DARK_MAP_PALETTE;
}

export const TIER_MACRO_MAX_ZOOM = 5.8;
export const TIER_PARCEL_MIN_ZOOM = 12.2;
export const LAZY_FOOTPRINTS_ZOOM = 11.8;
