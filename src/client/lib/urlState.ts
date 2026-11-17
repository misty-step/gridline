import type {
  CoolingArchitecture,
  IsoRegion,
  LifecycleStatus,
} from "@shared/types";
import {
  COOLING_ORDER,
  DEFAULT_FILTERS,
  DEFAULT_VIEW,
  ISO_ORDER,
  LIFECYCLE_ORDER,
} from "./constants";
import type {
  AnalyticalLens,
  BasemapMode,
  FilterState,
  MapViewState,
  SortKey,
  ThemeMode,
} from "./types";

export interface ParsedUrlState {
  facilityId: string | null;
  hasExplicitCoords: boolean;
  view: MapViewState;
  basemap: BasemapMode;
  lens: AnalyticalLens;
  theme: ThemeMode;
  filters: FilterState;
  compareIds: string[];
}

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const allowedSet = new Set<string>(allowed);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => allowedSet.has(s));
}

function parseNumber(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < min || num > max) return fallback;
  return num;
}

export function readInitialUrlState(): ParsedUrlState {
  if (typeof window === "undefined") {
    return {
      facilityId: null,
      hasExplicitCoords: false,
      view: DEFAULT_VIEW,
      basemap: "vector",
      lens: "capacity",
      theme: "system",
      filters: DEFAULT_FILTERS,
      compareIds: [],
    };
  }

  const params = new URLSearchParams(window.location.search);

  const facilityId = params.get("facility")?.trim() || null;
  const hasExplicitCoords = params.has("lat") && params.has("lng");

  const lng = parseNumber(params.get("lng"), DEFAULT_VIEW.lng, -180, 180);
  const lat = parseNumber(params.get("lat"), DEFAULT_VIEW.lat, -85, 85);
  const zoom = parseNumber(params.get("z"), DEFAULT_VIEW.zoom, 2, 19);
  const pitch = parseNumber(params.get("pitch"), DEFAULT_VIEW.pitch, 0, 60);

  const rawBasemap = params.get("basemap");
  const basemap: BasemapMode =
    rawBasemap === "vector" || rawBasemap === "satellite" || rawBasemap === "usgs"
      ? rawBasemap
      : "vector";

  const rawLens = params.get("lens");
  const lens: AnalyticalLens =
    rawLens === "capacity" || rawLens === "water" || rawLens === "grid"
      ? rawLens
      : "capacity";

  let storedTheme: ThemeMode = "system";
  try {
    const val = window.localStorage.getItem("gridline:theme");
    if (val === "light" || val === "dark" || val === "system") storedTheme = val;
  } catch {
    // ignore storage errors
  }
  const rawTheme = params.get("theme");
  const theme: ThemeMode =
    rawTheme === "system" || rawTheme === "light" || rawTheme === "dark"
      ? rawTheme
      : storedTheme;

  const rawSort = params.get("sort");
  const sort: SortKey =
    rawSort === "planned_mw" ||
    rawSort === "operational_mw" ||
    rawSort === "water_mgd" ||
    rawSort === "name"
      ? rawSort
      : DEFAULT_FILTERS.sort;

  const statuses = parseList<LifecycleStatus>(params.get("status"), LIFECYCLE_ORDER);
  const isos = parseList<IsoRegion>(params.get("iso"), ISO_ORDER);
  const coolings = parseList<CoolingArchitecture>(params.get("cooling"), COOLING_ORDER);

  const compareIds = (params.get("compare") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    facilityId,
    hasExplicitCoords,
    view: { lng, lat, zoom, pitch, bearing: 0 },
    basemap,
    lens,
    theme,
    filters: {
      q: params.get("q") || "",
      statuses,
      isos,
      coolings,
      contestedOnly: params.get("contested") === "1" || params.get("contested") === "true",
      undisclosedWaterOnly:
        params.get("undisclosedWater") === "1" ||
        params.get("undisclosedWater") === "true",
      sort,
    },
    compareIds,
  };
}

export function writeUrlState(state: {
  facilityId: string | null;
  view: MapViewState;
  basemap: BasemapMode;
  lens: AnalyticalLens;
  theme: ThemeMode;
  filters: FilterState;
  compareIds: string[];
}): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();

  if (state.facilityId) params.set("facility", state.facilityId);
  params.set("lat", state.view.lat.toFixed(4));
  params.set("lng", state.view.lng.toFixed(4));
  params.set("z", state.view.zoom.toFixed(2));
  if (state.view.pitch > 1) params.set("pitch", String(Math.round(state.view.pitch)));
  if (state.basemap !== "vector") params.set("basemap", state.basemap);
  if (state.lens !== "capacity") params.set("lens", state.lens);
  if (state.theme !== "system") params.set("theme", state.theme);

  if (state.filters.q.trim()) params.set("q", state.filters.q.trim());
  if (state.filters.statuses.length > 0) {
    params.set("status", state.filters.statuses.join(","));
  }
  if (state.filters.isos.length > 0) {
    params.set("iso", state.filters.isos.join(","));
  }
  if (state.filters.coolings.length > 0) {
    params.set("cooling", state.filters.coolings.join(","));
  }
  if (state.filters.contestedOnly) params.set("contested", "1");
  if (state.filters.undisclosedWaterOnly) params.set("undisclosedWater", "1");
  if (state.filters.sort !== "planned_mw") params.set("sort", state.filters.sort);
  if (state.compareIds.length > 0) {
    params.set("compare", state.compareIds.join(","));
  }

  const nextQuery = params.toString();
  const nextUrl = nextQuery
    ? `${window.location.pathname}?${nextQuery}`
    : window.location.pathname;
  window.history.replaceState(null, "", nextUrl);
}
