import {
  classifyFacilityMwSplit,
  isProposalFacilityItem,
  isVerifiedFacilityItem,
} from "@shared/fleet";
import type {
  ActivityWindow,
  CatalogTier,
  CoolingArchitecture,
  EpistemicStatus,
  FacilityIndexItem,
  FleetSummaryMetadata,
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

const WINDOW_MS: Record<Exclude<ActivityWindow, "all">, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
  "90d": 90 * 24 * 3600_000,
};

const TIER_RANK: Record<CatalogTier, number> = {
  flagship: 3,
  registry: 2,
  provisional: 1,
};

const WATERSHED_STRESS_RANK: Record<WatershedStress, number> = {
  low: 1,
  low_medium: 2,
  medium_high: 3,
  high: 4,
  extremely_high: 5,
};

export function isVerifiedEpistemic(epistemic: EpistemicStatus): boolean {
  return (
    epistemic === "measured" ||
    epistemic === "permitted" ||
    epistemic === "filed" ||
    epistemic === "disclosed" ||
    epistemic === "estimated"
  );
}

export const isVerifiedFacility = isVerifiedFacilityItem;

export const isProposalFacility = isProposalFacilityItem;

export function isContestedOrMoratorium(f: FacilityIndexItem): boolean {
  return (
    f.lifecycleStatus === "contested" ||
    f.lifecycleStatus === "moratorium" ||
    f.moratoriumOrLitigationActive
  );
}

export function isUndisclosedWater(f: FacilityIndexItem): boolean {
  return (
    f.waterEpistemic === "undisclosed" ||
    (f.peakOrAvgWaterMgd === null && f.annualWaterMgy === null)
  );
}

export function isUndisclosedWaterAlert(f: FacilityIndexItem): boolean {
  if (!isUndisclosedWater(f)) return false;
  const mw = f.totalPlannedMw ?? f.operationalMw ?? 0;
  return (
    f.catalogTier === "flagship" ||
    f.catalogTier === "provisional" ||
    f.lifecycleStatus === "proposed" ||
    mw >= 20
  );
}

export function isWithinActivityWindow(
  isoDate: string | null | undefined,
  window: ActivityWindow,
  nowMs = Date.now(),
): boolean {
  if (window === "all") return true;
  if (!isoDate) return false;
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= WINDOW_MS[window];
}

export function isRadarHighlightedActivity(
  f: FacilityIndexItem,
  radarWindow: ActivityWindow,
  nowMs = Date.now(),
): boolean {
  const activePipeline =
    f.lifecycleStatus === "proposed" ||
    f.lifecycleStatus === "contested" ||
    f.lifecycleStatus === "moratorium" ||
    f.lifecycleStatus === "under_construction" ||
    f.catalogTier === "provisional";

  const horizon: ActivityWindow = radarWindow === "all" ? "30d" : radarWindow;
  const recentlyUpdated = isWithinActivityWindow(
    f.lastUpdated || f.lastVerified,
    horizon,
    nowMs,
  );

  if (radarWindow === "all") {
    return activePipeline || recentlyUpdated;
  }
  return recentlyUpdated || (activePipeline && radarWindow === "90d");
}

