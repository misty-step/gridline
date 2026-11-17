import type {
  CampusFootprintProps,
  FacilityIndexItem,
  FacilityRecord,
  FacilitySource,
  FleetSummaryMetadata,
  IsoRegionProps,
  RegistryMetadata,
} from "../shared/types.ts";
import flagshipDossiersJson from "./flagship-dossiers.json" with { type: "json" };
import fleetSummaryJson from "./fleet-summary.json" with { type: "json" };
import footprintsUsJson from "./footprints-us.json" with { type: "json" };
import isoRegionsJson from "./iso-regions.geojson" with { type: "json" };
import registryDetailsJson from "./registry-details.json" with { type: "json" };
import usCensusIndexJson from "./us-census-index.json" with { type: "json" };

interface RegistryDetailPayload {
  streetAddress?: string;
  zipcode?: string;
  website?: string;
  watershedName?: string;
  registryMetadata?: RegistryMetadata;
  sourceUrls: Array<{
    title: string;
    publisher: string;
    date: string;
    kind: FacilitySource["kind"];
    url: string;
  }>;
}

export const ALL_INDEX_ITEMS: FacilityIndexItem[] =
  usCensusIndexJson as unknown as FacilityIndexItem[];

export const FLEET_SUMMARY: FleetSummaryMetadata =
  fleetSummaryJson as unknown as FleetSummaryMetadata;

export const ALL_FOOTPRINTS: GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CampusFootprintProps
> = footprintsUsJson as unknown as GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CampusFootprintProps
>;

export const ISO_REGIONS: GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  IsoRegionProps
> = isoRegionsJson as unknown as GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  IsoRegionProps
>;

const FLAGSHIP_DOSSIERS = flagshipDossiersJson as unknown as FacilityRecord[];
const REGISTRY_DETAILS = registryDetailsJson as unknown as Record<string, RegistryDetailPayload>;

const dossierById = new Map<string, FacilityRecord>();
for (const dossier of FLAGSHIP_DOSSIERS) {
  dossierById.set(dossier.id, dossier);
}

const indexById = new Map<string, FacilityIndexItem>();
for (const item of ALL_INDEX_ITEMS) {
  indexById.set(item.id, item);
}

const footprintsByFacilityId = new Map<
  string,
  GeoJSON.Feature<GeoJSON.Polygon, CampusFootprintProps>[]
>();
for (const feat of ALL_FOOTPRINTS.features) {
  const fid = feat.properties.facilityId;
  const list = footprintsByFacilityId.get(fid);
  if (list) list.push(feat);
  else footprintsByFacilityId.set(fid, [feat]);
}

