#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import type {
  CampusFootprintProps,
  CatalogTier,
  FacilityIndexItem,
  FacilityRecord,
  FacilitySource,
  FleetSummaryMetadata,
  FootprintCoverage,
  IsoRegion,
  IsoRegionProps,
  RegistryMetadata,
  WatershedStress,
} from "../src/shared/types.ts";
import {
  isSafeHttpUrl,
  isValidUsCoord,
  validateFacilities,
  validateFacilityIndex,
  validateFootprints,
  validateIsoRegions,
} from "../src/shared/validate.ts";

const USER_AGENT = "GridlineCensus/1.0 (ops@mistystep.io)";
const USE_CACHE = process.argv.includes("--cache");
const CACHE_DIR = resolve(tmpdir(), "gridline-census-cache");
const ROOT_DIR = resolve(dirname(new URL(import.meta.url).pathname), "..");
const DATA_DIR = resolve(ROOT_DIR, "src/data");
const PUBLIC_FOOTPRINTS_PATH = resolve(ROOT_DIR, "public/data/footprints-us.geojson");

const IM3_CENTROIDS_URL =
  "https://raw.githubusercontent.com/IMMM-SFA/datacenter-atlas/main/static/im3_datacenter_centroids.geojson";
const IM3_FOOTPRINTS_URL =
  "https://raw.githubusercontent.com/IMMM-SFA/datacenter-atlas/main/static/im3_datacenter_footprints.geojson";
const PEERINGDB_US_URL = "https://www.peeringdb.com/api/fac?country=US";
const EPA_ECHO_FULL_URL =
  "https://echodata.epa.gov/echo/echo_rest_services.get_facility_info?output=JSON&p_ncs=518210&qcolumns=1,2,3,4,5,6,7,19,20,21,23";
const EPA_ECHO_SUMMARY_URL =
  "https://echodata.epa.gov/echo/echo_rest_services.get_facility_info?output=JSON&p_ncs=518210";
const NWS_ICAO_CATALOG_URL = "https://tgftp.nws.noaa.gov/data/nsd_cccc.txt";

const JURISDICTIONS_51 = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;
const JURISDICTION_SET = new Set<string>(JURISDICTIONS_51);

const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
  INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK",
  OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY",
};

// Verified live fallback ICAO stations for all 51 jurisdictions (including DC, HI, AK).
const FALLBACK_NWS_STATIONS: Array<{ id: string; state: string; coords: [number, number] }> = [
  { id: "KBHM", state: "AL", coords: [-86.7535, 33.5629] },
  { id: "PANC", state: "AK", coords: [-149.9964, 61.1744] },
  { id: "KPHX", state: "AZ", coords: [-112.0116, 33.4343] },
  { id: "KLIT", state: "AR", coords: [-92.2243, 34.7294] },
  { id: "KSJC", state: "CA", coords: [-121.9289, 37.3626] },
  { id: "KLAX", state: "CA", coords: [-118.4085, 33.9416] },
  { id: "KDEN", state: "CO", coords: [-104.6737, 39.8561] },
  { id: "KBDL", state: "CT", coords: [-72.6832, 41.9389] },
  { id: "KILG", state: "DE", coords: [-75.6065, 39.6787] },
  { id: "KDCA", state: "DC", coords: [-77.0377, 38.8512] },
  { id: "KMIA", state: "FL", coords: [-80.287, 25.7959] },
  { id: "KATL", state: "GA", coords: [-84.4277, 33.6407] },
  { id: "PHNL", state: "HI", coords: [-157.9225, 21.3187] },
  { id: "KBOI", state: "ID", coords: [-116.2229, 43.5644] },
  { id: "KORD", state: "IL", coords: [-87.9073, 41.9742] },
  { id: "KIND", state: "IN", coords: [-86.2944, 39.7173] },
  { id: "KDSM", state: "IA", coords: [-93.6631, 41.534] },
  { id: "KICT", state: "KS", coords: [-97.4331, 37.6499] },
  { id: "KSDF", state: "KY", coords: [-85.7365, 38.1741] },
  { id: "KMSY", state: "LA", coords: [-90.258, 29.9934] },
  { id: "KPWM", state: "ME", coords: [-70.3093, 43.6462] },
  { id: "KBWI", state: "MD", coords: [-76.6683, 39.1754] },
  { id: "KBOS", state: "MA", coords: [-71.0052, 42.3656] },
  { id: "KDTW", state: "MI", coords: [-83.3554, 42.2162] },
  { id: "KMSP", state: "MN", coords: [-93.2218, 44.8848] },
  { id: "KJAN", state: "MS", coords: [-90.0759, 32.3112] },
  { id: "KMCI", state: "MO", coords: [-94.7139, 39.2976] },
  { id: "KSTL", state: "MO", coords: [-90.37, 38.7487] },
  { id: "KBIL", state: "MT", coords: [-108.5429, 45.8077] },
  { id: "KOMA", state: "NE", coords: [-95.8941, 41.3032] },
  { id: "KLAS", state: "NV", coords: [-115.1522, 36.084] },
  { id: "KRNO", state: "NV", coords: [-119.7681, 39.4991] },
  { id: "KMHT", state: "NH", coords: [-71.4357, 42.9326] },
  { id: "KEWR", state: "NJ", coords: [-74.1745, 40.6895] },
  { id: "KABQ", state: "NM", coords: [-106.6092, 35.0402] },
  { id: "KJFK", state: "NY", coords: [-73.7781, 40.6413] },
  { id: "KCLT", state: "NC", coords: [-80.9431, 35.214] },
  { id: "KFAR", state: "ND", coords: [-96.8158, 46.9207] },
  { id: "KCMH", state: "OH", coords: [-82.8919, 39.998] },
  { id: "KOKC", state: "OK", coords: [-97.6007, 35.3931] },
  { id: "KPDX", state: "OR", coords: [-122.5951, 45.5898] },
  { id: "KPHL", state: "PA", coords: [-75.2424, 39.8744] },
  { id: "KPVD", state: "RI", coords: [-71.4282, 41.724] },
  { id: "KCHS", state: "SC", coords: [-80.0405, 32.8986] },
  { id: "KFSD", state: "SD", coords: [-96.7419, 43.582] },
  { id: "KBNA", state: "TN", coords: [-86.6782, 36.1263] },
  { id: "KDFW", state: "TX", coords: [-97.0403, 32.8998] },
  { id: "KSLC", state: "UT", coords: [-111.9791, 40.7899] },
  { id: "KBTV", state: "VT", coords: [-73.1533, 44.4719] },
  { id: "KIAD", state: "VA", coords: [-77.4565, 38.9531] },
  { id: "KSEA", state: "WA", coords: [-122.3088, 47.4502] },
  { id: "KCRW", state: "WV", coords: [-81.5932, 38.3731] },
  { id: "KMKE", state: "WI", coords: [-87.8966, 42.9472] },
  { id: "KCYS", state: "WY", coords: [-104.8118, 41.1557] },
];

const FALLBACK_USGS_GAUGES: Array<{ id: string; state: string; coords: [number, number] }> = [
  { id: "02423630", state: "AL", coords: [-86.81, 33.42] },
  { id: "15276000", state: "AK", coords: [-149.76, 61.22] },
  { id: "09512165", state: "AZ", coords: [-111.95, 33.41] },
  { id: "07263450", state: "AR", coords: [-92.27, 34.76] },
  { id: "11169025", state: "CA", coords: [-121.97, 37.41] },
  { id: "06714000", state: "CO", coords: [-105.0, 39.75] },
  { id: "01196500", state: "CT", coords: [-72.83, 41.45] },
  { id: "01480015", state: "DE", coords: [-75.65, 39.69] },
  { id: "01648010", state: "DC", coords: [-77.042, 38.96] },
  { id: "02290700", state: "FL", coords: [-80.32, 25.85] },
  { id: "02336300", state: "GA", coords: [-84.45, 33.8] },
  { id: "16240500", state: "HI", coords: [-157.82, 21.33] },
  { id: "13206000", state: "ID", coords: [-116.25, 43.62] },
  { id: "05531045", state: "IL", coords: [-87.98, 41.98] },
  { id: "03353000", state: "IN", coords: [-86.18, 39.76] },
  { id: "05485500", state: "IA", coords: [-93.61, 41.58] },
  { id: "07144300", state: "KS", coords: [-97.34, 37.65] },
  { id: "03294500", state: "KY", coords: [-85.76, 38.27] },
  { id: "07374000", state: "LA", coords: [-91.19, 30.44] },
  { id: "01064118", state: "ME", coords: [-70.35, 43.68] },
  { id: "01589440", state: "MD", coords: [-76.64, 39.32] },
  { id: "01104500", state: "MA", coords: [-71.26, 42.37] },
  { id: "04166500", state: "MI", coords: [-83.27, 42.37] },
  { id: "05331000", state: "MN", coords: [-93.09, 44.94] },
  { id: "02486000", state: "MS", coords: [-90.18, 32.28] },
  { id: "06893000", state: "MO", coords: [-94.58, 39.11] },
  { id: "06214500", state: "MT", coords: [-108.47, 45.79] },
  { id: "06610000", state: "NE", coords: [-95.92, 41.26] },
  { id: "10348200", state: "NV", coords: [-119.78, 39.53] },
  { id: "01092000", state: "NH", coords: [-71.47, 42.95] },
  { id: "01391500", state: "NJ", coords: [-74.09, 40.88] },
  { id: "08330000", state: "NM", coords: [-106.68, 35.09] },
  { id: "01358000", state: "NY", coords: [-73.71, 42.75] },
  { id: "02146409", state: "NC", coords: [-80.85, 35.21] },
  { id: "05054000", state: "ND", coords: [-96.78, 46.86] },
  { id: "03228500", state: "OH", coords: [-82.88, 40.02] },
  { id: "07241550", state: "OK", coords: [-97.45, 35.47] },
  { id: "14203500", state: "OR", coords: [-122.98, 45.5] },
  { id: "01474500", state: "PA", coords: [-75.18, 39.97] },
  { id: "01116500", state: "RI", coords: [-71.49, 41.73] },
  { id: "02172040", state: "SC", coords: [-80.02, 32.91] },
  { id: "06482020", state: "SD", coords: [-96.73, 43.55] },
  { id: "03431500", state: "TN", coords: [-86.78, 36.17] },
  { id: "08057000", state: "TX", coords: [-96.81, 32.77] },
  { id: "10171000", state: "UT", coords: [-111.92, 40.75] },
  { id: "04290500", state: "VT", coords: [-73.2, 44.49] },
  { id: "01646500", state: "VA", coords: [-77.12, 38.95] },
  { id: "12113000", state: "WA", coords: [-122.24, 47.41] },
  { id: "03198000", state: "WV", coords: [-81.64, 38.35] },
  { id: "04087000", state: "WI", coords: [-87.98, 43.09] },
  { id: "06660000", state: "WY", coords: [-104.82, 41.13] },
];

