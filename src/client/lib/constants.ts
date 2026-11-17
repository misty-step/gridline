import type {
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
  isos: [],
  coolings: [],
  contestedOnly: false,
  undisclosedWaterOnly: false,
  sort: "planned_mw",
};

export const CORRIDOR_PRESETS: CorridorPreset[] = [
  { id: "us", label: "US Overview", center: [-96.4, 38.5], zoom: 3.9, pitch: 0 },
  { id: "nova", label: "Northern VA", center: [-77.52, 38.94], zoom: 9.6, pitch: 0 },
  { id: "phoenix", label: "Phoenix", center: [-111.98, 33.39], zoom: 9.7, pitch: 0 },
  { id: "texas", label: "Texas / Stargate", center: [-98.35, 31.75], zoom: 6.4, pitch: 0 },
  { id: "ohio", label: "Central Ohio", center: [-82.8, 40.0], zoom: 9.7, pitch: 0 },
  { id: "memphis", label: "Memphis", center: [-90.12, 35.06], zoom: 10.6, pitch: 0 },
  { id: "columbia", label: "Columbia Basin", center: [-119.95, 46.5], zoom: 7.3, pitch: 0 },
  { id: "louisiana", label: "Louisiana", center: [-91.68, 32.47], zoom: 10.0, pitch: 0 },
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

export const LENS_OPTIONS: { id: AnalyticalLens; label: string; shortLabel: string }[] = [
  { id: "capacity", label: "Capacity & Lifecycle", shortLabel: "Capacity" },
  { id: "water", label: "Water & Cooling Stress", shortLabel: "Water" },
  { id: "grid", label: "Grid & Ratepayer Impact", shortLabel: "Grid" },
];

export const BASEMAP_OPTIONS: { id: BasemapMode; label: string }[] = [
  { id: "vector", label: "Vector" },
  { id: "satellite", label: "Satellite" },
  { id: "usgs", label: "USGS" },
];

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "planned_mw", label: "Planned MW" },
  { id: "operational_mw", label: "Operational MW" },
  { id: "water_mgd", label: "Water MGD" },
  { id: "name", label: "Name (A–Z)" },
];

export const LIFECYCLE_COLORS: Record<LifecycleStatus, string> = {
  operational: "#10b981",
  expanding: "#06b6d4",
  under_construction: "#3b82f6",
  permitted: "#8b5cf6",
  proposed: "#94a3b8",
  contested: "#f59e0b",
  moratorium: "#ef4444",
};

export const WATERSHED_STRESS_COLORS: Record<string, string> = {
  low: "#10b981",
  low_medium: "#06b6d4",
  medium_high: "#f59e0b",
  high: "#f97316",
  extremely_high: "#ef4444",
};

export const GRID_STATUS_COLORS: Record<string, string> = {
  energized: "#10b981",
  phased_energization: "#06b6d4",
  interconnection_queue: "#3b82f6",
  transmission_upgrade_pending: "#f59e0b",
  ferc_or_puc_contested: "#ef4444",
};

export const TIER_MACRO_MAX_ZOOM = 5.8;
export const TIER_PARCEL_MIN_ZOOM = 12.5;
