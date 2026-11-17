import type { ExecutionContext, Fetcher, ScheduledController } from "@cloudflare/workers-types";
import {
  ALL_FACILITIES,
  ALL_FOOTPRINTS,
  ISO_REGIONS,
  getFootprintsForFacility,
} from "../data/index.ts";
import type {
  CampusFootprintProps,
  FacilityRecord,
  IsoRegionProps,
} from "../shared/types.ts";
import { fetchRegulatoryFeed } from "./regulatory.ts";
import {
  fetchFacilityTelemetry,
  fetchTelemetrySummary,
  type TelemetryFetchOptions,
} from "./telemetry.ts";

export interface Env {
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  RELEASE?: string;
}

export interface DatasetBundle {
  facilities: FacilityRecord[];
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  isoRegions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, IsoRegionProps>;
}

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

function toFacilitiesCsv(facilities: FacilityRecord[]): string {
  const headers = [
    "id",
    "name",
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
    "utilityProvider",
    "interconnectionStatus",
    "coolingArchitecture",
    "peakOrAvgWaterMgd",
    "peakWaterEpistemic",
    "annualWaterMgy",
    "annualWaterEpistemic",
    "pue",
    "watershedStress",
    "usgsGaugeSiteId",
    "nwsStationId",
    "moratoriumOrLitigationActive",
    "developer",
    "operator",
    "lastVerified",
  ];

  const rows = facilities.map((f) =>
    [
      f.id,
      f.name,
      f.marketCluster,
      f.city,
      f.county,
      f.state,
      f.isoRegion,
      f.lifecycleStatus,
      f.coordinates[0],
      f.coordinates[1],
      f.power.operationalMw.value,
      f.power.operationalMw.epistemic,
      f.power.totalPlannedMw.value,
      f.power.totalPlannedMw.epistemic,
      f.power.utilityProvider,
      f.power.interconnectionStatus,
      f.waterAndCooling.coolingArchitecture,
      f.waterAndCooling.peakOrAvgWaterMgd.value,
      f.waterAndCooling.peakOrAvgWaterMgd.epistemic,
      f.waterAndCooling.annualWaterMgy.value,
      f.waterAndCooling.annualWaterMgy.epistemic,
      f.waterAndCooling.pue.value,
      f.waterAndCooling.watershedStress,
      f.waterAndCooling.usgsGaugeSiteId,
      f.waterAndCooling.nwsStationId,
      f.regulatory.moratoriumOrLitigationActive,
      f.stakeholders.developer,
      f.stakeholders.operator,
      f.lastVerified,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

function toFacilitiesGeoJson(
  facilities: FacilityRecord[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: facilities.map((f) => ({
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
        county: f.county,
        state: f.state,
        isoRegion: f.isoRegion,
        lifecycleStatus: f.lifecycleStatus,
        operationalMw: f.power.operationalMw.value,
        operationalMwEpistemic: f.power.operationalMw.epistemic,
        totalPlannedMw: f.power.totalPlannedMw.value,
        totalPlannedMwEpistemic: f.power.totalPlannedMw.epistemic,
        utilityProvider: f.power.utilityProvider,
        interconnectionStatus: f.power.interconnectionStatus,
        coolingArchitecture: f.waterAndCooling.coolingArchitecture,
        peakOrAvgWaterMgd: f.waterAndCooling.peakOrAvgWaterMgd.value,
        peakWaterEpistemic: f.waterAndCooling.peakOrAvgWaterMgd.epistemic,
        annualWaterMgy: f.waterAndCooling.annualWaterMgy.value,
        watershedStress: f.waterAndCooling.watershedStress,
        moratoriumOrLitigationActive: f.regulatory.moratoriumOrLitigationActive,
        usgsGaugeSiteId: f.waterAndCooling.usgsGaugeSiteId,
        nwsStationId: f.waterAndCooling.nwsStationId,
        developer: f.stakeholders.developer,
        operator: f.stakeholders.operator,
        lastVerified: f.lastVerified,
      },
    })),
  };
}

export function filterFacilities(
  facilities: FacilityRecord[],
  params: URLSearchParams,
): { facilities: FacilityRecord[]; error?: string } {
  const statusFilter = splitCsvParam(params.get("status"));
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
      return { facilities: [], error: `Invalid minMw "${minMwRaw}"` };
    }
    minMw = parsed;
  }

  const bboxRaw = params.get("bbox");
  let bbox: [number, number, number, number] | null = null;
  if (bboxRaw !== null && bboxRaw.trim() !== "") {
    const nums = bboxRaw.split(",").map((part) => Number(part.trim()));
    if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
      return {
        facilities: [],
        error: `Invalid bbox "${bboxRaw}"; expected minLon,minLat,maxLon,maxLat`,
      };
    }
    bbox = [nums[0], nums[1], nums[2], nums[3]];
  }

  const filtered = facilities.filter((f) => {
    if (statusFilter && !statusFilter.has(f.lifecycleStatus)) return false;
    if (isoFilter && !isoFilter.has(f.isoRegion)) return false;
    if (stateFilter && !stateFilter.has(f.state.toUpperCase())) return false;
    if (coolingFilter && !coolingFilter.has(f.waterAndCooling.coolingArchitecture)) {
      return false;
    }
    if (
      contestedOnly &&
      f.lifecycleStatus !== "contested" &&
      f.lifecycleStatus !== "moratorium" &&
      !f.regulatory.moratoriumOrLitigationActive
    ) {
      return false;
    }
    if (
      undisclosedWaterOnly &&
      f.waterAndCooling.peakOrAvgWaterMgd.epistemic !== "undisclosed" &&
      f.waterAndCooling.annualWaterMgy.epistemic !== "undisclosed"
    ) {
      return false;
    }
    if (minMw !== null) {
      const mw = f.power.totalPlannedMw.value ?? f.power.operationalMw.value ?? 0;
      if (mw < minMw) return false;
    }
    if (bbox) {
      const [lon, lat] = f.coordinates;
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
      const haystack = [
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
        ...f.stakeholders.anchorTenants.map((t) => t.name),
        ...f.regulatory.permits.map((p) => `${p.docketOrPermitId} ${p.agency} ${p.title}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return { facilities: filtered };
}

export interface WorkerRuntimeOptions extends TelemetryFetchOptions {
  dataset?: DatasetBundle;
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
      return env.ASSETS.fetch(request as unknown as Parameters<Fetcher["fetch"]>[0]) as unknown as Promise<Response>;
    }
    return new Response("Not Found", { status: 404 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const dataset: DatasetBundle = runtimeOpts.dataset ?? {
    facilities: ALL_FACILITIES,
    footprints: ALL_FOOTPRINTS,
    isoRegions: ISO_REGIONS,
  };
  const refresh = isTruthyParam(url.searchParams.get("refresh"));
  const fetchOpts: TelemetryFetchOptions = {
    refresh,
    fetchFn: runtimeOpts.fetchFn,
    timeoutMs: runtimeOpts.timeoutMs,
  };

  if (path === "/api/health") {
    const operationalMwTotal = Math.round(
      dataset.facilities.reduce(
        (sum, f) => sum + (f.power.operationalMw.value ?? 0),
        0,
      ),
    );
    const plannedMwTotal = Math.round(
      dataset.facilities.reduce(
        (sum, f) => sum + (f.power.totalPlannedMw.value ?? 0),
        0,
      ),
    );
    return jsonResponse({
      status: "ok",
      service: "gridline",
      environment: env.ENVIRONMENT ?? "production",
      release: env.RELEASE ?? "0.2.0",
      facilityCount: dataset.facilities.length,
      operationalMwTotal,
      plannedMwTotal,
      timestamp: new Date().toISOString(),
    });
  }

  if (path === "/api/facilities") {
    const { facilities, error } = filterFacilities(dataset.facilities, url.searchParams);
    if (error) {
      return jsonResponse({ error: "invalid_query", message: error }, 400);
    }

    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    if (format === "csv") {
      return new Response(toFacilitiesCsv(facilities), {
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
      return new Response(JSON.stringify(toFacilitiesGeoJson(facilities)), {
        status: 200,
        headers: {
          "Content-Type": "application/geo+json; charset=utf-8",
          "Content-Disposition": 'attachment; filename="gridline-facilities.geojson"',
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        },
      });
    }
    if (format !== "json") {
      return jsonResponse(
        { error: "invalid_format", message: `Unsupported format "${format}"` },
        400,
      );
    }

    const visibleIds = new Set(facilities.map((f) => f.id));
    const filteredFootprints: GeoJSON.FeatureCollection<
      GeoJSON.Polygon,
      CampusFootprintProps
    > = {
      type: "FeatureCollection",
      features: dataset.footprints.features.filter((feat) =>
        visibleIds.has(feat.properties.facilityId),
      ),
    };

    return jsonResponse({
      facilities,
      footprints: filteredFootprints,
      isoRegions: dataset.isoRegions,
    });
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
    const facility = dataset.facilities.find((f) => f.id === id);
    if (!facility) {
      return jsonResponse({ error: "facility_not_found", id }, 404);
    }
    const footprints = runtimeOpts.dataset
      ? {
          type: "FeatureCollection" as const,
          features: dataset.footprints.features.filter(
            (feat) => feat.properties.facilityId === id,
          ),
        }
      : getFootprintsForFacility(id);

    const telemetry = await fetchFacilityTelemetry(facility, fetchOpts);
    return jsonResponse({
      facility,
      footprints,
      telemetry,
    });
  }

  if (path === "/api/telemetry/summary") {
    const summary = await fetchTelemetrySummary(dataset.facilities, fetchOpts);
    return jsonResponse(summary);
  }

  if (path === "/api/telemetry/live") {
    const facilityId = url.searchParams.get("facilityId")?.trim();
    if (!facilityId) {
      return jsonResponse({ error: "missing_facility_id" }, 400);
    }
    const facility = dataset.facilities.find((f) => f.id === facilityId);
    if (!facility) {
      return jsonResponse({ error: "facility_not_found", facilityId }, 404);
    }
    const telemetry = await fetchFacilityTelemetry(facility, fetchOpts);
    return jsonResponse(telemetry);
  }

  if (path === "/api/regulatory/live") {
    const feed = await fetchRegulatoryFeed(fetchOpts);
    return jsonResponse(feed);
  }

  return jsonResponse({ error: "not_found", path }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      Promise.allSettled([
        fetchTelemetrySummary(ALL_FACILITIES, { refresh: true }),
        fetchRegulatoryFeed({ refresh: true }),
      ]),
    );
  },
};
