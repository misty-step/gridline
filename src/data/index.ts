import type {
  CampusFootprintProps,
  FacilityRecord,
  IsoRegionProps,
} from "../shared/types.ts";
import facilitiesEastJson from "./facilities-east.json" with { type: "json" };
import facilitiesWestJson from "./facilities-west.json" with { type: "json" };
import footprintsEastJson from "./footprints-east.json" with { type: "json" };
import footprintsWestJson from "./footprints-west.json" with { type: "json" };
import isoRegionsJson from "./iso-regions.geojson" with { type: "json" };

const eastFacilities = facilitiesEastJson as unknown as FacilityRecord[];
const westFacilities = facilitiesWestJson as unknown as FacilityRecord[];

const eastFootprints = footprintsEastJson as unknown as GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CampusFootprintProps
>;
const westFootprints = footprintsWestJson as unknown as GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CampusFootprintProps
>;

export const ALL_FACILITIES: FacilityRecord[] = [
  ...eastFacilities,
  ...westFacilities,
];

export const ALL_FOOTPRINTS: GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CampusFootprintProps
> = {
  type: "FeatureCollection",
  features: [...eastFootprints.features, ...westFootprints.features],
};

export const ISO_REGIONS = isoRegionsJson as unknown as GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  IsoRegionProps
>;

export function getFacilityById(id: string): FacilityRecord | undefined {
  return ALL_FACILITIES.find((f) => f.id === id);
}

export function getFootprintsForFacility(
  facilityId: string,
): GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> {
  return {
    type: "FeatureCollection",
    features: ALL_FOOTPRINTS.features.filter(
      (feat) => feat.properties.facilityId === facilityId,
    ),
  };
}
