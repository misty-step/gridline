import type {
  FacilityIndexItem,
  FacilityRecord,
  LiveBasinHydrology,
  LiveFacilityTelemetry,
  LiveStationWeather,
  TelemetrySummaryApiResponse,
} from "../shared/types.ts";
import {
  celsiusToFahrenheit,
  classifyThermalRegime,
  computeWetBulbC,
} from "../shared/wetbulb.ts";
import type { TelemetryFetchOptions } from "./env.ts";
import {
  ATLAS_USER_AGENT,
  DEFAULT_TIMEOUT_MS,
  fetchWithTimeout,
  readCachedJson,
  round1,
  round2,
  writeCachedJson,
} from "./http.ts";

export type { TelemetryFetchOptions } from "./env.ts";

const CACHE_TTL_SECONDS = 900;
const SUMMARY_CONCURRENCY = 6;
const SUMMARY_MAX_NOAA_STATIONS = 18;
const SUMMARY_MAX_USGS_GAUGES = 25;

export type TelemetryFacilityLike = FacilityRecord | FacilityIndexItem;

function extractAnchors(facility: TelemetryFacilityLike): {
  id: string;
  nwsStationId: string;
  usgsGaugeSiteId: string;
  priorityScore: number;
} {
  if ("waterAndCooling" in facility) {
    const tierScore =
      facility.catalogTier === "provisional"
        ? 200
        : facility.catalogTier === "registry"
          ? 10
          : 1000;
    const mw =
      facility.power.totalPlannedMw.value ?? facility.power.operationalMw.value ?? 20;
    const contested =
      facility.lifecycleStatus === "contested" ||
      facility.lifecycleStatus === "moratorium" ||
      facility.regulatory.moratoriumOrLitigationActive
        ? 100
        : 0;
    return {
      id: facility.id,
      nwsStationId: facility.waterAndCooling.nwsStationId.trim().toUpperCase(),
      usgsGaugeSiteId: facility.waterAndCooling.usgsGaugeSiteId.trim(),
      priorityScore: tierScore + Math.min(2000, Math.max(0, mw)) + contested,
    };
  }

  const tierScore =
    facility.catalogTier === "provisional"
      ? 200
      : facility.catalogTier === "registry"
        ? 10
        : 1000;
  const mw = facility.totalPlannedMw ?? facility.operationalMw ?? 20;
  const contested =
    facility.lifecycleStatus === "contested" ||
    facility.lifecycleStatus === "moratorium" ||
    facility.moratoriumOrLitigationActive
      ? 100
      : 0;
  return {
    id: facility.id,
    nwsStationId: facility.nwsStationId.trim().toUpperCase(),
    usgsGaugeSiteId: facility.usgsGaugeSiteId.trim(),
    priorityScore: tierScore + Math.min(2000, Math.max(0, mw)) + contested,
  };
}

interface NwsObservationPayload {
  properties?: {
    timestamp?: string;
    temperature?: { value?: number | null; unitCode?: string };
    relativeHumidity?: { value?: number | null };
  };
}

interface NwsObservationCollectionPayload extends NwsObservationPayload {
  features?: NwsObservationPayload[];
}

function parseNwsObservation(obs: NwsObservationPayload): {
  observedAt: string | null;
  tempC: number | null;
  tempF: number | null;
  relativeHumidityPct: number | null;
  wetBulbC: number | null;
  wetBulbF: number | null;
  thermalRegime: LiveStationWeather["thermalRegime"];
} {
  const props = obs?.properties;
  const observedAt = typeof props?.timestamp === "string" ? props.timestamp : null;

  let tempC: number | null = null;
  const rawTemp = props?.temperature?.value;
  if (typeof rawTemp === "number" && Number.isFinite(rawTemp)) {
    const unitCode = props?.temperature?.unitCode ?? "";
    const c = unitCode.includes("degF") ? ((rawTemp - 32) * 5) / 9 : rawTemp;
    tempC = round1(c);
  }

  const rawRh = props?.relativeHumidity?.value;
  const relativeHumidityPct =
    typeof rawRh === "number" && Number.isFinite(rawRh) ? round1(rawRh) : null;

  const tempF = tempC !== null ? celsiusToFahrenheit(tempC) : null;
  const wetBulbC = computeWetBulbC(tempC, relativeHumidityPct);
  const wetBulbF = wetBulbC !== null ? celsiusToFahrenheit(wetBulbC) : null;
  const thermalRegime = classifyThermalRegime(wetBulbC);

  return {
    observedAt,
    tempC,
    tempF,
    relativeHumidityPct,
    wetBulbC,
    wetBulbF,
    thermalRegime,
  };
}

