import type {
  ActivityWindow,
  FacilityIndexItem,
  FacilityRecord,
  IsoRegion,
  LivePulseFeed,
  LivePulseSignal,
  PulseStream,
} from "../shared/types.ts";
import { isSafeHttpUrl } from "../shared/validate.ts";
import { ALL_INDEX_ITEMS } from "./dataset.ts";
import type { Env, TelemetryFetchOptions } from "./env.ts";
import { ALL_ISO_REGIONS } from "./grid.ts";
import {
  DEFAULT_TIMEOUT_MS,
  OBSERVATORY_USER_AGENT,
  fetchWithTimeout,
  isWithinActivityWindow,
  normalizeDateIso,
  readCachedJson,
  writeCachedJson,
} from "./http.ts";
import { fetchRegulatoryFeed, stripHtmlTags } from "./regulatory.ts";

const PULSE_CACHE_KEY = "https://gridline-cache.internal/v2/pulse/live";
const PULSE_CACHE_TTL_SECONDS = 1800; // 30 minutes
const PULSE_SLA_MS = 24 * 60 * 60 * 1000;
const PULSE_FRESH_D1_MS = 30 * 60 * 1000;

export const ALL_PULSE_STREAMS: PulseStream[] = [
  "federal_register",
  "sec_edgar",
  "peeringdb",
];

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
]);

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

const STATE_TO_DEFAULT_ISO: Partial<Record<string, IsoRegion>> = {
  TX: "ERCOT", CA: "CAISO", NY: "NYISO",
  CT: "ISO-NE", MA: "ISO-NE", ME: "ISO-NE", NH: "ISO-NE", RI: "ISO-NE", VT: "ISO-NE",
  DE: "PJM", DC: "PJM", MD: "PJM", NJ: "PJM", OH: "PJM", PA: "PJM", VA: "PJM", WV: "PJM",
  FL: "SERC", GA: "SERC", NC: "SERC", SC: "SERC", AL: "SERC", TN: "SERC",
  IL: "MISO", IN: "MISO", IA: "MISO", LA: "MISO", MI: "MISO", MN: "MISO", MS: "MISO", MO: "MISO", WI: "MISO",
  KS: "SPP", NE: "SPP", OK: "SPP", ND: "SPP", SD: "SPP",
  AZ: "WECC", CO: "WECC", ID: "WECC", NV: "WECC", NM: "WECC", OR: "WECC", UT: "WECC", WA: "WECC", WY: "WECC",
};

export interface PulseFetchOptions extends TelemetryFetchOptions {
  stream?: PulseStream | "all";
  window?: ActivityWindow;
  facilities?: Array<FacilityIndexItem | FacilityRecord>;
}

interface CachedPulseBundle {
  fetchedAt: string;
  streamStatus: Record<PulseStream, "live" | "stale" | "degraded">;
  items: LivePulseSignal[];
  error?: string;
}

const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name]),
);

const GENERIC_FACILITY_NAME_RE =
  /^(data\s*cent(er|re)s?|colocation|telecom|server\s*farm|carrier\s*hotel|facility|building|campus)(\s+\d+|\s*\(\d+\))?$/i;

const GENERIC_PLACEHOLDER_PARTY = "Registry Colocation / Enterprise Operator";

