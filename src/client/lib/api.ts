import type {
  ActivityWindow,
  CampusFootprintProps,
  FacilitiesApiResponse,
  FacilitiesIndexApiResponse,
  FacilityDetailApiResponse,
  FacilityIndexItem,
  FacilityRecord,
  LiveFacilityTelemetry,
  LiveGridFeed,
  LivePulseFeed,
  LivePulseSignal,
  LiveRegulatoryFeed,
  PulseStream,
  TelemetrySummaryApiResponse,
} from "@shared/types";
import { computeFleetSummaryFromIndex } from "./filters";

export interface BootFacilitiesResult {
  indexResponse: FacilitiesIndexApiResponse;
  legacyFootprints?: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  legacyRecordsById?: Record<string, FacilityRecord>;
}

let cachedNationalFootprints:
  | GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>
  | null = null;
let nationalFootprintsPromise: Promise<
  GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> | null
> | null = null;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = `${detail} (${body.error})`;
    } catch {
      // ignore non-json error body
    }
    throw new Error(detail);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error("Unexpected HTML response for JSON endpoint");
  }
  return (await res.json()) as T;
}

export function facilityRecordToIndexItem(f: FacilityRecord): FacilityIndexItem {
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
    catalogTier: f.catalogTier ?? "flagship",
    footprintCoverage: f.footprintCoverage ?? "verified_polygons",
    developer: f.stakeholders.developer,
    operator: f.stakeholders.operator,
    utilityProvider: f.power.utilityProvider,
    interconnectionStatus: f.power.interconnectionStatus,
    operationalMw: f.power.operationalMw.value,
    operationalMwEpistemic: f.power.operationalMw.epistemic,
    totalPlannedMw: f.power.totalPlannedMw.value,
    totalPlannedMwEpistemic: f.power.totalPlannedMw.epistemic,
    coolingArchitecture: f.waterAndCooling.coolingArchitecture,
    peakOrAvgWaterMgd: f.waterAndCooling.peakOrAvgWaterMgd.value,
    annualWaterMgy: f.waterAndCooling.annualWaterMgy.value,
    waterEpistemic: f.waterAndCooling.peakOrAvgWaterMgd.epistemic,
    watershedStress: f.waterAndCooling.watershedStress,
    moratoriumOrLitigationActive: f.regulatory.moratoriumOrLitigationActive,
    usgsGaugeSiteId: f.waterAndCooling.usgsGaugeSiteId,
    nwsStationId: f.waterAndCooling.nwsStationId,
    grossSqFt: f.parcel.grossSqFt.value,
    mappedPolygonCount: f.registryMetadata?.mappedPolygonCount ?? 0,
    sourceTags: f.registryMetadata?.sourceTags ?? [],
    lastVerified: f.lastVerified,
    lastUpdated: f.lastUpdated ?? f.lastVerified,
  };
}

function isLegacyFacilitiesPayload(
  payload: FacilitiesIndexApiResponse | FacilitiesApiResponse,
): payload is FacilitiesApiResponse {
  const first = payload.facilities[0] as unknown as Record<string, unknown> | undefined;
  if (!first) return "footprints" in payload && !("summary" in payload);
  return "power" in first && "waterAndCooling" in first;
}

export async function fetchFacilitiesIndex(
  signal?: AbortSignal,
): Promise<BootFacilitiesResult> {
  const raw = await getJson<FacilitiesIndexApiResponse | FacilitiesApiResponse>(
    "/api/facilities?view=index",
    signal,
  );

  if (isLegacyFacilitiesPayload(raw)) {
    const legacyRecordsById: Record<string, FacilityRecord> = {};
    const items: FacilityIndexItem[] = raw.facilities.map((rec) => {
      legacyRecordsById[rec.id] = rec;
      const item = facilityRecordToIndexItem(rec);
      const polyCount = raw.footprints.features.filter(
        (ft) => ft.properties.facilityId === rec.id,
      ).length;
      return {
        ...item,
        mappedPolygonCount: item.mappedPolygonCount || polyCount,
        footprintCoverage:
          rec.footprintCoverage ??
          (polyCount > 0 ? "verified_polygons" : "point_only"),
      };
    });
    return {
      indexResponse: {
        facilities: items,
        summary: computeFleetSummaryFromIndex(items),
        isoRegions: raw.isoRegions,
      },
      legacyFootprints: raw.footprints,
      legacyRecordsById,
    };
  }

  return {
    indexResponse: raw,
  };
}

