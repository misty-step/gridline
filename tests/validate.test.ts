import { describe, expect, test } from "bun:test";
import type {
  CampusFootprintProps,
  FacilityRecord,
  IsoRegion,
  IsoRegionProps,
} from "../src/shared/types.ts";
import {
  isSafeHttpUrl,
  isValidUsCoord,
  validateFacilities,
  validateFootprints,
  validateIsoRegions,
} from "../src/shared/validate.ts";

export function makeFixtureFacility(
  overrides: Partial<FacilityRecord> = {},
): FacilityRecord {
  const base: FacilityRecord = {
    id: "ashburn-test",
    name: "Ashburn Test Campus",
    marketCluster: "Northern Virginia",
    city: "Ashburn",
    county: "Loudoun County",
    state: "VA",
    isoRegion: "PJM",
    coordinates: [-77.4874, 39.0438],
    lifecycleStatus: "operational",
    summary: "Test facility fixture.",
    parcel: {
      acreage: {
        value: 120,
        unit: "acres",
        epistemic: "filed",
        asOf: "2026-01-01",
        basis: "County GIS parcel record",
        sourceId: "src-1",
      },
      grossSqFt: {
        value: 1500000,
        unit: "sq ft",
        epistemic: "permitted",
        asOf: "2026-01-01",
        basis: "Site plan approval",
        sourceId: "src-1",
      },
      dataHallCount: 8,
      zoningDesignation: "PD-GI",
      parcelNote: "Industrial park parcel",
    },
    stakeholders: {
      developer: "Test Dev LLC",
      operator: "Test Ops Inc",
      anchorTenants: [
        {
          name: "Cloud Anchor",
          role: "anchor_tenant",
          epistemic: "disclosed",
          sourceId: "src-1",
        },
      ],
    },
    power: {
      operationalMw: {
        value: 200,
        unit: "MW",
        epistemic: "disclosed",
        asOf: "2026-01-01",
        basis: "Operator capacity disclosure",
        sourceId: "src-1",
      },
      totalPlannedMw: {
        value: 350,
        unit: "MW",
        epistemic: "filed",
        asOf: "2026-01-01",
        basis: "Substation interconnect filing",
        sourceId: "src-1",
      },
      utilityProvider: "Dominion Energy",
      interconnectionStatus: "phased_energization",
      substationVoltage: "230 kV",
      backupGeneratorsPermitted: 48,
      backupFuelNote: "Tier 4 diesel backup",
      cleanPowerAndTariffSummary: "Large load tariff schedule",
    },
    waterAndCooling: {
      coolingArchitecture: "closed_loop_liquid",
      peakOrAvgWaterMgd: {
        value: null,
        unit: "MGD",
        epistemic: "undisclosed",
        asOf: "2026-01-01",
        basis: "Operator treats water intake as confidential under NDA",
        sourceId: "src-1",
      },
      annualWaterMgy: {
        value: null,
        unit: "MGY",
        epistemic: "undisclosed",
        asOf: "2026-01-01",
        basis: "Not published in municipal disclosure",
        sourceId: "src-1",
      },
      pue: {
        value: 1.21,
        unit: "ratio",
        epistemic: "disclosed",
        asOf: "2026-01-01",
        basis: "Annual sustainability report",
        sourceId: "src-1",
      },
      waterSource: "Loudoun Water reclaimed",
      watershedName: "Potomac River Basin",
      watershedStress: "low_medium",
      usgsGaugeSiteId: "01646500",
      nwsStationId: "KIAD",
    },
    regulatory: {
      permittingStage: "Approved",
      moratoriumOrLitigationActive: false,
      communityAndLegalSummary: "Standard county review.",
      permits: [
        {
          title: "Air Quality Permit",
          agency: "VA DEQ",
          docketOrPermitId: "DEQ-2026-01",
          date: "2026-01-10",
          status: "Issued",
          url: "https://www.deq.virginia.gov/permits",
        },
      ],
    },
    perspectives: {
      proponent: [
        {
          claim: "Expands county tax base",
          evidence: "Commercial real estate tax filings",
          sourceId: "src-1",
        },
        {
          claim: "Uses reclaimed municipal water",
          evidence: "Utility service agreement",
          sourceId: "src-1",
        },
      ],
      critic: [
        {
          claim: "Adds substation transmission demand",
          evidence: "Regional queue backlog",
          sourceId: "src-1",
        },
        {
          claim: "Water disclosure remains NDA-protected",
          evidence: "Public records response",
          sourceId: "src-1",
        },
      ],
    },
    sources: [
      {
        id: "src-1",
        title: "Loudoun Filing",
        publisher: "Loudoun County",
        date: "2026-01-01",
        kind: "regulatory_filing",
        url: "https://www.loudoun.gov/datacenter",
      },
    ],
    lastVerified: "2026-11-16",
  };
  return { ...base, ...overrides };
}