const GENERIC_BRAND_STOPWORDS = new Set([
  "data", "center", "centre", "centers", "centres", "datacenter", "colocation",
  "colo", "campus", "facility", "facilities", "building", "buildings", "telecom",
  "server", "servers", "cloud", "digital", "holdings", "holding", "group",
  "energy", "power", "electric", "electricity", "corp", "corporation",
  "company", "incorporated", "inc", "llc", "ltd", "limited", "partners",
  "properties", "property", "technologies", "technology", "services",
  "network", "networks", "systems", "realty", "capital", "ventures",
  "venture", "north", "south", "east", "west", "central", "metro",
  "american", "united", "states", "national", "global", "industrial",
  "undisclosed", "unknown", "project", "phase", "clean", "green",
  "registry", "enterprise", "operator", "infrastructure", "solutions",
  "management", "internet", "exchange", "communications", "associates",
  "development", "developers", "trust", "reit",
]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSpecificFacilityName(name: string): boolean {
  const normalized = name.trim().replace(/\s+/g, " ");
  return normalized.length >= 14 && !GENERIC_FACILITY_NAME_RE.test(normalized);
}

function extractDistinctBrandTokens(
  fac: FacilityIndexItem | FacilityRecord,
  cityLower: string,
  stateLower: string,
): string[] {
  const rawOperator =
    "stakeholders" in fac ? fac.stakeholders.operator : fac.operator;
  const rawDeveloper =
    "stakeholders" in fac ? fac.stakeholders.developer : fac.developer;
  const operator =
    rawOperator === GENERIC_PLACEHOLDER_PARTY ? "" : (rawOperator ?? "");
  const developer =
    rawDeveloper === GENERIC_PLACEHOLDER_PARTY ? "" : (rawDeveloper ?? "");
  const nameForBrand = isSpecificFacilityName(fac.name ?? "")
    ? (fac.name ?? "")
    : "";
  const raw = `${operator} ${developer} ${nameForBrand}`;
  const tokens = raw.toLowerCase().match(/[a-z0-9]{5,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of tokens) {
    if (GENERIC_BRAND_STOPWORDS.has(tok)) continue;
    if (tok === cityLower || tok === stateLower) continue;
    if (/^\d+$/.test(tok)) continue;
    if (!seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out;
}

function inferMetadataFromText(
  text: string,
  explicitStates: string[] = [],
  facilities: Array<FacilityIndexItem | FacilityRecord> = ALL_INDEX_ITEMS,
): {
  states: string[];
  isoRegions: IsoRegion[];
  matchedFacilityIds: string[];
} {
  const lower = text.toLowerCase();
  const stateSet = new Set<string>();
  for (const s of explicitStates) {
    const code = s.trim().toUpperCase();
    if (US_STATE_CODES.has(code)) stateSet.add(code);
  }
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    const pattern = new RegExp(`\\b${name}\\b`, "i");
    if (pattern.test(lower)) {
      stateSet.add(code);
    }
  }

  const isoSet = new Set<IsoRegion>();
  for (const iso of ALL_ISO_REGIONS) {
    const pattern = new RegExp(`\\b${iso}\\b`, "i");
    if (pattern.test(text)) {
      isoSet.add(iso);
    }
  }
  for (const code of stateSet) {
    const fallbackIso = STATE_TO_DEFAULT_ISO[code];
    if (fallbackIso && isoSet.size === 0) {
      isoSet.add(fallbackIso);
    }
  }

  const matchedIds: string[] = [];
  for (const fac of facilities) {
    if (matchedIds.length >= 5) break;
    const facName = fac.name.trim().replace(/\s+/g, " ");
    const facNameLower = facName.toLowerCase();
    if (isSpecificFacilityName(facName) && lower.includes(facNameLower)) {
      matchedIds.push(fac.id);
      continue;
    }

    const cityTrim = fac.city.trim();
    const stateCode = fac.state.trim().toUpperCase();
    if (cityTrim.length < 4 || !stateCode) continue;

    const cityLower = cityTrim.toLowerCase();
    if (!lower.includes(cityLower)) continue;
    if (!new RegExp(`\\b${escapeRegex(cityLower)}\\b`, "i").test(lower)) {
      continue;
    }

    const stateName = STATE_CODE_TO_NAME[stateCode];
    const hasState =
      stateSet.has(stateCode) ||
      new RegExp(`\\b${escapeRegex(stateCode)}\\b`).test(text) ||
      (Boolean(stateName) &&
        new RegExp(`\\b${escapeRegex(stateName)}\\b`, "i").test(lower));
    if (!hasState) continue;

    const brandTokens = extractDistinctBrandTokens(
      fac,
      cityLower,
      stateCode.toLowerCase(),
    );
    const hasBrandCooccurrence = brandTokens.some(
      (tok) =>
        lower.includes(tok) &&
        new RegExp(`\\b${escapeRegex(tok)}\\b`, "i").test(lower),
    );
    if (hasBrandCooccurrence) {
      matchedIds.push(fac.id);
    }
  }

  return {
    states: Array.from(stateSet),
    isoRegions: Array.from(isoSet),
    matchedFacilityIds: matchedIds,
  };
}

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface SecEftsHit {
  _id?: string;
  _source?: {
    form?: string;
    file_date?: string;
    ciks?: string[];
    display_names?: string[];
    adsh?: string;
    biz_states?: string[];
    biz_locations?: string[];
    file_type?: string;
    file_description?: string;
  };
}

interface SecEftsResponse {
  hits?: {
    hits?: SecEftsHit[];
  };
}

function extractSecDisplayParts(displayRaw: string): {
  companyName: string;
  tickerOrCik: string;
} {
  const cleaned = displayRaw.replace(/\s+/g, " ").trim();
  const cikMatch = cleaned.match(/\(CIK\s+0*([0-9]+)\)/i);
  const withoutCik = cleaned.replace(/\(CIK\s+[0-9]+\)/gi, "").trim();
  const parenMatch = withoutCik.match(/\(([^()]+)\)\s*$/);
  const firstTicker = parenMatch?.[1]
    ?.split(",")
    .map((t) => t.trim())
    .find((t) => /^[A-Z0-9.-]{1,10}$/.test(t));
  const companyName = withoutCik || cleaned || "SEC Registrant";
  const tickerOrCik = firstTicker ?? (cikMatch ? `CIK ${cikMatch[1]}` : "");
  return { companyName, tickerOrCik };
}

export function buildSecArchiveUrl(
  ciks: string[] | undefined,
  adsh: string | undefined,
  hitId: string | undefined,
): string | null {
  const cikRaw = String(ciks?.[0] ?? "").trim();
  const cikNum = cikRaw.replace(/^0+/, "");
  const adshClean = String(adsh ?? "").trim();
  const adshNoDash = adshClean.replace(/-/g, "");
  if (!cikNum || !/^\d+$/.test(cikNum) || !adshNoDash || !/^\d+$/.test(adshNoDash)) {
    return null;
  }

  let docFilename = "";
  if (hitId && hitId.includes(":")) {
    const candidate = hitId.split(":").slice(1).join(":").trim();
    if (candidate && !candidate.includes("/") && !candidate.includes("..")) {
      docFilename = candidate;
    }
  }

  const filePart = docFilename || `${adshClean}-index.htm`;
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${adshNoDash}/${encodeURIComponent(filePart)}`;
  return isSafeHttpUrl(url) ? url : null;
}

async function fetchSecEdgarSignals(
  opts: TelemetryFetchOptions,
  facilities: Array<FacilityIndexItem | FacilityRecord>,
): Promise<{ ok: boolean; items: LivePulseSignal[]; error?: string }> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startDt = formatDateYmd(ninetyDaysAgo);
  const endDt = formatDateYmd(now);

  const url =
    `https://efts.sec.gov/LATEST/search-index?q=%22data+center%22+%22megawatt%22` +
    `&dateRange=custom&startdt=${encodeURIComponent(startDt)}&enddt=${encodeURIComponent(endDt)}` +
    `&forms=8-K,10-Q,10-K,S-1`;

  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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
      return { ok: false, items: [], error: `SEC EDGAR returned HTTP ${res.status}` };
    }

    const body = (await res.json()) as SecEftsResponse;
    const rawHits = Array.isArray(body?.hits?.hits) ? body.hits.hits : [];

    const dedupedByAdsh = new Map<string, LivePulseSignal>();
    for (const hit of rawHits) {
      const src = hit?._source;
      if (!src) continue;
      const adsh = String(src.adsh ?? "").trim();
      const form = String(src.form ?? "8-K").trim();
      const fileDate = String(src.file_date ?? "").trim();
      const archiveUrl = buildSecArchiveUrl(src.ciks, adsh, hit._id);
      if (!adsh || !fileDate || !archiveUrl) continue;
      if (dedupedByAdsh.has(adsh)) continue;

      const rawDisplay = String(src.display_names?.[0] ?? "SEC Registrant");
      const { companyName, tickerOrCik } = extractSecDisplayParts(rawDisplay);
      const fileDesc = stripHtmlTags(src.file_description || src.file_type || "");
      const locationText = Array.isArray(src.biz_locations)
        ? src.biz_locations.filter(Boolean).join("; ")
        : "";
      const summary = [
        `SEC Form ${form}${fileDesc ? ` (${fileDesc})` : ""} filed ${fileDate}`,
        locationText ? `Registrant HQ: ${locationText}` : "",
        `Accession ${adsh} matching "data center" + "megawatt" disclosure.`,
      ]
        .filter(Boolean)
        .join(" — ");

      const meta = inferMetadataFromText(
        `${companyName} ${locationText} ${summary}`,
        src.biz_states ?? [],
        facilities,
      );

      dedupedByAdsh.set(adsh, {
        id: `sec:${adsh}`,
        stream: "sec_edgar",
        title: `${companyName} — Form ${form}${fileDesc ? ` (${fileDesc})` : ""}`,
        publisher: companyName,
        publishedAt: normalizeDateIso(fileDate),
        summary,
        url: archiveUrl,
        pdfUrl: null,
        isoRegions: meta.isoRegions,
        states: meta.states,
        matchedFacilityIds: meta.matchedFacilityIds,
        epistemic: "filed",
        documentNumber: adsh,
        ...(tickerOrCik ? { tickerOrCik } : {}),
      });
    }

    const items = Array.from(dedupedByAdsh.values())
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 20);

    return { ok: true, items };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `SEC EDGAR request timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown SEC EDGAR error";
    return { ok: false, items: [], error: message };
  }
}

interface PeeringDbFacRow {
  id?: number;
  name?: string;
  org_name?: string;
  city?: string;
  state?: string;
  updated?: string;
  net_count?: number;
  ix_count?: number;
}

interface PeeringDbFacResponse {
  data?: PeeringDbFacRow[];
}

async function fetchPeeringDbSignals(
  opts: TelemetryFetchOptions,
  facilities: Array<FacilityIndexItem | FacilityRecord>,
): Promise<{ ok: boolean; items: LivePulseSignal[]; error?: string }> {
  const url =
    "https://www.peeringdb.com/api/fac?country=US&fields=id,name,org_name,city,state,updated,net_count,ix_count";
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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
      return { ok: false, items: [], error: `PeeringDB API returned HTTP ${res.status}` };
    }

    const body = (await res.json()) as PeeringDbFacResponse;
    const rows = Array.isArray(body?.data) ? body.data : [];

    const validRows = rows
      .filter(
        (r): r is PeeringDbFacRow & { id: number; updated: string } =>
          typeof r?.id === "number" &&
          Number.isFinite(r.id) &&
          typeof r?.updated === "string" &&
          Number.isFinite(Date.parse(r.updated)),
      )
      .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
      .slice(0, 25);

    const items: LivePulseSignal[] = [];
    for (const row of validRows) {
      const facUrl = `https://www.peeringdb.com/fac/${row.id}`;
      if (!isSafeHttpUrl(facUrl)) continue;
      const name = stripHtmlTags(row.name || `Facility #${row.id}`);
      const orgName = stripHtmlTags(row.org_name || "PeeringDB Colocation");
      const city = stripHtmlTags(row.city || "");
      const state = stripHtmlTags(row.state || "").toUpperCase();
      const netCount = typeof row.net_count === "number" ? row.net_count : 0;
      const ixCount = typeof row.ix_count === "number" ? row.ix_count : 0;
      const locationLabel = [city, state].filter(Boolean).join(", ");
      const summary = `${orgName} colocation registry record${locationLabel ? ` in ${locationLabel}` : ""}: ${netCount} interconnected networks, ${ixCount} IXPs.`;
      const meta = inferMetadataFromText(
        `${name} ${orgName} ${locationLabel}`,
        state ? [state] : [],
        facilities,
      );

      items.push({
        id: `pdb:${row.id}`,
        stream: "peeringdb",
        title: locationLabel ? `${name} — ${locationLabel}` : name,
        publisher: orgName,
        publishedAt: normalizeDateIso(row.updated),
        summary,
        url: facUrl,
        pdfUrl: null,
        isoRegions: meta.isoRegions,
        states: meta.states,
        matchedFacilityIds: meta.matchedFacilityIds,
        epistemic: "disclosed",
        peeringDbFacId: row.id,
      });
    }

    return { ok: true, items };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `PeeringDB API timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown PeeringDB API error";
    return { ok: false, items: [], error: message };
  }
}

async function fetchFederalRegisterSignals(
  opts: TelemetryFetchOptions,
  facilities: Array<FacilityIndexItem | FacilityRecord>,
): Promise<{ ok: boolean; items: LivePulseSignal[]; error?: string }> {
  const regFeed = await fetchRegulatoryFeed(opts);
  if (regFeed.status !== "live") {
    return { ok: false, items: [], error: regFeed.error ?? "Federal Register unavailable" };
  }

  const items: LivePulseSignal[] = [];
  for (const item of regFeed.items) {
    if (!isSafeHttpUrl(item.htmlUrl)) continue;
    const publisher = item.agencies.join(", ") || "Federal Register";
    const summary = item.abstract || `${item.type} (${item.documentNumber})`;
    const meta = inferMetadataFromText(
      `${item.title} ${summary} ${publisher}`,
      [],
      facilities,
    );
    items.push({
      id: `fr:${item.documentNumber || item.htmlUrl}`,
      stream: "federal_register",
      title: item.title,
      publisher,
      publishedAt: normalizeDateIso(item.publicationDate),
      summary,
      url: item.htmlUrl,
      pdfUrl: item.pdfUrl && isSafeHttpUrl(item.pdfUrl) ? item.pdfUrl : null,
      isoRegions: meta.isoRegions,
      states: meta.states,
      matchedFacilityIds: meta.matchedFacilityIds,
      epistemic: "filed",
      documentNumber: item.documentNumber,
    });
  }

  return { ok: true, items };
}

interface LiveSignalDbRow {
  id: string;
  stream: string;
  title: string;
  publisher: string;
  published_at: string;
  summary: string;
  url: string;
  pdf_url: string | null;
  iso_regions_json: string | null;
  states_json: string | null;
  matched_facility_ids_json: string | null;
  epistemic: string;
  document_number: string | null;
  ticker_or_cik: string | null;
  peeringdb_fac_id: number | null;
  ingested_at: string;
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function rowToPulseSignal(row: LiveSignalDbRow): LivePulseSignal {
  return {
    id: row.id,
    stream: row.stream as PulseStream,
    title: row.title,
    publisher: row.publisher,
    publishedAt: row.published_at,
    summary: row.summary,
    url: row.url,
    pdfUrl: row.pdf_url,
    isoRegions: parseJsonArray<IsoRegion>(row.iso_regions_json),
    states: parseJsonArray<string>(row.states_json),
    matchedFacilityIds: parseJsonArray<string>(row.matched_facility_ids_json),
    epistemic: row.epistemic as LivePulseSignal["epistemic"],
    ...(row.document_number ? { documentNumber: row.document_number } : {}),
    ...(row.ticker_or_cik ? { tickerOrCik: row.ticker_or_cik } : {}),
    ...(row.peeringdb_fac_id !== null ? { peeringDbFacId: row.peeringdb_fac_id } : {}),
  };
}

async function readSignalsFromD1(
  env: Env,
  stream?: PulseStream,
): Promise<{ items: LivePulseSignal[]; newestIngestedAtMs: number | null }> {
  if (!env.DB) return { items: [], newestIngestedAtMs: null };
  try {
    const sql = stream
      ? `SELECT * FROM live_signals WHERE stream = ? ORDER BY published_at DESC LIMIT 40`
      : `SELECT * FROM live_signals ORDER BY published_at DESC LIMIT 120`;
    const stmt = stream ? env.DB.prepare(sql).bind(stream) : env.DB.prepare(sql);
    const res = await stmt.all<LiveSignalDbRow>();
    const rows = res.results ?? [];
    let newestMs: number | null = null;
    const items: LivePulseSignal[] = [];
    for (const row of rows) {
      if (!isSafeHttpUrl(row.url)) continue;
      items.push(rowToPulseSignal(row));
      const ms = Date.parse(row.ingested_at);
      if (Number.isFinite(ms)) {
        newestMs = newestMs === null ? ms : Math.max(newestMs, ms);
      }
    }
    return { items, newestIngestedAtMs: newestMs };
  } catch {
    return { items: [], newestIngestedAtMs: null };
  }
}

async function writeSignalsToD1(
  env: Env,
  signals: LivePulseSignal[],
  ingestedAt: string,
): Promise<void> {
  if (!env.DB || signals.length === 0) return;

  try {
    const stmt = env.DB.prepare(
      `INSERT INTO live_signals (
        id, stream, title, publisher, published_at, summary, url, pdf_url,
        iso_regions_json, states_json, matched_facility_ids_json, epistemic,
        document_number, ticker_or_cik, peeringdb_fac_id, ingested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        stream = excluded.stream,
        title = excluded.title,
        publisher = excluded.publisher,
        published_at = excluded.published_at,
        summary = excluded.summary,
        url = excluded.url,
        pdf_url = excluded.pdf_url,
        iso_regions_json = excluded.iso_regions_json,
        states_json = excluded.states_json,
        matched_facility_ids_json = excluded.matched_facility_ids_json,
        epistemic = excluded.epistemic,
        document_number = excluded.document_number,
        ticker_or_cik = excluded.ticker_or_cik,
        peeringdb_fac_id = excluded.peeringdb_fac_id,
        ingested_at = excluded.ingested_at`,
    );

    const chunkSize = 40;
    for (let i = 0; i < signals.length; i += chunkSize) {
      const chunk = signals.slice(i, i + chunkSize);
      await env.DB.batch(
        chunk.map((s) =>
          stmt.bind(
            s.id,
            s.stream,
            s.title,
            s.publisher,
            s.publishedAt,
            s.summary,
            s.url,
            s.pdfUrl ?? null,
            JSON.stringify(s.isoRegions ?? []),
            JSON.stringify(s.states ?? []),
            JSON.stringify(s.matchedFacilityIds ?? []),
            s.epistemic,
            s.documentNumber ?? null,
            s.tickerOrCik ?? null,
            s.peeringDbFacId ?? null,
            ingestedAt,
          ),
        ),
      );
    }
  } catch {
    // D1 persistence is best-effort.
  }
}

function filterPulseBundle(
  bundle: CachedPulseBundle,
  streamFilter: PulseStream | "all",
  window: ActivityWindow,
): LivePulseFeed {
  const filteredItems = bundle.items
    .filter((item) => {
      if (streamFilter !== "all" && item.stream !== streamFilter) return false;
      return isWithinActivityWindow(item.publishedAt, window);
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const statuses = Object.values(bundle.streamStatus);
  const allLive = statuses.every((s) => s === "live");
  const allDegraded = statuses.every((s) => s === "degraded");
  const status: LivePulseFeed["status"] = allLive
    ? "live"
    : allDegraded
      ? "degraded"
      : "stale";

  return {
    fetchedAt: bundle.fetchedAt,
    window,
    status,
    streamStatus: bundle.streamStatus,
    items: filteredItems,
    ...(bundle.error ? { error: bundle.error } : {}),
  };
}

export async function fetchLivePulseFeed(
  env: Env = {},
  opts: PulseFetchOptions = {},
): Promise<LivePulseFeed> {
  const streamFilter: PulseStream | "all" = opts.stream ?? "all";
  const window: ActivityWindow = opts.window ?? "90d";
  const facilities = opts.facilities ?? ALL_INDEX_ITEMS;

  if (!opts.refresh) {
    const cached = await readCachedJson<CachedPulseBundle>(PULSE_CACHE_KEY);
    if (cached) {
      const ageMs = Date.now() - Date.parse(cached.fetchedAt);
      if (Number.isFinite(ageMs) && ageMs <= PULSE_SLA_MS) {
        return filterPulseBundle(cached, streamFilter, window);
      }
      return filterPulseBundle(
        {
          ...cached,
          streamStatus: {
            federal_register: "stale",
            sec_edgar: "stale",
            peeringdb: "stale",
          },
          error: "Cached pulse bundle exceeded 24-hour SLA",
        },
        streamFilter,
        window,
      );
    }

    if (env.DB) {
      const d1ByStream = await Promise.all(
        ALL_PULSE_STREAMS.map((s) => readSignalsFromD1(env, s)),
      );
      const allFresh = d1ByStream.every(
        (res) =>
          res.items.length > 0 &&
          res.newestIngestedAtMs !== null &&
          Date.now() - res.newestIngestedAtMs <= PULSE_FRESH_D1_MS,
      );
      if (allFresh) {
        const combined = d1ByStream.flatMap((r) => r.items);
        const newest = Math.max(
          ...d1ByStream.map((r) => r.newestIngestedAtMs ?? 0),
        );
        return filterPulseBundle(
          {
            fetchedAt: new Date(newest).toISOString(),
            streamStatus: {
              federal_register: "live",
              sec_edgar: "live",
              peeringdb: "live",
            },
            items: combined,
          },
          streamFilter,
          window,
        );
      }
    }
  }

  const [frRes, secRes, pdbRes] = await Promise.all([
    fetchFederalRegisterSignals(opts, facilities),
    fetchSecEdgarSignals(opts, facilities),
    fetchPeeringDbSignals(opts, facilities),
  ]);

  const nowIso = new Date().toISOString();
  const streamResults: Record<
    PulseStream,
    { ok: boolean; items: LivePulseSignal[]; error?: string }
  > = {
    federal_register: frRes,
    sec_edgar: secRes,
    peeringdb: pdbRes,
  };

  const streamStatus: Record<PulseStream, "live" | "stale" | "degraded"> = {
    federal_register: "degraded",
    sec_edgar: "degraded",
    peeringdb: "degraded",
  };

  const liveToPersist: LivePulseSignal[] = [];
  const allSignals: LivePulseSignal[] = [];
  const errors: string[] = [];

  if (opts.refresh && env.DB) {
    try {
      await env.DB.prepare(
        "UPDATE live_signals SET matched_facility_ids_json = '[]' WHERE stream = 'sec_edgar' OR matched_facility_ids_json LIKE '%im3-or-data-center%'",
      ).run();
    } catch {
      // Best-effort cleanup of stale entity matches on forced refresh.
    }
  }

  for (const stream of ALL_PULSE_STREAMS) {
    const res = streamResults[stream];
    if (res.ok) {
      streamStatus[stream] = "live";
      allSignals.push(...res.items);
      liveToPersist.push(...res.items);
      continue;
    }

    if (res.error) errors.push(`${stream}: ${res.error}`);

    const d1Stream = await readSignalsFromD1(env, stream);
    if (d1Stream.items.length > 0) {
      streamStatus[stream] = "stale";
      allSignals.push(...d1Stream.items);
    } else {
      streamStatus[stream] = "degraded";
    }
  }

  await writeSignalsToD1(env, liveToPersist, nowIso);

  const bundle: CachedPulseBundle = {
    fetchedAt: nowIso,
    streamStatus,
    items: allSignals,
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  };

  if (liveToPersist.length > 0) {
    await writeCachedJson(PULSE_CACHE_KEY, bundle, PULSE_CACHE_TTL_SECONDS);
  }

  return filterPulseBundle(bundle, streamFilter, window);
}
