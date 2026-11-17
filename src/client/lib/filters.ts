import type {
  CoolingArchitecture,
  FacilityRecord,
  IsoRegion,
  LifecycleStatus,
  WatershedStress,
} from "@shared/types";
import type {
  FilterState,
  MapBoundsTuple,
  MarketClusterSummary,
  ViewportMetrics,
} from "./types";

export function isContestedOrMoratorium(f: FacilityRecord): boolean {
  return (
    f.lifecycleStatus === "contested" ||
    f.lifecycleStatus === "moratorium" ||
    f.regulatory.moratoriumOrLitigationActive
  );
}

export function isUndisclosedWater(f: FacilityRecord): boolean {
  return (
    f.waterAndCooling.peakOrAvgWaterMgd.epistemic === "undisclosed" ||
    f.waterAndCooling.annualWaterMgy.epistemic === "undisclosed" ||
    f.waterAndCooling.peakOrAvgWaterMgd.value === null
  );
}

export function matchesSearchQuery(f: FacilityRecord, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const haystacks: string[] = [
    f.id,
    f.name,
    f.marketCluster,
    f.city,
    f.county,
    f.state,
    f.isoRegion,
    f.stakeholders.developer,
    f.stakeholders.operator,
    f.power.utilityProvider,
    f.waterAndCooling.watershedName,
    ...f.stakeholders.anchorTenants.map((t) => t.name),
    ...f.regulatory.permits.flatMap((p) => [p.docketOrPermitId, p.agency, p.title]),
  ];
  return haystacks.some((val) => val.toLowerCase().includes(q));
}

