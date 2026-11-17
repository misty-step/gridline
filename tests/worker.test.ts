import { describe, expect, test } from "bun:test";
import type { Fetcher } from "@cloudflare/workers-types";
import type {
  CampusFootprintProps,
  FacilityRecord,
  IsoRegionProps,
} from "../src/shared/types.ts";
import { handleRequest, type DatasetBundle } from "../src/worker/index.ts";
import { makeFixtureFacility, makeFixtureFootprint } from "./validate.test.ts";

function buildTestDataset(): DatasetBundle {
  const f1 = makeFixtureFacility({
    id: "ashburn-va",
    name: "Equinix Ashburn, \"Phase 2\"",
    state: "VA",
    isoRegion: "PJM",
    lifecycleStatus: "operational",
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

  return { facilities: [f1, f2], footprints, isoRegions };
}

function makeMockFetch(opts: { failWeather?: boolean; failUsgs?: boolean; failReg?: boolean } = {}): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

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
      return new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                monitoring_location_id: "USGS-01646500",
                time: "2026-11-17T00:50:00+00:00",
                value: "1600",
              },
            },
          ],
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
              publication_date: "2026-11-05",
              type: "Notice",
              abstract: null,
              excerpts: "electric <span class=\"match\">data center</span> proceeding",
              html_url: "https://www.federalregister.gov/documents/2026/11/05/2026-22608/notice",
              pdf_url: "https://www.govinfo.gov/content/pkg/FR-2026-11-05/pdf/2026-22608.pdf",
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
  test("GET /api/health returns totals and CORS headers", async () => {
    const dataset = buildTestDataset();
    const res = await handleRequest(
      new Request("https://example.com/api/health"),
      { ENVIRONMENT: "test", RELEASE: "1.0.0" },
      { dataset },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await res.json()) as {
      status: string;
      facilityCount: number;
      operationalMwTotal: number;
      plannedMwTotal: number;
    };
    expect(body.status).toBe("ok");
    expect(body.facilityCount).toBe(2);
    expect(body.operationalMwTotal).toBe(200);
    expect(body.plannedMwTotal).toBe(1150);
  });

  test("GET /api/facilities supports query filters, bbox, geojson, and csv exports", async () => {
    const dataset = buildTestDataset();

    const contestedRes = await handleRequest(
      new Request("https://example.com/api/facilities?contested=1"),
      {},
      { dataset },
    );
    const contestedJson = (await contestedRes.json()) as {
      facilities: FacilityRecord[];
      footprints: GeoJSON.FeatureCollection;
    };
    expect(contestedJson.facilities.map((f) => f.id)).toEqual(["peculiar-mo"]);
    expect(contestedJson.footprints.features).toHaveLength(1);

    const undisclosedRes = await handleRequest(
      new Request("https://example.com/api/facilities?undisclosedWater=true&iso=PJM"),
      {},
      { dataset },
    );
    const undisclosedJson = (await undisclosedRes.json()) as {
      facilities: FacilityRecord[];
    };
    expect(undisclosedJson.facilities.map((f) => f.id)).toEqual(["ashburn-va"]);

    const bboxRes = await handleRequest(
      new Request("https://example.com/api/facilities?bbox=-80,37,-75,41"),
      {},
      { dataset },
    );
    const bboxJson = (await bboxRes.json()) as { facilities: FacilityRecord[] };
    expect(bboxJson.facilities.map((f) => f.id)).toEqual(["ashburn-va"]);

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
    expect(csvText).toContain('"Equinix Ashburn, ""Phase 2"""');

    const geoRes = await handleRequest(
      new Request("https://example.com/api/facilities?format=geojson"),
      {},
      { dataset },
    );
    expect(geoRes.status).toBe(200);
    const geoJson = (await geoRes.json()) as GeoJSON.FeatureCollection;
    expect(geoJson.type).toBe("FeatureCollection");
    expect(geoJson.features).toHaveLength(2);
  });

  test("GET /api/facilities/:id and /api/telemetry/live parse NOAA + USGS and degrade cleanly", async () => {
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
    };
    expect(liveData.telemetry.weather.status).toBe("live");
    expect(liveData.telemetry.weather.tempC).toBe(25);
    expect(liveData.telemetry.weather.thermalRegime).toBe("adiabatic_assist");
    expect(liveData.telemetry.hydrology.status).toBe("live");
    expect(liveData.telemetry.hydrology.dischargeCfs).toBe(1600);

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

  test("GET /api/regulatory/live handles Federal Register items and failures", async () => {
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
    expect(okJson.items[0].abstract).toBe("electric data center proceeding");

    const failRes = await handleRequest(
      new Request("https://example.com/api/regulatory/live?refresh=1"),
      {},
      { dataset, fetchFn: makeMockFetch({ failReg: true }) },
    );
    const failJson = (await failRes.json()) as { status: string; items: unknown[]; error: string };
    expect(failJson.status).toBe("degraded");
    expect(failJson.items).toEqual([]);
    expect(failJson.error).toContain("500");
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
});
