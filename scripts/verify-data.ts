#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ALL_FACILITIES,
  ALL_FOOTPRINTS,
  ALL_INDEX_ITEMS,
  FLEET_SUMMARY,
  ISO_REGIONS,
} from "../src/data/index.ts";
import type { FacilityRecord, IsoRegion } from "../src/shared/types.ts";
import {
  validateFacilities,
  validateFacilityIndex,
  validateFootprints,
  validateIsoRegions,
} from "../src/shared/validate.ts";
import { fetchRegulatoryFeed } from "../src/worker/regulatory.ts";
import { fetchBasinHydrology, fetchStationWeather } from "../src/worker/telemetry.ts";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const REQUIRED_ISOS: IsoRegion[] = [
  "PJM",
  "ERCOT",
  "MISO",
  "WECC",
  "CAISO",
  "SERC",
  "SPP",
  "NYISO",
  "ISO-NE",
];

const LEGACY_ZONE_KINDS = new Set([
  "campus_boundary",
  "operational_hall",
  "planned_expansion",
  "substation_yard",
  "cooling_yard",
]);

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
  const rootDir = resolve(dirname(new URL(import.meta.url).pathname), "..");

  if (ALL_INDEX_ITEMS.length === 0 || ALL_FACILITIES.length === 0) {
    console.error("FAIL: census index / ALL_FACILITIES is empty.");
    process.exit(1);
  }

  const indexRes = validateFacilityIndex(ALL_INDEX_ITEMS);
  const facilityRes = validateFacilities(ALL_FACILITIES);
  const footprintResVsIndex = validateFootprints(
    ALL_FOOTPRINTS,
    ALL_INDEX_ITEMS as unknown as FacilityRecord[],
  );
  const footprintResVsFacilities = validateFootprints(ALL_FOOTPRINTS, ALL_FACILITIES);
  const isoRes = validateIsoRegions(ISO_REGIONS);

  const invariantErrors: string[] = [];

  if (FLEET_SUMMARY.totalFacilities < 2200) {
    invariantErrors.push(
      `totalFacilities ${FLEET_SUMMARY.totalFacilities} < 2200 minimum`,
    );
  }
  if (ALL_INDEX_ITEMS.length !== FLEET_SUMMARY.totalFacilities) {
    invariantErrors.push(
      `ALL_INDEX_ITEMS.length (${ALL_INDEX_ITEMS.length}) !== FLEET_SUMMARY.totalFacilities (${FLEET_SUMMARY.totalFacilities})`,
    );
  }
  if (ALL_FACILITIES.length !== ALL_INDEX_ITEMS.length) {
    invariantErrors.push(
      `ALL_FACILITIES.length (${ALL_FACILITIES.length}) !== ALL_INDEX_ITEMS.length (${ALL_INDEX_ITEMS.length})`,
    );
  }
  if (FLEET_SUMMARY.statesCovered !== 51) {
    invariantErrors.push(`statesCovered ${FLEET_SUMMARY.statesCovered} !== 51`);
  }

  for (const iso of REQUIRED_ISOS) {
    const count = FLEET_SUMMARY.byIso[iso] ?? 0;
    if (count < 1) {
      invariantErrors.push(`ISO region ${iso} has 0 facilities`);
    }
  }
  if ((FLEET_SUMMARY.byIso["ISO-NE"] ?? 0) < 10) {
    invariantErrors.push(
      `ISO-NE facility count (${FLEET_SUMMARY.byIso["ISO-NE"] ?? 0}) < 10`,
    );
  }
  if ((FLEET_SUMMARY.byStatus.proposed ?? 0) < 18) {
    invariantErrors.push(
      `proposed facility count (${FLEET_SUMMARY.byStatus.proposed ?? 0}) < 18`,
    );
  }
  if (ALL_FOOTPRINTS.features.length < 1500) {
    invariantErrors.push(
      `real footprint polygons (${ALL_FOOTPRINTS.features.length}) < 1500`,
    );
  }

  if (existsSync(resolve(rootDir, "src/data/footprints-east.json"))) {
    invariantErrors.push("legacy synthetic file src/data/footprints-east.json still exists");
  }
  if (existsSync(resolve(rootDir, "src/data/footprints-west.json"))) {
    invariantErrors.push("legacy synthetic file src/data/footprints-west.json still exists");
  }

  for (const feat of ALL_FOOTPRINTS.features) {
    if (
      LEGACY_ZONE_KINDS.has(feat.properties.zoneKind) &&
      feat.geometry.coordinates[0].length <= 5
    ) {
      invariantErrors.push(
        `synthetic <=5-vertex legacy box found on ${feat.properties.facilityId} (${feat.properties.zoneKind})`,
      );
    }
  }

  const publicFootprintsPath = resolve(rootDir, "public/data/footprints-us.geojson");
  const srcFootprintsPath = resolve(rootDir, "src/data/footprints-us.json");
  if (!existsSync(publicFootprintsPath)) {
    invariantErrors.push("missing public/data/footprints-us.geojson");
  } else if (
    readFileSync(publicFootprintsPath, "utf8") !== readFileSync(srcFootprintsPath, "utf8")
  ) {
    invariantErrors.push(
      "public/data/footprints-us.geojson does not match src/data/footprints-us.json",
    );
  }

  let flagshipCount = 0;
  for (const f of ALL_FACILITIES) {
    if ((f.catalogTier ?? "flagship") === "flagship") {
      flagshipCount += 1;
      if (f.perspectives.proponent.length < 2) {
        invariantErrors.push(
          `${f.id}: flagship expected >= 2 proponent points, got ${f.perspectives.proponent.length}`,
        );
      }
      if (f.perspectives.critic.length < 2) {
        invariantErrors.push(
          `${f.id}: flagship expected >= 2 critic points, got ${f.perspectives.critic.length}`,
        );
      }
    }
  }
  if (flagshipCount < 75) {
    invariantErrors.push(`flagship dossier count (${flagshipCount}) < 75`);
  }

  const allErrors = [
    ...indexRes.errors,
    ...facilityRes.errors,
    ...footprintResVsIndex.errors,
    ...footprintResVsFacilities.errors,
    ...isoRes.errors,
    ...invariantErrors,
  ];

  console.log(
    `Schema summary: ${FLEET_SUMMARY.totalFacilities} campuses across ${FLEET_SUMMARY.statesCovered} jurisdictions (${flagshipCount} flagships, ${FLEET_SUMMARY.byTier.provisional} provisional, ${FLEET_SUMMARY.byTier.registry} registry), ${ALL_FOOTPRINTS.features.length} real polygons, ${ISO_REGIONS.features.length} ISO regions`,
  );
  console.log(
    `Capacity totals: ${FLEET_SUMMARY.verifiedOperationalMwTotal} MW verified operational, ${FLEET_SUMMARY.verifiedPlannedMwTotal} MW verified planned, ${FLEET_SUMMARY.reportedOrProposedMwTotal} MW reported/proposed | ${FLEET_SUMMARY.undisclosedWaterFacilityCount} undisclosed-water campuses`,
  );
  console.log(`ISOs: ${JSON.stringify(FLEET_SUMMARY.byIso)}`);
  console.log(`Statuses: ${JSON.stringify(FLEET_SUMMARY.byStatus)}`);

  if (allErrors.length > 0) {
    console.error(`Validation failed with ${allErrors.length} error(s):`);
    for (const err of allErrors.slice(0, 50)) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log("Static schema & invariant checks PASSED.");

  if (!withNetwork) {
    return;
  }

  console.log("\nRunning live network verification (--network)...");

  const curatedFacilities = ALL_FACILITIES.filter(
    (f) => f.catalogTier === "flagship" || f.catalogTier === "provisional",
  );
  const uniqueStations = Array.from(
    new Set(curatedFacilities.map((f) => f.waterAndCooling.nwsStationId)),
  );
  const uniqueGauges = Array.from(
    new Set(curatedFacilities.map((f) => f.waterAndCooling.usgsGaugeSiteId)),
  );
  const uniqueUrls = Array.from(
    new Set(
      curatedFacilities.flatMap((f) => [
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
    `NOAA NWS curated stations: ${weatherResults.length - weatherFailures.length}/${weatherResults.length} live`,
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
    `USGS curated gauges: ${gaugeLiveCount}/${gaugeResults.length} live, ${gaugeRateLimited.length} rate-limited (HTTP 429), ${gaugeFailures.length} failed`,
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
    `Provenance & permit URLs (${uniqueUrls.length} unique curated): ${okUrls.length} OK (2xx/3xx), ${guardedUrls.length} bot-guarded (403/429), ${brokenUrls.length} broken`,
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