export function filterFacilities(
  facilities: FacilityRecord[],
  filters: FilterState,
): FacilityRecord[] {
  const filtered = facilities.filter((f) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(f.lifecycleStatus)) {
      return false;
    }
    if (filters.isos.length > 0 && !filters.isos.includes(f.isoRegion)) {
      return false;
    }
    if (
      filters.coolings.length > 0 &&
      !filters.coolings.includes(f.waterAndCooling.coolingArchitecture)
    ) {
      return false;
    }
    if (filters.contestedOnly && !isContestedOrMoratorium(f)) {
      return false;
    }
    if (filters.undisclosedWaterOnly && !isUndisclosedWater(f)) {
      return false;
    }
    if (filters.q && !matchesSearchQuery(f, filters.q)) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (filters.sort) {
      case "planned_mw": {
        const av = a.power.totalPlannedMw.value ?? a.power.operationalMw.value ?? -1;
        const bv = b.power.totalPlannedMw.value ?? b.power.operationalMw.value ?? -1;
        if (bv !== av) return bv - av;
        return a.name.localeCompare(b.name);
      }
      case "operational_mw": {
        const av = a.power.operationalMw.value ?? -1;
        const bv = b.power.operationalMw.value ?? -1;
        if (bv !== av) return bv - av;
        return a.name.localeCompare(b.name);
      }
      case "water_mgd": {
        const av = a.waterAndCooling.peakOrAvgWaterMgd.value ?? -1;
        const bv = b.waterAndCooling.peakOrAvgWaterMgd.value ?? -1;
        if (bv !== av) return bv - av;
        return a.name.localeCompare(b.name);
      }
      case "name":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return sorted;
}

export function isFacilityInBounds(
  facility: FacilityRecord,
  bounds: MapBoundsTuple | null,
): boolean {
  if (!bounds) return true;
  const [lon, lat] = facility.coordinates;
  const [west, south, east, north] = bounds;
  if (west <= east) {
    return lon >= west && lon <= east && lat >= south && lat <= north;
  }
  // Handle antimeridian wrap defensively
  return (lon >= west || lon <= east) && lat >= south && lat <= north;
}

export function computeViewportMetrics(
  facilities: FacilityRecord[],
): ViewportMetrics {
  let operationalMw = 0;
  let plannedMw = 0;
  let contestedOrMoratoriumCount = 0;
  let disclosedPeakWaterMgd = 0;
  let undisclosedWaterCount = 0;

  for (const f of facilities) {
    operationalMw += f.power.operationalMw.value ?? 0;
    plannedMw += f.power.totalPlannedMw.value ?? f.power.operationalMw.value ?? 0;
    if (
      f.lifecycleStatus === "contested" ||
      f.lifecycleStatus === "moratorium" ||
      f.regulatory.moratoriumOrLitigationActive
    ) {
      contestedOrMoratoriumCount += 1;
    }
    if (isUndisclosedWater(f)) {
      undisclosedWaterCount += 1;
    } else {
      disclosedPeakWaterMgd += f.waterAndCooling.peakOrAvgWaterMgd.value ?? 0;
    }
  }

  return {
    facilityCount: facilities.length,
    operationalMw: Math.round(operationalMw),
    plannedMw: Math.round(plannedMw),
    contestedOrMoratoriumCount,
    disclosedPeakWaterMgd: Math.round(disclosedPeakWaterMgd * 100) / 100,
    undisclosedWaterCount,
  };
}

const WATERSHED_STRESS_RANK: Record<WatershedStress, number> = {
  low: 1,
  low_medium: 2,
  medium_high: 3,
  high: 4,
  extremely_high: 5,
};

export function buildMarketClusters(
  facilities: FacilityRecord[],
): MarketClusterSummary[] {
  const byCluster = new Map<string, FacilityRecord[]>();
  for (const f of facilities) {
    const key = f.marketCluster || `${f.city}, ${f.state}`;
    const list = byCluster.get(key);
    if (list) list.push(f);
    else byCluster.set(key, [f]);
  }

  const summaries: MarketClusterSummary[] = [];
  for (const [clusterName, items] of byCluster.entries()) {
    let weightSum = 0;
    let lonSum = 0;
    let latSum = 0;
    let operationalMw = 0;
    let plannedMw = 0;
    let contestedCount = 0;
    let undisclosedWaterCount = 0;
    let disclosedWaterMgd = 0;
    let maxWatershedStress: WatershedStress = "low";
    let maxStressRank = 0;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    const isoCount = new Map<IsoRegion, number>();
    const gridMw = new Map<string, number>();

    for (const f of items) {
      const [lon, lat] = f.coordinates;
      const w = Math.max(f.power.totalPlannedMw.value ?? f.power.operationalMw.value ?? 50, 50);
      weightSum += w;
      lonSum += lon * w;
      latSum += lat * w;
      operationalMw += f.power.operationalMw.value ?? 0;
      plannedMw += f.power.totalPlannedMw.value ?? f.power.operationalMw.value ?? 0;
      if (isContestedOrMoratorium(f)) contestedCount += 1;
      if (isUndisclosedWater(f)) {
        undisclosedWaterCount += 1;
      } else {
        disclosedWaterMgd += f.waterAndCooling.peakOrAvgWaterMgd.value ?? 0;
      }
      const stressRank = WATERSHED_STRESS_RANK[f.waterAndCooling.watershedStress] ?? 1;
      if (stressRank > maxStressRank) {
        maxStressRank = stressRank;
        maxWatershedStress = f.waterAndCooling.watershedStress;
      }
      const gridKey = f.power.interconnectionStatus;
      gridMw.set(gridKey, (gridMw.get(gridKey) ?? 0) + w);

      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
      isoCount.set(f.isoRegion, (isoCount.get(f.isoRegion) ?? 0) + 1);
    }

    let primaryIso: IsoRegion = items[0].isoRegion;
    let bestIsoCount = 0;
    for (const [iso, count] of isoCount.entries()) {
      if (count > bestIsoCount) {
        bestIsoCount = count;
        primaryIso = iso;
      }
    }

    let dominantGridStatus: string = items[0].power.interconnectionStatus;
    let bestGridMw = -1;
    for (const [status, mw] of gridMw.entries()) {
      if (mw > bestGridMw) {
        bestGridMw = mw;
        dominantGridStatus = status;
      }
    }

    summaries.push({
      clusterName,
      coordinates: [lonSum / weightSum, latSum / weightSum],
      facilityCount: items.length,
      operationalMw: Math.round(operationalMw),
      plannedMw: Math.round(plannedMw),
      contestedCount,
      undisclosedWaterCount,
      disclosedWaterMgd: Math.round(disclosedWaterMgd * 100) / 100,
      maxWatershedStress,
      dominantGridStatus,
      primaryIso,
      bounds: [minLon, minLat, maxLon, maxLat],
    });
  }

  summaries.sort((a, b) => b.plannedMw - a.plannedMw);
  return summaries;
}

export function buildMarketClustersGeoJson(
  clusters: MarketClusterSummary[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: clusters.map((c) => {
      const planned = Math.max(c.plannedMw, 25);
      const radiusOuter = Math.max(11, Math.min(34, 8 + Math.sqrt(planned) * 0.45));
      const ratio = c.operationalMw > 0 ? Math.min(1, c.operationalMw / Math.max(c.plannedMw, c.operationalMw, 1)) : 0;
      const radiusInner = ratio > 0 ? Math.max(4, radiusOuter * Math.sqrt(ratio)) : 0;
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: c.coordinates,
        },
        properties: {
          clusterName: c.clusterName,
          facilityCount: c.facilityCount,
          operationalMw: c.operationalMw,
          plannedMw: c.plannedMw,
          contestedCount: c.contestedCount,
          undisclosedWaterCount: c.undisclosedWaterCount,
          disclosedWaterMgd: c.disclosedWaterMgd,
          maxWatershedStress: c.maxWatershedStress,
          dominantGridStatus: c.dominantGridStatus,
          primaryIso: c.primaryIso,
          radiusOuter,
          radiusInner,
          minLon: c.bounds[0],
          minLat: c.bounds[1],
          maxLon: c.bounds[2],
          maxLat: c.bounds[3],
        },
      };
    }),
  };
}

