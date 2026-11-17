import type {
  AnchorTenant,
  CoolingArchitecture,
  EpistemicStatus,
  FacilitySource,
  LifecycleStatus,
  MetricValue,
  WatershedStress,
} from "@shared/types";

const intFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const dec1Formatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dec2Formatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function safeHttpUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (decimals === 2) return dec2Formatter.format(value);
  if (decimals === 1) return dec1Formatter.format(value);
  return intFormatter.format(value);
}

export function formatMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Undisclosed";
  }
  return `${intFormatter.format(Math.round(value))} MW`;
}

export function formatGwOrMw(valueMw: number): string {
  if (!Number.isFinite(valueMw) || valueMw <= 0) return "0 MW";
  if (valueMw >= 1000) {
    return `${dec2Formatter.format(valueMw / 1000)} GW`;
  }
  return `${intFormatter.format(Math.round(valueMw))} MW`;
}

export function formatMetricValue(metric: MetricValue): string {
  if (metric.epistemic === "undisclosed" || metric.value === null) {
    return "Undisclosed by Operator";
  }
  const decimals =
    metric.unit === "MGD" || metric.unit === "PUE" || metric.unit === "ratio"
      ? 2
      : Number.isInteger(metric.value)
        ? 0
        : 1;
  const formatted = formatNumber(metric.value, decimals);
  return metric.unit ? `${formatted} ${metric.unit}` : formatted;
}

export function formatWaterMgd(metric: MetricValue): string {
  if (metric.epistemic === "undisclosed" || metric.value === null) {
    return "Undisclosed";
  }
  return `${formatNumber(metric.value, 2)} MGD`;
}

export function formatDischargeCfs(cfs: number | null): string {
  if (cfs === null || !Number.isFinite(cfs)) return "Unavailable";
  return `${formatNumber(cfs, cfs < 20 ? 1 : 0)} ft³/s`;
}

export function formatTempPair(
  tempF: number | null,
  tempC: number | null,
): string {
  if (tempF === null || tempC === null) return "Unavailable";
  return `${dec1Formatter.format(tempF)}°F (${dec1Formatter.format(tempC)}°C)`;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return "Unavailable";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  operational: "Operational",
  expanding: "Expanding",
  under_construction: "Under Construction",
  permitted: "Permitted",
  proposed: "Proposed",
  contested: "Contested",
  moratorium: "Moratorium",
};

export const EPISTEMIC_LABELS: Record<EpistemicStatus, string> = {
  measured: "Measured",
  permitted: "Permitted",
  filed: "Filed",
  disclosed: "Disclosed",
  estimated: "Estimated",
  undisclosed: "Undisclosed",
};

export const COOLING_LABELS: Record<CoolingArchitecture, string> = {
  closed_loop_liquid: "Closed-Loop Liquid",
  air_chiller_zero_evap: "Air Chiller (Zero Evap)",
  adiabatic_hybrid: "Adiabatic Hybrid",
  evaporative_tower: "Evaporative Tower",
  hybrid_liquid_evap: "Hybrid Liquid / Evap",
  undisclosed: "Undisclosed",
};

export const COOLING_SHORT_LABELS: Record<CoolingArchitecture, string> = {
  closed_loop_liquid: "Closed-Loop",
  air_chiller_zero_evap: "Zero-Evap Air",
  adiabatic_hybrid: "Adiabatic",
  evaporative_tower: "Evap Tower",
  hybrid_liquid_evap: "Liquid / Evap",
  undisclosed: "Undisclosed",
};

export const WATERSHED_STRESS_LABELS: Record<WatershedStress, string> = {
  low: "Low",
  low_medium: "Low–Medium",
  medium_high: "Medium–High",
  high: "High",
  extremely_high: "Extremely High",
};

export const INTERCONNECTION_LABELS: Record<string, string> = {
  energized: "Energized",
  phased_energization: "Phased Energization",
  interconnection_queue: "Interconnection Queue",
  ferc_or_puc_contested: "FERC / PUC Contested",
  transmission_upgrade_pending: "Tx Upgrade Pending",
};

export const THERMAL_REGIME_LABELS: Record<string, string> = {
  free_economizer: "Free Economizer",
  adiabatic_assist: "Adiabatic Assist",
  peak_chiller_evap: "Peak Chiller / Evap",
  unavailable: "Unavailable",
};

export const TENANT_ROLE_LABELS: Record<AnchorTenant["role"], string> = {
  hyperscale_owner: "Hyperscale Owner",
  anchor_tenant: "Anchor Tenant",
  ai_compute_tenant: "AI Compute Tenant",
  colocation_platform: "Colocation Platform",
  reported_tenant: "Reported Tenant",
};

export const SOURCE_KIND_LABELS: Record<FacilitySource["kind"], string> = {
  regulatory_filing: "Regulatory Filing",
  environmental_permit: "Environmental Permit",
  operator_disclosure: "Operator Disclosure",
  utility_iso_record: "Utility / ISO Record",
  municipal_or_court_record: "Municipal / Court Record",
};

export const ZONE_KIND_LABELS: Record<string, string> = {
  campus_boundary: "Campus Perimeter",
  operational_hall: "Operational Data Hall",
  planned_expansion: "Planned Expansion Zone",
  substation_yard: "Dedicated Substation Yard",
  cooling_yard: "Cooling & Water Plant Yard",
};

const CLUSTER_SHORT_NAMES: Record<string, string> = {
  "East Valley Phoenix (Elliot Road Corridor)": "East Valley Phoenix",
  "Kansas City Metro Southern Corridor": "Kansas City South",
  "Central Washington Hydro Corridor": "Central Washington",
  "Eastern Oregon Columbia Basin": "Columbia Basin (OR)",
  "Northeast Louisiana AI Megasite": "NE Louisiana",
  "Omaha–Council Bluffs Metro": "Omaha–Council Bluffs",
  "Silicon Valley (Santa Clara)": "Silicon Valley",
  "San Antonio / Medina Corridor": "San Antonio",
  "Northern Nevada (TRIC)": "Northern Nevada",
};

export function formatShortClusterName(clusterName: string): string {
  if (CLUSTER_SHORT_NAMES[clusterName]) {
    return CLUSTER_SHORT_NAMES[clusterName];
  }
  const stripped = clusterName
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+(AI Megasite|Metro|Hydro Corridor|Corridor)$/i, "")
    .trim();
  return stripped || clusterName;
}
