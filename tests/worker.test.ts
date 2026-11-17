import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { D1Database, Fetcher } from "@cloudflare/workers-types";
import type {
  CampusFootprintProps,
  FacilityIndexItem,
  FacilityRecord,
  FleetSummaryMetadata,
  IsoRegionProps,
  LiveGridFeed,
  LivePulseFeed,
  TelemetrySummaryApiResponse,
} from "../src/shared/types.ts";
import { recordToIndexItem } from "../src/worker/dataset.ts";
import { handleRequest, runScheduledIngest, type DatasetBundle } from "../src/worker/index.ts";
import { stripHtmlTags } from "../src/worker/regulatory.ts";
import { fetchTelemetrySummary } from "../src/worker/telemetry.ts";
import { makeFixtureFacility, makeFixtureFootprint } from "./validate.test.ts";

const MIGRATION_SQL = readFileSync(
  new URL("../migrations/0001_live_observatory.sql", import.meta.url),
  "utf8",
);

function createTestD1Database(): { db: D1Database; sqlite: Database } {
  const sqlite = new Database(":memory:");
  sqlite.exec(MIGRATION_SQL);

  const buildResult = <T>(results: T[]) => ({
    results,
    success: true as const,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: 0,
      last_row_id: 0,
      changed_db: true,
      changes: 0,
    },
  });

  const makeStmt = (sql: string, boundArgs: unknown[] = []) => {
    const stmt = {
      bind(...values: unknown[]) {
        return makeStmt(sql, values);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const row = sqlite
          .query(sql)
          .get(...(boundArgs as never[])) as Record<string, unknown> | null;
        if (!row) return null;
        if (colName) {
          return (row[colName] ?? null) as T | null;
        }
        return row as T;
      },
      async run<T = Record<string, unknown>>() {
        const info = sqlite.query(sql).run(...(boundArgs as never[]));
        return {
          ...buildResult<T>([]),
          meta: {
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: info.changes,
            last_row_id: Number(info.lastInsertRowid),
            changed_db: info.changes > 0,
            changes: info.changes,
          },
        };
      },
      async all<T = Record<string, unknown>>() {
        const rows = sqlite.query(sql).all(...(boundArgs as never[])) as T[];
        return buildResult(rows);
      },
      async raw() {
        return [];
      },
    };
    return stmt;
  };

  const db = {
    prepare(query: string) {
      return makeStmt(query);
    },
    async batch(statements: Array<{ all: () => Promise<unknown> }>) {
      const out = [];
      for (const s of statements) {
        out.push(await s.all());
      }
      return out;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;

  return { db, sqlite };
}

function buildTestDataset(): DatasetBundle {
  const todayIso = new Date().toISOString().slice(0, 10);
  const staleIso = "2020-01-15";

  const f1 = makeFixtureFacility({
    id: "ashburn-va",
    name: 'Equinix Ashburn, "Phase 2"',
    state: "VA",
    isoRegion: "PJM",
    lifecycleStatus: "operational",
    catalogTier: "flagship",
    footprintCoverage: "verified_polygons",
    lastVerified: todayIso,
    lastUpdated: todayIso,
  });

  const f2 = makeFixtureFacility({
    id: "peculiar-mo",
    name: "Peculiar Project Klein",
    marketCluster: "Kansas City",
    city: "Peculiar",
    county: "Cass County",
    state: "MO",
    isoRegion: "SPP",
    coordinates: [-94.458, 38.721],
    lifecycleStatus: "contested",
    catalogTier: "flagship",
    footprintCoverage: "verified_polygons",
    lastVerified: staleIso,
    lastUpdated: staleIso,
  });
  f2.power.operationalMw = { ...f2.power.operationalMw, value: 0, epistemic: "filed" };
  f2.power.totalPlannedMw = { ...f2.power.totalPlannedMw, value: 800, epistemic: "filed" };
  f2.waterAndCooling = {
    ...f2.waterAndCooling,
    coolingArchitecture: "evaporative_tower",
    peakOrAvgWaterMgd: {
      value: 3.2,
      unit: "MGD",
      epistemic: "estimated",
      asOf: "2026-01-01",
      basis: "Municipal water filing",
      sourceId: "src-1",
    },
    usgsGaugeSiteId: "06893500",
    nwsStationId: "KMCI",
  };
  f2.regulatory.moratoriumOrLitigationActive = true;

  const f3 = makeFixtureFacility({
    id: "pdb-us-sample",
    name: "Boston Harbor Carrier Hotel",
    marketCluster: "Boston",
    city: "Boston",
    county: "Suffolk County",
    state: "MA",
    isoRegion: "ISO-NE",
    coordinates: [-71.0589, 42.3601],
    lifecycleStatus: "operational",
    catalogTier: "registry",
    footprintCoverage: "point_only",
    lastVerified: todayIso,
    lastUpdated: todayIso,
  });
  f3.power.operationalMw = {
    ...f3.power.operationalMw,
    value: null,
    epistemic: "undisclosed",
    basis: "Colocation operator does not publish facility MW",
  };
  f3.power.totalPlannedMw = {
    ...f3.power.totalPlannedMw,
    value: null,
    epistemic: "undisclosed",
    basis: "Colocation operator does not publish planned MW",
  };
  f3.waterAndCooling.usgsGaugeSiteId = "01104500";
  f3.waterAndCooling.nwsStationId = "KBOS";

  const f4 = makeFixtureFacility({
    id: "proposed-tx-ai",
    name: "West Texas Hyperscale Proposal",
    marketCluster: "West Texas",
    city: "Abilene",
    county: "Taylor County",
    state: "TX",
    isoRegion: "ERCOT",
    coordinates: [-99.7331, 32.4487],
    lifecycleStatus: "proposed",
    catalogTier: "provisional",
    footprintCoverage: "point_only",
    lastVerified: todayIso,
    lastUpdated: todayIso,
  });
  f4.power.operationalMw = {
    ...f4.power.operationalMw,
    value: 0,
    epistemic: "reported",
    basis: "Not yet energized",
  };
  f4.power.totalPlannedMw = {
    ...f4.power.totalPlannedMw,
    value: 1200,
    epistemic: "reported",
    basis: "Press announcement pending interconnection approval",
  };
  f4.waterAndCooling.usgsGaugeSiteId = "08084000";
  f4.waterAndCooling.nwsStationId = "KABI";

  const fp1 = makeFixtureFootprint(f1.id, f1.lifecycleStatus);
  const fp2 = makeFixtureFootprint(f2.id, f2.lifecycleStatus);

  const footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> = {
    type: "FeatureCollection",
    features: [...fp1.features, ...fp2.features],
  };

  const isoRegions: GeoJSON.FeatureCollection<GeoJSON.Polygon, IsoRegionProps> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-82, 36],
              [-74, 36],
              [-74, 42],
              [-82, 42],
              [-82, 36],
            ],
          ],
        },
        properties: {
          id: "PJM",
          name: "PJM",
          fullName: "PJM Interconnection",
          queueNote: "Data center load growth",
          gridStressLevel: "high",
        },
      },
    ],
  };

  return { facilities: [f1, f2, f3, f4], footprints, isoRegions };
}