export async function fetchStationWeather(
  stationId: string,
  opts: TelemetryFetchOptions = {},
): Promise<LiveStationWeather> {
  const normalized = stationId.trim().toUpperCase();
  const sourceUrl = `https://api.weather.gov/stations/${encodeURIComponent(normalized)}/observations?limit=5`;
  const cacheKey = `https://undercurrent-cache.internal/v1/weather/${encodeURIComponent(normalized)}`;

  if (!opts.refresh) {
    const cached = await readCachedJson<LiveStationWeather>(cacheKey);
    if (cached) return cached;
  }

  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetchWithTimeout(
      sourceUrl,
      {
        headers: {
          "User-Agent": ATLAS_USER_AGENT,
          Accept: "application/geo+json",
        },
      },
      timeoutMs,
      fetchFn,
    );

    if (!res.ok) {
      return {
        stationId: normalized,
        observedAt: null,
        tempC: null,
        tempF: null,
        relativeHumidityPct: null,
        wetBulbC: null,
        wetBulbF: null,
        thermalRegime: "unavailable",
        sourceUrl,
        status: "degraded",
        error: `NOAA NWS returned HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as NwsObservationCollectionPayload;
    // NOAA /observations/latest emits transient null-temp/RH pre-METAR stubs around top-of-hour;
    // scanning recent observations in one single request avoids failing on empty boundary entries.
    const candidates: NwsObservationPayload[] = Array.isArray(body?.features)
      ? body.features
      : body?.properties
        ? [body]
        : [];
    const parsedCandidates = candidates.map(parseNwsObservation);
    const complete = parsedCandidates.find(
      (obs) =>
        obs.tempC !== null &&
        obs.relativeHumidityPct !== null &&
        obs.wetBulbC !== null,
    );

    if (!complete) {
      const latest = parsedCandidates[0];
      return {
        stationId: normalized,
        observedAt: latest?.observedAt ?? null,
        tempC: latest?.tempC ?? null,
        tempF: latest?.tempF ?? null,
        relativeHumidityPct: latest?.relativeHumidityPct ?? null,
        wetBulbC: latest?.wetBulbC ?? null,
        wetBulbF: latest?.wetBulbF ?? null,
        thermalRegime: latest?.thermalRegime ?? "unavailable",
        sourceUrl,
        status: "degraded",
        error: "Latest NOAA observation is missing temperature or relative humidity",
      };
    }

    const result: LiveStationWeather = {
      stationId: normalized,
      observedAt: complete.observedAt,
      tempC: complete.tempC,
      tempF: complete.tempF,
      relativeHumidityPct: complete.relativeHumidityPct,
      wetBulbC: complete.wetBulbC,
      wetBulbF: complete.wetBulbF,
      thermalRegime: complete.thermalRegime,
      sourceUrl,
      status: "live",
    };

    await writeCachedJson(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `NOAA NWS request timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown NOAA NWS error";

    return {
      stationId: normalized,
      observedAt: null,
      tempC: null,
      tempF: null,
      relativeHumidityPct: null,
      wetBulbC: null,
      wetBulbF: null,
      thermalRegime: "unavailable",
      sourceUrl,
      status: "degraded",
      error: message,
    };
  }
}

interface UsgsFeatureProperties {
  monitoring_location_id?: string;
  monitoring_location_name?: string;
  site_name?: string;
  statistic_id?: string;
  time?: string;
  value?: string | number | null;
}

interface UsgsOgcFeatureCollection {
  features?: Array<{
    properties?: UsgsFeatureProperties;
  }>;
}

function buildUsgsSingleSourceUrl(siteId: string): string {
  return `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?f=json&monitoring_location_id=USGS-${encodeURIComponent(siteId)}&parameter_code=00060&limit=1`;
}

function buildDegradedHydrology(
  siteId: string,
  error: string,
  partial?: { siteName?: string | null; observedAt?: string | null },
): LiveBasinHydrology {
  return {
    siteId,
    siteName: partial?.siteName ?? null,
    observedAt: partial?.observedAt ?? null,
    dischargeCfs: null,
    unit: "ft3/s",
    sourceUrl: buildUsgsSingleSourceUrl(siteId),
    status: "degraded",
    error,
  };
}

function parseUsgsFeatureToHydrology(
  siteId: string,
  props: UsgsFeatureProperties | undefined,
): LiveBasinHydrology {
  if (!props) {
    return buildDegradedHydrology(
      siteId,
      `No active parameter 00060 discharge reading for USGS-${siteId}`,
    );
  }

  const rawVal = props.value;
  const parsedVal =
    rawVal === null || rawVal === undefined || rawVal === "" ? Number.NaN : Number(rawVal);
  const observedAt = typeof props.time === "string" ? props.time : null;
  const siteName =
    props.monitoring_location_name ??
    props.site_name ??
    props.monitoring_location_id ??
    null;

  if (!Number.isFinite(parsedVal)) {
    return buildDegradedHydrology(
      siteId,
      `USGS-${siteId} returned non-numeric discharge value`,
      { siteName, observedAt },
    );
  }

  return {
    siteId,
    siteName,
    observedAt,
    dischargeCfs: round2(parsedVal),
    unit: "ft3/s",
    sourceUrl: buildUsgsSingleSourceUrl(siteId),
    status: "live",
  };
}

export async function fetchBasinHydrology(
  siteId: string,
  opts: TelemetryFetchOptions = {},
): Promise<LiveBasinHydrology> {
  const normalized = siteId.trim();
  const sourceUrl = buildUsgsSingleSourceUrl(normalized);
  const cacheKey = `https://undercurrent-cache.internal/v1/hydrology/${encodeURIComponent(normalized)}`;

  if (!opts.refresh) {
    const cached = await readCachedJson<LiveBasinHydrology>(cacheKey);
    if (cached) return cached;
  }

  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetchWithTimeout(
      sourceUrl,
      {
        headers: {
          "User-Agent": ATLAS_USER_AGENT,
          Accept: "application/geo+json, application/json",
        },
      },
      timeoutMs,
      fetchFn,
    );

    if (!res.ok) {
      return buildDegradedHydrology(
        normalized,
        `USGS Water Data API returned HTTP ${res.status}`,
      );
    }

    const body = (await res.json()) as UsgsOgcFeatureCollection;
    const result = parseUsgsFeatureToHydrology(
      normalized,
      body?.features?.[0]?.properties,
    );

    if (result.status === "live") {
      await writeCachedJson(cacheKey, result, CACHE_TTL_SECONDS);
    }
    return result;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `USGS Water Data API timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown USGS Water Data error";

    return buildDegradedHydrology(normalized, message);
  }
}

async function fetchBatchedBasinHydrology(
  siteIds: string[],
  opts: TelemetryFetchOptions = {},
): Promise<Record<string, LiveBasinHydrology>> {
  const gauges: Record<string, LiveBasinHydrology> = {};
  if (siteIds.length === 0) return gauges;

  const uncached: string[] = [];
  if (!opts.refresh) {
    const cachedEntries = await Promise.all(
      siteIds.map(async (siteId) => {
        const cacheKey = `https://undercurrent-cache.internal/v1/hydrology/${encodeURIComponent(siteId)}`;
        return { siteId, cached: await readCachedJson<LiveBasinHydrology>(cacheKey) };
      }),
    );
    for (const entry of cachedEntries) {
      if (entry.cached) {
        gauges[entry.siteId] = entry.cached;
      } else {
        uncached.push(entry.siteId);
      }
    }
  } else {
    uncached.push(...siteIds);
  }

  if (uncached.length === 0) {
    return gauges;
  }

  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const monitoringIdsParam = uncached
    .map((id) => `USGS-${encodeURIComponent(id)}`)
    .join(",");
  const batchUrl =
    `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items` +
    `?f=json&monitoring_location_id=${monitoringIdsParam}&parameter_code=00060&limit=100`;

  try {
    const res = await fetchWithTimeout(
      batchUrl,
      {
        headers: {
          "User-Agent": ATLAS_USER_AGENT,
          Accept: "application/geo+json, application/json",
        },
      },
      timeoutMs,
      fetchFn,
    );

    if (!res.ok) {
      for (const siteId of uncached) {
        gauges[siteId] = buildDegradedHydrology(
          siteId,
          `USGS Water Data API returned HTTP ${res.status}`,
        );
      }
      return gauges;
    }

    const body = (await res.json()) as UsgsOgcFeatureCollection;
    const features = Array.isArray(body?.features) ? body.features : [];
    const bySite = new Map<string, UsgsFeatureProperties>();

    for (const feat of features) {
      const props = feat?.properties;
      const rawLoc = props?.monitoring_location_id?.trim() ?? "";
      const siteId = rawLoc.replace(/^USGS-/i, "");
      if (!siteId) continue;

      const existing = bySite.get(siteId);
      if (!existing) {
        bySite.set(siteId, props!);
        continue;
      }
      // Prefer instantaneous statistic 00011 when multiple series are returned.
      if (props?.statistic_id === "00011" && existing.statistic_id !== "00011") {
        bySite.set(siteId, props);
      }
    }

    await Promise.all(
      uncached.map(async (siteId) => {
        const parsed = parseUsgsFeatureToHydrology(siteId, bySite.get(siteId));
        gauges[siteId] = parsed;
        if (parsed.status === "live") {
          const cacheKey = `https://undercurrent-cache.internal/v1/hydrology/${encodeURIComponent(siteId)}`;
          await writeCachedJson(cacheKey, parsed, CACHE_TTL_SECONDS);
        }
      }),
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `USGS Water Data API timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown USGS Water Data error";

    for (const siteId of uncached) {
      gauges[siteId] = buildDegradedHydrology(siteId, message);
    }
  }

  return gauges;
}

export async function fetchFacilityTelemetry(
  facility: TelemetryFacilityLike,
  opts: TelemetryFetchOptions = {},
): Promise<LiveFacilityTelemetry> {
  const anchors = extractAnchors(facility);
  const [weather, hydrology] = await Promise.all([
    fetchStationWeather(anchors.nwsStationId, opts),
    fetchBasinHydrology(anchors.usgsGaugeSiteId, opts),
  ]);

  return {
    facilityId: anchors.id,
    fetchedAt: new Date().toISOString(),
    weather,
    hydrology,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      try {
        const value = await worker(items[idx]);
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext(),
  );
  await Promise.all(runners);
  return results;
}

function rankPriorityAnchors(facilities: TelemetryFacilityLike[]): {
  topStations: string[];
  topGauges: string[];
} {
  const stationScores = new Map<string, number>();
  const gaugeScores = new Map<string, number>();

  for (const fac of facilities) {
    const { nwsStationId, usgsGaugeSiteId, priorityScore } = extractAnchors(fac);
    if (nwsStationId) {
      stationScores.set(
        nwsStationId,
        (stationScores.get(nwsStationId) ?? 0) + priorityScore,
      );
    }
    if (usgsGaugeSiteId) {
      gaugeScores.set(
        usgsGaugeSiteId,
        (gaugeScores.get(usgsGaugeSiteId) ?? 0) + priorityScore,
      );
    }
  }

  const topStations = Array.from(stationScores.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, SUMMARY_MAX_NOAA_STATIONS)
    .map(([id]) => id);

  const topGauges = Array.from(gaugeScores.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, SUMMARY_MAX_USGS_GAUGES)
    .map(([id]) => id);

  return { topStations, topGauges };
}

/**
 * Fetches priority corridor NOAA station weather (<= 18 HTTP fetches) and
 * batched USGS streamgauge hydrology (1 single OGC request for <= 25 gauges),
 * staying strictly <= 20 upstream subrequests per Worker invocation.
 */
export async function fetchTelemetrySummary(
  facilities: TelemetryFacilityLike[],
  opts: TelemetryFetchOptions = {},
): Promise<TelemetrySummaryApiResponse> {
  const { topStations, topGauges } = rankPriorityAnchors(facilities);

  const [stationSettled, gauges] = await Promise.all([
    mapWithConcurrency(topStations, SUMMARY_CONCURRENCY, (stationId) =>
      fetchStationWeather(stationId, opts),
    ),
    fetchBatchedBasinHydrology(topGauges, opts),
  ]);

  const stations: Record<string, LiveStationWeather> = {};
  topStations.forEach((stationId, idx) => {
    const entry = stationSettled[idx];
    if (entry.status === "fulfilled") {
      stations[stationId] = entry.value;
    } else {
      stations[stationId] = {
        stationId,
        observedAt: null,
        tempC: null,
        tempF: null,
        relativeHumidityPct: null,
        wetBulbC: null,
        wetBulbF: null,
        thermalRegime: "unavailable",
        sourceUrl: `https://api.weather.gov/stations/${encodeURIComponent(stationId)}/observations?limit=5`,
        status: "degraded",
        error:
          entry.reason instanceof Error
            ? entry.reason.message
            : "Failed to fetch station",
      };
    }
  });

  return {
    fetchedAt: new Date().toISOString(),
    stations,
    gauges,
  };
}