export function matchesSearchQuery(f: FacilityIndexItem, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (
    f.id.toLowerCase().includes(q) ||
    f.name.toLowerCase().includes(q) ||
    f.marketCluster.toLowerCase().includes(q) ||
    f.city.toLowerCase().includes(q) ||
    f.county.toLowerCase().includes(q) ||
    f.state.toLowerCase().includes(q) ||
    f.isoRegion.toLowerCase().includes(q) ||
    f.developer.toLowerCase().includes(q) ||
    f.operator.toLowerCase().includes(q) ||
    f.utilityProvider.toLowerCase().includes(q)
  ) {
    return true;
  }
  for (const tag of f.sourceTags) {
    if (tag.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function filterFacilities(
  facilities: FacilityIndexItem[],
  filters: FilterState,
): FacilityIndexItem[] {
  const nowMs = Date.now();
  const statusSet = filters.statuses.length > 0 ? new Set(filters.statuses) : null;
  const tierSet = filters.tiers.length > 0 ? new Set(filters.tiers) : null;
  const isoSet = filters.isos.length > 0 ? new Set(filters.isos) : null;
  const stateSet =
    filters.states.length > 0
      ? new Set(filters.states.map((s) => s.toUpperCase()))
      : null;
  const coolingSet =
    filters.coolings.length > 0 ? new Set(filters.coolings) : null;
  const trimmedQ = filters.q.trim();

  const filtered = facilities.filter((f) => {
    if (statusSet && !statusSet.has(f.lifecycleStatus)) return false;
    if (tierSet && !tierSet.has(f.catalogTier)) return false;
    if (filters.verifiedOnly && !isVerifiedFacility(f)) return false;
    if (filters.proposalsOnly && !isProposalFacility(f)) return false;
    if (
      filters.window !== "all" &&
      !isWithinActivityWindow(f.lastUpdated || f.lastVerified, filters.window, nowMs)
    ) {
      return false;
    }
    if (isoSet && !isoSet.has(f.isoRegion)) return false;
    if (stateSet && !stateSet.has(f.state.toUpperCase())) return false;
    if (coolingSet && !coolingSet.has(f.coolingArchitecture)) return false;
    if (filters.contestedOnly && !isContestedOrMoratorium(f)) return false;
    if (filters.undisclosedWaterOnly && !isUndisclosedWater(f)) return false;
    if (filters.minMw !== null) {
      const mw = f.totalPlannedMw ?? f.operationalMw ?? 0;
      if (mw < filters.minMw) return false;
    }
    if (trimmedQ && !matchesSearchQuery(f, trimmedQ)) return false;
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (filters.sort) {
      case "planned_mw": {
        const av = a.totalPlannedMw ?? a.operationalMw ?? -1;
        const bv = b.totalPlannedMw ?? b.operationalMw ?? -1;
        if (bv !== av) return bv - av;
        const tierDiff = (TIER_RANK[b.catalogTier] ?? 0) - (TIER_RANK[a.catalogTier] ?? 0);
        if (tierDiff !== 0) return tierDiff;
        return a.name.localeCompare(b.name);
      }
      case "operational_mw": {
        const av = a.operationalMw ?? -1;
        const bv = b.operationalMw ?? -1;
        if (bv !== av) return bv - av;
        const tierDiff = (TIER_RANK[b.catalogTier] ?? 0) - (TIER_RANK[a.catalogTier] ?? 0);
        if (tierDiff !== 0) return tierDiff;
        return a.name.localeCompare(b.name);
      }
      case "water_mgd": {
        const av =
          a.peakOrAvgWaterMgd ??
          (a.annualWaterMgy !== null ? a.annualWaterMgy / 365 : -1);
        const bv =
          b.peakOrAvgWaterMgd ??
          (b.annualWaterMgy !== null ? b.annualWaterMgy / 365 : -1);
        if (bv !== av) return bv - av;
        return a.name.localeCompare(b.name);
      }
      case "updated": {
        const ats = Date.parse(a.lastUpdated || a.lastVerified) || 0;
        const bts = Date.parse(b.lastUpdated || b.lastVerified) || 0;
        if (bts !== ats) return bts - ats;
        const av = a.totalPlannedMw ?? a.operationalMw ?? -1;
        const bv = b.totalPlannedMw ?? b.operationalMw ?? -1;
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
  facility: Pick<FacilityIndexItem, "coordinates">,
  bounds: MapBoundsTuple | null,
): boolean {
  if (!bounds) return true;
  const [lon, lat] = facility.coordinates;
  const [west, south, east, north] = bounds;
  if (west <= east) {
    return lon >= west && lon <= east && lat >= south && lat <= north;
  }
  return (lon >= west || lon <= east) && lat >= south && lat <= north;
}

export function computeViewportMetrics(
  facilities: FacilityIndexItem[],
): ViewportMetrics {
  let verifiedFacilityCount = 0;
  let verifiedOperationalMw = 0;
  let verifiedPlannedMw = 0;
  let proposedFacilityCount = 0;
  let reportedOrProposedMw = 0;
  let contestedOrMoratoriumCount = 0;
  let disclosedPeakWaterMgd = 0;
  let undisclosedWaterCount = 0;
  const stateSet = new Set<string>();

  for (const f of facilities) {
    if (f.state) stateSet.add(f.state.toUpperCase());

    if (isVerifiedFacility(f)) {
      verifiedFacilityCount += 1;
    }
    if (isProposalFacility(f)) {
      proposedFacilityCount += 1;
    }
    const mwSplit = classifyFacilityMwSplit(f);
    verifiedOperationalMw += mwSplit.verifiedOperationalMw;
    verifiedPlannedMw += mwSplit.verifiedPlannedMw;
    reportedOrProposedMw += mwSplit.reportedOrProposedMw;

    if (isContestedOrMoratorium(f)) {
      contestedOrMoratoriumCount += 1;
    }
    if (isUndisclosedWater(f)) {
      undisclosedWaterCount += 1;
    } else {
      disclosedPeakWaterMgd +=
        f.peakOrAvgWaterMgd ?? (f.annualWaterMgy !== null ? f.annualWaterMgy / 365 : 0);
    }
  }

  const roundedOp = Math.round(verifiedOperationalMw);
  const roundedPlan = Math.round(verifiedPlannedMw);

  return {
    facilityCount: facilities.length,
    verifiedFacilityCount,
    verifiedOperationalMw: roundedOp,
    verifiedPlannedMw: roundedPlan,
    proposedFacilityCount,
    reportedOrProposedMw: Math.round(reportedOrProposedMw),
    statesCovered: stateSet.size,
    contestedOrMoratoriumCount,
    disclosedPeakWaterMgd: Math.round(disclosedPeakWaterMgd * 100) / 100,
    undisclosedWaterCount,
    operationalMw: roundedOp,
    plannedMw: roundedPlan,
  };
}

export function computeFleetSummaryFromIndex(
  facilities: FacilityIndexItem[],
): FleetSummaryMetadata {
  const metrics = computeViewportMetrics(facilities);
  const byTier: Record<CatalogTier, number> = {
    flagship: 0,
    registry: 0,
    provisional: 0,
  };
  const byFootprintCoverage: Record<"verified_polygons" | "point_only", number> = {
    verified_polygons: 0,
    point_only: 0,
  };
  const byIso: Partial<Record<IsoRegion, number>> = {};
  const byStatus: Partial<Record<LifecycleStatus, number>> = {};
  let latestDate = "";

  for (const f of facilities) {
    byTier[f.catalogTier] += 1;
    byFootprintCoverage[f.footprintCoverage] += 1;
    byIso[f.isoRegion] = (byIso[f.isoRegion] ?? 0) + 1;
    byStatus[f.lifecycleStatus] = (byStatus[f.lifecycleStatus] ?? 0) + 1;
    const d = f.lastUpdated || f.lastVerified;
    if (d && d > latestDate) latestDate = d;
  }

  return {
    totalFacilities: facilities.length,
    statesCovered: metrics.statesCovered,
    byTier,
    byFootprintCoverage,
    byIso,
    byStatus,
    verifiedOperationalMwTotal: metrics.verifiedOperationalMw,
    verifiedPlannedMwTotal: metrics.verifiedPlannedMw,
    reportedOrProposedMwTotal: metrics.reportedOrProposedMw,
    disclosedWaterFacilityCount: facilities.length - metrics.undisclosedWaterCount,
    undisclosedWaterFacilityCount: metrics.undisclosedWaterCount,
    contestedOrMoratoriumCount: metrics.contestedOrMoratoriumCount,
    censusGeneratedAt: latestDate || new Date().toISOString(),
  };
}

export function buildMarketClusters(
  facilities: FacilityIndexItem[],
  radarWindow: ActivityWindow = "all",
): MarketClusterSummary[] {
  const nowMs = Date.now();
  const byCluster = new Map<string, FacilityIndexItem[]>();
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
    let verifiedCount = 0;
    let operationalMw = 0;
    let plannedMw = 0;
    let reportedOrProposedMw = 0;
    let contestedCount = 0;
    let undisclosedWaterCount = 0;
    let disclosedWaterMgd = 0;
    let recentActivityCount = 0;
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
      const w = Math.max(f.totalPlannedMw ?? f.operationalMw ?? 25, 25);
      weightSum += w;
      lonSum += lon * w;
      latSum += lat * w;

      if (isVerifiedFacility(f)) {
        verifiedCount += 1;
      }
      const mwSplit = classifyFacilityMwSplit(f);
      operationalMw += mwSplit.verifiedOperationalMw;
      plannedMw += mwSplit.verifiedPlannedMw;
      reportedOrProposedMw += mwSplit.reportedOrProposedMw;

      if (isContestedOrMoratorium(f)) contestedCount += 1;
      if (isUndisclosedWater(f)) {
        undisclosedWaterCount += 1;
      } else {
        disclosedWaterMgd +=
          f.peakOrAvgWaterMgd ?? (f.annualWaterMgy !== null ? f.annualWaterMgy / 365 : 0);
      }
      if (isRadarHighlightedActivity(f, radarWindow, nowMs)) {
        recentActivityCount += 1;
      }

      const stressRank = WATERSHED_STRESS_RANK[f.watershedStress] ?? 1;
      if (stressRank > maxStressRank) {
        maxStressRank = stressRank;
        maxWatershedStress = f.watershedStress;
      }
      gridMw.set(f.interconnectionStatus, (gridMw.get(f.interconnectionStatus) ?? 0) + w);

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

    let dominantGridStatus: string = items[0].interconnectionStatus;
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
      verifiedCount,
      operationalMw: Math.round(operationalMw),
      plannedMw: Math.round(plannedMw),
      reportedOrProposedMw: Math.round(reportedOrProposedMw),
      contestedCount,
      undisclosedWaterCount,
      disclosedWaterMgd: Math.round(disclosedWaterMgd * 100) / 100,
      recentActivityCount,
      maxWatershedStress,
      dominantGridStatus,
      primaryIso,
      bounds: [minLon, minLat, maxLon, maxLat],
    });
  }

  summaries.sort(
    (a, b) =>
      b.plannedMw + b.reportedOrProposedMw - (a.plannedMw + a.reportedOrProposedMw) ||
      b.facilityCount - a.facilityCount ||
      a.clusterName.localeCompare(b.clusterName),
  );
  return summaries;
}

export function buildMarketClustersGeoJson(
  clusters: MarketClusterSummary[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const multiSite = clusters.filter((c) => c.facilityCount >= 2);
  const selected = (multiSite.length > 0 ? multiSite : clusters).slice(0, 48);

  return {
    type: "FeatureCollection",
    features: selected.map((c) => {
      const totalLoad = Math.max(c.plannedMw + c.reportedOrProposedMw, 25);
      const radiusOuter = Math.max(11, Math.min(32, 8 + Math.sqrt(totalLoad) * 0.4));
      const ratio =
        c.operationalMw > 0
          ? Math.min(1, c.operationalMw / Math.max(totalLoad, c.operationalMw, 1))
          : 0;
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
          verifiedCount: c.verifiedCount,
          operationalMw: c.operationalMw,
          plannedMw: c.plannedMw,
          reportedOrProposedMw: c.reportedOrProposedMw,
          contestedCount: c.contestedCount,
          undisclosedWaterCount: c.undisclosedWaterCount,
          disclosedWaterMgd: c.disclosedWaterMgd,
          recentActivityCount: c.recentActivityCount,
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
  facilities: FacilityIndexItem[],
  radarWindow: ActivityWindow = "all",
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const nowMs = Date.now();
  return {
    type: "FeatureCollection",
    features: facilities.map((f) => {
      const hasKnownMw =
        (f.totalPlannedMw !== null && Number.isFinite(f.totalPlannedMw)) ||
        (f.operationalMw !== null && Number.isFinite(f.operationalMw));
      const planned = f.totalPlannedMw ?? f.operationalMw ?? 0;
      const operational = f.operationalMw ?? 0;

      const radiusOuter = hasKnownMw
        ? Math.max(5.5, Math.min(22, 4.2 + Math.sqrt(Math.max(planned, 10)) * 0.37))
        : 4;
      const ratio =
        hasKnownMw && operational > 0
          ? Math.min(1, operational / Math.max(planned, operational, 1))
          : 0;
      const radiusInner = hasKnownMw
        ? ratio > 0
          ? Math.max(3, radiusOuter * Math.sqrt(ratio))
          : 0
        : 4;

      const contestedFlag = isContestedOrMoratorium(f) ? 1 : 0;
      const undisclosedWaterFlag = isUndisclosedWater(f) ? 1 : 0;
      const undisclosedWaterAlertFlag = isUndisclosedWaterAlert(f) ? 1 : 0;
      const isProvisionalOrProposed = isProposalFacility(f) ? 1 : 0;
      const recentActivityFlag = isRadarHighlightedActivity(f, radarWindow, nowMs)
        ? 1
        : 0;

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
          catalogTier: f.catalogTier,
          footprintCoverage: f.footprintCoverage,
          watershedStress: f.watershedStress,
          coolingArchitecture: f.coolingArchitecture,
          interconnectionStatus: f.interconnectionStatus,
          operationalMw: operational,
          totalPlannedMw: planned,
          hasKnownMw: hasKnownMw ? 1 : 0,
          isProvisionalOrProposed,
          radiusOuter,
          radiusInner,
          contestedFlag,
          undisclosedWaterFlag,
          undisclosedWaterAlertFlag,
          recentActivityFlag,
        },
      };
    }),
  };
}

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.q.trim().length > 0 ||
    filters.statuses.length > 0 ||
    filters.tiers.length > 0 ||
    filters.verifiedOnly ||
    filters.proposalsOnly ||
    filters.window !== "all" ||
    filters.isos.length > 0 ||
    filters.states.length > 0 ||
    filters.coolings.length > 0 ||
    filters.contestedOnly ||
    filters.undisclosedWaterOnly ||
    filters.minMw !== null
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
  if (filters.proposalsOnly) {
    params.set("proposalsOnly", "1");
  }
  if (filters.tiers.length > 0) {
    params.set("tier", filters.tiers.join(","));
  }
  if (filters.verifiedOnly) {
    params.set("verifiedOnly", "1");
  }
  if (filters.window !== "all") {
    params.set("window", filters.window);
  }
  if (filters.isos.length > 0) {
    params.set("iso", filters.isos.join(","));
  }
  if (filters.states.length > 0) {
    params.set("state", filters.states.join(","));
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
  if (filters.minMw !== null && Number.isFinite(filters.minMw)) {
    params.set("minMw", String(filters.minMw));
  }
  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }
  return `/api/facilities?${params.toString()}`;
}

export function toggleArrayItem<
  T extends LifecycleStatus | CatalogTier | IsoRegion | CoolingArchitecture | string,
>(items: T[], target: T): T[] {
  return items.includes(target)
    ? items.filter((item) => item !== target)
    : [...items, target];
}
