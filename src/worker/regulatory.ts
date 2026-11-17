import type { LiveRegulatoryFeed, LiveRegulatoryItem } from "../shared/types.ts";
import { isSafeHttpUrl } from "../shared/validate.ts";
import {
  ATLAS_USER_AGENT,
  DEFAULT_TIMEOUT_MS,
  fetchWithTimeout,
  readCachedJson,
  writeCachedJson,
} from "./http.ts";

const FEDERAL_REGISTER_URL =
  "https://www.federalregister.gov/api/v1/documents.json?per_page=15&order=newest&conditions%5Bterm%5D=%22data+center%22+electric&conditions%5Bagencies%5D%5B%5D=energy-department&conditions%5Bagencies%5D%5B%5D=federal-energy-regulatory-commission&conditions%5Bagencies%5D%5B%5D=environmental-protection-agency&conditions%5Bagencies%5D%5B%5D=nuclear-regulatory-commission";
const CACHE_KEY = "https://undercurrent-cache.internal/v2/regulatory/federal-register";
const CACHE_TTL_SECONDS = 1800;

export interface RegulatoryFetchOptions {
  refresh?: boolean;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export function stripHtmlTags(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/\bNO<INF>\s*[xX]\s*<\/INF>/gi, "NOx")
    .replace(/\bSO<INF>\s*[xX]\s*<\/INF>/gi, "SOx")
    .replace(/<\/?(?:INF|SUP|SU|E)(?:\s+[^>]*)?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&hellip;|&#8230;/gi, "...")
    .replace(/[•○■▪]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface FederalRegisterResponse {
  results?: Array<{
    document_number?: string;
    title?: string;
    agencies?: Array<{ name?: string; raw_name?: string }>;
    publication_date?: string;
    type?: string;
    abstract?: string | null;
    excerpts?: string | null;
    html_url?: string;
    pdf_url?: string | null;
  }>;
}

export async function fetchRegulatoryFeed(
  opts: RegulatoryFetchOptions = {},
): Promise<LiveRegulatoryFeed> {
  if (!opts.refresh) {
    const cached = await readCachedJson<LiveRegulatoryFeed>(CACHE_KEY);
    if (cached) return cached;
  }

  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetchWithTimeout(
      FEDERAL_REGISTER_URL,
      {
        headers: {
          "User-Agent": ATLAS_USER_AGENT,
          Accept: "application/json",
        },
      },
      timeoutMs,
      fetchFn,
    );

    if (!res.ok) {
      return {
        fetchedAt: new Date().toISOString(),
        status: "degraded",
        sourceUrl: FEDERAL_REGISTER_URL,
        items: [],
        error: `Federal Register API returned HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as FederalRegisterResponse;
    const rawResults = Array.isArray(body?.results) ? body.results : [];

    const items: LiveRegulatoryItem[] = rawResults.map((doc) => {
      const rawAbstract =
        typeof doc.abstract === "string" && doc.abstract.trim().length > 0
          ? doc.abstract
          : doc.excerpts;
      const htmlUrl =
        typeof doc.html_url === "string" && isSafeHttpUrl(doc.html_url)
          ? doc.html_url
          : "https://www.federalregister.gov/";
      const pdfUrl =
        typeof doc.pdf_url === "string" && isSafeHttpUrl(doc.pdf_url)
          ? doc.pdf_url
          : null;

      return {
        documentNumber: String(doc.document_number ?? ""),
        title: stripHtmlTags(doc.title),
        agencies: Array.isArray(doc.agencies)
          ? doc.agencies
              .map((a) => stripHtmlTags(a?.name ?? a?.raw_name ?? ""))
              .filter(Boolean)
          : [],
        publicationDate: String(doc.publication_date ?? ""),
        type: stripHtmlTags(doc.type),
        abstract: stripHtmlTags(rawAbstract),
        htmlUrl,
        pdfUrl,
      };
    });

    const feed: LiveRegulatoryFeed = {
      fetchedAt: new Date().toISOString(),
      status: "live",
      sourceUrl: FEDERAL_REGISTER_URL,
      items,
    };

    await writeCachedJson(CACHE_KEY, feed, CACHE_TTL_SECONDS);
    return feed;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Federal Register API timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown Federal Register API error";

    return {
      fetchedAt: new Date().toISOString(),
      status: "degraded",
      sourceUrl: FEDERAL_REGISTER_URL,
      items: [],
      error: message,
    };
  }
}
