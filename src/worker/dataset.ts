import * as dataModule from "../data/index.ts";
import type {
  CampusFootprintProps,
  CatalogTier,
  EpistemicStatus,
  FacilityIndexItem,
  FacilityRecord,
  FleetSummaryMetadata,
  FootprintCoverage,
  IsoRegion,
  IsoRegionProps,
  LifecycleStatus,
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

export function isVerifiedFacilityItem(item: FacilityIndexItem): boolean {
  return (
    item.catalogTier !== "provisional" &&
    item.lifecycleStatus !== "proposed" &&
    item.operationalMwEpistemic !== "reported" &&
    item.totalPlannedMwEpistemic !== "reported"
  );
}

export function computeFleetSummary(
  items: FacilityIndexItem[],
  censusGeneratedAt = new Date().toISOString(),
): FleetSummaryMetadata {
  const states = new Set<string>();
  const byTier: Record<CatalogTier, number> = {
    flagship: 0,
    registry: 0,
    provisional: 0,
  };
  const byFootprintCoverage: Record<FootprintCoverage, number> = {
    verified_polygons: 0,
    point_only: 0,
  };
  const byIso: Partial<Record<IsoRegion, number>> = {};
  const byStatus: Partial<Record<LifecycleStatus, number>> = {};

  let verifiedOperationalMwTotal = 0;
  let verifiedPlannedMwTotal = 0;
  let reportedOrProposedMwTotal = 0;
  let disclosedWaterFacilityCount = 0;
  let undisclosedWaterFacilityCount = 0;
  let contestedOrMoratoriumCount = 0;

  for (const item of items) {
    if (item.state) {
      states.add(item.state.trim().toUpperCase());
    }
    byTier[item.catalogTier] += 1;
    byFootprintCoverage[item.footprintCoverage] += 1;
    byIso[item.isoRegion] = (byIso[item.isoRegion] ?? 0) + 1;
    byStatus[item.lifecycleStatus] = (byStatus[item.lifecycleStatus] ?? 0) + 1;

    const isSpeculativeStatus =
      item.lifecycleStatus === "proposed" || item.catalogTier === "provisional";

    if (
      typeof item.operationalMw === "number" &&
      Number.isFinite(item.operationalMw)
    ) {
      if (!isSpeculativeStatus && item.operationalMwEpistemic !== "reported") {
        verifiedOperationalMwTotal += item.operationalMw;
      } else if (item.totalPlannedMw === null) {
        reportedOrProposedMwTotal += item.operationalMw;
      }
    }

    if (
      typeof item.totalPlannedMw === "number" &&
      Number.isFinite(item.totalPlannedMw)
    ) {
      if (isSpeculativeStatus || item.totalPlannedMwEpistemic === "reported") {
        reportedOrProposedMwTotal += item.totalPlannedMw;
      } else {
        verifiedPlannedMwTotal += item.totalPlannedMw;
      }
    }

    if (
      item.waterEpistemic !== "undisclosed" &&
      (item.peakOrAvgWaterMgd !== null || item.annualWaterMgy !== null)
    ) {
      disclosedWaterFacilityCount += 1;
    } else {
      undisclosedWaterFacilityCount += 1;
    }

    if (
      item.lifecycleStatus === "contested" ||
      item.lifecycleStatus === "moratorium" ||
      item.moratoriumOrLitigationActive
    ) {
      contestedOrMoratoriumCount += 1;
    }
  }

  return {
    totalFacilities: items.length,
    statesCovered: states.size,
    byTier,
    byFootprintCoverage,
    byIso,
    byStatus,
    verifiedOperationalMwTotal: Math.round(verifiedOperationalMwTotal),
    verifiedPlannedMwTotal: Math.round(verifiedPlannedMwTotal),
    reportedOrProposedMwTotal: Math.round(reportedOrProposedMwTotal),
    disclosedWaterFacilityCount,
    undisclosedWaterFacilityCount,
    contestedOrMoratoriumCount,
    censusGeneratedAt,
  };
}

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
