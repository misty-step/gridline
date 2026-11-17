import type {
  ActivityWindow,
  CatalogTier,
  CoolingArchitecture,
  FacilityIndexItem,
  IsoRegion,
  LifecycleStatus,
  LiveIsoGridSnapshot,
  WatershedStress,
} from "@shared/types";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type BasemapMode = "vector" | "satellite" | "usgs";
export type AnalyticalLens = "capacity" | "water" | "grid" | "activity";
export type SortKey =
  | "planned_mw"
  | "operational_mw"
  | "water_mgd"
  | "updated"
  | "name";
export type ZoomTier = "macro" | "regional" | "parcel";

export interface FilterState {
  q: string;
  statuses: LifecycleStatus[];
  tiers: CatalogTier[];
  verifiedOnly: boolean;
  proposalsOnly: boolean;
  window: ActivityWindow;
  isos: IsoRegion[];
  states: string[];
  coolings: CoolingArchitecture[];
  contestedOnly: boolean;
  undisclosedWaterOnly: boolean;
  minMw: number | null;
  sort: SortKey;
}

export type MapBoundsTuple = [number, number, number, number]; // [west, south, east, north]

export interface MapViewState {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface CorridorPreset {
  id: string;
  label: string;
  center: [number, number];
  zoom: number;
  pitch?: number;
}

export interface ViewportMetrics {
  facilityCount: number;
  verifiedFacilityCount: number;
  verifiedOperationalMw: number;
  verifiedPlannedMw: number;
  proposedFacilityCount: number;
  reportedOrProposedMw: number;
  statesCovered: number;
  contestedOrMoratoriumCount: number;
  disclosedPeakWaterMgd: number;
  undisclosedWaterCount: number;
  operationalMw: number;
  plannedMw: number;
}

export interface MarketClusterSummary {
  clusterName: string;
  coordinates: [number, number];
  facilityCount: number;
  verifiedCount: number;
  operationalMw: number;
  plannedMw: number;
  reportedOrProposedMw: number;
  contestedCount: number;
  undisclosedWaterCount: number;
  disclosedWaterMgd: number;
  recentActivityCount: number;
  maxWatershedStress: WatershedStress;
  dominantGridStatus: string;
  primaryIso: IsoRegion;
  bounds: MapBoundsTuple;
}

export interface HoveredClusterState {
  cluster: MarketClusterSummary;
  point: { x: number; y: number };
}

export interface HoveredFacilityState {
  facility: FacilityIndexItem;
  point: { x: number; y: number };
}

export interface HoveredFootprintState {
  facilityId: string;
  label: string;
  zoneKind: string;
  mwLabel?: string;
  sqft?: number | null;
  status: LifecycleStatus;
  point: { x: number; y: number };
}

export interface HoveredIsoState {
  id: IsoRegion;
  fullName: string;
  queueNote: string;
  gridStressLevel: string;
  facilityCount: number;
  plannedMw: number;
  gridSnapshot?: LiveIsoGridSnapshot | null;
  point: { x: number; y: number };
}
