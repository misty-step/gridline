import type { D1Database, Fetcher } from "@cloudflare/workers-types";
import type {
  CampusFootprintProps,
  FacilityIndexItem,
  FacilityRecord,
  FleetSummaryMetadata,
  IsoRegionProps,
} from "../shared/types.ts";

export interface Env {
  ASSETS?: Fetcher;
  DB?: D1Database;
  EIA_API_KEY?: string;
  ENVIRONMENT?: string;
  RELEASE?: string;
}

export interface DatasetBundle {
  facilities: FacilityRecord[];
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  isoRegions: GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    IsoRegionProps
  >;
  indexItems?: FacilityIndexItem[];
  summary?: FleetSummaryMetadata;
}

export interface TelemetryFetchOptions {
  refresh?: boolean;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}
