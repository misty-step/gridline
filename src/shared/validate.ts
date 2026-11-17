import type {
  CampusFootprintProps,
  CatalogTier,
  CoolingArchitecture,
  EpistemicStatus,
  FacilityIndexItem,
  FacilityRecord,
  FacilitySource,
  FootprintCoverage,
  IsoRegion,
  IsoRegionProps,
  LifecycleStatus,
  MetricValue,
  PerspectivePoint,
  WatershedStress,
} from "./types.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const LIFECYCLE_STATUSES = new Set<LifecycleStatus>([
  "operational",
  "expanding",
  "under_construction",
  "permitted",
  "proposed",
  "contested",
  "moratorium",
]);

const EPISTEMIC_STATUSES = new Set<EpistemicStatus>([
  "measured",
  "permitted",
  "filed",
  "disclosed",
  "estimated",
  "reported",
  "undisclosed",
]);

const CATALOG_TIERS = new Set<CatalogTier>([
  "flagship",
  "registry",
  "provisional",
]);

const FOOTPRINT_COVERAGES = new Set<FootprintCoverage>([
  "verified_polygons",
  "point_only",
]);

const ISO_REGIONS = new Set<IsoRegion>([
  "PJM",
  "ERCOT",
  "MISO",
  "WECC",
  "CAISO",
  "SERC",
  "SPP",
  "NYISO",
  "ISO-NE",
]);

const COOLING_ARCHITECTURES = new Set<CoolingArchitecture>([
  "closed_loop_liquid",
  "air_chiller_zero_evap",
  "adiabatic_hybrid",
  "evaporative_tower",
  "hybrid_liquid_evap",
  "undisclosed",
]);

const WATERSHED_STRESS = new Set<WatershedStress>([
  "low",
  "low_medium",
  "medium_high",
  "high",
  "extremely_high",
]);

const INTERCONNECTION_STATUSES = new Set([
  "energized",
  "phased_energization",
  "interconnection_queue",
  "ferc_or_puc_contested",
  "transmission_upgrade_pending",
]);

const TENANT_ROLES = new Set([
  "hyperscale_owner",
  "anchor_tenant",
  "ai_compute_tenant",
  "colocation_platform",
  "reported_tenant",
]);

const SOURCE_KINDS = new Set<FacilitySource["kind"]>([
  "regulatory_filing",
  "environmental_permit",
  "operator_disclosure",
  "utility_iso_record",
  "municipal_or_court_record",
  "registry_census",
  "public_reporting",
]);

const ZONE_KINDS = new Set<CampusFootprintProps["zoneKind"]>([
  "campus_boundary",
  "operational_hall",
  "planned_expansion",
  "substation_yard",
  "cooling_yard",
  "building",
  "campus",
]);

const USGS_SITE_RE = /^\d{8}$/;
const NWS_STATION_RE = /^[A-Z0-9]{4}$/;

export function isSafeHttpUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isValidUsCoord(lon: number, lat: number): boolean {
  return (
    typeof lon === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -170 &&
    lon <= -65 &&
    lat >= 18 &&
    lat <= 72
  );
}

function validateScalarMetric(
  label: string,
  value: number | null,
  epistemic: EpistemicStatus,
  errors: string[],
): void {
  if (!EPISTEMIC_STATUSES.has(epistemic)) {
    errors.push(`${label}: invalid epistemic "${epistemic}"`);
  }
  if (epistemic === "undisclosed") {
    if (value !== null) {
      errors.push(`${label}: epistemic "undisclosed" requires value === null`);
    }
  } else if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(
      `${label}: non-undisclosed epistemic "${epistemic}" requires numeric value`,
    );
  }
}