export async function fetchFacilityDetail(
  facilityId: string,
  refresh = false,
  signal?: AbortSignal,
): Promise<FacilityDetailApiResponse> {
  const qs = refresh ? "?refresh=1" : "";
  return getJson<FacilityDetailApiResponse>(
    `/api/facilities/${encodeURIComponent(facilityId)}${qs}`,
    signal,
  );
}

export async function fetchLiveGrid(
  refresh = false,
  signal?: AbortSignal,
): Promise<LiveGridFeed | null> {
  const url = refresh ? "/api/grid/live?refresh=1" : "/api/grid/live";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (res.status === 404 || !res.ok) {
      return null;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) return null;
    return (await res.json()) as LiveGridFeed;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  }
}

function adaptRegulatoryToPulse(
  reg: LiveRegulatoryFeed,
  window: ActivityWindow,
): LivePulseFeed {
  const items: LivePulseSignal[] = reg.items.map((item) => ({
    id: `fr-${item.documentNumber}`,
    stream: "federal_register",
    title: item.title,
    publisher: item.agencies.join(", ") || "Federal Register",
    publishedAt: item.publicationDate,
    summary: item.abstract,
    url: item.htmlUrl,
    pdfUrl: item.pdfUrl,
    epistemic: "filed",
    documentNumber: item.documentNumber,
  }));

  return {
    fetchedAt: reg.fetchedAt,
    window,
    status: reg.status === "live" ? "live" : "degraded",
    streamStatus: {
      federal_register: reg.status === "live" ? "live" : "degraded",
      sec_edgar: "degraded",
      peeringdb: "degraded",
    },
    items,
    error: reg.error,
  };
}

export async function fetchLivePulse(
  opts: {
    stream?: PulseStream | "all";
    window?: ActivityWindow;
    refresh?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<LivePulseFeed> {
  const windowParam = opts.window ?? "30d";
  const params = new URLSearchParams();
  if (opts.stream && opts.stream !== "all") params.set("stream", opts.stream);
  params.set("window", windowParam);
  if (opts.refresh) params.set("refresh", "1");

  const res = await fetch(`/api/pulse/live?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (res.status === 404) {
    const legacyUrl = opts.refresh
      ? "/api/regulatory/live?refresh=1"
      : "/api/regulatory/live";
    const legacy = await getJson<LiveRegulatoryFeed>(legacyUrl, signal);
    return adaptRegulatoryToPulse(legacy, windowParam);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = `${detail} (${body.error})`;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    const legacyUrl = opts.refresh
      ? "/api/regulatory/live?refresh=1"
      : "/api/regulatory/live";
    const legacy = await getJson<LiveRegulatoryFeed>(legacyUrl, signal);
    return adaptRegulatoryToPulse(legacy, windowParam);
  }

  return (await res.json()) as LivePulseFeed;
}

export async function fetchNationalFootprints(): Promise<
  GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> | null
> {
  if (cachedNationalFootprints) return cachedNationalFootprints;
  if (nationalFootprintsPromise) return nationalFootprintsPromise;

  nationalFootprintsPromise = (async () => {
    try {
      const res = await fetch("/data/footprints-us.geojson", {
        headers: { Accept: "application/geo+json, application/json" },
      });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html")) return null;
      const parsed = (await res.json()) as GeoJSON.FeatureCollection<
        GeoJSON.Polygon,
        CampusFootprintProps
      >;
      if (
        !parsed ||
        parsed.type !== "FeatureCollection" ||
        !Array.isArray(parsed.features)
      ) {
        return null;
      }
      cachedNationalFootprints = parsed;
      return parsed;
    } catch {
      return null;
    } finally {
      if (!cachedNationalFootprints) {
        nationalFootprintsPromise = null;
      }
    }
  })();

  return nationalFootprintsPromise;
}

export function fetchTelemetrySummary(
  signal?: AbortSignal,
): Promise<TelemetrySummaryApiResponse> {
  return getJson<TelemetrySummaryApiResponse>("/api/telemetry/summary", signal);
}

export function fetchLiveFacilityTelemetry(
  facilityId: string,
  refresh = false,
  signal?: AbortSignal,
): Promise<LiveFacilityTelemetry> {
  const params = new URLSearchParams({ facilityId });
  if (refresh) params.set("refresh", "1");
  return getJson<LiveFacilityTelemetry>(
    `/api/telemetry/live?${params.toString()}`,
    signal,
  );
}
