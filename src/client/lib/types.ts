import type {
  CoolingArchitecture,
  FacilityRecord,
  IsoRegion,
  LifecycleStatus,
} from "@shared/types";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type BasemapMode = "vector" | "satellite" | "usgs";
export type AnalyticalLens = "capacity" | "water" | "grid";
export type SortKey = "planned_mw" | "operational_mw" | "water_mgd" | "name";
export type ZoomTier = "macro" | "regional" | "parcel";

export interface FilterState {
  q: string;
  statuses: LifecycleStatus[];
  isos: IsoRegion[];
  coolings: CoolingArchitecture[];
  contestedOnly: boolean;
  undisclosedWaterOnly: boolean;
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
  operationalMw: number;
  plannedMw: number;
  contestedOrMoratoriumCount: number;
  disclosedPeakWaterMgd: number;
  undisclosedWaterCount: number;
}

export interface MarketClusterSummary {
  clusterName: string;
  coordinates: [number, number];
  facilityCount: number;
  operationalMw: number;
  plannedMw: number;
  contestedCount: number;
  undisclosedWaterCount: number;
  primaryIso: IsoRegion;
  bounds: MapBoundsTuple;
}

export interface HoveredFacilityState {
  facility: FacilityRecord;
  point: { x: number; y: number };
}

export interface HoveredFootprintState {
  facilityId: string;
  label: string;
  zoneKind: string;
  mwLabel?: string;
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
  point: { x: number; y: number };
}