function hydrateRegistryRecord(item: FacilityIndexItem): FacilityRecord {
  const detail = REGISTRY_DETAILS[item.id];
  const meta = detail?.registryMetadata ?? {
    mappedPolygonCount: item.mappedPolygonCount,
    sourceTags: item.sourceTags,
    ...(item.grossSqFt !== null ? { im3SqFt: item.grossSqFt } : {}),
  };

  const sources: FacilitySource[] = (detail?.sourceUrls ?? []).map((src, idx) => ({
    id: `src-reg-${idx + 1}`,
    title: src.title,
    publisher: src.publisher,
    date: src.date,
    kind: src.kind,
    url: src.url,
  }));

  if (sources.length === 0) {
    sources.push({
      id: "src-reg-1",
      title: "DOE / PNNL IM3 Open Source Data Center Atlas",
      publisher: "Pacific Northwest National Laboratory",
      date: item.lastVerified,
      kind: "registry_census",
      url: "https://github.com/IMMM-SFA/datacenter-atlas",
    });
  }
  const primarySourceId = sources[0].id;

  const provenanceParts: string[] = [];
  if (item.sourceTags.includes("im3")) provenanceParts.push("DOE/PNNL IM3");
  if (item.sourceTags.includes("peeringdb")) provenanceParts.push("PeeringDB");
  if (item.sourceTags.includes("epa_echo")) provenanceParts.push("EPA ECHO NAICS 518210");
  const provenanceList = provenanceParts.join(", ") || "Open US Infrastructure Registries";

  const addressSuffix = detail?.streetAddress
    ? ` at ${detail.streetAddress}${detail.zipcode ? ` (${detail.zipcode})` : ""}`
    : "";
  const interconnectionSummary =
    meta.netCount || meta.ixCount || meta.carrierCount
      ? ` PeeringDB records ${meta.netCount ?? 0} networks, ${meta.ixCount ?? 0} IXPs, and ${meta.carrierCount ?? 0} carriers.`
      : "";
  const epaSummary = meta.epaRegistryId
    ? ` EPA FRS Registry ID ${meta.epaRegistryId}${meta.airIds ? ` (Air ${meta.airIds})` : ""}${meta.npdesIds ? ` (NPDES ${meta.npdesIds})` : ""}.`
    : "";

  return {
    id: item.id,
    name: item.name,
    marketCluster: item.marketCluster,
    city: item.city,
    county: item.county,
    state: item.state,
    isoRegion: item.isoRegion,
    coordinates: item.coordinates,
    lifecycleStatus: item.lifecycleStatus,
    catalogTier: item.catalogTier,
    footprintCoverage: item.footprintCoverage,
    registryMetadata: meta,
    summary: `Registry-verified ${item.city}, ${item.state} facility${addressSuffix} fused from ${provenanceList}.${interconnectionSummary}${epaSummary}`.trim(),
    parcel: {
      acreage: {
        value: null,
        unit: "acres",
        epistemic: "undisclosed",
        asOf: item.lastVerified,
        basis: "Parcel acreage not reported in open federal or interconnection registries",
        sourceId: primarySourceId,
      },
      grossSqFt:
        item.grossSqFt !== null
          ? {
              value: item.grossSqFt,
              unit: "sq ft",
              epistemic: "estimated",
              asOf: item.lastVerified,
              basis: "Surveyed footprint area from DOE/PNNL IM3 open infrastructure polygons",
              sourceId: primarySourceId,
            }
          : {
              value: null,
              unit: "sq ft",
              epistemic: "undisclosed",
              asOf: item.lastVerified,
              basis: "Building floor area undisclosed in open colocation registry",
              sourceId: primarySourceId,
            },
      dataHallCount: null,
      zoningDesignation: "Registry Verified Site",
      parcelNote: detail?.streetAddress
        ? `${detail.streetAddress}, ${item.city}, ${item.state} ${detail.zipcode ?? ""}`.trim()
        : `${item.city}, ${item.county}, ${item.state} (${item.footprintCoverage === "verified_polygons" ? "IM3 footprint mapped" : "Coordinate verified"})`,
    },
    stakeholders: {
      developer: item.developer,
      operator: item.operator,
      anchorTenants: [],
    },
    power: {
      operationalMw: {
        value: item.operationalMw,
        unit: "MW",
        epistemic: item.operationalMwEpistemic,
        asOf: item.lastVerified,
        basis:
          item.operationalMw === null
            ? "Facility power capacity is not published in federal or PeeringDB registries"
            : "Disclosed operational power capacity",
        sourceId: primarySourceId,
      },
      totalPlannedMw: {
        value: item.totalPlannedMw,
        unit: "MW",
        epistemic: item.totalPlannedMwEpistemic,
        asOf: item.lastVerified,
        basis:
          item.totalPlannedMw === null
            ? "Planned MW ceiling is not published in open registry records"
            : "Disclosed total planned power capacity",
        sourceId: primarySourceId,
      },
      utilityProvider: item.utilityProvider,
      interconnectionStatus: item.interconnectionStatus,
      substationVoltage: "Regional Utility Feed",
      backupGeneratorsPermitted: null,
      backupFuelNote: meta.airIds
        ? `EPA ECHO Air Program ID(s): ${meta.airIds}`
        : "Backup generator permit counts not reported in open registry census.",
      cleanPowerAndTariffSummary: `Operates within ${item.isoRegion} regional electric balancing authority.`,
    },
    waterAndCooling: {
      coolingArchitecture: item.coolingArchitecture,
      peakOrAvgWaterMgd: {
        value: item.peakOrAvgWaterMgd,
        unit: "MGD",
        epistemic: item.waterEpistemic,
        asOf: item.lastVerified,
        basis:
          item.peakOrAvgWaterMgd === null
            ? "Site-level cooling water draw is not published in open national registries"
            : "Disclosed peak/average daily water draw",
        sourceId: primarySourceId,
      },
      annualWaterMgy: {
        value: item.annualWaterMgy,
        unit: "MGY",
        epistemic: item.waterEpistemic,
        asOf: item.lastVerified,
        basis:
          item.annualWaterMgy === null
            ? "Annual water volume is not published in open national registries"
            : "Disclosed annual water volume",
        sourceId: primarySourceId,
      },
      pue: {
        value: null,
        unit: "ratio",
        epistemic: "undisclosed",
        asOf: item.lastVerified,
        basis: "Site-level PUE is not reported in open colocation or federal registries",
        sourceId: primarySourceId,
      },
      waterSource: "Regional municipal / basin supply (undisclosed cooling architecture)",
      watershedName: detail?.watershedName ?? `${item.county} Basin`,
      watershedStress: item.watershedStress,
      usgsGaugeSiteId: item.usgsGaugeSiteId,
      nwsStationId: item.nwsStationId,
    },
    regulatory: {
      permittingStage: meta.epaRegistryId
        ? `EPA ECHO Regulated Facility (${meta.epaRegistryId})`
        : "Registry-Verified Facility",
      moratoriumOrLitigationActive: item.moratoriumOrLitigationActive,
      communityAndLegalSummary: meta.epaRegistryId
        ? `Cross-referenced with EPA ECHO NAICS 518210 registry record ${meta.epaRegistryId}.`
        : "Indexed from verified commercial-safe open registries with no invented regulatory prose.",
      permits: meta.epaRegistryId
        ? [
            {
              title: "EPA ECHO Detailed Facility Report (NAICS 518210)",
              agency: "U.S. EPA",
              docketOrPermitId: meta.epaRegistryId,
              date: item.lastVerified,
              status: "Registered",
              url: `https://echo.epa.gov/detailed-facility-report?fid=${meta.epaRegistryId}`,
            },
          ]
        : [],
    },
    perspectives: {
      proponent: [],
      critic: [],
    },
    sources,
    lastVerified: item.lastVerified,
    lastUpdated: item.lastUpdated,
  };
}

const hydratedRecordCache = new Map<string, FacilityRecord>();

export function getFacilityRecordById(id: string): FacilityRecord | undefined {
  const cached = hydratedRecordCache.get(id);
  if (cached) return cached;

  const dossier = dossierById.get(id);
  if (dossier) {
    hydratedRecordCache.set(id, dossier);
    return dossier;
  }

  const indexItem = indexById.get(id);
  if (!indexItem) return undefined;

  const hydrated = hydrateRegistryRecord(indexItem);
  hydratedRecordCache.set(id, hydrated);
  return hydrated;
}

export function getFacilityById(id: string): FacilityRecord | undefined {
  return getFacilityRecordById(id);
}

export const ALL_FACILITIES: FacilityRecord[] = ALL_INDEX_ITEMS.map((item) => {
  const record = getFacilityRecordById(item.id);
  if (!record) {
    throw new Error(`Failed to hydrate facility record for "${item.id}"`);
  }
  return record;
});

export function getFootprintsForFacility(
  facilityId: string,
): GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> {
  return {
    type: "FeatureCollection",
    features: footprintsByFacilityId.get(facilityId) ?? [],
  };
}
