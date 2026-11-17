#!/usr/bin/env bun
import { ALL_FACILITIES, ALL_FOOTPRINTS, ISO_REGIONS } from "../src/data/index.ts";
import {
  validateFacilities,
  validateFootprints,
  validateIsoRegions,
} from "../src/shared/validate.ts";
import { fetchRegulatoryFeed } from "../src/worker/regulatory.ts";
import { fetchBasinHydrology, fetchStationWeather } from "../src/worker/telemetry.ts";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface UrlCheckOutcome {
  url: string;
  status: number | null;
  category: "ok" | "bot_guarded" | "broken";
  detail?: string;
}

async function checkSingleUrl(url: string, timeoutMs = 8000): Promise<UrlCheckOutcome> {
  const attempt = async (method: "HEAD" | "GET"): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await attempt("HEAD");
    if (res.status === 405 || res.status === 403 || res.status === 400 || res.status === 406) {
      await res.body?.cancel();
      res = await attempt("GET");
    }
    const status = res.status;
    await res.body?.cancel();
    if (status >= 200 && status < 400) {
      return { url, status, category: "ok" };
    }
    if (status === 403 || status === 429) {
      return {
        url,
        status,
        category: "bot_guarded",
        detail: `HTTP ${status}`,
      };
    }
    return {
      url,
      status,
      category: "broken",
      detail: `HTTP ${status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    if (msg.includes("TooManyRedirects")) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const manual = await fetch(url, {
            method: "GET",
            redirect: "manual",
            headers: { "User-Agent": BROWSER_UA },
            signal: controller.signal,
          });
          await manual.body?.cancel();
          const loc = manual.headers.get("location");
          if (manual.status >= 300 && manual.status < 400 && loc === url) {
            return {
              url,
              status: manual.status,
              category: "bot_guarded",
              detail: "WAF cookie redirect loop",
            };
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // Fall through to broken report.
      }
    }
    return {
      url,
      status: null,
      category: "broken",
      detail: msg,
    };
  }
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function main(): Promise<void> {
  const withNetwork = process.argv.includes("--network");

  if (ALL_FACILITIES.length === 0) {
    console.error("FAIL: ALL_FACILITIES is empty (datasets not yet wired into src/data/index.ts).");
    process.exit(1);
  }

  const facilityRes = validateFacilities(ALL_FACILITIES);
  const footprintRes = validateFootprints(ALL_FOOTPRINTS, ALL_FACILITIES);
  const isoRes = validateIsoRegions(ISO_REGIONS);

  const qualityErrors: string[] = [];
  for (const f of ALL_FACILITIES) {
    if (f.perspectives.proponent.length < 2) {
      qualityErrors.push(`${f.id}: expected >= 2 proponent points, got ${f.perspectives.proponent.length}`);
    }
    if (f.perspectives.critic.length < 2) {
      qualityErrors.push(`${f.id}: expected >= 2 critic points, got ${f.perspectives.critic.length}`);
    }
  }

  const allErrors = [
    ...facilityRes.errors,
    ...footprintRes.errors,
    ...isoRes.errors,
    ...qualityErrors,
  ];

  const operationalMw = Math.round(
    ALL_FACILITIES.reduce((sum, f) => sum + (f.power.operationalMw.value ?? 0), 0),
  );
  const plannedMw = Math.round(
    ALL_FACILITIES.reduce((sum, f) => sum + (f.power.totalPlannedMw.value ?? 0), 0),
  );
  const undisclosedWater = ALL_FACILITIES.filter(
    (f) =>
      f.waterAndCooling.peakOrAvgWaterMgd.epistemic === "undisclosed" ||
      f.waterAndCooling.annualWaterMgy.epistemic === "undisclosed",
  ).length;

  console.log(
    `Schema summary: ${ALL_FACILITIES.length} facilities, ${ALL_FOOTPRINTS.features.length} footprint polygons, ${ISO_REGIONS.features.length} ISO regions`,
  );
  console.log(
    `Totals: ${operationalMw} MW operational, ${plannedMw} MW planned, ${undisclosedWater} undisclosed-water facilities`,
  );

  if (allErrors.length > 0) {
    console.error(`Validation failed with ${allErrors.length} error(s):`);
    for (const err of allErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log("Static schema & invariant checks PASSED.");

  if (!withNetwork) {
    return;
  }

  console.log("\nRunning live network verification (--network)...");

  const uniqueStations = Array.from(
    new Set(ALL_FACILITIES.map((f) => f.waterAndCooling.nwsStationId)),
  );
  const uniqueGauges = Array.from(
    new Set(ALL_FACILITIES.map((f) => f.waterAndCooling.usgsGaugeSiteId)),
  );
  const uniqueUrls = Array.from(
    new Set(
      ALL_FACILITIES.flatMap((f) => [
        ...f.sources.map((s) => s.url),
        ...f.regulatory.permits.map((p) => p.url),
      ]),
    ),
  );

  const weatherResults = await runPool(uniqueStations, 6, (id) =>
    fetchStationWeather(id, { refresh: true, timeoutMs: 8000 }),
  );
  const weatherFailures = weatherResults.filter((w) => w.status !== "live");
  console.log(
    `NOAA NWS stations: ${weatherResults.length - weatherFailures.length}/${weatherResults.length} live`,
  );
  for (const w of weatherFailures) {
    console.error(`  - NOAA ${w.stationId} degraded: ${w.error}`);
  }

  const gaugeResults = await runPool(uniqueGauges, 6, (id) =>
    fetchBasinHydrology(id, { refresh: true, timeoutMs: 8000 }),
  );
  const gaugeRateLimited = gaugeResults.filter(
    (g) => g.status !== "live" && g.error?.includes("HTTP 429"),
  );
  const gaugeFailures = gaugeResults.filter(
    (g) => g.status !== "live" && !g.error?.includes("HTTP 429"),
  );
  const gaugeLiveCount = gaugeResults.length - gaugeRateLimited.length - gaugeFailures.length;
  console.log(
    `USGS gauges: ${gaugeLiveCount}/${gaugeResults.length} live, ${gaugeRateLimited.length} rate-limited (HTTP 429), ${gaugeFailures.length} failed`,
  );
  for (const g of gaugeFailures) {
    console.error(`  - USGS ${g.siteId} failed: ${g.error}`);
  }

  const regFeed = await fetchRegulatoryFeed({ refresh: true, timeoutMs: 8000 });
  console.log(
    `Federal Register feed: ${regFeed.status} (${regFeed.items.length} items)${regFeed.error ? ` — ${regFeed.error}` : ""}`,
  );

  const urlResults = await runPool(uniqueUrls, 10, (url) => checkSingleUrl(url, 8000));
  const okUrls = urlResults.filter((r) => r.category === "ok");
  const guardedUrls = urlResults.filter((r) => r.category === "bot_guarded");
  const brokenUrls = urlResults.filter((r) => r.category === "broken");
  console.log(
    `Provenance & permit URLs (${uniqueUrls.length} unique): ${okUrls.length} OK (2xx/3xx), ${guardedUrls.length} bot-guarded (403/429), ${brokenUrls.length} broken`,
  );
  for (const b of brokenUrls) {
    console.error(`  - BROKEN [${b.detail ?? "error"}] ${b.url}`);
  }

  if (
    weatherFailures.length > 0 ||
    gaugeFailures.length > 0 ||
    regFeed.status !== "live" ||
    brokenUrls.length > 0
  ) {
    process.exit(1);
  }
  console.log("Live network verification PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