function validateMetric(
  facilityId: string,
  fieldPath: string,
  metric: MetricValue,
  sourceIds: Set<string>,
  errors: string[],
): void {
  if (!metric || typeof metric !== "object") {
    errors.push(`${facilityId}.${fieldPath}: missing MetricValue object`);
    return;
  }
  validateScalarMetric(
    `${facilityId}.${fieldPath}`,
    metric.value,
    metric.epistemic,
    errors,
  );
  if (!metric.unit || typeof metric.unit !== "string") {
    errors.push(`${facilityId}.${fieldPath}: missing unit`);
  }
  if (!metric.asOf || typeof metric.asOf !== "string") {
    errors.push(`${facilityId}.${fieldPath}: missing asOf`);
  }
  if (!metric.basis || typeof metric.basis !== "string") {
    errors.push(`${facilityId}.${fieldPath}: missing basis`);
  }
  if (!metric.sourceId || !sourceIds.has(metric.sourceId)) {
    errors.push(`${facilityId}.${fieldPath}: unknown sourceId "${metric.sourceId}"`);
  }
}

function validatePerspectiveList(
  facilityLabel: string,
  side: "proponent" | "critic",
  points: PerspectivePoint[] | undefined,
  requireNonEmpty: boolean,
  sourceIds: Set<string>,
  errors: string[],
): void {
  if (!Array.isArray(points)) {
    errors.push(`${facilityLabel}.perspectives.${side}: must be an array`);
    return;
  }
  if (requireNonEmpty && points.length === 0) {
    errors.push(`${facilityLabel}.perspectives.${side}: must be non-empty`);
    return;
  }
  for (let idx = 0; idx < points.length; idx += 1) {
    const pt = points[idx];
    if (!pt || !pt.claim?.trim() || !pt.evidence?.trim()) {
      errors.push(`${facilityLabel}.perspectives.${side}[${idx}]: claim and evidence required`);
    }
    if (!pt || !sourceIds.has(pt.sourceId)) {
      errors.push(
        `${facilityLabel}.perspectives.${side}[${idx}]: unknown sourceId "${pt?.sourceId}"`,
      );
    }
  }
}

function validateRingClosed(
  label: string,
  ring: unknown,
  errors: string[],
): void {
  if (!Array.isArray(ring) || ring.length < 4) {
    errors.push(`${label}: polygon ring must have at least 4 coordinate pairs`);
    return;
  }
  for (let i = 0; i < ring.length; i += 1) {
    const pt = ring[i];
    if (!Array.isArray(pt) || pt.length < 2 || !isValidUsCoord(pt[0], pt[1])) {
      errors.push(`${label}: invalid US coordinate at vertex ${i}`);
      return;
    }
  }
  const first = ring[0] as [number, number];
  const last = ring[ring.length - 1] as [number, number];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    errors.push(`${label}: polygon ring is not closed (first vertex !== last vertex)`);
  }
}

