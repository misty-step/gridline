import type {
  CatalogTier,
  FacilityIndexItem,
  FleetSummaryMetadata,
  FootprintCoverage,
  IsoRegion,
  LifecycleStatus,
} from "./types.ts";

/**
 * Returns true when a campus is strictly verified (excluding provisional sites,
 * unpermitted proposed entries, and campuses carrying press-reported MW).
 */
export function isVerifiedFacilityItem(item: FacilityIndexItem): boolean {
  return (
    item.catalogTier !== "provisional" &&
    item.lifecycleStatus !== "proposed" &&
    item.operationalMwEpistemic !== "reported" &&
    item.totalPlannedMwEpistemic !== "reported"
  );
}

/**
 * Returns true when a campus belongs to the unpermitted / speculative
 * proposal pipeline (`provisional` tier or `proposed` lifecycle status).
 */
export function isProposalFacilityItem(item: FacilityIndexItem): boolean {
  return item.catalogTier === "provisional" || item.lifecycleStatus === "proposed";
}

/**
 * Splits a campus's capacity into strictly verified operational MW, verified
 * planned MW, and reported/proposed MW so hybrid campuses (e.g. verified
 * operational MW paired with a press-reported expansion) never cross-contaminate.
 */
export function classifyFacilityMwSplit(item: FacilityIndexItem): {
  verifiedOperationalMw: number;
  verifiedPlannedMw: number;
  reportedOrProposedMw: number;
} {
  let verifiedOperationalMw = 0;
  let verifiedPlannedMw = 0;
  let reportedOrProposedMw = 0;

  const isSpeculativeStatus = isProposalFacilityItem(item);

  if (
    typeof item.operationalMw === "number" &&
    Number.isFinite(item.operationalMw)
  ) {
    if (!isSpeculativeStatus && item.operationalMwEpistemic !== "reported") {
      verifiedOperationalMw += item.operationalMw;
    } else if (item.totalPlannedMw === null) {
      reportedOrProposedMw += item.operationalMw;
    }
  }

  if (
    typeof item.totalPlannedMw === "number" &&
    Number.isFinite(item.totalPlannedMw)
  ) {
    if (isSpeculativeStatus || item.totalPlannedMwEpistemic === "reported") {
      reportedOrProposedMw += item.totalPlannedMw;
    } else {
      verifiedPlannedMw += item.totalPlannedMw;
    }
  }

  return { verifiedOperationalMw, verifiedPlannedMw, reportedOrProposedMw };
}

/**
 * Computes canonical FleetSummaryMetadata across a FacilityIndexItem[] slice.
 */
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

    const split = classifyFacilityMwSplit(item);
    verifiedOperationalMwTotal += split.verifiedOperationalMw;
    verifiedPlannedMwTotal += split.verifiedPlannedMw;
    reportedOrProposedMwTotal += split.reportedOrProposedMw;

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
