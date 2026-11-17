import type { LiveRegulatoryFeed, LiveRegulatoryItem } from "../shared/types.ts";

const FEDERAL_REGISTER_URL =
  "https://www.federalregister.gov/api/v1/documents.json?per_page=15&order=newest&conditions%5Bterm%5D=%22data+center%22+electric";
const CACHE_KEY = "https://gridline-cache.internal/v1/regulatory/federal-register";
const CACHE_TTL_SECONDS = 1800;
const DEFAULT_TIMEOUT_MS = 4500;
const USER_AGENT = "(GridlineAtlas, contact@mistystep.io)";

export interface RegulatoryFetchOptions {
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

function stripHtmlTags(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
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
  const cache = getEdgeCache();
  if (!opts.refresh && cache) {
    try {
      const hit = await cache.match(new Request(CACHE_KEY));
      if (hit) {
        return (await hit.json()) as LiveRegulatoryFeed;
      }
    } catch {
      // Ignore cache read error.
    }
  }

  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(FEDERAL_REGISTER_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

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
      const abstractText =
        typeof doc.abstract === "string" && doc.abstract.trim().length > 0
          ? doc.abstract.trim()
          : stripHtmlTags(doc.excerpts);

      return {
        documentNumber: String(doc.document_number ?? ""),
        title: String(doc.title ?? ""),
        agencies: Array.isArray(doc.agencies)
          ? doc.agencies
              .map((a) => String(a?.name ?? a?.raw_name ?? "").trim())
              .filter(Boolean)
          : [],
        publicationDate: String(doc.publication_date ?? ""),
        type: String(doc.type ?? ""),
        abstract: abstractText,
        htmlUrl: String(doc.html_url ?? ""),
        pdfUrl:
          typeof doc.pdf_url === "string" && doc.pdf_url.length > 0 ? doc.pdf_url : null,
      };
    });

    const feed: LiveRegulatoryFeed = {
      fetchedAt: new Date().toISOString(),
      status: "live",
      sourceUrl: FEDERAL_REGISTER_URL,
      items,
    };

    if (cache) {
      try {
        await cache.put(
          new Request(CACHE_KEY),
          new Response(JSON.stringify(feed), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
            },
          }),
        );
      } catch {
        // Cache write is best-effort.
      }
    }

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
  } finally {
    clearTimeout(timer);
  }
}
