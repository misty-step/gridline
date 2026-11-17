import type {
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

const USER_AGENT = "(GridlineAtlas, contact@mistystep.io)";
const DEFAULT_TIMEOUT_MS = 4500;
const CACHE_TTL_SECONDS = 900;
const SUMMARY_CONCURRENCY = 8;

export interface TelemetryFetchOptions {
  refresh?: boolean;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface CfCacheStorage {
  default?: Cache;
}

function getEdgeCache(): Cache | undefined {
  try {
    return (globalThis as unknown as { caches?: CfCacheStorage }).caches?.default;
  } catch {
    return undefined;
  }
}

async function readCachedJson<T>(cacheKey: string): Promise<T | null> {
  const cache = getEdgeCache();
  if (!cache) return null;
  try {
    const match = await cache.match(new Request(cacheKey));
    if (!match) return null;
    return (await match.json()) as T;
  } catch {
    return null;
  }
}

async function writeCachedJson<T>(
  cacheKey: string,
  payload: T,
  ttlSeconds: number,
): Promise<void> {
  const cache = getEdgeCache();
  if (!cache) return;
  try {
    const res = new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${ttlSeconds}`,
      },
    });
    await cache.put(new Request(cacheKey), res);
  } catch {
    // Cache writes are best-effort; ignore local/test runtime cache failures.
  }
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface NwsObservationPayload {
  properties?: {
    timestamp?: string;
    temperature?: { value?: number | null; unitCode?: string };
    relativeHumidity?: { value?: number | null };
  };
}

export async function fetchStationWeather(
  stationId: string,
  opts: TelemetryFetchOptions = {},
): Promise<LiveStationWeather> {
  const normalized = stationId.trim().toUpperCase();
  const sourceUrl = `https://api.weather.gov/stations/${encodeURIComponent(normalized)}/observations/latest`;
  const cacheKey = `https://gridline-cache.internal/v1/weather/${encodeURIComponent(normalized)}`;

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
          "User-Agent": USER_AGENT,
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

    const body = (await res.json()) as NwsObservationPayload;
    const props = body?.properties;
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

    if (tempC === null || relativeHumidityPct === null || wetBulbC === null) {
      return {
        stationId: normalized,
        observedAt,
        tempC,
        tempF,
        relativeHumidityPct,
        wetBulbC,
        wetBulbF,
        thermalRegime,
        sourceUrl,
        status: "degraded",
        error: "Latest NOAA observation is missing temperature or relative humidity",
      };
    }

    const result: LiveStationWeather = {
      stationId: normalized,
      observedAt,
      tempC,
      tempF,
      relativeHumidityPct,
      wetBulbC,
      wetBulbF,
      thermalRegime,
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

interface UsgsOgcFeatureCollection {
  features?: Array<{
    properties?: {
      monitoring_location_id?: string;
      monitoring_location_name?: string;
      site_name?: string;
      time?: string;
      value?: string | number | null;
    };
  }>;
}

export async function fetchBasinHydrology(
  siteId: string,
  opts: TelemetryFetchOptions = {},
): Promise<LiveBasinHydrology> {
  const normalized = siteId.trim();
  const sourceUrl = `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?f=json&monitoring_location_id=USGS-${encodeURIComponent(normalized)}&parameter_code=00060&limit=1`;
  const cacheKey = `https://gridline-cache.internal/v1/hydrology/${encodeURIComponent(normalized)}`;

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
          "User-Agent": USER_AGENT,
          Accept: "application/geo+json, application/json",
        },
      },
      timeoutMs,
      fetchFn,
    );

    if (!res.ok) {
      return {
        siteId: normalized,
        siteName: null,
        observedAt: null,
        dischargeCfs: null,
        unit: "ft3/s",
        sourceUrl,
        status: "degraded",
        error: `USGS Water Data API returned HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as UsgsOgcFeatureCollection;
    const props = body?.features?.[0]?.properties;
    if (!props) {
      return {
        siteId: normalized,
        siteName: null,
        observedAt: null,
        dischargeCfs: null,
        unit: "ft3/s",
        sourceUrl,
        status: "degraded",
        error: `No active parameter 00060 discharge reading for USGS-${normalized}`,
      };
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
      return {
        siteId: normalized,
        siteName,
        observedAt,
        dischargeCfs: null,
        unit: "ft3/s",
        sourceUrl,
        status: "degraded",
        error: `USGS-${normalized} returned non-numeric discharge value`,
      };
    }

    const result: LiveBasinHydrology = {
      siteId: normalized,
      siteName,
      observedAt,
      dischargeCfs: Math.round(parsedVal * 100) / 100,
      unit: "ft3/s",
      sourceUrl,
      status: "live",
    };

    await writeCachedJson(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `USGS Water Data API timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown USGS Water Data error";

    return {
      siteId: normalized,
      siteName: null,
      observedAt: null,
      dischargeCfs: null,
      unit: "ft3/s",
      sourceUrl,
      status: "degraded",
      error: message,
    };
  }
}

export async function fetchFacilityTelemetry(
  facility: FacilityRecord,
  opts: TelemetryFetchOptions = {},
): Promise<LiveFacilityTelemetry> {
  const [weather, hydrology] = await Promise.all([
    fetchStationWeather(facility.waterAndCooling.nwsStationId, opts),
    fetchBasinHydrology(facility.waterAndCooling.usgsGaugeSiteId, opts),
  ]);

  return {
    facilityId: facility.id,
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

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    runNext(),
  );
  await Promise.all(runners);
  return results;
}

export async function fetchTelemetrySummary(
  facilities: FacilityRecord[],
  opts: TelemetryFetchOptions = {},
): Promise<TelemetrySummaryApiResponse> {
  const uniqueStations = Array.from(
    new Set(facilities.map((f) => f.waterAndCooling.nwsStationId.trim().toUpperCase())),
  );
  const uniqueGauges = Array.from(
    new Set(facilities.map((f) => f.waterAndCooling.usgsGaugeSiteId.trim())),
  );

  const [stationSettled, gaugeSettled] = await Promise.all([
    mapWithConcurrency(uniqueStations, SUMMARY_CONCURRENCY, (stationId) =>
      fetchStationWeather(stationId, opts),
    ),
    mapWithConcurrency(uniqueGauges, SUMMARY_CONCURRENCY, (siteId) =>
      fetchBasinHydrology(siteId, opts),
    ),
  ]);

  const stations: Record<string, LiveStationWeather> = {};
  uniqueStations.forEach((stationId, idx) => {
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
        sourceUrl: `https://api.weather.gov/stations/${encodeURIComponent(stationId)}/observations/latest`,
        status: "degraded",
        error:
          entry.reason instanceof Error ? entry.reason.message : "Failed to fetch station",
      };
    }
  });

  const gauges: Record<string, LiveBasinHydrology> = {};
  uniqueGauges.forEach((siteId, idx) => {
    const entry = gaugeSettled[idx];
    if (entry.status === "fulfilled") {
      gauges[siteId] = entry.value;
    } else {
      gauges[siteId] = {
        siteId,
        siteName: null,
        observedAt: null,
        dischargeCfs: null,
        unit: "ft3/s",
        sourceUrl: `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?f=json&monitoring_location_id=USGS-${encodeURIComponent(siteId)}&parameter_code=00060&limit=1`,
        status: "degraded",
        error: entry.reason instanceof Error ? entry.reason.message : "Failed to fetch gauge",
      };
    }
  });

  return {
    fetchedAt: new Date().toISOString(),
    stations,
    gauges,
  };
}
