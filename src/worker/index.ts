import type {
  ExecutionContext,
  Fetcher,
  ScheduledController,
} from "@cloudflare/workers-types";
import type {
  ActivityWindow,
  CampusFootprintProps,
  CatalogTier,
  FacilitiesApiResponse,
  FacilitiesIndexApiResponse,
  FacilityDetailApiResponse,
  FacilityIndexItem,
  FacilityRecord,
  FleetSummaryMetadata,
  LiveGridFeed,
  LivePulseFeed,
  PulseStream,
  TelemetrySummaryApiResponse,
} from "../shared/types.ts";
import {
  ALL_FACILITIES,
  ALL_FOOTPRINTS,
  ALL_INDEX_ITEMS,
  FLEET_SUMMARY,
  ISO_REGIONS,
  computeFleetSummary,
  countFootprintsByFacility,
  getFacilityRecordById,
  getFootprintsForFacility,
  isVerifiedFacilityItem,
  recordToIndexItem,
} from "./dataset.ts";
import type { DatasetBundle, Env, TelemetryFetchOptions } from "./env.ts";
import { fetchLiveGridFeed, getGridSnapshotForIso } from "./grid.ts";
import { isWithinActivityWindow, parseActivityWindow } from "./http.ts";
import { ALL_PULSE_STREAMS, fetchLivePulseFeed } from "./pulse.ts";
import { fetchRegulatoryFeed } from "./regulatory.ts";
import {
  fetchFacilityTelemetry,
  fetchTelemetrySummary,
  type TelemetryFacilityLike,
} from "./telemetry.ts";

export type { DatasetBundle, Env } from "./env.ts";

export interface WorkerRuntimeOptions extends TelemetryFetchOptions {
  dataset?: DatasetBundle;
}

