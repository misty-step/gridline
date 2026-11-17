export type LifecycleStatus =
  | "operational"
  | "expanding"
  | "under_construction"
  | "permitted"
  | "proposed"
  | "contested"
  | "moratorium";

export type EpistemicStatus =
  | "measured"
  | "permitted"
  | "filed"
  | "disclosed"
  | "estimated"
  | "reported"
  | "undisclosed";

export type CatalogTier = "flagship" | "registry" | "provisional";

export type FootprintCoverage = "verified_polygons" | "point_only";

export type ActivityWindow = "24h" | "7d" | "30d" | "90d" | "all";

export type IsoRegion =
  | "PJM"
  | "ERCOT"
  | "MISO"
  | "WECC"
  | "CAISO"
  | "SERC"
  | "SPP"
  | "NYISO"
  | "ISO-NE";

export type CoolingArchitecture =
  | "closed_loop_liquid"
  | "air_chiller_zero_evap"
  | "adiabatic_hybrid"
  | "evaporative_tower"
  | "hybrid_liquid_evap"
  | "undisclosed";

export type WatershedStress =
  | "low"
  | "low_medium"
  | "medium_high"
  | "high"
  | "extremely_high";

export interface MetricValue {
  value: number | null;
  unit: string;
  epistemic: EpistemicStatus;
  asOf: string;
  basis: string;
  sourceId: string;
}

export interface AnchorTenant {
  name: string;
  role:
    | "hyperscale_owner"
    | "anchor_tenant"
    | "ai_compute_tenant"
    | "colocation_platform"
    | "reported_tenant";
  epistemic: EpistemicStatus;
  sourceId: string;
}

export interface PermitFiling {
  title: string;
  agency: string;
  docketOrPermitId: string;
  date: string;
  status: string;
  url: string;
}

export interface PerspectivePoint {
  claim: string;
  evidence: string;
  sourceId: string;
}

export interface FacilitySource {
  id: string;
  title: string;
  publisher: string;
  date: string;
  kind:
    | "regulatory_filing"
    | "environmental_permit"
    | "operator_disclosure"
    | "utility_iso_record"
    | "municipal_or_court_record"
    | "registry_census"
    | "public_reporting";
  url: string;
}

export interface RegistryMetadata {
  peeringDbFacId?: number | null;
  peeringDbCampusId?: number | null;
  netCount?: number | null;
  ixCount?: number | null;
  carrierCount?: number | null;
  clli?: string | null;
  epaRegistryId?: string | null;
  airIds?: string | null;
  npdesIds?: string | null;
  im3SqFt?: number | null;
  mappedPolygonCount?: number;
  sourceTags?: string[];
}

export interface FacilityRecord {
  id: string;
  name: string;
  marketCluster: string;
  city: string;
  county: string;
  state: string;
  isoRegion: IsoRegion;
  coordinates: [number, number]; // [lon, lat] WGS84
  lifecycleStatus: LifecycleStatus;
  catalogTier?: CatalogTier;
  footprintCoverage?: FootprintCoverage;
  registryMetadata?: RegistryMetadata;
  summary: string;
  parcel: {
    acreage: MetricValue;
    grossSqFt: MetricValue;
    dataHallCount: number | null;
    zoningDesignation: string;
    parcelNote: string;
  };
  stakeholders: {
    developer: string;
    operator: string;
    anchorTenants: AnchorTenant[];
  };
  power: {
    operationalMw: MetricValue;
    totalPlannedMw: MetricValue;
    utilityProvider: string;
    interconnectionStatus:
      | "energized"
      | "phased_energization"
      | "interconnection_queue"
      | "ferc_or_puc_contested"
      | "transmission_upgrade_pending";
    substationVoltage: string;
    backupGeneratorsPermitted: number | null;
    backupFuelNote: string;
    cleanPowerAndTariffSummary: string;
  };
  waterAndCooling: {
    coolingArchitecture: CoolingArchitecture;
    peakOrAvgWaterMgd: MetricValue;
    annualWaterMgy: MetricValue;
    pue: MetricValue;
    waterSource: string;
    watershedName: string;
    watershedStress: WatershedStress;
    usgsGaugeSiteId: string;
    nwsStationId: string;
  };
  regulatory: {
    permittingStage: string;
    moratoriumOrLitigationActive: boolean;
    communityAndLegalSummary: string;
    permits: PermitFiling[];
  };
  perspectives: {
    proponent: PerspectivePoint[];
    critic: PerspectivePoint[];
  };
  sources: FacilitySource[];
  lastVerified: string;
  lastUpdated?: string;
}

export interface FacilityIndexItem {
  id: string;
  name: string;
  marketCluster: string;
  city: string;
  county: string;
  state: string;
  isoRegion: IsoRegion;
  coordinates: [number, number]; // [lon, lat] WGS84
  lifecycleStatus: LifecycleStatus;
  catalogTier: CatalogTier;
  footprintCoverage: FootprintCoverage;
  developer: string;
  operator: string;
  utilityProvider: string;
  interconnectionStatus: FacilityRecord["power"]["interconnectionStatus"];
  operationalMw: number | null;
  operationalMwEpistemic: EpistemicStatus;
  totalPlannedMw: number | null;
  totalPlannedMwEpistemic: EpistemicStatus;
  coolingArchitecture: CoolingArchitecture;
  peakOrAvgWaterMgd: number | null;
  annualWaterMgy: number | null;
  waterEpistemic: EpistemicStatus;
  watershedStress: WatershedStress;
  moratoriumOrLitigationActive: boolean;
  usgsGaugeSiteId: string;
  nwsStationId: string;
  grossSqFt: number | null;
  mappedPolygonCount: number;
  sourceTags: string[];
  lastVerified: string;
  lastUpdated: string;
}

