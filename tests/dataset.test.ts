import { describe, expect, test } from "bun:test";
import {
  ALL_FACILITIES,
  ALL_FOOTPRINTS,
  ISO_REGIONS,
} from "../src/data/index.ts";
import {
  validateFacilities,
  validateFacilityIndex,
  validateFootprints,
  validateIsoRegions,
} from "../src/shared/validate.ts";
import { ALL_INDEX_ITEMS } from "../src/worker/dataset.ts";
import { handleRequest } from "../src/worker/index.ts";

describe("bundled US data center dataset", () => {
  test("passes full schema, epistemic, and geospatial invariant validation", () => {
    expect(ALL_FACILITIES.length).toBeGreaterThanOrEqual(45);
    expect(ALL_INDEX_ITEMS.length).toBeGreaterThanOrEqual(45);
    expect(ALL_FOOTPRINTS.features.length).toBeGreaterThanOrEqual(45);
    expect(ISO_REGIONS.features.length).toBe(9);

    expect(validateFacilityIndex(ALL_INDEX_ITEMS)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateFacilities(ALL_FACILITIES)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateFootprints(ALL_FOOTPRINTS, ALL_FACILITIES)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateIsoRegions(ISO_REGIONS)).toEqual({ valid: true, errors: [] });

    for (const f of ALL_FACILITIES) {
      if ((f.catalogTier ?? "flagship") === "flagship") {
        expect(f.perspectives.proponent.length).toBeGreaterThanOrEqual(2);
        expect(f.perspectives.critic.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("serves real dataset through Worker API routes cleanly", async () => {
    const healthRes = await handleRequest(new Request("https://example.com/api/health"));
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as {
      status: string;
      release: string;
      facilityCount: number;
      statesCovered: number;
      verifiedOperationalMwTotal: number;
      verifiedPlannedMwTotal: number;
      reportedOrProposedMwTotal: number;
      d1Bound: boolean;
    };
    expect(health.status).toBe("ok");
    expect(health.release).toBe("1.0.0");
    expect(health.facilityCount).toBe(ALL_INDEX_ITEMS.length);
    expect(health.statesCovered).toBeGreaterThanOrEqual(24);
    expect(health.verifiedOperationalMwTotal).toBeGreaterThan(0);
    expect(health.verifiedPlannedMwTotal).toBeGreaterThan(
      health.verifiedOperationalMwTotal,
    );
    expect(health.d1Bound).toBe(false);

    const indexRes = await handleRequest(
      new Request("https://example.com/api/facilities?contested=1"),
    );
    expect(indexRes.status).toBe(200);
    const indexJson = (await indexRes.json()) as {
      facilities: Array<{ id: string; catalogTier: string }>;
      summary: { totalFacilities: number };
      isoRegions: GeoJSON.FeatureCollection;
    };
    expect(indexJson.facilities.length).toBeGreaterThan(0);
    expect(indexJson.summary.totalFacilities).toBe(indexJson.facilities.length);
    expect(indexJson.isoRegions.features).toHaveLength(9);

    const legacyRes = await handleRequest(
      new Request("https://example.com/api/facilities?contested=1&view=legacy"),
    );
    expect(legacyRes.status).toBe(200);
    const legacyJson = (await legacyRes.json()) as {
      facilities: Array<{ id: string }>;
      footprints: GeoJSON.FeatureCollection;
      isoRegions: GeoJSON.FeatureCollection;
    };
    expect(legacyJson.facilities.length).toBe(indexJson.facilities.length);
    expect(legacyJson.footprints.features.length).toBeGreaterThan(0);
    expect(legacyJson.isoRegions.features).toHaveLength(9);

    const csvRes = await handleRequest(
      new Request("https://example.com/api/facilities?format=csv"),
    );
    expect(csvRes.status).toBe(200);
    const csvLines = (await csvRes.text()).trim().split("\n");
    expect(csvLines.length).toBe(ALL_INDEX_ITEMS.length + 1);
    expect(csvLines[0]).toContain("catalogTier");
    expect(csvLines[0]).toContain("footprintCoverage");
  });
});