const STATE_WATERSHED_STRESS: Record<string, WatershedStress> = {
  AZ: "extremely_high", NM: "extremely_high", NV: "high", CA: "high", UT: "high",
  CO: "high", TX: "medium_high", OK: "medium_high", KS: "medium_high", NE: "low_medium",
  ID: "high", WY: "medium_high", WA: "medium_high", OR: "low_medium", MT: "low_medium",
  FL: "medium_high", GA: "low_medium", SC: "low_medium", NC: "low_medium", VA: "low_medium",
  MD: "low_medium", DC: "low_medium", DE: "low_medium", NJ: "low_medium", NY: "low",
  PA: "low", OH: "low_medium", IN: "low", IL: "low", WI: "low", MI: "low", MN: "low",
  IA: "low_medium", MO: "low_medium", AR: "low_medium", LA: "low_medium", MS: "low_medium",
  AL: "low_medium", TN: "low_medium", KY: "low", WV: "low", ND: "low_medium", SD: "low_medium",
  MA: "low", CT: "low", RI: "low", NH: "low", VT: "low", ME: "low", AK: "low", HI: "low_medium",
};

const STATE_FALLBACK_ISO: Record<string, IsoRegion> = {
  AK: "WECC", HI: "WECC", WA: "WECC", OR: "WECC", ID: "WECC", MT: "WECC", WY: "WECC",
  UT: "WECC", NV: "WECC", AZ: "WECC", NM: "WECC", CO: "WECC", CA: "CAISO",
  TX: "ERCOT", OK: "SPP", KS: "SPP", NE: "SPP", SD: "SPP", ND: "MISO",
  MN: "MISO", IA: "MISO", MO: "MISO", AR: "MISO", LA: "MISO", WI: "MISO", MI: "MISO",
  IL: "PJM", IN: "PJM", OH: "PJM", KY: "PJM", WV: "PJM", VA: "PJM", MD: "PJM",
  DC: "PJM", DE: "PJM", PA: "PJM", NJ: "PJM",
  NC: "SERC", SC: "SERC", GA: "SERC", FL: "SERC", AL: "SERC", MS: "SERC", TN: "SERC",
  NY: "NYISO", CT: "ISO-NE", MA: "ISO-NE", RI: "ISO-NE", VT: "ISO-NE", NH: "ISO-NE", ME: "ISO-NE",
};

const BRAND_ALIASES: Array<[string, RegExp]> = [
  ["amazon", /\b(amazon|aws|vadata)\b/i],
  ["meta", /\b(meta|facebook)\b/i],
  ["google", /\b(google|alphabet)\b/i],
  ["microsoft", /\b(microsoft|azure|msft)\b/i],
  ["equinix", /\b(equinix|eqx)\b/i],
  ["digital realty", /\b(digital\s+realty|dlr|telx|dupont\s+fabros)\b/i],
  ["qts", /\b(qts|quality\s+technology)\b/i],
  ["coresite", /\bcoresite\b/i],
  ["cyrusone", /\bcyrusone\b/i],
  ["vantage", /\bvantage\b/i],
  ["switch", /\bswitch\b/i],
  ["edgecore", /\bedgecore\b/i],
  ["edgeconnex", /\bedgeconnex\b/i],
  ["flexential", /\b(flexential|viawest)\b/i],
  ["tierpoint", /\btierpoint\b/i],
  ["databank", /\bdatabank\b/i],
  ["stream", /\bstream\s+data/i],
  ["aligned", /\baligned\b/i],
  ["iron mountain", /\biron\s+mountain\b/i],
  ["lumen", /\b(lumen|centurylink|level\s*3|savvis)\b/i],
  ["zayo", /\bzayo\b/i],
  ["h5", /\bh5\b/i],
  ["stack", /\b(stack\s+infra|infomart)\b/i],
  ["ntt", /\b(ntt|ragingwire)\b/i],
  ["compass", /\bcompass\b/i],
  ["cologix", /\bcologix\b/i],
  ["sabey", /\bsabey\b/i],
  ["expedient", /\bexpedient\b/i],
  ["verizon", /\b(verizon|terremark)\b/i],
  ["att", /\b(at&t|att)\b/i],
  ["oracle", /\boracle\b/i],
  ["apple", /\bapple\b/i],
  ["xai", /\bxai\b/i],
  ["crusoe", /\bcrusoe\b/i],
  ["terawulf", /\bterawulf\b/i],
  ["cogent", /\bcogent\b/i],
  ["hurricane", /\bhurricane\s+electric\b/i],
  ["365", /\b365\s+data\b/i],
  ["evocative", /\bevocative\b/i],
  ["involta", /\binvolta\b/i],
  ["lightedge", /\blightedge\b/i],
  ["chirisa", /\bchirisa\b/i],
  ["centersquare", /\b(centersquare|cyxtera|sungard)\b/i],
  ["coreweave", /\bcoreweave\b/i],
  ["copt", /\bcopt\b/i],
  ["t5", /\bt5\s+data/i],
  ["applied digital", /\bapplied\s+digital\b/i],
  ["lancium", /\blancium\b/i],
  ["hut 8", /\bhut\s*8\b/i],
  ["greenidge", /\bgreenidge\b/i],
];

const q6 = (n: number): number => Math.round(n * 1e6) / 1e6;

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function extractBrand(text: string): string | null {
  for (const [brand, re] of BRAND_ALIASES) {
    if (re.test(text)) return brand;
  }
  return null;
}

function extractSiteCode(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2,4}-?\d{1,3}[A-Z]?)\b/);
  return m ? m[1].replace("-", "") : null;
}

function normStreet(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\b(suite|ste|floor|fl|bldg|building|unit|apt|#)\s*[a-z0-9-]*/g, "")
    .replace(
      /\b(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|court|ct|lane|ln|parkway|pkwy|circle|cir|way|place|pl|terrace|ter|highway|hwy|north|south|east|west|n|s|e|w)\b/g,
      "",
    )
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(
      /\b(data\s*center|datacenter|campus|facility|building|inc|llc|corp|incorporated|usa|us|technologies|technology)\b/g,
      "",
    )
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function quantizeAndCloseRing(rawRing: number[][]): [number, number][] | null {
  if (!Array.isArray(rawRing) || rawRing.length < 4) return null;
  const pts: [number, number][] = [];
  for (const pt of rawRing) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = q6(Number(pt[0]));
    const lat = q6(Number(pt[1]));
    if (!isValidUsCoord(lon, lat)) return null;
    const prev = pts[pts.length - 1];
    if (!prev || prev[0] !== lon || prev[1] !== lat) {
      pts.push([lon, lat]);
    }
  }
  if (pts.length < 3) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    pts.push([first[0], first[1]]);
  }
  if (pts.length < 4) return null;
  return pts;
}

function ringCentroid(ring: [number, number][]): [number, number] {
  const n = ring.length - 1;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return [q6(sx / n), q6(sy / n)];
}

function pointInRing(pt: [number, number], ring: number[][]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(pt: [number, number], rings: number[][][]): boolean {
  if (!rings.length || !pointInRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(pt, rings[i])) return false;
  }
  return true;
}

function pointToSegmentDistSq(p: [number, number], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return (p[0] - projX) ** 2 + (p[1] - projY) ** 2;
}

const ISO_SPECIFICITY_PRIORITY: IsoRegion[] = [
  "CAISO",
  "ERCOT",
  "NYISO",
  "ISO-NE",
  "PJM",
  "SPP",
  "MISO",
  "SERC",
  "WECC",
];

function assignIsoRegion(
  coords: [number, number],
  state: string,
  isoFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, IsoRegionProps>[],
): IsoRegion {
  if (state === "AK" || state === "HI") {
    return "WECC";
  }
  const matches: IsoRegion[] = [];
  for (const feat of isoFeatures) {
    const geom = feat.geometry;
    let inside = false;
    if (geom.type === "Polygon") {
      inside = pointInPolygonCoords(coords, geom.coordinates);
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        if (pointInPolygonCoords(coords, poly)) {
          inside = true;
          break;
        }
      }
    }
    if (inside) matches.push(feat.properties.id);
  }

  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    if (state === "CA" && matches.includes("CAISO")) return "CAISO";
    if (state === "NY" && matches.includes("NYISO")) return "NYISO";
    if (["CT", "MA", "RI", "VT", "NH", "ME"].includes(state) && matches.includes("ISO-NE")) {
      return "ISO-NE";
    }
    if (["NJ", "PA", "MD", "DC", "DE", "VA", "OH", "WV"].includes(state) && matches.includes("PJM")) {
      return "PJM";
    }
    if (state === "TX" && matches.includes("ERCOT")) return "ERCOT";
    if (state === "LA" && matches.includes("MISO")) return "MISO";
    const stateDefault = STATE_FALLBACK_ISO[state];
    if (stateDefault && matches.includes(stateDefault)) return stateDefault;
    for (const candidate of ISO_SPECIFICITY_PRIORITY) {
      if (matches.includes(candidate)) return candidate;
    }
    return matches[0];
  }

  let bestIso: IsoRegion | null = null;
  let bestDistSq = Infinity;
  for (const feat of isoFeatures) {
    const polys =
      feat.geometry.type === "Polygon" ? [feat.geometry.coordinates] : feat.geometry.coordinates;
    for (const poly of polys) {
      const ring = poly[0];
      for (let i = 0; i < ring.length - 1; i += 1) {
        const dSq = pointToSegmentDistSq(coords, ring[i], ring[i + 1]);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIso = feat.properties.id;
        }
      }
    }
  }
  // Within ~0.6 deg (~55 km) coastal/border buffer use nearest ISO polygon, else state fallback
  if (bestIso && bestDistSq <= 0.36) {
    if (state === "NY" && bestIso === "ISO-NE") return "NYISO";
    if (["CT", "MA", "RI", "ME", "NH", "VT"].includes(state)) return "ISO-NE";
    return bestIso;
  }
  return STATE_FALLBACK_ISO[state] ?? bestIso ?? "PJM";
}