export function buildFacilitiesGeoJson(
  facilities: FacilityRecord[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: facilities.map((f) => {
      const planned = f.power.totalPlannedMw.value ?? f.power.operationalMw.value ?? 80;
      const operational = f.power.operationalMw.value ?? 0;
      const radiusOuter = Math.max(6.5, Math.min(23, 4.5 + Math.sqrt(Math.max(planned, 15)) * 0.39));
      const ratio = operational > 0 ? Math.min(1, operational / Math.max(planned, operational, 1)) : 0;
      const radiusInner = ratio > 0 ? Math.max(3.2, radiusOuter * Math.sqrt(ratio)) : 0;
      const contestedFlag = isContestedOrMoratorium(f) ? 1 : 0;
      const undisclosedWaterFlag = isUndisclosedWater(f) ? 1 : 0;

      return {
        type: "Feature",
        id: f.id,
        geometry: {
          type: "Point",
          coordinates: f.coordinates,
        },
        properties: {
          id: f.id,
          name: f.name,
          marketCluster: f.marketCluster,
          city: f.city,
          state: f.state,
          isoRegion: f.isoRegion,
          lifecycleStatus: f.lifecycleStatus,
          watershedStress: f.waterAndCooling.watershedStress,
          coolingArchitecture: f.waterAndCooling.coolingArchitecture,
          interconnectionStatus: f.power.interconnectionStatus,
          operationalMw: operational,
          totalPlannedMw: planned,
          radiusOuter,
          radiusInner,
          contestedFlag,
          undisclosedWaterFlag,
        },
      };
    }),
  };
}

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.q.trim().length > 0 ||
    filters.statuses.length > 0 ||
    filters.isos.length > 0 ||
    filters.coolings.length > 0 ||
    filters.contestedOnly ||
    filters.undisclosedWaterOnly
  );
}

export function buildFacilityExportUrl(
  format: "csv" | "geojson",
  filters: FilterState,
): string {
  const params = new URLSearchParams();
  params.set("format", format);
  if (filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.isos.length > 0) {
    params.set("iso", filters.isos.join(","));
  }
  if (filters.coolings.length > 0) {
    params.set("cooling", filters.coolings.join(","));
  }
  if (filters.contestedOnly) {
    params.set("contested", "1");
  }
  if (filters.undisclosedWaterOnly) {
    params.set("undisclosedWater", "1");
  }
  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }
  return `/api/facilities?${params.toString()}`;
}

export function toggleArrayItem<T extends LifecycleStatus | IsoRegion | CoolingArchitecture>(
  items: T[],
  target: T,
): T[] {
  return items.includes(target)
    ? items.filter((item) => item !== target)
    : [...items, target];
}
