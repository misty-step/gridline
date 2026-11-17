import type {
  GridFuelCategory,
  GridFuelMixItem,
  IsoRegion,
  LiveGridFeed,
  LiveIsoGridSnapshot,
} from "../shared/types.ts";
import type { Env, TelemetryFetchOptions } from "./env.ts";
import {
  DEFAULT_TIMEOUT_MS,
  OBSERVATORY_USER_AGENT,
  fetchWithTimeout,
  readCachedJson,
  round1,
  writeCachedJson,
} from "./http.ts";

const GRID_CACHE_KEY = "https://undercurrent-cache.internal/v1/grid/live";
const GRID_CACHE_TTL_SECONDS = 1800; // 30 minutes (within <= 60 min Live Physics SLA)
const GRID_SLA_MS = 60 * 60 * 1000;
const GRID_FRESH_D1_MS = 30 * 60 * 1000;
const PUBLIC_GRID_SOURCE_URL = "https://api.eia.gov/v2/electricity/rto/region-data/data/";

export const ALL_ISO_REGIONS: IsoRegion[] = [
  "PJM",
  "ERCOT",
  "MISO",
  "SPP",
  "CAISO",
  "NYISO",
  "ISO-NE",
  "SERC",
  "WECC",
];

export const ISO_TO_EIA_RESPONDENT: Record<IsoRegion, string> = {
  PJM: "PJM",
  ERCOT: "ERCO",
  MISO: "MISO",
  SPP: "SWPP",
  CAISO: "CISO",
  NYISO: "NYIS",
  "ISO-NE": "ISNE",
  SERC: "SOCO",
  WECC: "NW",
};

const EIA_RESPONDENT_TO_ISO: Record<string, IsoRegion> = Object.fromEntries(
  Object.entries(ISO_TO_EIA_RESPONDENT).map(([iso, resp]) => [resp, iso as IsoRegion]),
);

const FUEL_META: Record<GridFuelCategory, string> = {
  nuclear: "Nuclear",
  gas: "Natural Gas",
  coal: "Coal",
  wind: "Wind",
  solar: "Solar",
  hydro: "Hydro",
  other: "Other",
};

export function mapEiaFuelCategory(fuelType: string): GridFuelCategory {
  switch (fuelType.trim().toUpperCase()) {
    case "NUC":
      return "nuclear";
    case "NG":
      return "gas";
    case "COL":
      return "coal";
    case "WND":
      return "wind";
    case "SUN":
      return "solar";
    case "WAT":
      return "hydro";
    default:
      return "other";
  }
}

export function normalizeEiaPeriod(period: string | null | undefined): string | null {
  if (!period) return null;
  const trimmed = period.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(trimmed)) {
    return `${trimmed}:00:00Z`;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : trimmed;
}

function buildDegradedRegionSnapshot(
  isoRegion: IsoRegion,
  error?: string,
): LiveIsoGridSnapshot {
  const eiaRespondent = ISO_TO_EIA_RESPONDENT[isoRegion];
  return {
    isoRegion,
    eiaRespondent,
    observedAt: null,
    demandMw: null,
    netGenerationMw: null,
    interchangeMw: null,
    fuelMix: [],
    sourceUrl: `${PUBLIC_GRID_SOURCE_URL}?facets[respondent][]=${encodeURIComponent(eiaRespondent)}`,
    status: "degraded",
    ...(error ? { error } : {}),
  };
}

interface EiaApiRow {
  period?: string;
  respondent?: string;
  type?: string;
  fueltype?: string;
  value?: string | number | null;
}

interface EiaApiResponse {
  error?: { code?: string; message?: string };
  response?: {
    data?: EiaApiRow[];
  };
}