function deriveMarketCluster(city: string, county: string, state: string): string {
  const c = city.toLowerCase();
  const co = county.toLowerCase();
  if (state === "VA" && (co.includes("loudoun") || co.includes("fairfax") || co.includes("prince william") || /ashburn|sterling|reston|herndon|manassas|chantilly/.test(c))) {
    return "Northern Virginia";
  }
  if (state === "CA" && /santa clara|san jose|sunnyvale|palo alto|mountain view|milpitas|fremont|campbell/.test(c)) {
    return "Silicon Valley";
  }
  if (state === "CA" && /los angeles|el segundo|vernon|burbank|torrance|compton|pasadena/.test(c)) {
    return "Los Angeles Metro";
  }
  if (state === "AZ" && (co.includes("maricopa") || /phoenix|mesa|chandler|goodyear|tempe|scottsdale|glendale/.test(c))) {
    return "Phoenix Metro";
  }
  if (state === "TX" && /dallas|fort worth|irving|richardson|plano|allen|carrollton|garland|red oak|midlothian/.test(c)) {
    return "Dallas-Fort Worth Metroplex";
  }
  if (state === "TX" && /houston|katy|cypress|sugar land|the woodlands/.test(c)) {
    return "Greater Houston";
  }
  if (state === "TX" && /austin|san antonio|round rock|pflugerville|castroville/.test(c)) {
    return "Austin / San Antonio";
  }
  if (state === "IL" && (co.includes("cook") || co.includes("dupage") || /chicago|elk grove|itasca|aurora|northlake|franklin park/.test(c))) {
    return "Chicago Metro";
  }
  if ((state === "NY" || state === "NJ") && /new york|manhattan|brooklyn|queens|staten island|newark|secaucus|weehawken|piscataway|carlstadt|jersey city|parsippany|somerset|edison|totowa|clifton/.test(c)) {
    return "NY / NJ Metro";
  }
  if (state === "OH" && (co.includes("franklin") || co.includes("licking") || /columbus|new albany|dublin|westerville|groveport|lancaster/.test(c))) {
    return "Central Ohio";
  }
  if (state === "GA" && (co.includes("fulton") || co.includes("douglas") || co.includes("cobb") || /atlanta|alpharetta|suwanee|lithia springs|marietta|newnan|palmetto/.test(c))) {
    return "Atlanta Metro";
  }
  if (state === "WA" && /seattle|tukwila|kent|lynnwood|bellevue|redmond|tacoma|bothell/.test(c)) {
    return "Seattle-Tacoma";
  }
  if (state === "OR" && (co.includes("washington") || co.includes("multnomah") || /hillsboro|portland|beaverton/.test(c))) {
    return "Portland / Hillsboro";
  }
  if (state === "MA" && /boston|cambridge|somerville|waltham|needham|bedford|marlborough|worcester/.test(c)) {
    return "Greater Boston";
  }
  if (state === "DC") return "Washington DC Metro";
  if (city && state) return `${city}, ${state}`;
  return `${state} Corridor`;
}