export interface FleetSummaryMetadata {
  totalFacilities: number;
  statesCovered: number;
  byTier: Record<CatalogTier, number>;
  byFootprintCoverage: Record<FootprintCoverage, number>;
  byIso: Partial<Record<IsoRegion, number>>;
  byStatus: Partial<Record<LifecycleStatus, number>>;
  verifiedOperationalMwTotal: number;
  verifiedPlannedMwTotal: number;
  reportedOrProposedMwTotal: number;
  disclosedWaterFacilityCount: number;
  undisclosedWaterFacilityCount: number;
  contestedOrMoratoriumCount: number;
  censusGeneratedAt: string;
}

export interface CampusFootprintProps {
  facilityId: string;
  zoneKind:
    | "campus_boundary"
    | "operational_hall"
    | "planned_expansion"
    | "substation_yard"
    | "cooling_yard"
    | "building"
    | "campus";
  label: string;
  mwLabel?: string;
  sqft?: number | null;
  status: LifecycleStatus;
}

export interface IsoRegionProps {
  id: IsoRegion;
  name: IsoRegion;
  fullName: string;
  queueNote: string;
  gridStressLevel: "elevated" | "high" | "severe" | "moderate";
}

export interface LiveStationWeather {
  stationId: string;
  observedAt: string | null;
  tempC: number | null;
  tempF: number | null;
  relativeHumidityPct: number | null;
  wetBulbC: number | null;
  wetBulbF: number | null;
  thermalRegime:
    | "free_economizer"
    | "adiabatic_assist"
    | "peak_chiller_evap"
    | "unavailable";
  sourceUrl: string;
  status: "live" | "degraded";
  error?: string;
}

export interface LiveBasinHydrology {
  siteId: string;
  siteName: string | null;
  observedAt: string | null;
  dischargeCfs: number | null;
  unit: "ft3/s";
  sourceUrl: string;
  status: "live" | "degraded";
  error?: string;
}

export interface LiveFacilityTelemetry {
  facilityId: string;
  fetchedAt: string;
  weather: LiveStationWeather;
  hydrology: LiveBasinHydrology;
}

export type GridFuelCategory =
  | "nuclear"
  | "gas"
  | "coal"
  | "wind"
  | "solar"
  | "hydro"
  | "other";

export interface GridFuelMixItem {
  fuel: GridFuelCategory;
  label: string;
  mw: number;
  sharePct: number;
}

export interface LiveIsoGridSnapshot {
  isoRegion: IsoRegion;
  eiaRespondent: string;
  observedAt: string | null;
  demandMw: number | null;
  netGenerationMw: number | null;
  interchangeMw: number | null;
  fuelMix: GridFuelMixItem[];
  sourceUrl: string;
  status: "live" | "stale" | "degraded";
  error?: string;
}

export interface LiveGridFeed {
  fetchedAt: string;
  status: "live" | "stale" | "degraded";
  sourceUrl: string;
  regions: Partial<Record<IsoRegion, LiveIsoGridSnapshot>>;
  error?: string;
}

export interface LiveRegulatoryItem {
  documentNumber: string;
  title: string;
  agencies: string[];
  publicationDate: string;
  type: string;
  abstract: string;
  htmlUrl: string;
  pdfUrl: string | null;
}

export interface LiveRegulatoryFeed {
  fetchedAt: string;
  status: "live" | "degraded";
  sourceUrl: string;
  items: LiveRegulatoryItem[];
  error?: string;
}

export type PulseStream = "federal_register" | "sec_edgar" | "peeringdb";

export interface LivePulseSignal {
  id: string;
  stream: PulseStream;
  title: string;
  publisher: string;
  publishedAt: string;
  summary: string;
  url: string;
  pdfUrl?: string | null;
  isoRegions?: IsoRegion[];
  states?: string[];
  matchedFacilityIds?: string[];
  epistemic: EpistemicStatus;
  documentNumber?: string;
  tickerOrCik?: string;
  peeringDbFacId?: number | null;
}

export interface LivePulseFeed {
  fetchedAt: string;
  window: ActivityWindow;
  status: "live" | "stale" | "degraded";
  streamStatus: Record<PulseStream, "live" | "stale" | "degraded">;
  items: LivePulseSignal[];
  error?: string;
}

export interface FacilitiesApiResponse {
  facilities: FacilityRecord[];
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  isoRegions: GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    IsoRegionProps
  >;
}

export interface FacilitiesIndexApiResponse {
  facilities: FacilityIndexItem[];
  summary: FleetSummaryMetadata;
  isoRegions: GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    IsoRegionProps
  >;
}

export interface FacilityDetailApiResponse {
  facility: FacilityRecord;
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  telemetry: LiveFacilityTelemetry;
  gridSnapshot?: LiveIsoGridSnapshot | null;
}

export interface TelemetrySummaryApiResponse {
  fetchedAt: string;
  stations: Record<string, LiveStationWeather>;
  gauges: Record<string, LiveBasinHydrology>;
}