async function fetchEiaEndpoint(
  url: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<{ rows: EiaApiRow[]; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": OBSERVATORY_USER_AGENT,
          Accept: "application/json",
        },
      },
      timeoutMs,
      fetchFn,
    );

    if (!res.ok) {
      let detail = `EIA API v2 returned HTTP ${res.status}`;
      try {
        const errBody = (await res.json()) as EiaApiResponse;
        if (errBody?.error) {
          const code = errBody.error.code ? `${errBody.error.code}: ` : "";
          detail = `${detail} (${code}${errBody.error.message ?? "unknown"})`;
        }
      } catch {
        // Ignore non-JSON error body.
      }
      return { rows: [], error: detail };
    }

    const body = (await res.json()) as EiaApiResponse;
    if (body?.error) {
      const code = body.error.code ? `${body.error.code}: ` : "";
      return {
        rows: [],
        error: `EIA API v2 error (${code}${body.error.message ?? "unknown"})`,
      };
    }

    const rows = Array.isArray(body?.response?.data) ? body.response.data : [];
    return { rows };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `EIA API v2 request timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown EIA API v2 error";
    return { rows: [], error: message };
  }
}

function parseNumericMw(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function comparePeriodDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function buildFuelMixFromRows(rows: EiaApiRow[]): {
  fuelMix: GridFuelMixItem[];
  observedAt: string | null;
} {
  if (rows.length === 0) return { fuelMix: [], observedAt: null };

  const periods = Array.from(
    new Set(rows.map((r) => r.period?.trim()).filter((p): p is string => Boolean(p))),
  ).sort(comparePeriodDesc);

  const latestPeriod = periods[0];
  if (!latestPeriod) return { fuelMix: [], observedAt: null };

  const totals = new Map<GridFuelCategory, number>();
  for (const row of rows) {
    if (row.period?.trim() !== latestPeriod) continue;
    const rawMw = parseNumericMw(row.value);
    if (rawMw === null || rawMw <= 0) continue;
    const cat = mapEiaFuelCategory(row.fueltype ?? "OTH");
    totals.set(cat, (totals.get(cat) ?? 0) + rawMw);
  }

  let totalPositiveMw = 0;
  for (const mw of totals.values()) {
    totalPositiveMw += mw;
  }
  if (totalPositiveMw <= 0) {
    return { fuelMix: [], observedAt: normalizeEiaPeriod(latestPeriod) };
  }

  const fuelMix: GridFuelMixItem[] = Array.from(totals.entries())
    .map(([fuel, mw]) => ({
      fuel,
      label: FUEL_META[fuel],
      mw: Math.round(mw),
      sharePct: round1((mw / totalPositiveMw) * 100),
    }))
    .sort((a, b) => b.mw - a.mw);

  return {
    fuelMix,
    observedAt: normalizeEiaPeriod(latestPeriod),
  };
}

interface GridSnapshotDbRow {
  iso_region: string;
  eia_respondent: string;
  observed_at: string | null;
  payload_json: string;
  updated_at: string;
}

async function readGridSnapshotsFromD1(
  env: Env,
): Promise<{ snapshots: Map<IsoRegion, LiveIsoGridSnapshot>; oldestUpdatedAtMs: number | null }> {
  const snapshots = new Map<IsoRegion, LiveIsoGridSnapshot>();
  if (!env.DB) return { snapshots, oldestUpdatedAtMs: null };

  try {
    const res = await env.DB.prepare(
      "SELECT iso_region, eia_respondent, observed_at, payload_json, updated_at FROM grid_snapshots",
    ).all<GridSnapshotDbRow>();

    let oldestUpdatedAtMs: number | null = null;
    for (const row of res.results ?? []) {
      const iso = row.iso_region as IsoRegion;
      if (!ISO_TO_EIA_RESPONDENT[iso]) continue;
      try {
        const parsed = JSON.parse(row.payload_json) as LiveIsoGridSnapshot;
        snapshots.set(iso, parsed);
        const updatedMs = Date.parse(row.updated_at);
        if (Number.isFinite(updatedMs)) {
          oldestUpdatedAtMs =
            oldestUpdatedAtMs === null ? updatedMs : Math.min(oldestUpdatedAtMs, updatedMs);
        }
      } catch {
        // Ignore malformed JSON row in D1.
      }
    }
    return { snapshots, oldestUpdatedAtMs };
  } catch {
    return { snapshots, oldestUpdatedAtMs: null };
  }
}

async function writeGridSnapshotsToD1(
  env: Env,
  snapshots: LiveIsoGridSnapshot[],
  updatedAt: string,
): Promise<void> {
  if (!env.DB || snapshots.length === 0) return;

  try {
    const stmt = env.DB.prepare(
      `INSERT INTO grid_snapshots (iso_region, eia_respondent, observed_at, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(iso_region) DO UPDATE SET
         eia_respondent = excluded.eia_respondent,
         observed_at = excluded.observed_at,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    );

    const batch = snapshots.map((snap) =>
      stmt.bind(
        snap.isoRegion,
        snap.eiaRespondent,
        snap.observedAt,
        JSON.stringify(snap),
        updatedAt,
      ),
    );
    await env.DB.batch(batch);
  } catch {
    // D1 writes are best-effort; do not break API response if D1 fails transiently.
  }
}