export function validateFacilities(facilities: FacilityRecord[]): ValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (!Array.isArray(facilities) || facilities.length === 0) {
    return { valid: false, errors: ["facilities array must be non-empty"] };
  }

  for (let idx = 0; idx < facilities.length; idx += 1) {
    const f = facilities[idx];
    const label = f?.id || `index[${idx}]`;

    if (!f || typeof f !== "object") {
      errors.push(`${label}: facility record must be an object`);
      continue;
    }
    if (!f.id || typeof f.id !== "string" || f.id.trim().length === 0) {
      errors.push(`${label}: facility id must be a non-empty string`);
    } else if (seenIds.has(f.id)) {
      errors.push(`${f.id}: duplicate facility id`);
    } else {
      seenIds.add(f.id);
    }

    if (!f.name?.trim()) errors.push(`${label}: missing name`);
    if (!f.marketCluster?.trim()) errors.push(`${label}: missing marketCluster`);
    if (!f.city?.trim()) errors.push(`${label}: missing city`);
    if (!f.county?.trim()) errors.push(`${label}: missing county`);
    if (!f.state?.trim()) errors.push(`${label}: missing state`);
    if (!ISO_REGIONS.has(f.isoRegion)) {
      errors.push(`${label}: invalid isoRegion "${f.isoRegion}"`);
    }
    if (!LIFECYCLE_STATUSES.has(f.lifecycleStatus)) {
      errors.push(`${label}: invalid lifecycleStatus "${f.lifecycleStatus}"`);
    }

    const tier: CatalogTier = f.catalogTier ?? "flagship";
    if (f.catalogTier !== undefined && !CATALOG_TIERS.has(f.catalogTier)) {
      errors.push(`${label}: invalid catalogTier "${f.catalogTier}"`);
    }
    if (f.footprintCoverage !== undefined && !FOOTPRINT_COVERAGES.has(f.footprintCoverage)) {
      errors.push(`${label}: invalid footprintCoverage "${f.footprintCoverage}"`);
    }
    if (f.registryMetadata !== undefined) {
      if (typeof f.registryMetadata !== "object" || f.registryMetadata === null || Array.isArray(f.registryMetadata)) {
        errors.push(`${label}.registryMetadata: must be an object`);
      } else {
        if (
          f.registryMetadata.mappedPolygonCount !== undefined &&
          (typeof f.registryMetadata.mappedPolygonCount !== "number" ||
            !Number.isFinite(f.registryMetadata.mappedPolygonCount) ||
            f.registryMetadata.mappedPolygonCount < 0)
        ) {
          errors.push(`${label}.registryMetadata.mappedPolygonCount: must be a non-negative finite number`);
        }
        if (
          f.registryMetadata.sourceTags !== undefined &&
          (!Array.isArray(f.registryMetadata.sourceTags) ||
            f.registryMetadata.sourceTags.some((t) => typeof t !== "string" || !t.trim()))
        ) {
          errors.push(`${label}.registryMetadata.sourceTags: must be an array of non-empty strings`);
        }
      }
    }

    if (!Array.isArray(f.coordinates) || f.coordinates.length !== 2) {
      errors.push(`${label}: coordinates must be [lon, lat]`);
    } else if (!isValidUsCoord(f.coordinates[0], f.coordinates[1])) {
      errors.push(
        `${label}: coordinates [${f.coordinates[0]}, ${f.coordinates[1]}] out of US bounds`,
      );
    }

    const sourceIds = new Set<string>();
    if (!Array.isArray(f.sources) || f.sources.length === 0) {
      errors.push(`${label}: sources must be non-empty`);
    } else {
      for (const src of f.sources) {
        if (!src.id?.trim()) {
          errors.push(`${label}: source entry missing id`);
        } else if (sourceIds.has(src.id)) {
          errors.push(`${label}: duplicate source id "${src.id}"`);
        } else {
          sourceIds.add(src.id);
        }
        if (!SOURCE_KINDS.has(src.kind)) {
          errors.push(`${label}.sources[${src.id}]: invalid kind "${src.kind}"`);
        }
        if (!isSafeHttpUrl(src.url)) {
          errors.push(`${label}.sources[${src.id}]: invalid url "${src.url}"`);
        }
      }
    }

    validateMetric(label, "parcel.acreage", f.parcel?.acreage, sourceIds, errors);
    validateMetric(label, "parcel.grossSqFt", f.parcel?.grossSqFt, sourceIds, errors);
    if (
      f.parcel?.dataHallCount !== null &&
      (typeof f.parcel?.dataHallCount !== "number" || !Number.isFinite(f.parcel.dataHallCount))
    ) {
      errors.push(`${label}.parcel.dataHallCount: must be a finite number or null`);
    }

    if (!f.stakeholders?.developer?.trim()) {
      errors.push(`${label}: missing stakeholders.developer`);
    }
    if (!f.stakeholders?.operator?.trim()) {
      errors.push(`${label}: missing stakeholders.operator`);
    }
    if (!Array.isArray(f.stakeholders?.anchorTenants)) {
      errors.push(`${label}: anchorTenants must be an array`);
    } else {
      for (const tenant of f.stakeholders.anchorTenants) {
        if (!TENANT_ROLES.has(tenant.role)) {
          errors.push(`${label}.anchorTenants[${tenant.name}]: invalid role "${tenant.role}"`);
        }
        if (!EPISTEMIC_STATUSES.has(tenant.epistemic)) {
          errors.push(`${label}.anchorTenants[${tenant.name}]: invalid epistemic`);
        }
        if (!sourceIds.has(tenant.sourceId)) {
          errors.push(
            `${label}.anchorTenants[${tenant.name}]: unknown sourceId "${tenant.sourceId}"`,
          );
        }
      }
    }

    validateMetric(label, "power.operationalMw", f.power?.operationalMw, sourceIds, errors);
    validateMetric(label, "power.totalPlannedMw", f.power?.totalPlannedMw, sourceIds, errors);
    if (!INTERCONNECTION_STATUSES.has(f.power?.interconnectionStatus)) {
      errors.push(
        `${label}.power.interconnectionStatus: invalid value "${f.power?.interconnectionStatus}"`,
      );
    }
    if (
      f.power?.backupGeneratorsPermitted !== null &&
      (typeof f.power?.backupGeneratorsPermitted !== "number" ||
        !Number.isFinite(f.power.backupGeneratorsPermitted))
    ) {
      errors.push(`${label}.power.backupGeneratorsPermitted: must be a finite number or null`);
    }

    if (!COOLING_ARCHITECTURES.has(f.waterAndCooling?.coolingArchitecture)) {
      errors.push(
        `${label}.waterAndCooling.coolingArchitecture: invalid value "${f.waterAndCooling?.coolingArchitecture}"`,
      );
    }
    validateMetric(
      label,
      "waterAndCooling.peakOrAvgWaterMgd",
      f.waterAndCooling?.peakOrAvgWaterMgd,
      sourceIds,
      errors,
    );
    validateMetric(
      label,
      "waterAndCooling.annualWaterMgy",
      f.waterAndCooling?.annualWaterMgy,
      sourceIds,
      errors,
    );
    validateMetric(label, "waterAndCooling.pue", f.waterAndCooling?.pue, sourceIds, errors);
    if (!WATERSHED_STRESS.has(f.waterAndCooling?.watershedStress)) {
      errors.push(
        `${label}.waterAndCooling.watershedStress: invalid value "${f.waterAndCooling?.watershedStress}"`,
      );
    }
    if (!USGS_SITE_RE.test(f.waterAndCooling?.usgsGaugeSiteId ?? "")) {
      errors.push(
        `${label}.waterAndCooling.usgsGaugeSiteId: "${f.waterAndCooling?.usgsGaugeSiteId}" must match ^\\d{8}$`,
      );
    }
    if (!NWS_STATION_RE.test(f.waterAndCooling?.nwsStationId ?? "")) {
      errors.push(
        `${label}.waterAndCooling.nwsStationId: "${f.waterAndCooling?.nwsStationId}" must match ^[A-Z0-9]{4}$`,
      );
    }

    if (!Array.isArray(f.regulatory?.permits)) {
      errors.push(`${label}.regulatory.permits: must be an array`);
    } else {
      for (const permit of f.regulatory.permits) {
        if (!isSafeHttpUrl(permit.url)) {
          errors.push(`${label}.regulatory.permits[${permit.docketOrPermitId}]: invalid url "${permit.url}"`);
        }
      }
    }

    const requirePerspectives = tier === "flagship";
    validatePerspectiveList(
      label,
      "proponent",
      f.perspectives?.proponent,
      requirePerspectives,
      sourceIds,
      errors,
    );
    validatePerspectiveList(
      label,
      "critic",
      f.perspectives?.critic,
      requirePerspectives,
      sourceIds,
      errors,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateFacilityIndex(items: FacilityIndexItem[]): ValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, errors: ["facility index array must be non-empty"] };
  }

  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const label = item?.id || `index[${idx}]`;

    if (!item || typeof item !== "object") {
      errors.push(`${label}: facility index item must be an object`);
      continue;
    }
    if (!item.id || typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`${label}: facility id must be a non-empty string`);
    } else if (seenIds.has(item.id)) {
      errors.push(`${item.id}: duplicate facility id`);
    } else {
      seenIds.add(item.id);
    }

    if (!item.name?.trim()) errors.push(`${label}: missing name`);
    if (!item.marketCluster?.trim()) errors.push(`${label}: missing marketCluster`);
    if (!item.city?.trim()) errors.push(`${label}: missing city`);
    if (!item.county?.trim()) errors.push(`${label}: missing county`);
    if (!item.state?.trim()) errors.push(`${label}: missing state`);
    if (!ISO_REGIONS.has(item.isoRegion)) {
      errors.push(`${label}: invalid isoRegion "${item.isoRegion}"`);
    }
    if (!LIFECYCLE_STATUSES.has(item.lifecycleStatus)) {
      errors.push(`${label}: invalid lifecycleStatus "${item.lifecycleStatus}"`);
    }
    if (!CATALOG_TIERS.has(item.catalogTier)) {
      errors.push(`${label}: invalid catalogTier "${item.catalogTier}"`);
    }
    if (!FOOTPRINT_COVERAGES.has(item.footprintCoverage)) {
      errors.push(`${label}: invalid footprintCoverage "${item.footprintCoverage}"`);
    }
    if (!Array.isArray(item.coordinates) || item.coordinates.length !== 2) {
      errors.push(`${label}: coordinates must be [lon, lat]`);
    } else if (!isValidUsCoord(item.coordinates[0], item.coordinates[1])) {
      errors.push(
        `${label}: coordinates [${item.coordinates[0]}, ${item.coordinates[1]}] out of US bounds`,
      );
    }

    if (!INTERCONNECTION_STATUSES.has(item.interconnectionStatus)) {
      errors.push(`${label}.interconnectionStatus: invalid value "${item.interconnectionStatus}"`);
    }
    if (!COOLING_ARCHITECTURES.has(item.coolingArchitecture)) {
      errors.push(`${label}.coolingArchitecture: invalid value "${item.coolingArchitecture}"`);
    }
    if (!WATERSHED_STRESS.has(item.watershedStress)) {
      errors.push(`${label}.watershedStress: invalid value "${item.watershedStress}"`);
    }
    if (!USGS_SITE_RE.test(item.usgsGaugeSiteId ?? "")) {
      errors.push(`${label}.usgsGaugeSiteId: "${item.usgsGaugeSiteId}" must match ^\\d{8}$`);
    }
    if (!NWS_STATION_RE.test(item.nwsStationId ?? "")) {
      errors.push(`${label}.nwsStationId: "${item.nwsStationId}" must match ^[A-Z0-9]{4}$`);
    }

    validateScalarMetric(
      `${label}.operationalMw`,
      item.operationalMw,
      item.operationalMwEpistemic,
      errors,
    );
    validateScalarMetric(
      `${label}.totalPlannedMw`,
      item.totalPlannedMw,
      item.totalPlannedMwEpistemic,
      errors,
    );
    if (!EPISTEMIC_STATUSES.has(item.waterEpistemic)) {
      errors.push(`${label}.waterEpistemic: invalid epistemic "${item.waterEpistemic}"`);
    } else if (item.waterEpistemic === "undisclosed") {
      if (item.peakOrAvgWaterMgd !== null || item.annualWaterMgy !== null) {
        errors.push(`${label}.waterEpistemic: "undisclosed" requires null water values`);
      }
    } else {
      const hasPeak = typeof item.peakOrAvgWaterMgd === "number" && Number.isFinite(item.peakOrAvgWaterMgd);
      const hasAnnual = typeof item.annualWaterMgy === "number" && Number.isFinite(item.annualWaterMgy);
      if (!hasPeak && !hasAnnual) {
        errors.push(`${label}.waterEpistemic: non-undisclosed water requires numeric MGD or MGY value`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateFootprints(
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>,
  facilities: FacilityRecord[],
): ValidationResult {
  const errors: string[] = [];
  const coverageById = new Map<string, FootprintCoverage>();
  for (const f of facilities) {
    coverageById.set(f.id, f.footprintCoverage ?? "verified_polygons");
  }

  if (!footprints || footprints.type !== "FeatureCollection" || !Array.isArray(footprints.features)) {
    return { valid: false, errors: ["footprints must be a GeoJSON FeatureCollection"] };
  }

  const coveredFacilities = new Set<string>();

  for (let idx = 0; idx < footprints.features.length; idx += 1) {
    const feat = footprints.features[idx];
    const props = feat?.properties;
    const label = `footprint[${idx}](${props?.facilityId ?? "unknown"}:${props?.zoneKind ?? "unknown"})`;

    if (!feat || feat.type !== "Feature") {
      errors.push(`${label}: feature must have type "Feature"`);
      continue;
    }
    if (!props || !coverageById.has(props.facilityId)) {
      errors.push(`${label}: facilityId "${props?.facilityId}" does not match any facility`);
    } else {
      coveredFacilities.add(props.facilityId);
    }
    if (!ZONE_KINDS.has(props?.zoneKind)) {
      errors.push(`${label}: invalid zoneKind "${props?.zoneKind}"`);
    }
    if (!LIFECYCLE_STATUSES.has(props?.status)) {
      errors.push(`${label}: invalid status "${props?.status}"`);
    }
    if (!props?.label?.trim()) {
      errors.push(`${label}: missing label`);
    }
    if (
      props?.sqft !== undefined &&
      props?.sqft !== null &&
      (typeof props.sqft !== "number" || !Number.isFinite(props.sqft) || props.sqft < 0)
    ) {
      errors.push(`${label}: sqft must be a non-negative finite number or null`);
    }
    if (feat.geometry?.type !== "Polygon" || !Array.isArray(feat.geometry.coordinates)) {
      errors.push(`${label}: geometry must be a Polygon`);
      continue;
    }
    if (feat.geometry.coordinates.length === 0) {
      errors.push(`${label}: Polygon must have at least one linear ring`);
      continue;
    }
    validateRingClosed(label, feat.geometry.coordinates[0], errors);
    for (let ringIdx = 1; ringIdx < feat.geometry.coordinates.length; ringIdx += 1) {
      validateRingClosed(`${label}:hole[${ringIdx}]`, feat.geometry.coordinates[ringIdx], errors);
    }
  }

  for (const [id, coverage] of coverageById.entries()) {
    if (coverage === "verified_polygons" && !coveredFacilities.has(id)) {
      errors.push(`facility "${id}" has no footprint features`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateIsoRegions(
  isoRegions: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, IsoRegionProps>,
): ValidationResult {
  const errors: string[] = [];
  if (!isoRegions || isoRegions.type !== "FeatureCollection" || !Array.isArray(isoRegions.features)) {
    return { valid: false, errors: ["isoRegions must be a GeoJSON FeatureCollection"] };
  }
  const seen = new Set<IsoRegion>();
  for (let i = 0; i < isoRegions.features.length; i += 1) {
    const feat = isoRegions.features[i];
    const id = feat?.properties?.id;
    if (!ISO_REGIONS.has(id)) {
      errors.push(`isoRegions[${i}]: invalid id "${id}"`);
    } else {
      seen.add(id);
    }
    if (!feat?.properties?.fullName?.trim() || !feat?.properties?.queueNote?.trim()) {
      errors.push(`isoRegions[${i}](${id}): fullName and queueNote required`);
    }
    if (feat?.geometry?.type === "Polygon") {
      validateRingClosed(`isoRegions[${id}]`, feat.geometry.coordinates[0], errors);
    } else if (feat?.geometry?.type === "MultiPolygon") {
      for (let p = 0; p < feat.geometry.coordinates.length; p += 1) {
        validateRingClosed(`isoRegions[${id}][${p}]`, feat.geometry.coordinates[p][0], errors);
      }
    } else {
      errors.push(`isoRegions[${i}](${id}): geometry must be Polygon or MultiPolygon`);
    }
  }
  for (const region of ISO_REGIONS) {
    if (!seen.has(region)) {
      errors.push(`isoRegions missing required region "${region}"`);
    }
  }
  return { valid: errors.length === 0, errors };
}
