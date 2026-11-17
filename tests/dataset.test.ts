import { describe, expect, test } from "bun:test";
import { ALL_FACILITIES, ALL_FOOTPRINTS, ISO_REGIONS } from "../src/data/index.ts";
import {
  validateFacilities,
  validateFootprints,
  validateIsoRegions,
} from "../src/shared/validate.ts";
import { handleRequest } from "../src/worker/index.ts";

describe("bundled US data center dataset", () => {
  test("passes full schema, epistemic, and geospatial invariant validation", () => {
    expect(ALL_FACILITIES.length).toBe(45);
    expect(ALL_FOOTPRINTS.features.length).toBeGreaterThanOrEqual(45 * 3);
    expect(ISO_REGIONS.features.length).toBe(9);

    expect(validateFacilities(ALL_FACILITIES)).toEqual({ valid: true, errors: [] });
    expect(validateFootprints(ALL_FOOTPRINTS, ALL_FACILITIES)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateIsoRegions(ISO_REGIONS)).toEqual({ valid: true, errors: [] });

    for (const f of ALL_FACILITIES) {
      expect(f.perspectives.proponent.length).toBeGreaterThanOrEqual(2);
      expect(f.perspectives.critic.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("serves real dataset through Worker API routes cleanly", async () => {
    const healthRes = await handleRequest(new Request("https://example.com/api/health"));
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as {
      status: string;
      facilityCount: number;
      operationalMwTotal: number;
      plannedMwTotal: number;
    };
    expect(health.status).toBe("ok");
    expect(health.facilityCount).toBe(45);
    expect(health.operationalMwTotal).toBeGreaterThan(0);
    expect(health.plannedMwTotal).toBeGreaterThan(health.operationalMwTotal);

    const listRes = await handleRequest(
      new Request("https://example.com/api/facilities?contested=1"),
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      facilities: Array<{ id: string }>;
      footprints: GeoJSON.FeatureCollection;
      isoRegions: GeoJSON.FeatureCollection;
    };
    expect(listJson.facilities.length).toBeGreaterThan(0);
    expect(listJson.footprints.features.length).toBeGreaterThan(0);
    expect(listJson.isoRegions.features).toHaveLength(9);

    const csvRes = await handleRequest(
      new Request("https://example.com/api/facilities?format=csv"),
    );
    expect(csvRes.status).toBe(200);
    const csvLines = (await csvRes.text()).trim().split("\n");
    expect(csvLines.length).toBe(46);
  });
});
