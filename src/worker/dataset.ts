import * as dataModule from "../data/index.ts";
import {
  classifyFacilityMwSplit,
  computeFleetSummary,
  isProposalFacilityItem,
  isVerifiedFacilityItem,
} from "../shared/fleet.ts";
import type {
  CampusFootprintProps,
  CatalogTier,
  EpistemicStatus,
  FacilityIndexItem,
  FacilityRecord,
  FleetSummaryMetadata,
  FootprintCoverage,
  IsoRegionProps,
} from "../shared/types.ts";

interface DataModuleAdapter {
  ALL_FACILITIES?: FacilityRecord[];
  ALL_INDEX_ITEMS?: FacilityIndexItem[];
  FLEET_SUMMARY?: FleetSummaryMetadata;
  ALL_FOOTPRINTS?: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  ISO_REGIONS?: GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    IsoRegionProps
  >;
  getFacilityById?: (id: string) => FacilityRecord | undefined;
  getFacilityRecordById?: (id: string) => FacilityRecord | undefined;
  getFootprintsForFacility?: (
    facilityId: string,
  ) => GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
}

const rawData = dataModule as unknown as DataModuleAdapter;

export const ALL_FACILITIES: FacilityRecord[] = rawData.ALL_FACILITIES ?? [];

export const ALL_FOOTPRINTS: GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CampusFootprintProps
> = rawData.ALL_FOOTPRINTS ?? { type: "FeatureCollection", features: [] };

export const ISO_REGIONS: GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  IsoRegionProps
> = rawData.ISO_REGIONS ?? { type: "FeatureCollection", features: [] };

export function countFootprintsByFacility(
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const feat of footprints.features) {
    const fid = feat?.properties?.facilityId;
    if (fid) {
      counts.set(fid, (counts.get(fid) ?? 0) + 1);
    }
  }
  return counts;
}

export function recordToIndexItem(
  f: FacilityRecord,
  footprintCounts?: Map<string, number>,
): FacilityIndexItem {
  const mappedCount =
    f.registryMetadata?.mappedPolygonCount ?? footprintCounts?.get(f.id) ?? 0;
  const footprintCoverage: FootprintCoverage =
    f.footprintCoverage ?? (mappedCount > 0 ? "verified_polygons" : "point_only");
  const catalogTier: CatalogTier = f.catalogTier ?? "flagship";

  const peakWater = f.waterAndCooling.peakOrAvgWaterMgd;
  const annualWater = f.waterAndCooling.annualWaterMgy;
  let waterEpistemic: EpistemicStatus = "undisclosed";
  if (
    peakWater.epistemic !== "undisclosed" &&
    typeof peakWater.value === "number" &&
    Number.isFinite(peakWater.value)
  ) {
    waterEpistemic = peakWater.epistemic;
  } else if (
    annualWater.epistemic !== "undisclosed" &&
    typeof annualWater.value === "number" &&
    Number.isFinite(annualWater.value)
  ) {
    waterEpistemic = annualWater.epistemic;
  }

  return {
    id: f.id,
    name: f.name,
    marketCluster: f.marketCluster,
    city: f.city,
    county: f.county,
    state: f.state,
    isoRegion: f.isoRegion,
    coordinates: f.coordinates,
    lifecycleStatus: f.lifecycleStatus,
    catalogTier,
    footprintCoverage,
    developer: f.stakeholders.developer,
    operator: f.stakeholders.operator,
    utilityProvider: f.power.utilityProvider,
    interconnectionStatus: f.power.interconnectionStatus,
    operationalMw: f.power.operationalMw.value,
    operationalMwEpistemic: f.power.operationalMw.epistemic,
    totalPlannedMw: f.power.totalPlannedMw.value,
    totalPlannedMwEpistemic: f.power.totalPlannedMw.epistemic,
    coolingArchitecture: f.waterAndCooling.coolingArchitecture,
    peakOrAvgWaterMgd:
      waterEpistemic === "undisclosed" ? null : peakWater.value,
    annualWaterMgy:
      waterEpistemic === "undisclosed" ? null : annualWater.value,
    waterEpistemic,
    watershedStress: f.waterAndCooling.watershedStress,
    moratoriumOrLitigationActive: f.regulatory.moratoriumOrLitigationActive,
    usgsGaugeSiteId: f.waterAndCooling.usgsGaugeSiteId,
    nwsStationId: f.waterAndCooling.nwsStationId,
    grossSqFt: f.parcel.grossSqFt.value,
    mappedPolygonCount: mappedCount,
    sourceTags:
      f.registryMetadata?.sourceTags ??
      Array.from(new Set(f.sources.map((s) => s.kind))),
    lastVerified: f.lastVerified,
    lastUpdated: f.lastUpdated ?? f.lastVerified,
  };
}

export {
  classifyFacilityMwSplit,
  computeFleetSummary,
  isProposalFacilityItem,
  isVerifiedFacilityItem,
};

const defaultFootprintCounts = countFootprintsByFacility(ALL_FOOTPRINTS);

export const ALL_INDEX_ITEMS: FacilityIndexItem[] =
  rawData.ALL_INDEX_ITEMS ??
  ALL_FACILITIES.map((f) => recordToIndexItem(f, defaultFootprintCounts));

export const FLEET_SUMMARY: FleetSummaryMetadata =
  rawData.FLEET_SUMMARY ?? computeFleetSummary(ALL_INDEX_ITEMS);

export function getFacilityRecordById(id: string): FacilityRecord | undefined {
  if (rawData.getFacilityRecordById) {
    return rawData.getFacilityRecordById(id);
  }
  if (rawData.getFacilityById) {
    return rawData.getFacilityById(id);
  }
  return ALL_FACILITIES.find((f) => f.id === id);
}

export function getFootprintsForFacility(
  facilityId: string,
): GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> {
  if (rawData.getFootprintsForFacility) {
    return rawData.getFootprintsForFacility(facilityId);
  }
  return {
    type: "FeatureCollection",
    features: ALL_FOOTPRINTS.features.filter(
      (feat) => feat.properties.facilityId === facilityId,
    ),
  };
}