async function fetchWithCache(
  url: string,
  cacheName: string,
  accept = "application/json",
  timeoutMs = 20000,
): Promise<string> {
  const cachePath = resolve(CACHE_DIR, cacheName);
  if (USE_CACHE && existsSync(cachePath)) {
    return readFileSync(cachePath, "utf8");
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status === 503) {
        const retrySec = Number(res.headers.get("retry-after") ?? "0");
        const delayMs = retrySec > 0 && retrySec <= 15 ? retrySec * 1000 : 1500 * (attempt + 1);
        await res.body?.cancel();
        lastErr = new Error(`HTTP ${res.status} fetching ${url}`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }
      const text = await res.text();
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(cachePath, text);
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (existsSync(cachePath)) {
    console.warn(`WARN: Using cached ${cacheName} after upstream error:`, lastErr);
    return readFileSync(cachePath, "utf8");
  }
  throw lastErr;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function parseNsdDmsCoord(raw: string): number | null {
  // Format like "38-50-56N" or "077-02-29W" or "38-51N"
  const m = raw.trim().match(/^(\d{2,3})-(\d{2})(?:-(\d{2}))?([NSEW])$/);
  if (!m) return null;
  const deg = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  const dir = m[4];
  let dec = deg + min / 60 + sec / 3600;
  if (dir === "S" || dir === "W") dec = -dec;
  return q6(dec);
}

interface StationAnchor {
  id: string;
  state: string;
  coords: [number, number];
  priority: number; // higher = preferred standard ASOS ICAO
}

interface UsgsGaugeAnchor {
  id: string;
  state: string;
  coords: [number, number];
  name: string;
}

function inferStateFromCoords(coords: [number, number]): string {
  let bestState = "DC";
  let bestDist = Infinity;
  for (const s of FALLBACK_NWS_STATIONS) {
    const d = haversineKm(coords, s.coords);
    if (d < bestDist) {
      bestDist = d;
      bestState = s.state;
    }
  }
  return bestState;
}

interface Im3CentroidFeature {
  type: "Feature";
  properties: {
    state_abb: string;
    county: string;
    operator: string | null;
    name: string | null;
    sqft: number | null;
    type: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

interface Im3FootprintFeature {
  type: "Feature";
  properties: {
    state_abb: string;
    county: string;
    operator: string | null;
    name: string | null;
    sqft: number | null;
    type: string;
  };
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

interface SplitIm3Polygon {
  index: number;
  state: string;
  county: string;
  operator: string | null;
  name: string | null;
  sqft: number | null;
  zoneKind: "campus" | "building";
  brand: string | null;
  ring: [number, number][];
  center: [number, number];
  assignedFacilityId: string | null;
}

interface PeeringDbFacility {
  id: number;
  org_id: number;
  org_name: string;
  campus_id: number | null;
  name: string;
  clli: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  latitude: number | null;
  longitude: number | null;
  net_count: number | null;
  ix_count: number | null;
  carrier_count: number | null;
  website: string | null;
  updated: string | null;
}

interface EpaEchoFacility {
  FacName: string | null;
  FacStreet: string | null;
  FacCity: string | null;
  FacState: string | null;
  FacZip: string | null;
  RegistryID: string | null;
  FacCounty: string | null;
  FacLat: string | null;
  FacLong: string | null;
  AIRIDs: string | null;
  NPDESIDs: string | null;
  FacDerivedWBDHu8Name?: string | null;
}

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

interface WorkingCampus {
  id: string;
  priority: number; // 1=curated, 2=im3_poly, 3=peeringdb, 4=im3_point
  catalogTier: CatalogTier;
  name: string;
  rawName: string;
  normName: string;
  brand: string | null;
  siteCode: string | null;
  street: string;
  rawStreet: string;
  zipcode: string;
  website: string;
  marketCluster: string;
  city: string;
  county: string;
  state: string;
  coordinates: [number, number];
  isoRegion: IsoRegion;
  watershedStress: WatershedStress;
  watershedName: string;
  nwsStationId: string;
  usgsGaugeSiteId: string;
  grossSqFt: number | null;
  sourceTags: Set<string>;
  registryMetadata: RegistryMetadata;
  lastVerified: string;
  lastUpdated: string;
  curatedRecord?: FacilityRecord;
  im3SqFtSum: number;
  im3CampusSqFt: number;
  peeringDbUpdated?: string;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log("==> Gridline 50-State + DC US Census Ingestion");

  // 1. Load curated local inputs
  const eastLegacy = JSON.parse(
    readFileSync(resolve(DATA_DIR, "facilities-east.json"), "utf8"),
  ) as FacilityRecord[];
  const westLegacy = JSON.parse(
    readFileSync(resolve(DATA_DIR, "facilities-west.json"), "utf8"),
  ) as FacilityRecord[];
  const expansionRecords = JSON.parse(
    readFileSync(resolve(DATA_DIR, "flagship-proposals-expansion.json"), "utf8"),
  ) as FacilityRecord[];
  const legacyTracedFootprints = JSON.parse(
    readFileSync(resolve(DATA_DIR, "flagship-traced-footprints.json"), "utf8"),
  ) as GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps>;
  const isoRegions = JSON.parse(
    readFileSync(resolve(DATA_DIR, "iso-regions.geojson"), "utf8"),
  ) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, IsoRegionProps>;

  console.log(
    `Loaded curated records: ${eastLegacy.length} east + ${westLegacy.length} west + ${expansionRecords.length} expansion; ${legacyTracedFootprints.features.length} legacy traced footprints.`,
  );

  // 2. Fetch primary open datasets in parallel
  console.log("Fetching IM3 centroids/footprints, PeeringDB US, EPA ECHO 518210, and NWS ICAO catalog...");
  const [
    im3CentroidsText,
    im3FootprintsText,
    peeringDbText,
    epaFullText,
    epaSummaryText,
    nsdText,
  ] = await Promise.all([
    fetchWithCache(IM3_CENTROIDS_URL, "im3_centroids.geojson", "application/geo+json,application/json"),
    fetchWithCache(IM3_FOOTPRINTS_URL, "im3_footprints.geojson", "application/geo+json,application/json"),
    fetchWithCache(PEERINGDB_US_URL, "peeringdb_us.json", "application/json"),
    fetchWithCache(EPA_ECHO_FULL_URL, "epa_echo_full.json", "application/json"),
    fetchWithCache(EPA_ECHO_SUMMARY_URL, "epa_echo_518210.json", "application/json"),
    fetchWithCache(NWS_ICAO_CATALOG_URL, "nsd_cccc.txt", "text/plain"),
  ]);

  const im3Centroids = JSON.parse(im3CentroidsText) as { features: Im3CentroidFeature[] };
  const im3Footprints = JSON.parse(im3FootprintsText) as { features: Im3FootprintFeature[] };
  const peeringDb = JSON.parse(peeringDbText) as { data: PeeringDbFacility[] };
  const epaFull = JSON.parse(epaFullText) as { Results: { Facilities: EpaEchoFacility[] } };
  const epaSummary = JSON.parse(epaSummaryText) as { Results: { Facilities: EpaEchoFacility[] } };

  // Map watershed names from default summary response onto full ECHO rows
  const watershedByRegistry = new Map<string, string>();
  for (const row of epaSummary.Results?.Facilities ?? []) {
    if (row.RegistryID && row.FacDerivedWBDHu8Name) {
      watershedByRegistry.set(row.RegistryID.trim(), row.FacDerivedWBDHu8Name.trim());
    }
  }
  const epaFacilities = (epaFull.Results?.Facilities ?? []).map((row) => ({
    ...row,
    FacDerivedWBDHu8Name: row.RegistryID
      ? watershedByRegistry.get(row.RegistryID.trim()) ?? null
      : null,
  }));

  console.log(
    `Fetched: IM3 centroids=${im3Centroids.features.length}, IM3 footprints=${im3Footprints.features.length}, PeeringDB=${peeringDb.data.length}, EPA ECHO=${epaFacilities.length}.`,
  );

  // 3. Fetch NOAA NWS stations + USGS active continuous streamgauges across all 51 jurisdictions
  console.log("Fetching state-by-state NOAA NWS stations and USGS NWIS active streamgauges (51 jurisdictions)...");
  const stationMap = new Map<string, StationAnchor>();
  for (const fb of FALLBACK_NWS_STATIONS) {
    stationMap.set(fb.id, { ...fb, priority: 2 });
  }

  // Parse NWS nsd_cccc.txt US 4-char ICAO catalog
  for (const line of nsdText.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split(";");
    const id = (parts[0] ?? "").trim().toUpperCase();
    const state = (parts[4] ?? "").trim().toUpperCase();
    const country = (parts[5] ?? "").trim();
    if (country !== "United States" || !/^[A-Z0-9]{4}$/.test(id)) continue;
    if (!JURISDICTION_SET.has(state) && id !== "KDCA") continue;
    const lat = parseNsdDmsCoord(parts[7] ?? "");
    const lon = parseNsdDmsCoord(parts[8] ?? "");
    if (lat === null || lon === null || !isValidUsCoord(lon, lat)) continue;
    const isMajorAirport = /^[KP][A-Z]{3}$/.test(id);
    const existing = stationMap.get(id);
    if (!existing) {
      stationMap.set(id, {
        id,
        state: id === "KDCA" ? "DC" : state,
        coords: [lon, lat],
        priority: isMajorAirport ? 2 : 1,
      });
    }
  }

  // Also query api.weather.gov/stations?state=${ST}&limit=100 for all 51 jurisdictions
  await mapPool([...JURISDICTIONS_51], 8, async (st) => {
    try {
      const txt = await fetchWithCache(
        `https://api.weather.gov/stations?state=${st}&limit=100`,
        `nws_state_${st}.json`,
        "application/geo+json",
        12000,
      );
      const parsed = JSON.parse(txt) as {
        features?: Array<{
          properties?: { stationIdentifier?: string };
          geometry?: { coordinates?: [number, number] };
        }>;
      };
      for (const feat of parsed.features ?? []) {
        const sid = (feat.properties?.stationIdentifier ?? "").trim().toUpperCase();
        const coords = feat.geometry?.coordinates;
        if (!/^[A-Z0-9]{4}$/.test(sid) || !Array.isArray(coords) || coords.length < 2) continue;
        const lon = q6(coords[0]);
        const lat = q6(coords[1]);
        if (!isValidUsCoord(lon, lat)) continue;
        if (!stationMap.has(sid)) {
          stationMap.set(sid, {
            id: sid,
            state: st,
            coords: [lon, lat],
            priority: /^[KP][A-Z]{3}$/.test(sid) ? 2 : 1,
          });
        }
      }
    } catch (err) {
      console.warn(`WARN: NOAA stations API empty/failed for ${st}, using catalog/fallback:`, err);
    }
  });

  // Fetch USGS active continuous 00060 streamgauges per jurisdiction
  const gaugeMap = new Map<string, UsgsGaugeAnchor>();
  for (const fb of FALLBACK_USGS_GAUGES) {
    gaugeMap.set(fb.id, { ...fb, name: `USGS-${fb.id}` });
  }
  await mapPool([...JURISDICTIONS_51], 8, async (st) => {
    try {
      const url = `https://waterservices.usgs.gov/nwis/site/?format=rdb&stateCd=${st}&parameterCd=00060&siteType=ST&siteStatus=active&hasDataTypeCd=iv`;
      const txt = await fetchWithCache(url, `usgs_state_${st}.rdb`, "text/plain", 15000);
      for (const line of txt.split(/\r?\n/)) {
        if (!line || line.startsWith("#") || line.startsWith("agency_cd") || line.startsWith("5s")) {
          continue;
        }
        const cols = line.split("\t");
        const siteNo = (cols[1] ?? "").trim();
        const name = (cols[2] ?? "").trim();
        const lat = Number(cols[4]);
        const lon = Number(cols[5]);
        if (!/^\d{8}$/.test(siteNo) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const qlon = q6(lon);
        const qlat = q6(lat);
        if (!isValidUsCoord(qlon, qlat)) continue;
        // Guard against transboundary sites outside Alaska when querying AK
        if (st === "AK" && qlon > -128) continue;
        gaugeMap.set(siteNo, { id: siteNo, state: st, coords: [qlon, qlat], name });
      }
    } catch (err) {
      console.warn(`WARN: USGS NWIS failed for ${st}, using fallback gauge:`, err);
    }
  });

  const allStations = Array.from(stationMap.values());
  const allGauges = Array.from(gaugeMap.values());
  console.log(`Catalog ready: ${allStations.length} NWS 4-char ICAO stations, ${allGauges.length} USGS 8-digit streamgauges.`);

  function findNearestStation(coords: [number, number], exclude?: Set<string>): StationAnchor {
    let best: StationAnchor | null = null;
    let bestScore = Infinity;
    for (const s of allStations) {
      if (exclude?.has(s.id)) continue;
      const d = haversineKm(coords, s.coords);
      // Prefer standard K*/P* ASOS airports slightly over obscure military/mesonet 4-char IDs
      const penalty = s.priority === 2 ? 0 : 12;
      const score = d + penalty;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best ?? FALLBACK_NWS_STATIONS[0] as StationAnchor;
  }

  function findNearestGauge(coords: [number, number]): UsgsGaugeAnchor {
    let best: UsgsGaugeAnchor | null = null;
    let bestDist = Infinity;
    for (const g of allGauges) {
      const d = haversineKm(coords, g.coords);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    return best ?? { ...FALLBACK_USGS_GAUGES[0], name: "USGS Fallback" };
  }

  // 4. Split IM3 footprints (excluding non-51 territories like PR)
  const splitIm3Polys: SplitIm3Polygon[] = [];
  for (const feat of im3Footprints.features) {
    const geom = feat.geometry;
    if (!geom || geom.type === "Point") continue;
    const state = (feat.properties?.state_abb ?? "").trim().toUpperCase();
    if (!JURISDICTION_SET.has(state)) continue;

    const polyCoordArrays =
      geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    for (const poly of polyCoordArrays) {
      if (!poly || !poly[0]) continue;
      const ring = quantizeAndCloseRing(poly[0]);
      if (!ring) continue;
      const label = `${feat.properties?.name ?? ""} ${feat.properties?.operator ?? ""}`.trim();
      splitIm3Polys.push({
        index: splitIm3Polys.length,
        state,
        county: (feat.properties?.county ?? "").trim() || `${state} County`,
        operator: feat.properties?.operator?.trim() || null,
        name: feat.properties?.name?.trim() || null,
        sqft:
          typeof feat.properties?.sqft === "number" && Number.isFinite(feat.properties.sqft)
            ? Math.round(feat.properties.sqft)
            : null,
        zoneKind: feat.properties?.type === "campus" ? "campus" : "building",
        brand: extractBrand(label),
        ring,
        center: ringCentroid(ring),
        assignedFacilityId: null,
      });
    }
  }
  console.log(`Normalized ${splitIm3Polys.length} real closed IM3 polygons (quantized 6 decimals).`);

  // 5. Seed Priority 1: Curated Flagship + Expansion Records
  const campuses: WorkingCampus[] = [];
  const campusById = new Map<string, WorkingCampus>();
  const curatedAll: Array<{ rec: FacilityRecord; isLegacy: boolean }> = [
    ...eastLegacy.map((rec) => ({ rec, isLegacy: true })),
    ...westLegacy.map((rec) => ({ rec, isLegacy: true })),
    ...expansionRecords.map((rec) => ({ rec, isLegacy: false })),
  ];

  for (const { rec, isLegacy } of curatedAll) {
    const coords: [number, number] = [q6(rec.coordinates[0]), q6(rec.coordinates[1])];
    const isoRegion = isLegacy
      ? rec.isoRegion
      : assignIsoRegion(coords, rec.state, isoRegions.features);
    const nwsStationId = isLegacy
      ? rec.waterAndCooling.nwsStationId
      : findNearestStation(coords).id;
    const usgsGaugeSiteId = isLegacy
      ? rec.waterAndCooling.usgsGaugeSiteId
      : findNearestGauge(coords).id;
    const tier: CatalogTier = rec.catalogTier ?? "flagship";
    const lastUpdated = rec.lastUpdated ?? rec.lastVerified ?? "2026-11-16";

    const cloned: FacilityRecord = {
      ...rec,
      coordinates: coords,
      isoRegion,
      catalogTier: tier,
      waterAndCooling: {
        ...rec.waterAndCooling,
        nwsStationId,
        usgsGaugeSiteId,
      },
      lastUpdated,
      sources: [...rec.sources],
      registryMetadata: {
        ...(rec.registryMetadata ?? {}),
        sourceTags: Array.from(new Set([...(rec.registryMetadata?.sourceTags ?? []), "curated"])),
      },
    };

    const brand = extractBrand(
      `${cloned.name} ${cloned.stakeholders.operator} ${cloned.stakeholders.developer}`,
    );
    const wc: WorkingCampus = {
      id: cloned.id,
      priority: 1,
      catalogTier: tier,
      name: cloned.name,
      rawName: cloned.name,
      normName: normName(cloned.name),
      brand,
      siteCode: extractSiteCode(cloned.name),
      street: normStreet(cloned.parcel.parcelNote),
      rawStreet: "",
      zipcode: "",
      website: "",
      marketCluster: cloned.marketCluster,
      city: cloned.city,
      county: cloned.county,
      state: cloned.state,
      coordinates: coords,
      isoRegion: cloned.isoRegion,
      watershedStress: cloned.waterAndCooling.watershedStress,
      watershedName: cloned.waterAndCooling.watershedName,
      nwsStationId,
      usgsGaugeSiteId,
      grossSqFt: cloned.parcel.grossSqFt.value,
      sourceTags: new Set(["curated"]),
      registryMetadata: cloned.registryMetadata!,
      lastVerified: cloned.lastVerified,
      lastUpdated,
      curatedRecord: cloned,
      im3SqFtSum: 0,
      im3CampusSqFt: 0,
    };
    campuses.push(wc);
    campusById.set(wc.id, wc);
  }

  // Attach preserved legacy >5-vertex traced polygons
  const finalFootprints: GeoJSON.Feature<GeoJSON.Polygon, CampusFootprintProps>[] = [];
  for (const feat of legacyTracedFootprints.features) {
    const c = campusById.get(feat.properties.facilityId);
    if (!c) continue;
    const ring = quantizeAndCloseRing(feat.geometry.coordinates[0]);
    if (!ring) continue;
    finalFootprints.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        ...feat.properties,
        sqft: feat.properties.sqft ?? c.grossSqFt ?? null,
      },
    });
  }

  // Match IM3 polygons onto Curated campuses when within 1.2 km (or 3.5 km for massive campuses) with brand match
  let im3PolysMatchedToCurated = 0;
  for (const poly of splitIm3Polys) {
    let bestCurated: WorkingCampus | null = null;
    let bestDist = Infinity;
    for (const c of campuses) {
      const d = haversineKm(poly.center, c.coordinates);
      const maxD =
        c.id === "meta-richland-parish-hyperion" || (poly.brand && c.brand === poly.brand && poly.zoneKind === "campus")
          ? 3.5
          : 1.2;
      if (d > maxD) continue;
      const brandMatch = Boolean(poly.brand && c.brand && poly.brand === c.brand);
      const unnamedMatch = !poly.name && !poly.operator && d <= 0.35;
      if ((brandMatch || unnamedMatch) && d < bestDist) {
        bestDist = d;
        bestCurated = c;
      }
    }
    if (bestCurated) {
      poly.assignedFacilityId = bestCurated.id;
      bestCurated.sourceTags.add("im3");
      if (poly.sqft) {
        if (poly.zoneKind === "campus") {
          bestCurated.im3CampusSqFt = Math.max(bestCurated.im3CampusSqFt, poly.sqft);
        } else {
          bestCurated.im3SqFtSum += poly.sqft;
        }
      }
      im3PolysMatchedToCurated += 1;
    }
  }
  console.log(`Attached ${im3PolysMatchedToCurated} IM3 polygons directly onto curated flagships.`);

  // Helper for <= 750 m deduplication across IM3 & PeeringDB
  function shouldMergeCandidate(
    existing: WorkingCampus,
    cand: {
      rawName: string;
      normName: string;
      brand: string | null;
      siteCode: string | null;
      street: string;
      coords: [number, number];
    },
  ): boolean {
    const distKm = haversineKm(cand.coords, existing.coordinates);
    if (distKm > 0.75) return false;
    // Different explicit street numbers do not merge unless existing is a multi-building flagship campus
    if (
      existing.priority > 1 &&
      existing.street &&
      cand.street &&
      existing.street !== cand.street
    ) {
      return false;
    }
    if (existing.street && cand.street && existing.street === cand.street) {
      return true;
    }
    if (existing.priority === 1 && existing.brand && cand.brand && existing.brand === cand.brand) {
      return true;
    }
    if ((!existing.rawName || !cand.rawName) && distKm <= 0.15) {
      return true;
    }
    if (existing.brand && cand.brand && existing.brand === cand.brand) {
      if (existing.siteCode && cand.siteCode) {
        return existing.siteCode === cand.siteCode;
      }
      if (existing.normName && cand.normName && existing.normName === cand.normName) {
        return true;
      }
      if (distKm <= 0.25 && (!existing.siteCode || !cand.siteCode)) {
        return true;
      }
    }
    if (
      distKm <= 0.3 &&
      existing.normName &&
      cand.normName &&
      (existing.normName === cand.normName ||
        existing.normName.includes(cand.normName) ||
        cand.normName.includes(existing.normName))
    ) {
      return true;
    }
    return false;
  }

  // Track unique IDs cleanly
  const usedIds = new Set<string>(campuses.map((c) => c.id));
  function allocateUniqueId(base: string): string {
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    let idx = 2;
    while (usedIds.has(`${base}-${idx}`)) idx += 1;
    const next = `${base}-${idx}`;
    usedIds.add(next);
    return next;
  }

  // 6. Priority 2: IM3 Polygon-backed centroids
  const im3PolyCentroids = im3Centroids.features.filter(
    (f) => JURISDICTION_SET.has((f.properties.state_abb ?? "").trim().toUpperCase()) && f.properties.type !== "point",
  );
  // Process campus-type centroids before building-type centroids so campus names take precedence
  im3PolyCentroids.sort((a, b) => {
    const aCampus = a.properties.type === "campus" ? 0 : 1;
    const bCampus = b.properties.type === "campus" ? 0 : 1;
    if (aCampus !== bCampus) return aCampus - bCampus;
    return (b.properties.sqft ?? 0) - (a.properties.sqft ?? 0);
  });

  const im3CentroidToCampusId: Array<{ coords: [number, number]; brand: string | null; facilityId: string }> = [];
  for (const feat of im3PolyCentroids) {
    const state = feat.properties.state_abb.trim().toUpperCase();
    const coords: [number, number] = [q6(feat.geometry.coordinates[0]), q6(feat.geometry.coordinates[1])];
    if (!isValidUsCoord(coords[0], coords[1])) continue;
    const county = feat.properties.county?.trim() || `${state} County`;
    const op = feat.properties.operator?.trim() || null;
    const nm = feat.properties.name?.trim() || null;
    const displayName = nm ?? (op ? `${op} Facility — ${county.replace(/ County$/i, "")}, ${state}` : `Data Center Facility — ${county}, ${state}`);
    const label = `${nm ?? ""} ${op ?? ""}`.trim();
    const brand = extractBrand(label);
    const cand = {
      rawName: nm ?? "",
      normName: normName(nm ?? ""),
      brand,
      siteCode: extractSiteCode(nm ?? ""),
      street: "",
      coords,
    };

    let target: WorkingCampus | null = null;
    for (const c of campuses) {
      if (shouldMergeCandidate(c, cand)) {
        target = c;
        break;
      }
    }

    if (target) {
      target.sourceTags.add("im3");
      if (feat.properties.sqft) {
        if (feat.properties.type === "campus") {
          target.im3CampusSqFt = Math.max(target.im3CampusSqFt, Math.round(feat.properties.sqft));
        } else {
          target.im3SqFtSum += Math.round(feat.properties.sqft);
        }
      }
      im3CentroidToCampusId.push({ coords, brand, facilityId: target.id });
    } else {
      const city = county.replace(/\s+(County|Parish|Borough)$/i, "").trim() || state;
      const idBase = `im3-${state.toLowerCase()}-${slugify(nm || op || county)}`;
      const id = allocateUniqueId(idBase);
      const sqft =
        typeof feat.properties.sqft === "number" && Number.isFinite(feat.properties.sqft)
          ? Math.round(feat.properties.sqft)
          : null;
      const wc: WorkingCampus = {
        id,
        priority: 2,
        catalogTier: "registry",
        name: displayName,
        rawName: nm ?? "",
        normName: normName(nm ?? ""),
        brand,
        siteCode: extractSiteCode(nm ?? ""),
        street: "",
        rawStreet: "",
        zipcode: "",
        website: "",
        marketCluster: deriveMarketCluster(city, county, state),
        city,
        county,
        state,
        coordinates: coords,
        isoRegion: assignIsoRegion(coords, state, isoRegions.features),
        watershedStress: STATE_WATERSHED_STRESS[state] ?? "low_medium",
        watershedName: `${county} Basin`,
        nwsStationId: findNearestStation(coords).id,
        usgsGaugeSiteId: findNearestGauge(coords).id,
        grossSqFt: sqft,
        sourceTags: new Set(["im3"]),
        registryMetadata: {
          im3SqFt: sqft,
          mappedPolygonCount: 0,
          sourceTags: ["im3"],
        },
        lastVerified: "2026-11-16",
        lastUpdated: "2026-11-01",
        im3SqFtSum: feat.properties.type !== "campus" && sqft ? sqft : 0,
        im3CampusSqFt: feat.properties.type === "campus" && sqft ? sqft : 0,
      };
      campuses.push(wc);
      campusById.set(id, wc);
      im3CentroidToCampusId.push({ coords, brand, facilityId: id });
    }
  }

  // Attach remaining IM3 polygons to their matching IM3 campus (or create one if unlinked)
  let unlinkedPolys = 0;
  for (const poly of splitIm3Polys) {
    if (poly.assignedFacilityId) continue;
    let bestId: string | null = null;
    let bestScore = Infinity;
    for (const c of im3CentroidToCampusId) {
      const d = haversineKm(poly.center, c.coords);
      if (d <= 1.2 || (poly.brand && c.brand === poly.brand && d <= 2.5)) {
        const penalty = poly.brand && c.brand && poly.brand !== c.brand ? 1.0 : 0;
        const score = d + penalty;
        if (score < bestScore) {
          bestScore = score;
          bestId = c.facilityId;
        }
      }
    }
    if (!bestId) {
      // Fallback: find nearest IM3 campus in same state within 2.5 km or create campus from polygon
      let nearCampus: WorkingCampus | null = null;
      let nearD = Infinity;
      for (const c of campuses) {
        if (c.state !== poly.state) continue;
        const d = haversineKm(poly.center, c.coordinates);
        if (d <= 0.75 && d < nearD) {
          nearD = d;
          nearCampus = c;
        }
      }
      if (nearCampus) {
        bestId = nearCampus.id;
      } else {
        unlinkedPolys += 1;
        const city = poly.county.replace(/\s+(County|Parish|Borough)$/i, "").trim() || poly.state;
        const displayName =
          poly.name ??
          (poly.operator
            ? `${poly.operator} Facility — ${city}, ${poly.state}`
            : `Data Center Facility — ${poly.county}, ${poly.state}`);
        const id = allocateUniqueId(`im3-${poly.state.toLowerCase()}-${slugify(poly.name || poly.operator || poly.county)}`);
        const wc: WorkingCampus = {
          id,
          priority: 2,
          catalogTier: "registry",
          name: displayName,
          rawName: poly.name ?? "",
          normName: normName(poly.name ?? ""),
          brand: poly.brand,
          siteCode: extractSiteCode(poly.name ?? ""),
          street: "",
          rawStreet: "",
          zipcode: "",
          website: "",
          marketCluster: deriveMarketCluster(city, poly.county, poly.state),
          city,
          county: poly.county,
          state: poly.state,
          coordinates: poly.center,
          isoRegion: assignIsoRegion(poly.center, poly.state, isoRegions.features),
          watershedStress: STATE_WATERSHED_STRESS[poly.state] ?? "low_medium",
          watershedName: `${poly.county} Basin`,
          nwsStationId: findNearestStation(poly.center).id,
          usgsGaugeSiteId: findNearestGauge(poly.center).id,
          grossSqFt: poly.sqft,
          sourceTags: new Set(["im3"]),
          registryMetadata: {
            im3SqFt: poly.sqft,
            mappedPolygonCount: 0,
            sourceTags: ["im3"],
          },
          lastVerified: "2026-11-16",
          lastUpdated: "2026-11-01",
          im3SqFtSum: poly.zoneKind !== "campus" && poly.sqft ? poly.sqft : 0,
          im3CampusSqFt: poly.zoneKind === "campus" && poly.sqft ? poly.sqft : 0,
        };
        campuses.push(wc);
        campusById.set(id, wc);
        bestId = id;
      }
    }
    poly.assignedFacilityId = bestId;
    const owner = campusById.get(bestId)!;
    owner.sourceTags.add("im3");
    if (poly.sqft) {
      if (poly.zoneKind === "campus") owner.im3CampusSqFt = Math.max(owner.im3CampusSqFt, poly.sqft);
      else owner.im3SqFtSum += poly.sqft;
    }
  }
  console.log(`All ${splitIm3Polys.length} IM3 polygons linked (${unlinkedPolys} promoted directly).`);

  // 7. Priority 3: Merge PeeringDB US Facilities
  const sortedPdb = [...peeringDb.data].sort((a, b) => (b.net_count ?? 0) - (a.net_count ?? 0));
  let pdbMergedCount = 0;
  let pdbNewCount = 0;

  for (const fac of sortedPdb) {
    if (typeof fac.latitude !== "number" || typeof fac.longitude !== "number") continue;
    const coords: [number, number] = [q6(fac.longitude), q6(fac.latitude)];
    if (!isValidUsCoord(coords[0], coords[1])) continue;

    let state = (fac.state ?? "").trim().toUpperCase();
    if (STATE_NAME_TO_CODE[state]) state = STATE_NAME_TO_CODE[state];
    if (state === "PR" || state === "VI" || state === "GU" || state === "AS" || state === "MP") continue;
    if (!JURISDICTION_SET.has(state)) {
      state = inferStateFromCoords(coords);
    }

    const city = (fac.city ?? "").trim() || state;
    const rawName = (fac.name ?? "").trim();
    const orgName = (fac.org_name ?? "").trim() || rawName;
    const label = `${rawName} ${orgName}`.trim();
    const brand = extractBrand(label);
    const street = normStreet(fac.address1);
    const cand = {
      rawName,
      normName: normName(rawName),
      brand,
      siteCode: extractSiteCode(rawName),
      street,
      coords,
    };

    let target: WorkingCampus | null = null;
    for (const c of campuses) {
      if (shouldMergeCandidate(c, cand)) {
        target = c;
        break;
      }
    }

    const updatedIso = fac.updated ? fac.updated.slice(0, 10) : "2026-11-01";
    if (target) {
      pdbMergedCount += 1;
      target.sourceTags.add("peeringdb");
      if (!target.rawStreet && fac.address1) {
        target.rawStreet = fac.address1.trim();
        target.street = street;
      }
      if (!target.zipcode && fac.zipcode) target.zipcode = fac.zipcode.trim();
      if (!target.website && fac.website && isSafeHttpUrl(fac.website.trim())) {
        target.website = fac.website.trim();
      }
      const prevNet = target.registryMetadata.netCount ?? -1;
      if ((fac.net_count ?? 0) > prevNet || !target.registryMetadata.peeringDbFacId) {
        target.registryMetadata.peeringDbFacId = fac.id;
        target.registryMetadata.peeringDbCampusId = fac.campus_id ?? null;
        target.registryMetadata.netCount = fac.net_count ?? 0;
        target.registryMetadata.ixCount = fac.ix_count ?? 0;
        target.registryMetadata.carrierCount = fac.carrier_count ?? 0;
        target.registryMetadata.clli = fac.clli?.trim() || null;
      }
      if (!target.peeringDbUpdated || updatedIso > target.peeringDbUpdated) {
        target.peeringDbUpdated = updatedIso;
      }
      if (updatedIso > target.lastUpdated && target.priority > 1) {
        target.lastUpdated = updatedIso;
      }
    } else {
      pdbNewCount += 1;
      const id = allocateUniqueId(`peeringdb-${fac.id}-${slugify(rawName || city)}`);
      const county = `${city} County`;
      const wc: WorkingCampus = {
        id,
        priority: 3,
        catalogTier: "registry",
        name: rawName || `${orgName} — ${city}, ${state}`,
        rawName,
        normName: normName(rawName),
        brand,
        siteCode: extractSiteCode(rawName),
        street,
        rawStreet: fac.address1?.trim() ?? "",
        zipcode: fac.zipcode?.trim() ?? "",
        website: fac.website && isSafeHttpUrl(fac.website.trim()) ? fac.website.trim() : "",
        marketCluster: deriveMarketCluster(city, county, state),
        city,
        county,
        state,
        coordinates: coords,
        isoRegion: assignIsoRegion(coords, state, isoRegions.features),
        watershedStress: STATE_WATERSHED_STRESS[state] ?? "low_medium",
        watershedName: `${city} Metro Basin`,
        nwsStationId: findNearestStation(coords).id,
        usgsGaugeSiteId: findNearestGauge(coords).id,
        grossSqFt: null,
        sourceTags: new Set(["peeringdb"]),
        registryMetadata: {
          peeringDbFacId: fac.id,
          peeringDbCampusId: fac.campus_id ?? null,
          netCount: fac.net_count ?? 0,
          ixCount: fac.ix_count ?? 0,
          carrierCount: fac.carrier_count ?? 0,
          clli: fac.clli?.trim() || null,
          mappedPolygonCount: 0,
          sourceTags: ["peeringdb"],
        },
        lastVerified: "2026-11-16",
        lastUpdated: updatedIso,
        im3SqFtSum: 0,
        im3CampusSqFt: 0,
        peeringDbUpdated: updatedIso,
      };
      // Store operator on working campus via custom field in registryDetails later
      (wc as WorkingCampus & { operatorLabel?: string }).operatorLabel = orgName;
      campuses.push(wc);
      campusById.set(id, wc);
    }
  }
  console.log(`PeeringDB US: ${pdbMergedCount} merged onto campuses, ${pdbNewCount} new colocation sites.`);

  // 8. Priority 4: IM3 point-only centroids
  const im3PointCentroids = im3Centroids.features.filter(
    (f) => JURISDICTION_SET.has((f.properties.state_abb ?? "").trim().toUpperCase()) && f.properties.type === "point",
  );
  let ptMergedCount = 0;
  let ptNewCount = 0;
  for (const feat of im3PointCentroids) {
    const state = feat.properties.state_abb.trim().toUpperCase();
    const coords: [number, number] = [q6(feat.geometry.coordinates[0]), q6(feat.geometry.coordinates[1])];
    if (!isValidUsCoord(coords[0], coords[1])) continue;
    const county = feat.properties.county?.trim() || `${state} County`;
    const op = feat.properties.operator?.trim() || null;
    const nm = feat.properties.name?.trim() || null;
    const displayName = nm ?? (op ? `${op} Facility — ${county.replace(/ County$/i, "")}, ${state}` : `Data Center Facility — ${county}, ${state}`);
    const brand = extractBrand(`${nm ?? ""} ${op ?? ""}`);
    const cand = {
      rawName: nm ?? "",
      normName: normName(nm ?? ""),
      brand,
      siteCode: extractSiteCode(nm ?? ""),
      street: "",
      coords,
    };

    let target: WorkingCampus | null = null;
    for (const c of campuses) {
      if (shouldMergeCandidate(c, cand)) {
        target = c;
        break;
      }
    }
    if (target) {
      ptMergedCount += 1;
      target.sourceTags.add("im3");
    } else {
      ptNewCount += 1;
      const city = county.replace(/\s+(County|Parish|Borough)$/i, "").trim() || state;
      const id = allocateUniqueId(`im3pt-${state.toLowerCase()}-${slugify(nm || op || county)}`);
      const wc: WorkingCampus = {
        id,
        priority: 4,
        catalogTier: "registry",
        name: displayName,
        rawName: nm ?? "",
        normName: normName(nm ?? ""),
        brand,
        siteCode: extractSiteCode(nm ?? ""),
        street: "",
        rawStreet: "",
        zipcode: "",
        website: "",
        marketCluster: deriveMarketCluster(city, county, state),
        city,
        county,
        state,
        coordinates: coords,
        isoRegion: assignIsoRegion(coords, state, isoRegions.features),
        watershedStress: STATE_WATERSHED_STRESS[state] ?? "low_medium",
        watershedName: `${county} Basin`,
        nwsStationId: findNearestStation(coords).id,
        usgsGaugeSiteId: findNearestGauge(coords).id,
        grossSqFt: null,
        sourceTags: new Set(["im3"]),
        registryMetadata: {
          mappedPolygonCount: 0,
          sourceTags: ["im3"],
        },
        lastVerified: "2026-11-16",
        lastUpdated: "2026-11-01",
        im3SqFtSum: 0,
        im3CampusSqFt: 0,
      };
      (wc as WorkingCampus & { operatorLabel?: string }).operatorLabel = op ?? "Undisclosed Registry Operator";
      campuses.push(wc);
      campusById.set(id, wc);
    }
  }
  console.log(`IM3 points: ${ptMergedCount} merged, ${ptNewCount} new point_only sites.`);

  // 9. Match EPA ECHO NAICS 518210 records onto campuses
  let epaMatchedCount = 0;
  for (const epa of epaFacilities) {
    const regId = epa.RegistryID?.trim();
    const state = (epa.FacState ?? "").trim().toUpperCase();
    const lat = Number(epa.FacLat);
    const lon = Number(epa.FacLong);
    if (!regId || !JURISDICTION_SET.has(state) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const epaCoords: [number, number] = [q6(lon), q6(lat)];
    if (!isValidUsCoord(epaCoords[0], epaCoords[1])) continue;

    const epaBrand = extractBrand(epa.FacName ?? "");
    const epaStreet = normStreet(epa.FacStreet);
    const epaCity = (epa.FacCity ?? "").trim().toLowerCase();
    const epaNormName = normName(epa.FacName);

    let best: WorkingCampus | null = null;
    let bestScore = Infinity;
    for (const c of campuses) {
      if (c.state !== state) continue;
      const d = haversineKm(epaCoords, c.coordinates);
      if (d > 2.5) continue;
      const streetMatch = Boolean(
        epaStreet && c.street && (epaStreet === c.street || (epaStreet.split(" ")[0] === c.street.split(" ")[0] && epaStreet.includes(c.street.split(" ")[1] ?? "___"))),
      );
      const brandMatch = Boolean(epaBrand && c.brand && epaBrand === c.brand);
      const cityNameMatch =
        epaCity && c.city.toLowerCase() === epaCity && epaNormName && c.normName && (c.normName.includes(epaNormName) || epaNormName.includes(c.normName));
      const tightSpatialMatch = d <= 0.2;

      if (streetMatch || (brandMatch && d <= 1.2) || cityNameMatch || tightSpatialMatch) {
        const score = d - (streetMatch ? 0.5 : 0) - (brandMatch ? 0.3 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }

    if (best) {
      epaMatchedCount += 1;
      best.sourceTags.add("epa_echo");
      if (!best.registryMetadata.epaRegistryId) {
        best.registryMetadata.epaRegistryId = regId;
        best.registryMetadata.airIds = epa.AIRIDs?.trim() || null;
        best.registryMetadata.npdesIds = epa.NPDESIDs?.trim() || null;
      } else {
        // Combine additional air/NPDES permits if multi-permit campus
        if (epa.AIRIDs?.trim() && !best.registryMetadata.airIds?.includes(epa.AIRIDs.trim())) {
          best.registryMetadata.airIds = best.registryMetadata.airIds
            ? `${best.registryMetadata.airIds},${epa.AIRIDs.trim()}`
            : epa.AIRIDs.trim();
        }
        if (epa.NPDESIDs?.trim() && !best.registryMetadata.npdesIds?.includes(epa.NPDESIDs.trim())) {
          best.registryMetadata.npdesIds = best.registryMetadata.npdesIds
            ? `${best.registryMetadata.npdesIds},${epa.NPDESIDs.trim()}`
            : epa.NPDESIDs.trim();
        }
      }
      if (!best.rawStreet && epa.FacStreet?.trim()) {
        best.rawStreet = epa.FacStreet.trim();
        best.street = epaStreet;
      }
      if (!best.zipcode && epa.FacZip?.trim()) {
        best.zipcode = epa.FacZip.trim();
      }
      if (epa.FacDerivedWBDHu8Name?.trim() && best.priority > 1) {
        best.watershedName = epa.FacDerivedWBDHu8Name.trim();
      }
      if (epa.FacCounty?.trim() && best.priority === 3) {
        const cleanCounty = epa.FacCounty.trim().replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
        best.county = cleanCounty;
      }
    }
  }
  console.log(`EPA ECHO NAICS 518210 matched onto ${epaMatchedCount} campus linkages.`);

  // 10. Emit all split IM3 polygons into finalFootprints and count per facility
  for (const poly of splitIm3Polys) {
    if (!poly.assignedFacilityId) continue;
    const owner = campusById.get(poly.assignedFacilityId);
    if (!owner) continue;
    finalFootprints.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [poly.ring] },
      properties: {
        facilityId: owner.id,
        zoneKind: poly.zoneKind,
        label: poly.name || owner.name,
        sqft: poly.sqft,
        status: owner.curatedRecord?.lifecycleStatus ?? "operational",
      },
    });
  }

  const polyCountById = new Map<string, number>();
  for (const feat of finalFootprints) {
    const fid = feat.properties.facilityId;
    polyCountById.set(fid, (polyCountById.get(fid) ?? 0) + 1);
  }

  // 11. Verify assigned NWS stations are genuinely live on api.weather.gov (auto-repair any 404/null station)
  const legacyIds = new Set([...eastLegacy, ...westLegacy].map((f) => f.id));
  const brokenStations = new Set<string>();
  const stationCachePath = resolve(CACHE_DIR, "verified_nws_stations.json");
  let verifiedStationStatuses: Record<string, boolean> = {};
  if (existsSync(stationCachePath)) {
    verifiedStationStatuses = JSON.parse(readFileSync(stationCachePath, "utf8")) as Record<string, boolean>;
  }

  const initialStations = new Map(campuses.map((c) => [c.id, c.nwsStationId]));
  const lockedStations = new Set<string>();
  for (let round = 0; round < 6; round += 1) {
    const uniqueCandidateStations = Array.from(new Set(campuses.map((c) => c.nwsStationId)));
    const toCheck = uniqueCandidateStations.filter((id) => verifiedStationStatuses[id] === undefined);
    if (round === 0) {
      console.log(`Verifying ${uniqueCandidateStations.length} unique assigned NOAA NWS stations live (${toCheck.length} uncached)...`);
    }
    if (toCheck.length > 0) {
      await mapPool(toCheck, 16, async (stationId) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          try {
            const res = await fetch(`https://api.weather.gov/stations/${stationId}/observations/latest`, {
              headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
              signal: controller.signal,
            });
            if (!res.ok) {
              verifiedStationStatuses[stationId] = false;
              return;
            }
            const data = (await res.json()) as {
              properties?: {
                temperature?: { value?: number | null };
                relativeHumidity?: { value?: number | null };
              };
            };
            const ok =
              typeof data?.properties?.temperature?.value === "number" &&
              typeof data?.properties?.relativeHumidity?.value === "number";
            verifiedStationStatuses[stationId] = ok;
          } finally {
            clearTimeout(timer);
          }
        } catch {
          verifiedStationStatuses[stationId] = false;
        }
      });
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(stationCachePath, JSON.stringify(verifiedStationStatuses));
    }

    let repaired = 0;
    for (const [sid, ok] of Object.entries(verifiedStationStatuses)) {
      if (!ok) brokenStations.add(sid);
    }
    for (const c of campuses) {
      if (lockedStations.has(c.id)) continue;
      if (brokenStations.has(c.nwsStationId) && !legacyIds.has(c.id)) {
        const nextBest = findNearestStation(c.coordinates, brokenStations);
        if (nextBest.id !== c.nwsStationId && haversineKm(c.coordinates, nextBest.coords) <= 300) {
          c.nwsStationId = nextBest.id;
          repaired += 1;
        } else {
          c.nwsStationId = initialStations.get(c.id) ?? c.nwsStationId;
          lockedStations.add(c.id);
        }
      }
    }
    if (repaired === 0) break;
    console.log(`Round ${round + 1}: re-routed ${repaired} campuses off non-live NWS stations.`);
  }

  // 12. Build final FacilityIndexItem[], flagship-dossiers.json, registry-details.json, and fleet-summary.json
  const indexItems: FacilityIndexItem[] = [];
  const flagshipDossiers: FacilityRecord[] = [];
  const registryDetails: Record<string, RegistryDetailPayload> = {};

  for (const c of campuses) {
    const mappedPolygonCount = polyCountById.get(c.id) ?? 0;
    const footprintCoverage: FootprintCoverage =
      mappedPolygonCount > 0 ? "verified_polygons" : "point_only";
    const sourceTags = Array.from(c.sourceTags).sort();

    // Update im3SqFt & mappedPolygonCount on registryMetadata
    const computedIm3SqFt =
      c.im3CampusSqFt > 0
        ? c.im3CampusSqFt
        : c.im3SqFtSum > 0
          ? c.im3SqFtSum
          : c.registryMetadata.im3SqFt ?? null;

    c.registryMetadata = {
      ...c.registryMetadata,
      ...(computedIm3SqFt ? { im3SqFt: computedIm3SqFt } : {}),
      mappedPolygonCount,
      sourceTags,
    };

    if (c.curatedRecord) {
      const rec = c.curatedRecord;
      rec.footprintCoverage = footprintCoverage;
      rec.catalogTier = c.catalogTier;
      rec.registryMetadata = c.registryMetadata;
      rec.waterAndCooling.nwsStationId = c.nwsStationId;
      rec.waterAndCooling.usgsGaugeSiteId = c.usgsGaugeSiteId;

      if (c.registryMetadata.peeringDbFacId) {
        const pdbUrl = `https://www.peeringdb.com/fac/${c.registryMetadata.peeringDbFacId}`;
        if (!rec.sources.some((s) => s.url === pdbUrl)) {
          rec.sources.push({
            id: "src-peeringdb-census",
            title: `PeeringDB Facility #${c.registryMetadata.peeringDbFacId} Interconnection Record`,
            publisher: "PeeringDB",
            date: c.peeringDbUpdated ?? "2026-11-01",
            kind: "registry_census",
            url: pdbUrl,
          });
        }
      }
      if (c.registryMetadata.epaRegistryId) {
        const epaUrl = `https://echo.epa.gov/detailed-facility-report?fid=${c.registryMetadata.epaRegistryId}`;
        if (!rec.sources.some((s) => s.url === epaUrl)) {
          rec.sources.push({
            id: "src-epa-echo-census",
            title: `EPA ECHO Detailed Facility Report (FRS ${c.registryMetadata.epaRegistryId})`,
            publisher: "U.S. Environmental Protection Agency",
            date: "2026-11-01",
            kind: "environmental_permit",
            url: epaUrl,
          });
        }
      }

      flagshipDossiers.push(rec);

      const waterEpistemic =
        rec.waterAndCooling.peakOrAvgWaterMgd.epistemic !== "undisclosed"
          ? rec.waterAndCooling.peakOrAvgWaterMgd.epistemic
          : rec.waterAndCooling.annualWaterMgy.epistemic;

      indexItems.push({
        id: rec.id,
        name: rec.name,
        marketCluster: rec.marketCluster,
        city: rec.city,
        county: rec.county,
        state: rec.state,
        isoRegion: rec.isoRegion,
        coordinates: rec.coordinates,
        lifecycleStatus: rec.lifecycleStatus,
        catalogTier: c.catalogTier,
        footprintCoverage,
        developer: rec.stakeholders.developer,
        operator: rec.stakeholders.operator,
        utilityProvider: rec.power.utilityProvider,
        interconnectionStatus: rec.power.interconnectionStatus,
        operationalMw: rec.power.operationalMw.value,
        operationalMwEpistemic: rec.power.operationalMw.epistemic,
        totalPlannedMw: rec.power.totalPlannedMw.value,
        totalPlannedMwEpistemic: rec.power.totalPlannedMw.epistemic,
        coolingArchitecture: rec.waterAndCooling.coolingArchitecture,
        peakOrAvgWaterMgd: rec.waterAndCooling.peakOrAvgWaterMgd.value,
        annualWaterMgy: rec.waterAndCooling.annualWaterMgy.value,
        waterEpistemic,
        watershedStress: rec.waterAndCooling.watershedStress,
        moratoriumOrLitigationActive: rec.regulatory.moratoriumOrLitigationActive,
        usgsGaugeSiteId: rec.waterAndCooling.usgsGaugeSiteId,
        nwsStationId: rec.waterAndCooling.nwsStationId,
        grossSqFt: rec.parcel.grossSqFt.value ?? computedIm3SqFt ?? null,
        mappedPolygonCount,
        sourceTags,
        lastVerified: rec.lastVerified,
        lastUpdated: c.lastUpdated,
      });
    } else {
      const operatorLabel =
        (c as WorkingCampus & { operatorLabel?: string }).operatorLabel ??
        (c.brand ? c.brand.toUpperCase() : "Registry Colocation / Enterprise Operator");
      const grossSqFt = computedIm3SqFt ?? c.grossSqFt ?? null;

      const sourceUrls: RegistryDetailPayload["sourceUrls"] = [];
      if (c.sourceTags.has("im3")) {
        sourceUrls.push({
          title: "DOE / PNNL IM3 Open Source Data Center Atlas",
          publisher: "Pacific Northwest National Laboratory (IMMM-SFA)",
          date: "2026-11-01",
          kind: "registry_census",
          url: "https://github.com/IMMM-SFA/datacenter-atlas",
        });
      }
      if (c.registryMetadata.peeringDbFacId) {
        sourceUrls.push({
          title: `PeeringDB Facility #${c.registryMetadata.peeringDbFacId} (${c.name})`,
          publisher: "PeeringDB",
          date: c.peeringDbUpdated ?? "2026-11-01",
          kind: "registry_census",
          url: `https://www.peeringdb.com/fac/${c.registryMetadata.peeringDbFacId}`,
        });
      }
      if (c.registryMetadata.epaRegistryId) {
        sourceUrls.push({
          title: `EPA ECHO Detailed Facility Report (FRS ${c.registryMetadata.epaRegistryId})`,
          publisher: "U.S. Environmental Protection Agency",
          date: "2026-11-01",
          kind: "environmental_permit",
          url: `https://echo.epa.gov/detailed-facility-report?fid=${c.registryMetadata.epaRegistryId}`,
        });
      }

      registryDetails[c.id] = {
        ...(c.rawStreet ? { streetAddress: c.rawStreet } : {}),
        ...(c.zipcode ? { zipcode: c.zipcode } : {}),
        ...(c.website ? { website: c.website } : {}),
        watershedName: c.watershedName,
        registryMetadata: c.registryMetadata,
        sourceUrls,
      };

      indexItems.push({
        id: c.id,
        name: c.name,
        marketCluster: c.marketCluster,
        city: c.city,
        county: c.county,
        state: c.state,
        isoRegion: c.isoRegion,
        coordinates: c.coordinates,
        lifecycleStatus: "operational",
        catalogTier: "registry",
        footprintCoverage,
        developer: operatorLabel,
        operator: operatorLabel,
        utilityProvider: `${c.isoRegion} Balancing Authority`,
        interconnectionStatus: "energized",
        operationalMw: null,
        operationalMwEpistemic: "undisclosed",
        totalPlannedMw: null,
        totalPlannedMwEpistemic: "undisclosed",
        coolingArchitecture: "undisclosed",
        peakOrAvgWaterMgd: null,
        annualWaterMgy: null,
        waterEpistemic: "undisclosed",
        watershedStress: c.watershedStress,
        moratoriumOrLitigationActive: false,
        usgsGaugeSiteId: c.usgsGaugeSiteId,
        nwsStationId: c.nwsStationId,
        grossSqFt,
        mappedPolygonCount,
        sourceTags,
        lastVerified: c.lastVerified,
        lastUpdated: c.lastUpdated,
      });
    }
  }

  // Sort index deterministically: flagship -> provisional -> registry, then by planned/operational MW desc, then name
  const tierRank: Record<CatalogTier, number> = { flagship: 0, provisional: 1, registry: 2 };
  indexItems.sort((a, b) => {
    const tr = tierRank[a.catalogTier] - tierRank[b.catalogTier];
    if (tr !== 0) return tr;
    const mwA = a.totalPlannedMw ?? a.operationalMw ?? -1;
    const mwB = b.totalPlannedMw ?? b.operationalMw ?? -1;
    if (mwB !== mwA) return mwB - mwA;
    return a.name.localeCompare(b.name);
  });

  // 13. Compute FleetSummaryMetadata (strict separation of verified vs reported/proposed MW)
  const statesSet = new Set<string>();
  const byTier: Record<CatalogTier, number> = { flagship: 0, registry: 0, provisional: 0 };
  const byFootprintCoverage: Record<FootprintCoverage, number> = {
    verified_polygons: 0,
    point_only: 0,
  };
  const byIso: FleetSummaryMetadata["byIso"] = {};
  const byStatus: FleetSummaryMetadata["byStatus"] = {};
  let verifiedOperationalMwTotal = 0;
  let verifiedPlannedMwTotal = 0;
  let reportedOrProposedMwTotal = 0;
  let disclosedWaterFacilityCount = 0;
  let undisclosedWaterFacilityCount = 0;
  let contestedOrMoratoriumCount = 0;

  for (const item of indexItems) {
    statesSet.add(item.state.toUpperCase());
    byTier[item.catalogTier] += 1;
    byFootprintCoverage[item.footprintCoverage] += 1;
    byIso[item.isoRegion] = (byIso[item.isoRegion] ?? 0) + 1;
    byStatus[item.lifecycleStatus] = (byStatus[item.lifecycleStatus] ?? 0) + 1;

    if (item.operationalMw !== null && item.operationalMwEpistemic !== "reported") {
      verifiedOperationalMwTotal += item.operationalMw;
    }

    const plannedVal = item.totalPlannedMw ?? item.operationalMw;
    const plannedEp = item.totalPlannedMw !== null ? item.totalPlannedMwEpistemic : item.operationalMwEpistemic;
    const isSpeculative =
      plannedEp === "reported" ||
      (item.lifecycleStatus === "proposed" && plannedEp !== "permitted");

    if (plannedVal !== null) {
      if (isSpeculative) {
        reportedOrProposedMwTotal += plannedVal;
      } else {
        verifiedPlannedMwTotal += plannedVal;
      }
    }

    if (item.waterEpistemic === "undisclosed") {
      undisclosedWaterFacilityCount += 1;
    } else {
      disclosedWaterFacilityCount += 1;
    }
    if (
      item.lifecycleStatus === "contested" ||
      item.lifecycleStatus === "moratorium" ||
      item.moratoriumOrLitigationActive
    ) {
      contestedOrMoratoriumCount += 1;
    }
  }

  const fleetSummary: FleetSummaryMetadata = {
    totalFacilities: indexItems.length,
    statesCovered: statesSet.size,
    byTier,
    byFootprintCoverage,
    byIso,
    byStatus,
    verifiedOperationalMwTotal: Math.round(verifiedOperationalMwTotal),
    verifiedPlannedMwTotal: Math.round(verifiedPlannedMwTotal),
    reportedOrProposedMwTotal: Math.round(reportedOrProposedMwTotal),
    disclosedWaterFacilityCount,
    undisclosedWaterFacilityCount,
    contestedOrMoratoriumCount,
    censusGeneratedAt: startedAt,
  };

  const footprintsCollection: GeoJSON.FeatureCollection<GeoJSON.Polygon, CampusFootprintProps> = {
    type: "FeatureCollection",
    features: finalFootprints,
  };

  // 14. Validate ALL invariants before writing artifacts
  const idxVal = validateFacilityIndex(indexItems);
  const dosVal = validateFacilities(flagshipDossiers);
  const fpVal = validateFootprints(footprintsCollection, indexItems as unknown as FacilityRecord[]);
  const isoVal = validateIsoRegions(isoRegions);

  if (!idxVal.valid || !dosVal.valid || !fpVal.valid || !isoVal.valid) {
    console.error("Validation errors detected during ingestion:");
    for (const e of [...idxVal.errors, ...dosVal.errors, ...fpVal.errors, ...isoVal.errors].slice(0, 40)) {
      console.error("  -", e);
    }
    process.exit(1);
  }

  // 15. Write minified output artifacts + public/data/footprints-us.geojson
  writeFileSync(resolve(DATA_DIR, "us-census-index.json"), JSON.stringify(indexItems));
  writeFileSync(resolve(DATA_DIR, "flagship-dossiers.json"), JSON.stringify(flagshipDossiers));
  writeFileSync(resolve(DATA_DIR, "registry-details.json"), JSON.stringify(registryDetails));
  writeFileSync(resolve(DATA_DIR, "fleet-summary.json"), JSON.stringify(fleetSummary));

  const footprintsJsonStr = JSON.stringify(footprintsCollection);
  writeFileSync(resolve(DATA_DIR, "footprints-us.json"), footprintsJsonStr);
  mkdirSync(dirname(PUBLIC_FOOTPRINTS_PATH), { recursive: true });
  writeFileSync(PUBLIC_FOOTPRINTS_PATH, footprintsJsonStr);

  const gzipBytes = Bun.gzipSync(Buffer.from(footprintsJsonStr)).length;
  console.log("==> Ingestion Complete!");
  console.log("Fleet Summary:", JSON.stringify(fleetSummary, null, 2));
  console.log(
    `Footprints: ${finalFootprints.length} real polygons | raw=${(footprintsJsonStr.length / 1024).toFixed(1)} KB | gzip=${(gzipBytes / 1024).toFixed(1)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