interface MockFetchOptions {
  failWeather?: boolean;
  failUsgs?: boolean;
  failReg?: boolean;
  failEia?: boolean;
  failSec?: boolean;
  failPdb?: boolean;
  secObservedUa?: string[];
  fetchUrls?: string[];
}

function makeMockFetch(opts: MockFetchOptions = {}): typeof fetch {
  const todayDate = new Date().toISOString().slice(0, 10);
  const recentIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    opts.fetchUrls?.push(url);

    if (url.startsWith("https://api.weather.gov/")) {
      if (opts.failWeather) {
        return new Response("upstream down", { status: 503 });
      }
      return new Response(
        JSON.stringify({
          properties: {
            timestamp: "2026-11-17T01:00:00+00:00",
            temperature: { value: 25, unitCode: "wmoUnit:degC" },
            relativeHumidity: { value: 60, unitCode: "wmoUnit:percent" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/geo+json" } },
      );
    }

    if (url.startsWith("https://api.waterdata.usgs.gov/")) {
      if (opts.failUsgs) {
        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), {
          status: 200,
        });
      }
      const parsed = new URL(url);
      const locParam = parsed.searchParams.get("monitoring_location_id") ?? "USGS-01646500";
      const ids = locParam.split(",").map((s) => s.trim()).filter(Boolean);
      return new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: ids.map((id, idx) => ({
            type: "Feature",
            properties: {
              monitoring_location_id: id,
              monitoring_location_name: `Gauge ${id}`,
              statistic_id: "00011",
              time: "2026-11-17T00:50:00+00:00",
              value: String(1600 + idx * 10),
            },
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.startsWith("https://www.federalregister.gov/")) {
      if (opts.failReg) {
        return new Response("error", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              document_number: "2026-22608",
              title: "FERC Large Load Co-Location Notice",
              agencies: [{ name: "Federal Energy Regulatory Commission" }],
              publication_date: todayDate,
              type: "Notice",
              abstract: null,
              excerpts:
                'electric <span class="match">data center</span> NO<INF>X</INF> and SO<INF>2</INF> <E T="03">proceeding</E>',
              html_url: "https://www.federalregister.gov/documents/2026/11/05/2026-22608/notice",
              pdf_url: "https://www.govinfo.gov/content/pkg/FR-2026-11-05/pdf/2026-22608.pdf",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.startsWith("https://api.eia.gov/v2/electricity/rto/region-data/data/")) {
      if (opts.failEia) {
        return new Response(
          JSON.stringify({
            error: { code: "OVER_RATE_LIMIT", message: "Rate limit exceeded" },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }
      const respondents = ["PJM", "ERCO", "MISO", "SWPP", "CISO", "NYIS", "ISNE", "SOCO", "NW"];
      const rows = respondents.flatMap((resp, idx) => [
        { period: "2026-11-17T05", respondent: resp, type: "D", value: String(20000 + idx * 5000) },
        { period: "2026-11-17T05", respondent: resp, type: "NG", value: String(21000 + idx * 5000) },
        { period: "2026-11-17T05", respondent: resp, type: "TI", value: String(-500 + idx * 100) },
      ]);
      return new Response(JSON.stringify({ response: { data: rows } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.startsWith("https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/")) {
      if (opts.failEia) {
        return new Response("upstream error", { status: 503 });
      }
      const respondents = ["PJM", "ERCO", "MISO", "SWPP", "CISO", "NYIS", "ISNE", "SOCO", "NW"];
      const rows = respondents.flatMap((resp) => [
        { period: "2026-11-17T05", respondent: resp, fueltype: "NUC", value: "3000" },
        { period: "2026-11-17T05", respondent: resp, fueltype: "NG", value: "4000" },
        { period: "2026-11-17T05", respondent: resp, fueltype: "COL", value: "1000" },
        { period: "2026-11-17T05", respondent: resp, fueltype: "WND", value: "1000" },
        { period: "2026-11-17T05", respondent: resp, fueltype: "SUN", value: "500" },
        { period: "2026-11-17T05", respondent: resp, fueltype: "WAT", value: "300" },
        { period: "2026-11-17T05", respondent: resp, fueltype: "BAT", value: "200" },
        { period: "2026-11-17T05", respondent: resp, fueltype: "PS", value: "-150" },
      ]);
      return new Response(JSON.stringify({ response: { data: rows } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.startsWith("https://efts.sec.gov/LATEST/search-index")) {
      const headers = new Headers(init?.headers);
      const ua = headers.get("User-Agent");
      if (ua) opts.secObservedUa?.push(ua);
      if (opts.failSec) {
        return new Response("sec error", { status: 503 });
      }
      return new Response(
        JSON.stringify({
          hits: {
            hits: [
              {
                _id: "0001193125-26-414991:lmfa-ex99_1.htm",
                _source: {
                  form: "8-K",
                  file_date: todayDate,
                  ciks: ["0001640384"],
                  display_names: ["POWERCOMPUTE, INC.  (PWCM)  (CIK 0001640384)"],
                  adsh: "0001193125-26-414991",
                  biz_states: ["VA"],
                  biz_locations: ["Ashburn, VA"],
                  file_description: "EX-99.1",
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.startsWith("https://www.peeringdb.com/api/fac")) {
      if (opts.failPdb) {
        return new Response("pdb error", { status: 502 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 101,
              name: "Older Site",
              org_name: "Alpha Colo",
              city: "Dallas",
              state: "TX",
              updated: "2026-01-01T00:00:00Z",
              net_count: 10,
              ix_count: 1,
            },
            {
              id: 202,
              name: "Boston Harbor Carrier Hotel",
              org_name: "Harbor Colo",
              city: "Boston",
              state: "MA",
              updated: recentIso,
              net_count: 85,
              ix_count: 4,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("not mocked", { status: 404 });
  }) as typeof fetch;
}

describe("Worker API endpoints", () => {
  test("GET /api/health returns separated verified vs reported MW, statesCovered, d1Bound, and CORS", async () => {
    const dataset = buildTestDataset();
    const { db } = createTestD1Database();

    const resUnbound = await handleRequest(
      new Request("https://example.com/api/health"),
      { ENVIRONMENT: "test" },
      { dataset },
    );
    expect(resUnbound.status).toBe(200);
    expect(resUnbound.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await resUnbound.json()) as {
      status: string;
      release: string;
      facilityCount: number;
      statesCovered: number;
      verifiedOperationalMwTotal: number;
      verifiedPlannedMwTotal: number;
      reportedOrProposedMwTotal: number;
      d1Bound: boolean;
    };
    expect(body.status).toBe("ok");
    expect(body.release).toBe("1.0.0");
    expect(body.facilityCount).toBe(4);
    expect(body.statesCovered).toBe(4);
    expect(body.verifiedOperationalMwTotal).toBe(200);
    expect(body.verifiedPlannedMwTotal).toBe(1150);
    expect(body.reportedOrProposedMwTotal).toBe(1200);
    expect(body.d1Bound).toBe(false);

    const resBound = await handleRequest(
      new Request("https://example.com/api/health"),
      { DB: db, RELEASE: "1.0.1" },
      { dataset },
    );
    const boundBody = (await resBound.json()) as { d1Bound: boolean; release: string };
    expect(boundBody.d1Bound).toBe(true);
    expect(boundBody.release).toBe("1.0.1");
  });

  test("GET /api/facilities serves index view, legacy view, tier/verifiedOnly/state/window filters, csv, and geojson", async () => {
    const dataset = buildTestDataset();

    // Default / ?view=index returns FacilitiesIndexApiResponse
    const indexRes = await handleRequest(
      new Request("https://example.com/api/facilities"),
      {},
      { dataset },
    );
    expect(indexRes.status).toBe(200);
    const indexJson = (await indexRes.json()) as {
      facilities: FacilityIndexItem[];
      summary: FleetSummaryMetadata;
      isoRegions: GeoJSON.FeatureCollection;
    };
    expect(indexJson.facilities).toHaveLength(4);
    expect(indexJson.summary.totalFacilities).toBe(4);
    expect(indexJson.summary.byTier).toEqual({ flagship: 2, registry: 1, provisional: 1 });
    expect(indexJson.summary.verifiedPlannedMwTotal).toBe(1150);
    expect(indexJson.summary.reportedOrProposedMwTotal).toBe(1200);

    // verifiedOnly=1 excludes proposed/provisional/reported
    const verifiedRes = await handleRequest(
      new Request("https://example.com/api/facilities?verifiedOnly=1"),
      {},
      { dataset },
    );
    const verifiedJson = (await verifiedRes.json()) as {
      facilities: FacilityIndexItem[];
      summary: FleetSummaryMetadata;
    };
    expect(verifiedJson.facilities.map((f) => f.id)).toEqual([
      "ashburn-va",
      "peculiar-mo",
      "pdb-us-sample",
    ]);
    expect(verifiedJson.summary.reportedOrProposedMwTotal).toBe(0);

    // tier filter
    const tierRes = await handleRequest(
      new Request("https://example.com/api/facilities?tier=registry,provisional"),
      {},
      { dataset },
    );
    const tierJson = (await tierRes.json()) as { facilities: FacilityIndexItem[] };
    expect(tierJson.facilities.map((f) => f.id)).toEqual([
      "pdb-us-sample",
      "proposed-tx-ai",
    ]);

    // state & window filters
    const windowRes = await handleRequest(
      new Request("https://example.com/api/facilities?window=7d&state=va,ma"),
      {},
      { dataset },
    );
    const windowJson = (await windowRes.json()) as { facilities: FacilityIndexItem[] };
    expect(windowJson.facilities.map((f) => f.id)).toEqual([
      "ashburn-va",
      "pdb-us-sample",
    ]);

    // Legacy view preserves FacilitiesApiResponse
    const contestedLegacy = await handleRequest(
      new Request("https://example.com/api/facilities?contested=1&view=legacy"),
      {},
      { dataset },
    );
    const contestedJson = (await contestedLegacy.json()) as {
      facilities: FacilityRecord[];
      footprints: GeoJSON.FeatureCollection;
    };
    expect(contestedJson.facilities.map((f) => f.id)).toEqual(["peculiar-mo"]);
    expect(contestedJson.footprints.features).toHaveLength(1);

    const fullLegacy = await handleRequest(
      new Request("https://example.com/api/facilities?full=1&iso=PJM"),
      {},
      { dataset },
    );
    const fullJson = (await fullLegacy.json()) as {
      facilities: FacilityRecord[];
      footprints: GeoJSON.FeatureCollection;
    };
    expect(fullJson.facilities.map((f) => f.id)).toEqual(["ashburn-va"]);
    expect(fullJson.footprints.features).toHaveLength(1);

    const bboxRes = await handleRequest(
      new Request("https://example.com/api/facilities?bbox=-80,37,-75,41"),
      {},
      { dataset },
    );
    const bboxJson = (await bboxRes.json()) as { facilities: FacilityIndexItem[] };
    expect(bboxJson.facilities.map((f) => f.id)).toEqual(["ashburn-va"]);

    const badTier = await handleRequest(
      new Request("https://example.com/api/facilities?tier=unknown"),
      {},
      { dataset },
    );
    expect(badTier.status).toBe(400);

    const badBbox = await handleRequest(
      new Request("https://example.com/api/facilities?bbox=abc"),
      {},
      { dataset },
    );
    expect(badBbox.status).toBe(400);

    const csvRes = await handleRequest(
      new Request("https://example.com/api/facilities?format=csv"),
      {},
      { dataset },
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("Content-Type")).toContain("text/csv");
    const csvText = await csvRes.text();
    expect(csvText).toContain("catalogTier,footprintCoverage");
    expect(csvText).toContain('"Equinix Ashburn, ""Phase 2"""');

    const geoRes = await handleRequest(
      new Request("https://example.com/api/facilities?format=geojson"),
      {},
      { dataset },
    );
    expect(geoRes.status).toBe(200);
    const geoJson = (await geoRes.json()) as GeoJSON.FeatureCollection;
    expect(geoJson.type).toBe("FeatureCollection");
    expect(geoJson.features).toHaveLength(4);
    expect(geoJson.features[0]?.properties?.catalogTier).toBe("flagship");
    expect(geoJson.features[2]?.properties?.footprintCoverage).toBe("point_only");
  });

  test("GET /api/facilities/:id and /api/telemetry/live parse NOAA + USGS + gridSnapshot and degrade cleanly", async () => {
    const dataset = buildTestDataset();

    const liveRes = await handleRequest(
      new Request("https://example.com/api/facilities/ashburn-va"),
      {},
      { dataset, fetchFn: makeMockFetch() },
    );
    expect(liveRes.status).toBe(200);
    const liveData = (await liveRes.json()) as {
      facility: FacilityRecord;
      telemetry: {
        weather: { status: string; tempC: number; wetBulbC: number; thermalRegime: string };
        hydrology: { status: string; dischargeCfs: number };
      };
      gridSnapshot: { isoRegion: string; demandMw: number; status: string } | null;
    };
    expect(liveData.telemetry.weather.status).toBe("live");
    expect(liveData.telemetry.weather.tempC).toBe(25);
    expect(liveData.telemetry.weather.thermalRegime).toBe("adiabatic_assist");
    expect(liveData.telemetry.hydrology.status).toBe("live");
    expect(liveData.telemetry.hydrology.dischargeCfs).toBe(1600);
    expect(liveData.gridSnapshot?.isoRegion).toBe("PJM");
    expect(liveData.gridSnapshot?.demandMw).toBe(20000);
    expect(liveData.gridSnapshot?.status).toBe("live");

    const degradedRes = await handleRequest(
      new Request("https://example.com/api/telemetry/live?facilityId=ashburn-va&refresh=1"),
      {},
      { dataset, fetchFn: makeMockFetch({ failWeather: true, failUsgs: true }) },
    );
    expect(degradedRes.status).toBe(200);
    const degraded = (await degradedRes.json()) as {
      weather: { status: string; tempC: null; thermalRegime: string; error: string };
      hydrology: { status: string; dischargeCfs: null; error: string };
    };
    expect(degraded.weather.status).toBe("degraded");
    expect(degraded.weather.tempC).toBeNull();
    expect(degraded.weather.thermalRegime).toBe("unavailable");
    expect(degraded.weather.error).toContain("503");
    expect(degraded.hydrology.status).toBe("degraded");
    expect(degraded.hydrology.dischargeCfs).toBeNull();

    const notFound = await handleRequest(
      new Request("https://example.com/api/facilities/unknown-site"),
      {},
      { dataset },
    );
    expect(notFound.status).toBe(404);
  });

  test("stripHtmlTags normalizes Federal Register INF/SUP/E markup and /api/regulatory/live handles errors", async () => {
    expect(
      stripHtmlTags(
        'Emissions of NO<INF>X</INF>, SO<INF>2</INF>, CO<INF>2</INF> &amp; <E T="03">data center</E><SUP>1</SUP> • review',
      ),
    ).toBe("Emissions of NOx, SO2, CO2 & data center1 review");

    const dataset = buildTestDataset();
    const okRes = await handleRequest(
      new Request("https://example.com/api/regulatory/live"),
      {},
      { dataset, fetchFn: makeMockFetch() },
    );
    const okJson = (await okRes.json()) as {
      status: string;
      items: Array<{ documentNumber: string; abstract: string }>;
    };
    expect(okJson.status).toBe("live");
    expect(okJson.items[0].documentNumber).toBe("2026-22608");
    expect(okJson.items[0].abstract).toBe("electric data center NOx and SO2 proceeding");

    const failRes = await handleRequest(
      new Request("https://example.com/api/regulatory/live?refresh=1"),
      {},
      { dataset, fetchFn: makeMockFetch({ failReg: true }) },
    );
    const failJson = (await failRes.json()) as {
      status: string;
      items: unknown[];
      error: string;
    };
    expect(failJson.status).toBe("degraded");
    expect(failJson.items).toEqual([]);
    expect(failJson.error).toContain("500");
  });

  test("GET /api/grid/live aggregates 9 EIA ISOs, fuel mix shares, persists to D1, and degrades cleanly", async () => {
    const dataset = buildTestDataset();
    const { db, sqlite } = createTestD1Database();
    const fetchUrls: string[] = [];

    const liveRes = await handleRequest(
      new Request("https://example.com/api/grid/live?refresh=1"),
      { DB: db },
      { dataset, fetchFn: makeMockFetch({ fetchUrls }) },
    );
    expect(liveRes.status).toBe(200);
    const liveFeed = (await liveRes.json()) as LiveGridFeed;
    expect(liveFeed.status).toBe("live");
    // Only 2 EIA HTTP fetches for all 9 ISOs
    expect(fetchUrls).toHaveLength(2);
    expect(Object.keys(liveFeed.regions)).toHaveLength(9);
    expect(liveFeed.regions.ERCOT?.eiaRespondent).toBe("ERCO");
    expect(liveFeed.regions.SPP?.eiaRespondent).toBe("SWPP");
    expect(liveFeed.regions["ISO-NE"]?.eiaRespondent).toBe("ISNE");
    expect(liveFeed.regions.SERC?.eiaRespondent).toBe("SOCO");
    expect(liveFeed.regions.WECC?.eiaRespondent).toBe("NW");
    expect(liveFeed.regions.PJM?.observedAt).toBe("2026-11-17T05:00:00Z");
    expect(liveFeed.regions.PJM?.demandMw).toBe(20000);
    expect(liveFeed.regions.PJM?.netGenerationMw).toBe(21000);
    expect(liveFeed.regions.PJM?.interchangeMw).toBe(-500);

    // Fuel mix: 3000+4000+1000+1000+500+300+200 = 10000 (negative PS ignored)
    const pjmMix = liveFeed.regions.PJM?.fuelMix ?? [];
    expect(pjmMix.map((m) => m.fuel)).toEqual([
      "gas",
      "nuclear",
      "coal",
      "wind",
      "solar",
      "hydro",
      "other",
    ]);
    expect(pjmMix[0].sharePct).toBe(40);
    expect(pjmMix[1].sharePct).toBe(30);
    expect(pjmMix.reduce((sum, m) => sum + m.sharePct, 0)).toBe(100);

    // D1 persisted all 9 grid snapshots
    const rowCount = sqlite
      .query("SELECT COUNT(*) AS cnt FROM grid_snapshots")
      .get() as { cnt: number };
    expect(rowCount.cnt).toBe(9);

    // Upstream failure with D1 populated -> stale fallback
    const staleRes = await handleRequest(
      new Request("https://example.com/api/grid/live?refresh=1"),
      { DB: db },
      { dataset, fetchFn: makeMockFetch({ failEia: true }) },
    );
    const staleFeed = (await staleRes.json()) as LiveGridFeed;
    expect(staleFeed.status).toBe("stale");
    expect(staleFeed.regions.PJM?.status).toBe("stale");
    expect(staleFeed.regions.PJM?.demandMw).toBe(20000);
    expect(staleFeed.error).toContain("OVER_RATE_LIMIT");

    // Upstream failure without D1 -> degraded with null numbers (never fabricated)
    const degradedRes = await handleRequest(
      new Request("https://example.com/api/grid/live?refresh=1"),
      {},
      { dataset, fetchFn: makeMockFetch({ failEia: true }) },
    );
    const degradedFeed = (await degradedRes.json()) as LiveGridFeed;
    expect(degradedFeed.status).toBe("degraded");
    expect(degradedFeed.regions.ERCOT?.status).toBe("degraded");
    expect(degradedFeed.regions.ERCOT?.demandMw).toBeNull();
    expect(degradedFeed.regions.ERCOT?.fuelMix).toEqual([]);
  });

  test("GET /api/pulse/live normalizes Federal Register, SEC EDGAR, and PeeringDB, persists to D1, and degrades per stream", async () => {
    const dataset = buildTestDataset();
    const { db, sqlite } = createTestD1Database();
    const secObservedUa: string[] = [];

    const pulseRes = await handleRequest(
      new Request("https://example.com/api/pulse/live?window=90d&refresh=1"),
      { DB: db },
      { dataset, fetchFn: makeMockFetch({ secObservedUa }) },
    );
    expect(pulseRes.status).toBe(200);
    expect(secObservedUa[0]).toBe("GridlineObservatory/1.0 (ops@mistystep.io)");

    const pulseFeed = (await pulseRes.json()) as LivePulseFeed;
    expect(pulseFeed.status).toBe("live");
    expect(pulseFeed.streamStatus).toEqual({
      federal_register: "live",
      sec_edgar: "live",
      peeringdb: "live",
    });
    // Older 2026-01-01 PeeringDB item filtered out by 90d window; 3 recent items remain
    expect(pulseFeed.items).toHaveLength(3);

    const secItem = pulseFeed.items.find((i) => i.stream === "sec_edgar");
    expect(secItem?.epistemic).toBe("filed");
    expect(secItem?.url).toBe(
      "https://www.sec.gov/Archives/edgar/data/1640384/000119312526414991/lmfa-ex99_1.htm",
    );
    expect(secItem?.tickerOrCik).toBe("PWCM");
    expect(secItem?.states).toContain("VA");

    const pdbItem = pulseFeed.items.find((i) => i.stream === "peeringdb");
    expect(pdbItem?.epistemic).toBe("disclosed");
    expect(pdbItem?.url).toBe("https://www.peeringdb.com/fac/202");
    expect(pdbItem?.peeringDbFacId).toBe(202);
    expect(pdbItem?.matchedFacilityIds).toContain("pdb-us-sample");

    // D1 persisted signals across all 3 streams (including older PeeringDB row)
    const dbCount = sqlite
      .query("SELECT COUNT(*) AS cnt FROM live_signals")
      .get() as { cnt: number };
    expect(dbCount.cnt).toBe(4);

    // Filter by ?stream=sec_edgar and ?window=all
    const secOnlyRes = await handleRequest(
      new Request("https://example.com/api/pulse/live?stream=sec_edgar&window=all"),
      { DB: db },
      { dataset, fetchFn: makeMockFetch() },
    );
    const secOnlyFeed = (await secOnlyRes.json()) as LivePulseFeed;
    expect(secOnlyFeed.items.every((i) => i.stream === "sec_edgar")).toBe(true);

    // Partial failure with D1 fallback -> failed stream marks stale, live streams remain live
    const partialRes = await handleRequest(
      new Request("https://example.com/api/pulse/live?refresh=1&window=all"),
      { DB: db },
      { dataset, fetchFn: makeMockFetch({ failSec: true }) },
    );
    const partialFeed = (await partialRes.json()) as LivePulseFeed;
    expect(partialFeed.status).toBe("stale");
    expect(partialFeed.streamStatus).toEqual({
      federal_register: "live",
      sec_edgar: "stale",
      peeringdb: "live",
    });

    // Failure without D1 -> per-stream degraded while others stay live
    const degradedStreamRes = await handleRequest(
      new Request("https://example.com/api/pulse/live?refresh=1&window=all"),
      {},
      { dataset, fetchFn: makeMockFetch({ failPdb: true }) },
    );
    const degradedStreamFeed = (await degradedStreamRes.json()) as LivePulseFeed;
    expect(degradedStreamFeed.status).toBe("stale");
    expect(degradedStreamFeed.streamStatus.peeringdb).toBe("degraded");
    expect(degradedStreamFeed.streamStatus.federal_register).toBe("live");
    expect(degradedStreamFeed.streamStatus.sec_edgar).toBe("live");

    const badStream = await handleRequest(
      new Request("https://example.com/api/pulse/live?stream=invalid"),
      {},
      { dataset },
    );
    expect(badStream.status).toBe(400);
  });

  test("fetchTelemetrySummary caps subrequests strictly <= 20 via top 18 NOAA + 1 batched USGS request", async () => {
    const manyFacilities: FacilityRecord[] = Array.from({ length: 34 }, (_, idx) => {
      const code = String(idx).padStart(2, "0");
      const f = makeFixtureFacility({
        id: `site-${code}`,
        catalogTier: idx < 5 ? "flagship" : "registry",
      });
      f.power.totalPlannedMw = { ...f.power.totalPlannedMw, value: 100 + idx };
      f.waterAndCooling.nwsStationId = `K0${code}`;
      f.waterAndCooling.usgsGaugeSiteId = `0164${String(1000 + idx)}`;
      return f;
    });

    const fetchUrls: string[] = [];
    const summary = await fetchTelemetrySummary(manyFacilities, {
      refresh: true,
      fetchFn: makeMockFetch({ fetchUrls }),
    });

    const noaaCalls = fetchUrls.filter((u) => u.startsWith("https://api.weather.gov/"));
    const usgsCalls = fetchUrls.filter((u) =>
      u.startsWith("https://api.waterdata.usgs.gov/"),
    );

    expect(fetchUrls.length).toBeLessThanOrEqual(20);
    expect(noaaCalls).toHaveLength(18);
    expect(usgsCalls).toHaveLength(1);
    expect(Object.keys(summary.stations)).toHaveLength(18);
    expect(Object.keys(summary.gauges)).toHaveLength(25);
    // Flagships (00..04) prioritized cleanly
    expect(summary.stations.K000.status).toBe("live");
    expect(summary.gauges["01641000"].status).toBe("live");
    expect(summary.gauges["01641000"].dischargeCfs).toBeGreaterThanOrEqual(1600);

    // Also test GET /api/telemetry/summary route
    const routeUrls: string[] = [];
    const routeRes = await handleRequest(
      new Request("https://example.com/api/telemetry/summary?refresh=1"),
      {},
      {
        dataset: {
          ...buildTestDataset(),
          facilities: manyFacilities,
        },
        fetchFn: makeMockFetch({ fetchUrls: routeUrls }),
      },
    );
    expect(routeRes.status).toBe(200);
    const routeJson = (await routeRes.json()) as TelemetrySummaryApiResponse;
    expect(routeUrls.length).toBeLessThanOrEqual(20);
    expect(Object.keys(routeJson.gauges)).toHaveLength(25);
  });

  test("runScheduledIngest refreshes feeds and inserts an ingest_runs audit row in D1", async () => {
    const { db, sqlite } = createTestD1Database();
    const fetchUrls: string[] = [];

    const outcome = await runScheduledIngest(
      { DB: db },
      { fetchFn: makeMockFetch({ fetchUrls }) },
    );

    expect(outcome.status).toBe("live");
    expect(fetchUrls.length).toBeLessThanOrEqual(30);

    const rows = sqlite
      .query("SELECT id, ran_at, status, summary_json FROM ingest_runs")
      .all() as Array<{
      id: number;
      ran_at: string;
      status: string;
      summary_json: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("live");
    const parsedSummary = JSON.parse(rows[0].summary_json) as {
      gridRegionsLive: number;
      pulseItemsCount: number;
      telemetryStationsCount: number;
      telemetryGaugesCount: number;
    };
    expect(parsedSummary.gridRegionsLive).toBe(9);
    expect(parsedSummary.pulseItemsCount).toBeGreaterThanOrEqual(3);
    expect(parsedSummary.telemetryStationsCount).toBeLessThanOrEqual(18);
    expect(parsedSummary.telemetryGaugesCount).toBeLessThanOrEqual(25);
  });

  test("Non-/api routes delegate to env.ASSETS", async () => {
    const dataset = buildTestDataset();
    const fakeAssets = {
      fetch: async () => new Response("<html>ok</html>", { status: 200 }),
    } as unknown as Fetcher;

    const res = await handleRequest(
      new Request("https://example.com/"),
      { ASSETS: fakeAssets },
      { dataset },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>ok</html>");
  });

  test("fetchStationWeather skips null top-of-hour NOAA stub observations in FeatureCollection", async () => {
    const mockFetch = (async () =>
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              properties: {
                timestamp: "2026-11-17T06:55:00+00:00",
                temperature: { value: null, unitCode: "wmoUnit:degC" },
                relativeHumidity: { value: null },
              },
            },
            {
              properties: {
                timestamp: "2026-11-17T06:50:00+00:00",
                temperature: { value: 18.5, unitCode: "wmoUnit:degC" },
                relativeHumidity: { value: 64.2 },
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/geo+json" } },
      )) as unknown as typeof fetch;

    const dataset = buildTestDataset();
    const targetId = dataset.facilities[0].id;
    const res = await handleRequest(
      new Request(
        `https://example.com/api/telemetry/live?facilityId=${encodeURIComponent(targetId)}&refresh=1`,
      ),
      {},
      { dataset, fetchFn: mockFetch },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      weather: { status: string; tempC: number | null; relativeHumidityPct: number | null; observedAt: string | null };
    };
    expect(json.weather.status).toBe("live");
    expect(json.weather.tempC).toBe(18.5);
    expect(json.weather.relativeHumidityPct).toBe(64.2);
    expect(json.weather.observedAt).toBe("2026-11-17T06:50:00+00:00");
  });

  test("pulse facility matching rejects generic 'Data Center' names and bare city/state HQ matches", async () => {
    const base = buildTestDataset();
    const genericCampus = makeFixtureFacility({
      id: "im3-or-data-center",
      name: "Data Center",
      city: "Washington",
      state: "OR",
      isoRegion: "WECC",
    });
    genericCampus.stakeholders.developer = "Registry Colocation / Enterprise Operator";
    genericCampus.stakeholders.operator = "Registry Colocation / Enterprise Operator";

    const registryGenericNy = makeFixtureFacility({
      id: "im3-ny-32-avenue-of-the-americas",
      name: "32 Avenue of the Americas",
      city: "New York",
      state: "NY",
      isoRegion: "NYISO",
    });
    registryGenericNy.stakeholders.developer = "Registry Colocation / Enterprise Operator";
    registryGenericNy.stakeholders.operator = "Registry Colocation / Enterprise Operator";

    const bareHqCampus = makeFixtureFacility({
      id: "unrelated-arlington-campus",
      name: "Cloud Campus Alpha",
      city: "Arlington",
      state: "VA",
      isoRegion: "PJM",
    });
    bareHqCampus.stakeholders.developer = "Acme Realty";
    bareHqCampus.stakeholders.operator = "Acme Realty";

    const brandedCampus = makeFixtureFacility({
      id: "equinix-ashburn",
      name: "Equinix Ashburn Campus",
      city: "Ashburn",
      state: "VA",
      isoRegion: "PJM",
    });
    brandedCampus.stakeholders.developer = "Equinix, Inc.";
    brandedCampus.stakeholders.operator = "Equinix, Inc.";

    const dataset: DatasetBundle = {
      ...base,
      facilities: [genericCampus, registryGenericNy, bareHqCampus, brandedCampus],
      indexItems: [
        recordToIndexItem(genericCampus),
        recordToIndexItem(registryGenericNy),
        recordToIndexItem(bareHqCampus),
        recordToIndexItem(brandedCampus),
      ],
    };

    const customFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://www.peeringdb.com/")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 16052,
                name: "Test Carrier Hotel",
                org_name: "Telehouse America",
                city: "New York",
                state: "NY",
                updated: new Date().toISOString(),
                net_count: 10,
                ix_count: 1,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("https://efts.sec.gov/")) {
        return new Response(
          JSON.stringify({
            hits: {
              hits: [
                {
                  _id: "0001111111-26-000101",
                  _source: {
                    form: "8-K",
                    file_date: new Date().toISOString().slice(0, 10),
                    ciks: ["0001111111"],
                    display_names: ["Soluna Power Corp (SLNA) (CIK 0001111111)"],
                    adsh: "0001111111-26-000101",
                    biz_states: ["VA"],
                    biz_locations: ["Arlington, VA"],
                    file_description: "DATA CENTER EXPANSION",
                  },
                },
                {
                  _id: "0002222222-26-000202",
                  _source: {
                    form: "10-Q",
                    file_date: new Date().toISOString().slice(0, 10),
                    ciks: ["0002222222"],
                    display_names: ["Equinix, Inc. (EQIX) (CIK 0002222222)"],
                    adsh: "0002222222-26-000202",
                    biz_states: ["VA"],
                    biz_locations: ["Ashburn, VA"],
                    file_description: "QUARTERLY REPORT",
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return makeMockFetch()(input, init);
    }) as unknown as typeof fetch;

    const { db } = createTestD1Database();
    const res = await handleRequest(
      new Request("https://example.com/api/pulse/live?refresh=1"),
      { DB: db },
      { dataset, fetchFn: customFetch },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LivePulseFeed;
    const soluna = body.items.find((i) => i.documentNumber === "0001111111-26-000101");
    const equinix = body.items.find((i) => i.documentNumber === "0002222222-26-000202");
    const pdb = body.items.find((i) => i.id === "pdb:16052");

    expect(soluna).toBeDefined();
    expect(soluna?.matchedFacilityIds ?? []).toEqual([]);
    expect(equinix).toBeDefined();
    expect(equinix?.matchedFacilityIds).toContain("equinix-ashburn");
    expect(equinix?.matchedFacilityIds).not.toContain("im3-or-data-center");
    expect(pdb).toBeDefined();
    expect(pdb?.matchedFacilityIds ?? []).not.toContain("im3-ny-32-avenue-of-the-americas");
  });
});
