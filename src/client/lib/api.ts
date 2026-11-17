import type {
  FacilitiesApiResponse,
  LiveFacilityTelemetry,
  LiveRegulatoryFeed,
  TelemetrySummaryApiResponse,
} from "@shared/types";

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
  return (await res.json()) as T;
}

export function fetchFacilitiesBundle(
  signal?: AbortSignal,
): Promise<FacilitiesApiResponse> {
  return getJson<FacilitiesApiResponse>("/api/facilities", signal);
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

export function fetchLiveRegulatory(
  refresh = false,
  signal?: AbortSignal,
): Promise<LiveRegulatoryFeed> {
  const url = refresh ? "/api/regulatory/live?refresh=1" : "/api/regulatory/live";
  return getJson<LiveRegulatoryFeed>(url, signal);
}