export function makeFixtureFootprint(
  facilityId: string,
  status: FacilityRecord["lifecycleStatus"] = "operational",
): GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-77.49, 39.04],
              [-77.48, 39.04],
              [-77.48, 39.05],
              [-77.49, 39.05],
              [-77.49, 39.04],
            ],
          ],
        },
        properties: {
          facilityId,
          zoneKind: "campus_boundary",
          label: "Campus Boundary",
          mwLabel: "350 MW",
          status,
        },
      },
    ],
  };
}

describe("validation invariants", () => {
  test("accepts valid facility and footprint fixtures", () => {
    const f = makeFixtureFacility();
    const fp = makeFixtureFootprint(f.id);
    expect(validateFacilities([f])).toEqual({ valid: true, errors: [] });
    expect(validateFootprints(fp, [f])).toEqual({ valid: true, errors: [] });
  });

  test("rejects undisclosed metric with non-null value and disclosed metric with null", () => {
    const bad1 = makeFixtureFacility();
    bad1.waterAndCooling.peakOrAvgWaterMgd = {
      ...bad1.waterAndCooling.peakOrAvgWaterMgd,
      epistemic: "undisclosed",
      value: 1.5,
    };
    const res1 = validateFacilities([bad1]);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.includes('epistemic "undisclosed" requires value === null'))).toBe(
      true,
    );

    const bad2 = makeFixtureFacility();
    bad2.power.operationalMw = {
      ...bad2.power.operationalMw,
      epistemic: "disclosed",
      value: null,
    };
    const res2 = validateFacilities([bad2]);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes("requires numeric value"))).toBe(true);
  });

  test("rejects unsafe URLs, dangling sourceIds, invalid coordinates, and bad station/gauge IDs", () => {
    const bad = makeFixtureFacility({
      coordinates: [10, 10],
    });
    bad.sources[0].url = "javascript:alert(1)";
    bad.regulatory.permits[0].url = "ftp://example.com/permit";
    bad.waterAndCooling.usgsGaugeSiteId = "123";
    bad.waterAndCooling.nwsStationId = "BAD12";
    bad.perspectives.critic[0].sourceId = "missing-source";

    const res = validateFacilities([bad]);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(5);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isValidUsCoord(-77.48, 39.04)).toBe(true);
    expect(isValidUsCoord(10, 10)).toBe(false);
  });

  test("rejects unclosed polygon rings and unmatched footprint facilityIds", () => {
    const f = makeFixtureFacility();
    const fp = makeFixtureFootprint("other-id");
    fp.features[0].geometry.coordinates[0] = [
      [-77.49, 39.04],
      [-77.48, 39.04],
      [-77.48, 39.05],
      [-77.49, 39.05],
    ];
    const res = validateFootprints(fp, [f]);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("does not match any facility"))).toBe(true);
    expect(res.errors.some((e) => e.includes("not closed"))).toBe(true);
  });

  test("validates all 9 required ISO regions", () => {
    const regions: IsoRegion[] = [
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
    const fc: GeoJSON.FeatureCollection<GeoJSON.Polygon, IsoRegionProps> = {
      type: "FeatureCollection",
      features: regions.map((id) => ({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-80, 38],
              [-78, 38],
              [-78, 40],
              [-80, 40],
              [-80, 38],
            ],
          ],
        },
        properties: {
          id,
          name: id,
          fullName: `${id} Interconnection`,
          queueNote: "Active queue",
          gridStressLevel: "high",
        },
      })),
    };
    expect(validateIsoRegions(fc)).toEqual({ valid: true, errors: [] });
  });
});
