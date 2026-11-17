import type { ActivityWindow } from "../shared/types.ts";

export const OBSERVATORY_USER_AGENT = "Undercurrent/1.1 (ops@mistystep.io)";
export const ATLAS_USER_AGENT = "(Undercurrent, contact@mistystep.io)";
export const DEFAULT_TIMEOUT_MS = 4500;

interface CfCacheStorage {
  default?: Cache;
}

export function getEdgeCache(): Cache | undefined {
  try {
    return (globalThis as unknown as { caches?: CfCacheStorage }).caches?.default;
  } catch {
    return undefined;
  }
}

export async function readCachedJson<T>(cacheKey: string): Promise<T | null> {
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

export async function writeCachedJson<T>(
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

export async function fetchWithTimeout(
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

const WINDOW_MS: Record<Exclude<ActivityWindow, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

export const VALID_ACTIVITY_WINDOWS = new Set<ActivityWindow>([
  "24h",
  "7d",
  "30d",
  "90d",
  "all",
]);

export function parseActivityWindow(raw: string | null | undefined): ActivityWindow | null {
  if (!raw || !raw.trim()) return "90d";
  const normalized = raw.trim().toLowerCase() as ActivityWindow;
  return VALID_ACTIVITY_WINDOWS.has(normalized) ? normalized : null;
}

export function isWithinActivityWindow(
  isoOrDate: string | null | undefined,
  window: ActivityWindow,
  nowMs = Date.now(),
): boolean {
  if (window === "all") return true;
  if (!isoOrDate) return false;
  const trimmed = isoOrDate.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return false;
  return parsed >= nowMs - WINDOW_MS[window];
}

export function normalizeDateIso(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00Z`;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : trimmed;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