function markFeedStaleIfNeeded(feed: LiveGridFeed, reason?: string): LiveGridFeed {
  const staleRegions: Partial<Record<IsoRegion, LiveIsoGridSnapshot>> = {};
  for (const iso of ALL_ISO_REGIONS) {
    const existing = feed.regions[iso];
    if (existing && (existing.demandMw !== null || existing.fuelMix.length > 0)) {
      staleRegions[iso] = {
        ...existing,
        status: "stale",
        ...(reason ? { error: reason } : {}),
      };
    } else {
      staleRegions[iso] = buildDegradedRegionSnapshot(iso, reason);
    }
  }
  return {
    ...feed,
    status: "stale",
    regions: staleRegions,
    ...(reason ? { error: reason } : {}),
  };
}

export async function fetchLiveGridFeed(
  env: Env = {},
  opts: TelemetryFetchOptions = {},
): Promise<LiveGridFeed> {
  if (!opts.refresh) {
    const cached = await readCachedJson<LiveGridFeed>(GRID_CACHE_KEY);
    if (cached) {
      const ageMs = Date.now() - Date.parse(cached.fetchedAt);
      if (Number.isFinite(ageMs) && ageMs <= GRID_SLA_MS) {
        return cached;
      }
      return markFeedStaleIfNeeded(cached, "Cached EIA grid snapshot exceeded 60-minute SLA");
    }

    const d1Cached = await readGridSnapshotsFromD1(env);
    if (
      d1Cached.snapshots.size === ALL_ISO_REGIONS.length &&
      d1Cached.oldestUpdatedAtMs !== null &&
      Date.now() - d1Cached.oldestUpdatedAtMs <= GRID_FRESH_D1_MS
    ) {
      const regions: Partial<Record<IsoRegion, LiveIsoGridSnapshot>> = {};
      for (const iso of ALL_ISO_REGIONS) {
        regions[iso] = d1Cached.snapshots.get(iso) ?? buildDegradedRegionSnapshot(iso);
      }
      return {
        fetchedAt: new Date(d1Cached.oldestUpdatedAtMs).toISOString(),
        status: "live",
        sourceUrl: PUBLIC_GRID_SOURCE_URL,
        regions,
      };
    }
  }

  const apiKey = env.EIA_API_KEY?.trim() || "DEMO_KEY";
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const respondentQuery = ALL_ISO_REGIONS.map(
    (iso) => `facets[respondent][]=${encodeURIComponent(ISO_TO_EIA_RESPONDENT[iso])}`,
  ).join("&");

  const regionUrl =
    `https://api.eia.gov/v2/electricity/rto/region-data/data/?api_key=${encodeURIComponent(apiKey)}` +
    `&frequency=hourly&data[0]=value&${respondentQuery}` +
    `&facets[type][]=D&facets[type][]=NG&facets[type][]=TI&sort[0][column]=period&sort[0][direction]=desc&length=1000`;

  const fuelUrl =
    `https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/?api_key=${encodeURIComponent(apiKey)}` +
    `&frequency=hourly&data[0]=value&${respondentQuery}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=500`;

  const [regionRes, fuelRes] = await Promise.all([
    fetchEiaEndpoint(regionUrl, timeoutMs, fetchFn),
    fetchEiaEndpoint(fuelUrl, timeoutMs, fetchFn),
  ]);

  const errors = [regionRes.error, fuelRes.error].filter((e): e is string => Boolean(e));
  const combinedError = errors.join("; ");

  const regionRowsByIso = new Map<IsoRegion, EiaApiRow[]>();
  for (const row of regionRes.rows) {
    const iso = EIA_RESPONDENT_TO_ISO[row.respondent?.trim().toUpperCase() ?? ""];
    if (!iso) continue;
    const list = regionRowsByIso.get(iso);
    if (list) list.push(row);
    else regionRowsByIso.set(iso, [row]);
  }

  const fuelRowsByIso = new Map<IsoRegion, EiaApiRow[]>();
  for (const row of fuelRes.rows) {
    const iso = EIA_RESPONDENT_TO_ISO[row.respondent?.trim().toUpperCase() ?? ""];
    if (!iso) continue;
    const list = fuelRowsByIso.get(iso);
    if (list) list.push(row);
    else fuelRowsByIso.set(iso, [row]);
  }

  const hasAnyUpstreamData = regionRowsByIso.size > 0 || fuelRowsByIso.size > 0;

  if (!hasAnyUpstreamData) {
    const staleCache = await readCachedJson<LiveGridFeed>(GRID_CACHE_KEY);
    if (staleCache) {
      return markFeedStaleIfNeeded(
        staleCache,
        combinedError || "EIA API v2 unavailable; serving stale edge cache",
      );
    }

    const d1Fallback = await readGridSnapshotsFromD1(env);
    if (d1Fallback.snapshots.size > 0) {
      const regions: Partial<Record<IsoRegion, LiveIsoGridSnapshot>> = {};
      for (const iso of ALL_ISO_REGIONS) {
        const snap = d1Fallback.snapshots.get(iso);
        if (snap) {
          regions[iso] = {
            ...snap,
            status: "stale",
            error: combinedError || "EIA API v2 unavailable; serving D1 snapshot",
          };
        } else {
          regions[iso] = buildDegradedRegionSnapshot(iso, combinedError || "EIA API v2 unavailable");
        }
      }
      return {
        fetchedAt: new Date().toISOString(),
        status: "stale",
        sourceUrl: PUBLIC_GRID_SOURCE_URL,
        regions,
        error: combinedError || "EIA API v2 unavailable; serving D1 snapshots",
      };
    }

    const degradedRegions: Partial<Record<IsoRegion, LiveIsoGridSnapshot>> = {};
    for (const iso of ALL_ISO_REGIONS) {
      degradedRegions[iso] = buildDegradedRegionSnapshot(
        iso,
        combinedError || "EIA API v2 returned no grid dispatch rows",
      );
    }
    return {
      fetchedAt: new Date().toISOString(),
      status: "degraded",
      sourceUrl: PUBLIC_GRID_SOURCE_URL,
      regions: degradedRegions,
      error: combinedError || "EIA API v2 returned no grid dispatch rows",
    };
  }

  const d1Existing = await readGridSnapshotsFromD1(env);
  const nowIso = new Date().toISOString();
  const regions: Partial<Record<IsoRegion, LiveIsoGridSnapshot>> = {};
  const snapshotsToPersist: LiveIsoGridSnapshot[] = [];
  let liveCount = 0;
  let staleCount = 0;

  for (const iso of ALL_ISO_REGIONS) {
    const eiaRespondent = ISO_TO_EIA_RESPONDENT[iso];
    const rRows = regionRowsByIso.get(iso) ?? [];
    const fRows = fuelRowsByIso.get(iso) ?? [];

    const byType = new Map<string, EiaApiRow[]>();
    for (const row of rRows) {
      const t = row.type?.trim().toUpperCase();
      if (!t) continue;
      const list = byType.get(t);
      if (list) list.push(row);
      else byType.set(t, [row]);
    }
    for (const list of byType.values()) {
      list.sort((a, b) => comparePeriodDesc(a.period ?? "", b.period ?? ""));
    }

    const latestD = byType.get("D")?.[0];
    const targetPeriod = latestD?.period?.trim() ?? null;

    const pickForType = (typeCode: string): EiaApiRow | undefined => {
      const list = byType.get(typeCode);
      if (!list || list.length === 0) return undefined;
      if (targetPeriod) {
        const matched = list.find((r) => r.period?.trim() === targetPeriod);
        if (matched) return matched;
      }
      return list[0];
    };

    const demandRow = latestD;
    const netGenRow = pickForType("NG");
    const interchangeRow = pickForType("TI");

    const demandMw = parseNumericMw(demandRow?.value);
    const netGenerationMw = parseNumericMw(netGenRow?.value);
    const interchangeMw = parseNumericMw(interchangeRow?.value);
    const { fuelMix, observedAt: fuelObservedAt } = buildFuelMixFromRows(fRows);

    const periodCandidates = [
      demandRow?.period,
      netGenRow?.period,
      interchangeRow?.period,
    ]
      .map((p) => p?.trim())
      .filter((p): p is string => Boolean(p))
      .sort(comparePeriodDesc);

    const observedAt = normalizeEiaPeriod(periodCandidates[0]) ?? fuelObservedAt;

    if (
      demandMw !== null ||
      netGenerationMw !== null ||
      interchangeMw !== null ||
      fuelMix.length > 0
    ) {
      const snap: LiveIsoGridSnapshot = {
        isoRegion: iso,
        eiaRespondent,
        observedAt,
        demandMw,
        netGenerationMw,
        interchangeMw,
        fuelMix,
        sourceUrl: `${PUBLIC_GRID_SOURCE_URL}?facets[respondent][]=${encodeURIComponent(eiaRespondent)}`,
        status: "live",
        ...(fuelRes.error && fuelMix.length === 0 ? { error: fuelRes.error } : {}),
      };
      regions[iso] = snap;
      snapshotsToPersist.push(snap);
      liveCount += 1;
    } else {
      const prev = d1Existing.snapshots.get(iso);
      if (prev) {
        regions[iso] = {
          ...prev,
          status: "stale",
          error: combinedError || `No fresh EIA rows for ${eiaRespondent}`,
        };
        staleCount += 1;
      } else {
        regions[iso] = buildDegradedRegionSnapshot(
          iso,
          combinedError || `No EIA rows returned for ${eiaRespondent}`,
        );
      }
    }
  }

  await writeGridSnapshotsToD1(env, snapshotsToPersist, nowIso);

  const feedStatus: LiveGridFeed["status"] =
    liveCount === ALL_ISO_REGIONS.length && errors.length === 0
      ? "live"
      : liveCount > 0 || staleCount > 0
        ? liveCount === ALL_ISO_REGIONS.length
          ? "live"
          : "stale"
        : "degraded";

  const feed: LiveGridFeed = {
    fetchedAt: nowIso,
    status: feedStatus,
    sourceUrl: PUBLIC_GRID_SOURCE_URL,
    regions,
    ...(combinedError ? { error: combinedError } : {}),
  };

  if (liveCount > 0) {
    await writeCachedJson(GRID_CACHE_KEY, feed, GRID_CACHE_TTL_SECONDS);
  }

  return feed;
}