const VALID_PULSE_STREAMS = new Set<string>(["all", ...ALL_PULSE_STREAMS]);
const VALID_CATALOG_TIERS = new Set<CatalogTier>([
  "flagship",
  "registry",
  "provisional",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

function splitCsvParam(raw: string | null): Set<string> | null {
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? new Set(parts) : null;
}

function isTruthyParam(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toFacilitiesCsv(
  items: FacilityIndexItem[],
  resolveRecord?: (id: string) => FacilityRecord | undefined,
): string {
  const headers = [
    "id",
    "name",
    "catalogTier",
    "footprintCoverage",
    "marketCluster",
    "city",
    "county",
    "state",
    "isoRegion",
    "lifecycleStatus",
    "lon",
    "lat",
    "operationalMw",
    "operationalMwEpistemic",
    "totalPlannedMw",
    "totalPlannedMwEpistemic",
    "verifiedCapacity",
    "utilityProvider",
    "interconnectionStatus",
    "coolingArchitecture",
    "peakOrAvgWaterMgd",
    "annualWaterMgy",
    "waterEpistemic",
    "watershedStress",
    "usgsGaugeSiteId",
    "nwsStationId",
    "moratoriumOrLitigationActive",
    "developer",
    "operator",
    "grossSqFt",
    "mappedPolygonCount",
    "sourceTags",
    "peeringDbFacId",
    "epaRegistryId",
    "lastVerified",
    "lastUpdated",
  ];

  const rows = items.map((item) => {
    const rec = resolveRecord?.(item.id);
    return [
      item.id,
      item.name,
      item.catalogTier,
      item.footprintCoverage,
      item.marketCluster,
      item.city,
      item.county,
      item.state,
      item.isoRegion,
      item.lifecycleStatus,
      item.coordinates[0],
      item.coordinates[1],
      item.operationalMw,
      item.operationalMwEpistemic,
      item.totalPlannedMw,
      item.totalPlannedMwEpistemic,
      isVerifiedFacilityItem(item),
      item.utilityProvider,
      item.interconnectionStatus,
      item.coolingArchitecture,
      item.peakOrAvgWaterMgd,
      item.annualWaterMgy,
      item.waterEpistemic,
      item.watershedStress,
      item.usgsGaugeSiteId,
      item.nwsStationId,
      item.moratoriumOrLitigationActive,
      item.developer,
      item.operator,
      item.grossSqFt,
      item.mappedPolygonCount,
      item.sourceTags.join(";"),
      rec?.registryMetadata?.peeringDbFacId ?? "",
      rec?.registryMetadata?.epaRegistryId ?? "",
      item.lastVerified,
      item.lastUpdated,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function toFacilitiesGeoJson(
  items: FacilityIndexItem[],
  resolveRecord?: (id: string) => FacilityRecord | undefined,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: items.map((item) => {
      const rec = resolveRecord?.(item.id);
      return {
        type: "Feature",
        id: item.id,
        geometry: {
          type: "Point",
          coordinates: item.coordinates,
        },
        properties: {
          id: item.id,
          name: item.name,
          catalogTier: item.catalogTier,
          footprintCoverage: item.footprintCoverage,
          marketCluster: item.marketCluster,
          city: item.city,
          county: item.county,
          state: item.state,
          isoRegion: item.isoRegion,
          lifecycleStatus: item.lifecycleStatus,
          operationalMw: item.operationalMw,
          operationalMwEpistemic: item.operationalMwEpistemic,
          totalPlannedMw: item.totalPlannedMw,
          totalPlannedMwEpistemic: item.totalPlannedMwEpistemic,
          verifiedCapacity: isVerifiedFacilityItem(item),
          utilityProvider: item.utilityProvider,
          interconnectionStatus: item.interconnectionStatus,
          coolingArchitecture: item.coolingArchitecture,
          peakOrAvgWaterMgd: item.peakOrAvgWaterMgd,
          annualWaterMgy: item.annualWaterMgy,
          waterEpistemic: item.waterEpistemic,
          watershedStress: item.watershedStress,
          moratoriumOrLitigationActive: item.moratoriumOrLitigationActive,
          usgsGaugeSiteId: item.usgsGaugeSiteId,
          nwsStationId: item.nwsStationId,
          developer: item.developer,
          operator: item.operator,
          grossSqFt: item.grossSqFt,
          mappedPolygonCount: item.mappedPolygonCount,
          sourceTags: item.sourceTags,
          peeringDbFacId: rec?.registryMetadata?.peeringDbFacId ?? null,
          epaRegistryId: rec?.registryMetadata?.epaRegistryId ?? null,
          lastVerified: item.lastVerified,
          lastUpdated: item.lastUpdated,
        },
      };
    }),
  };
}

function buildSearchHaystack(
  item: FacilityIndexItem,
  rec?: FacilityRecord,
): string {
  const parts: Array<string | number | undefined | null> = [
    item.id,
    item.name,
    item.marketCluster,
    item.city,
    item.county,
    item.state,
    item.isoRegion,
    item.developer,
    item.operator,
    item.utilityProvider,
    ...item.sourceTags,
  ];
  if (rec) {
    parts.push(
      rec.waterAndCooling.watershedName,
      rec.registryMetadata?.clli,
      rec.registryMetadata?.epaRegistryId,
      rec.registryMetadata?.airIds,
      rec.registryMetadata?.npdesIds,
      rec.registryMetadata?.peeringDbFacId,
      ...rec.stakeholders.anchorTenants.map((t) => t.name),
      ...rec.regulatory.permits.map(
        (p) => `${p.docketOrPermitId} ${p.agency} ${p.title}`,
      ),
    );
  }
  return parts
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" ")
    .toLowerCase();
}

export function filterFacilityIndex(
  items: FacilityIndexItem[],
  params: URLSearchParams,
  resolveRecord?: (id: string) => FacilityRecord | undefined,
): { items: FacilityIndexItem[]; hasFilters: boolean; error?: string } {
  const statusFilter = splitCsvParam(params.get("status"));
  const tierRaw = splitCsvParam(params.get("tier"));
  let tierFilter: Set<CatalogTier> | null = null;
  if (tierRaw) {
    const parsedTiers = new Set<CatalogTier>();
    for (const raw of tierRaw) {
      const normalized = raw.toLowerCase() as CatalogTier;
      if (!VALID_CATALOG_TIERS.has(normalized)) {
        return {
          items: [],
          hasFilters: false,
          error: `Invalid tier "${raw}"; expected flagship, registry, or provisional`,
        };
      }
      parsedTiers.add(normalized);
    }
    tierFilter = parsedTiers;
  }

  const verifiedOnly = isTruthyParam(params.get("verifiedOnly"));
  const windowRaw = params.get("window");
  let activityWindow: ActivityWindow | null = null;
  if (windowRaw !== null && windowRaw.trim() !== "") {
    const parsedWindow = parseActivityWindow(windowRaw);
    if (!parsedWindow) {
      return {
        items: [],
        hasFilters: false,
        error: `Invalid window "${windowRaw}"; expected 24h, 7d, 30d, 90d, or all`,
      };
    }
    activityWindow = parsedWindow;
  }

  const isoFilter = splitCsvParam(params.get("iso"));
  const stateRaw = splitCsvParam(params.get("state"));
  const stateFilter = stateRaw
    ? new Set(Array.from(stateRaw).map((s) => s.toUpperCase()))
    : null;
  const coolingFilter = splitCsvParam(params.get("cooling"));
  const contestedOnly = isTruthyParam(params.get("contested"));
  const undisclosedWaterOnly = isTruthyParam(params.get("undisclosedWater"));
  const q = params.get("q")?.trim().toLowerCase() ?? "";

  const minMwRaw = params.get("minMw");
  let minMw: number | null = null;
  if (minMwRaw !== null && minMwRaw.trim() !== "") {
    const parsed = Number(minMwRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return {
        items: [],
        hasFilters: false,
        error: `Invalid minMw "${minMwRaw}"`,
      };
    }
    minMw = parsed;
  }

  const bboxRaw = params.get("bbox");
  let bbox: [number, number, number, number] | null = null;
  if (bboxRaw !== null && bboxRaw.trim() !== "") {
    const nums = bboxRaw.split(",").map((part) => Number(part.trim()));
    if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
      return {
        items: [],
        hasFilters: false,
        error: `Invalid bbox "${bboxRaw}"; expected minLon,minLat,maxLon,maxLat`,
      };
    }
    bbox = [nums[0], nums[1], nums[2], nums[3]];
  }

  const hasFilters = Boolean(
    statusFilter ||
      tierFilter ||
      verifiedOnly ||
      (activityWindow && activityWindow !== "all") ||
      isoFilter ||
      stateFilter ||
      coolingFilter ||
      contestedOnly ||
      undisclosedWaterOnly ||
      minMw !== null ||
      bbox ||
      q,
  );

  const nowMs = Date.now();
  const filtered = items.filter((item) => {
    if (statusFilter && !statusFilter.has(item.lifecycleStatus)) return false;
    if (tierFilter && !tierFilter.has(item.catalogTier)) return false;
    if (verifiedOnly && !isVerifiedFacilityItem(item)) return false;
    if (activityWindow && activityWindow !== "all") {
      if (!isWithinActivityWindow(item.lastUpdated || item.lastVerified, activityWindow, nowMs)) {
        return false;
      }
    }
    if (isoFilter && !isoFilter.has(item.isoRegion)) return false;
    if (stateFilter && !stateFilter.has(item.state.toUpperCase())) return false;
    if (coolingFilter && !coolingFilter.has(item.coolingArchitecture)) return false;
    if (
      contestedOnly &&
      item.lifecycleStatus !== "contested" &&
      item.lifecycleStatus !== "moratorium" &&
      !item.moratoriumOrLitigationActive
    ) {
      return false;
    }
    if (
      undisclosedWaterOnly &&
      item.waterEpistemic !== "undisclosed" &&
      (item.peakOrAvgWaterMgd !== null || item.annualWaterMgy !== null)
    ) {
      return false;
    }
    if (minMw !== null) {
      const mw = item.totalPlannedMw ?? item.operationalMw ?? 0;
      if (mw < minMw) return false;
    }
    if (bbox) {
      const [lon, lat] = item.coordinates;
      const [minLon, minLat, maxLon, maxLat] = bbox;
      const lonMatch =
        minLon <= maxLon
          ? lon >= minLon && lon <= maxLon
          : lon >= minLon || lon <= maxLon;
      if (!lonMatch || lat < minLat || lat > maxLat) {
        return false;
      }
    }
    if (q) {
      const rec = resolveRecord?.(item.id);
      if (!buildSearchHaystack(item, rec).includes(q)) return false;
    }
    return true;
  });

  return { items: filtered, hasFilters };
}

export function filterFacilities(
  facilities: FacilityRecord[],
  params: URLSearchParams,
): { facilities: FacilityRecord[]; error?: string } {
  const byId = new Map<string, FacilityRecord>(facilities.map((f) => [f.id, f]));
  const indexItems = facilities.map((f) => recordToIndexItem(f));
  const { items, error } = filterFacilityIndex(indexItems, params, (id) =>
    byId.get(id),
  );
  if (error) {
    return { facilities: [], error };
  }
  return {
    facilities: items
      .map((item) => byId.get(item.id))
      .filter((f): f is FacilityRecord => Boolean(f)),
  };
}

function resolveDatasetContext(runtimeOpts: WorkerRuntimeOptions): {
  indexItems: FacilityIndexItem[];
  baseSummary: FleetSummaryMetadata;
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  isoRegions: DatasetBundle["isoRegions"];
  resolveRecord: (id: string) => FacilityRecord | undefined;
  resolveFootprints: (
    id: string,
  ) => GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  isCustomDataset: boolean;
} {
  if (!runtimeOpts.dataset) {
    return {
      indexItems: ALL_INDEX_ITEMS,
      baseSummary: FLEET_SUMMARY,
      footprints: ALL_FOOTPRINTS,
      isoRegions: ISO_REGIONS,
      resolveRecord: (id) => getFacilityRecordById(id),
      resolveFootprints: (id) => getFootprintsForFacility(id),
      isCustomDataset: false,
    };
  }

  const ds = runtimeOpts.dataset;
  const recordById = new Map<string, FacilityRecord>(
    ds.facilities.map((f) => [f.id, f]),
  );
  const fpCounts = countFootprintsByFacility(ds.footprints);
  const indexItems =
    ds.indexItems ?? ds.facilities.map((f) => recordToIndexItem(f, fpCounts));
  const baseSummary = ds.summary ?? computeFleetSummary(indexItems);

  return {
    indexItems,
    baseSummary,
    footprints: ds.footprints,
    isoRegions: ds.isoRegions,
    resolveRecord: (id) => recordById.get(id),
    resolveFootprints: (id) => ({
      type: "FeatureCollection",
      features: ds.footprints.features.filter(
        (feat) => feat.properties.facilityId === id,
      ),
    }),
    isCustomDataset: true,
  };
}

export async function handleRequest(
  request: Request,
  env: Env = {},
  runtimeOpts: WorkerRuntimeOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith("/api/")) {
    if (env.ASSETS) {
      return env.ASSETS.fetch(
        request as unknown as Parameters<Fetcher["fetch"]>[0],
      ) as unknown as Promise<Response>;
    }
    return new Response("Not Found", { status: 404 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const ctx = resolveDatasetContext(runtimeOpts);
  const refresh = isTruthyParam(url.searchParams.get("refresh"));
  const fetchOpts: TelemetryFetchOptions = {
    refresh,
    fetchFn: runtimeOpts.fetchFn,
    timeoutMs: runtimeOpts.timeoutMs,
  };

  if (path === "/api/health") {
    const summary = ctx.baseSummary;
    return jsonResponse({
      status: "ok",
      service: "gridline",
      environment: env.ENVIRONMENT ?? "production",
      release: env.RELEASE ?? "1.0.0",
      facilityCount: summary.totalFacilities,
      statesCovered: summary.statesCovered,
      verifiedOperationalMwTotal: summary.verifiedOperationalMwTotal,
      verifiedPlannedMwTotal: summary.verifiedPlannedMwTotal,
      reportedOrProposedMwTotal: summary.reportedOrProposedMwTotal,
      operationalMwTotal: summary.verifiedOperationalMwTotal,
      plannedMwTotal: summary.verifiedPlannedMwTotal,
      d1Bound: Boolean(env.DB),
      timestamp: new Date().toISOString(),
    });
  }

  if (path === "/api/facilities") {
    const { items: filteredItems, hasFilters, error } = filterFacilityIndex(
      ctx.indexItems,
      url.searchParams,
      ctx.resolveRecord,
    );
    if (error) {
      return jsonResponse({ error: "invalid_query", message: error }, 400);
    }

    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    if (format === "csv") {
      return new Response(toFacilitiesCsv(filteredItems, ctx.resolveRecord), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="gridline-facilities.csv"',
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        },
      });
    }
    if (format === "geojson") {
      return new Response(
        JSON.stringify(toFacilitiesGeoJson(filteredItems, ctx.resolveRecord)),
        {
          status: 200,
          headers: {
            "Content-Type": "application/geo+json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="gridline-facilities.geojson"',
            "Cache-Control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    }
    if (format !== "json") {
      return jsonResponse(
        { error: "invalid_format", message: `Unsupported format "${format}"` },
        400,
      );
    }

    const viewParam = url.searchParams.get("view")?.trim().toLowerCase() ?? "";
    const fullParam = isTruthyParam(url.searchParams.get("full"));
    if (viewParam && viewParam !== "index" && viewParam !== "legacy") {
      return jsonResponse(
        {
          error: "invalid_view",
          message: `Unsupported view "${viewParam}"; expected index or legacy`,
        },
        400,
      );
    }

    if (viewParam === "legacy" || fullParam) {
      const facilities = filteredItems
        .map((item) => ctx.resolveRecord(item.id))
        .filter((f): f is FacilityRecord => Boolean(f));
      const visibleIds = new Set(facilities.map((f) => f.id));
      const footprints: GeoJSON.FeatureCollection<
        GeoJSON.Polygon,
        CampusFootprintProps
      > = {
        type: "FeatureCollection",
        features: ctx.footprints.features.filter((feat) =>
          visibleIds.has(feat.properties.facilityId),
        ),
      };
      const legacyPayload: FacilitiesApiResponse = {
        facilities,
        footprints,
        isoRegions: ctx.isoRegions,
      };
      return jsonResponse(legacyPayload);
    }

    const summary =
      !hasFilters && !ctx.isCustomDataset
        ? ctx.baseSummary
        : computeFleetSummary(filteredItems, ctx.baseSummary.censusGeneratedAt);

    const indexPayload: FacilitiesIndexApiResponse = {
      facilities: filteredItems,
      summary,
      isoRegions: ctx.isoRegions,
    };
    return jsonResponse(indexPayload);
  }

  if (path.startsWith("/api/facilities/")) {
    const rawId = path.slice("/api/facilities/".length);
    if (!rawId || rawId.includes("/")) {
      return jsonResponse({ error: "not_found", path }, 404);
    }
    let id: string;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      return jsonResponse({ error: "invalid_id", rawId }, 400);
    }
    const facility = ctx.resolveRecord(id);
    if (!facility) {
      return jsonResponse({ error: "facility_not_found", id }, 404);
    }
    const footprints = ctx.resolveFootprints(id);
    const [telemetry, gridSnapshot] = await Promise.all([
      fetchFacilityTelemetry(facility, fetchOpts),
      getGridSnapshotForIso(facility.isoRegion, env, fetchOpts),
    ]);

    const detailPayload: FacilityDetailApiResponse = {
      facility,
      footprints,
      telemetry,
      gridSnapshot,
    };
    return jsonResponse(detailPayload);
  }

  if (path === "/api/grid/live") {
    const feed = await fetchLiveGridFeed(env, fetchOpts);
    return jsonResponse(feed);
  }

  if (path === "/api/pulse/live") {
    const rawStream = url.searchParams.get("stream")?.trim().toLowerCase() ?? "all";
    if (!VALID_PULSE_STREAMS.has(rawStream)) {
      return jsonResponse(
        {
          error: "invalid_query",
          message: `Invalid stream "${rawStream}"; expected federal_register, sec_edgar, peeringdb, or all`,
        },
        400,
      );
    }
    const window = parseActivityWindow(url.searchParams.get("window"));
    if (!window) {
      return jsonResponse(
        {
          error: "invalid_query",
          message: `Invalid window "${url.searchParams.get("window")}"; expected 24h, 7d, 30d, 90d, or all`,
        },
        400,
      );
    }
    const feed = await fetchLivePulseFeed(env, {
      ...fetchOpts,
      stream: rawStream as PulseStream | "all",
      window,
      facilities: ctx.indexItems,
    });
    return jsonResponse(feed);
  }

  if (path === "/api/telemetry/summary") {
    const summary = await fetchTelemetrySummary(ctx.indexItems, fetchOpts);
    return jsonResponse(summary);
  }

  if (path === "/api/telemetry/live") {
    const facilityId = url.searchParams.get("facilityId")?.trim();
    if (!facilityId) {
      return jsonResponse({ error: "missing_facility_id" }, 400);
    }
    const target: TelemetryFacilityLike | undefined =
      ctx.resolveRecord(facilityId) ??
      ctx.indexItems.find((item) => item.id === facilityId);
    if (!target) {
      return jsonResponse({ error: "facility_not_found", facilityId }, 404);
    }
    const telemetry = await fetchFacilityTelemetry(target, fetchOpts);
    return jsonResponse(telemetry);
  }

  if (path === "/api/regulatory/live") {
    const feed = await fetchRegulatoryFeed(fetchOpts);
    return jsonResponse(feed);
  }

  return jsonResponse({ error: "not_found", path }, 404);
}

export async function runScheduledIngest(
  env: Env = {},
  opts: TelemetryFetchOptions = {},
): Promise<{
  ranAt: string;
  status: string;
  summary: Record<string, unknown>;
}> {
  const ranAt = new Date().toISOString();
  const refreshOpts: TelemetryFetchOptions = { ...opts, refresh: true };
  const itemsForTelemetry: TelemetryFacilityLike[] =
    ALL_INDEX_ITEMS.length > 0 ? ALL_INDEX_ITEMS : ALL_FACILITIES;

  const [gridSettled, pulseSettled, telemetrySettled] = await Promise.allSettled([
    fetchLiveGridFeed(env, refreshOpts),
    fetchLivePulseFeed(env, {
      ...refreshOpts,
      window: "all",
      facilities: itemsForTelemetry,
    }),
    fetchTelemetrySummary(itemsForTelemetry, refreshOpts),
  ]);

  const gridFeed: LiveGridFeed | null =
    gridSettled.status === "fulfilled" ? gridSettled.value : null;
  const pulseFeed: LivePulseFeed | null =
    pulseSettled.status === "fulfilled" ? pulseSettled.value : null;
  const telemetrySummary: TelemetrySummaryApiResponse | null =
    telemetrySettled.status === "fulfilled" ? telemetrySettled.value : null;

  const gridRegionsLive = gridFeed
    ? Object.values(gridFeed.regions).filter((r) => r?.status === "live").length
    : 0;
  const stationsLive = telemetrySummary
    ? Object.values(telemetrySummary.stations).filter((s) => s.status === "live").length
    : 0;
  const gaugesLive = telemetrySummary
    ? Object.values(telemetrySummary.gauges).filter((g) => g.status === "live").length
    : 0;

  const overallStatus =
    gridFeed?.status === "live" && pulseFeed?.status === "live"
      ? "live"
      : gridRegionsLive > 0 || (pulseFeed?.items.length ?? 0) > 0 || stationsLive > 0
        ? "partial"
        : "degraded";

  const summary = {
    gridStatus: gridFeed?.status ?? "degraded",
    gridRegionsLive,
    pulseStatus: pulseFeed?.status ?? "degraded",
    pulseItemsCount: pulseFeed?.items.length ?? 0,
    pulseStreamStatus: pulseFeed?.streamStatus ?? null,
    telemetryStationsCount: telemetrySummary
      ? Object.keys(telemetrySummary.stations).length
      : 0,
    telemetryStationsLive: stationsLive,
    telemetryGaugesCount: telemetrySummary
      ? Object.keys(telemetrySummary.gauges).length
      : 0,
    telemetryGaugesLive: gaugesLive,
  };

  if (env.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO ingest_runs (ran_at, status, summary_json) VALUES (?, ?, ?)",
      )
        .bind(ranAt, overallStatus, JSON.stringify(summary))
        .run();
    } catch {
      // Audit log insert is best-effort.
    }
  }

  return { ranAt, status: overallStatus, summary };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScheduledIngest(env));
  },
};