export async function getGridSnapshotForIso(
  isoRegion: IsoRegion,
  env: Env = {},
  opts: TelemetryFetchOptions = {},
): Promise<LiveIsoGridSnapshot | null> {
  if (!opts.refresh) {
    const cachedFeed = await readCachedJson<LiveGridFeed>(GRID_CACHE_KEY);
    if (cachedFeed?.regions?.[isoRegion]) {
      const ageMs = Date.now() - Date.parse(cachedFeed.fetchedAt);
      if (Number.isFinite(ageMs) && ageMs <= GRID_SLA_MS) {
        return cachedFeed.regions[isoRegion] ?? null;
      }
      return {
        ...cachedFeed.regions[isoRegion]!,
        status: "stale",
      };
    }

    if (env.DB) {
      try {
        const row = await env.DB.prepare(
          "SELECT payload_json, updated_at FROM grid_snapshots WHERE iso_region = ? LIMIT 1",
        )
          .bind(isoRegion)
          .first<{ payload_json: string; updated_at: string }>();
        if (row) {
          const parsed = JSON.parse(row.payload_json) as LiveIsoGridSnapshot;
          const ageMs = Date.now() - Date.parse(row.updated_at);
          if (Number.isFinite(ageMs) && ageMs <= GRID_FRESH_D1_MS) {
            return parsed;
          }
        }
      } catch {
        // Fall through to live fetch.
      }
    }
  }

  const feed = await fetchLiveGridFeed(env, opts);
  return feed.regions[isoRegion] ?? null;
}
