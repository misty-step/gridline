#!/usr/bin/env bun
import {
  ALL_FACILITIES,
  getFacilityById,
  getFootprintsForFacility,
} from "../src/data/index.ts";
import { filterFacilities } from "../src/worker/index.ts";
import { fetchFacilityTelemetry } from "../src/worker/telemetry.ts";

function printHelp(): void {
  console.log(`Gridline CLI — US Data Center Infrastructure & Telemetry Atlas

Usage:
  bun run cli summary [--json]
  bun run cli list [--iso PJM] [--status contested] [--state VA] [--contested] [--undisclosed-water] [--q term] [--limit 20] [--json]
  bun run cli get <facility-id> [--json]
  bun run cli live <facility-id> [--json]
`);
}

function parseFlags(args: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eqIdx = arg.indexOf("=");
    if (eqIdx !== -1) {
      flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

function fmtNum(value: number | null, unit = ""): string {
  if (value === null) return "Undisclosed";
  return unit ? `${value} ${unit}` : String(value);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const { positional, flags } = parseFlags(rest);
  const asJson = Boolean(flags.json);

  if (command === "summary") {
    const byIso: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let operationalMw = 0;
    let plannedMw = 0;
    let contestedOrMoratorium = 0;
    let undisclosedWater = 0;

    for (const f of ALL_FACILITIES) {
      byIso[f.isoRegion] = (byIso[f.isoRegion] ?? 0) + 1;
      byStatus[f.lifecycleStatus] = (byStatus[f.lifecycleStatus] ?? 0) + 1;
      operationalMw += f.power.operationalMw.value ?? 0;
      plannedMw += f.power.totalPlannedMw.value ?? 0;
      if (
        f.lifecycleStatus === "contested" ||
        f.lifecycleStatus === "moratorium" ||
        f.regulatory.moratoriumOrLitigationActive
      ) {
        contestedOrMoratorium += 1;
      }
      if (
        f.waterAndCooling.peakOrAvgWaterMgd.epistemic === "undisclosed" ||
        f.waterAndCooling.annualWaterMgy.epistemic === "undisclosed"
      ) {
        undisclosedWater += 1;
      }
    }

    const summary = {
      facilityCount: ALL_FACILITIES.length,
      operationalMwTotal: Math.round(operationalMw),
      plannedMwTotal: Math.round(plannedMw),
      contestedOrMoratorium,
      undisclosedWater,
      byIso,
      byStatus,
    };

    if (asJson) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(`Facilities: ${summary.facilityCount}`);
    console.log(`Operational MW: ${summary.operationalMwTotal.toLocaleString()} MW`);
    console.log(`Total Planned MW: ${summary.plannedMwTotal.toLocaleString()} MW`);
    console.log(`Contested / Moratorium / Active Litigation: ${summary.contestedOrMoratorium}`);
    console.log(`Undisclosed Water Metrics: ${summary.undisclosedWater}`);
    console.log("By ISO:", JSON.stringify(byIso));
    console.log("By Status:", JSON.stringify(byStatus));
    return;
  }

  if (command === "list") {
    const params = new URLSearchParams();
    if (typeof flags.iso === "string") params.set("iso", flags.iso);
    if (typeof flags.status === "string") params.set("status", flags.status);
    if (typeof flags.state === "string") params.set("state", flags.state);
    if (flags.contested) params.set("contested", "1");
    if (flags["undisclosed-water"]) params.set("undisclosedWater", "1");
    if (typeof flags.q === "string") params.set("q", flags.q);

    const { facilities, error } = filterFacilities(ALL_FACILITIES, params);
    if (error) {
      console.error(`Filter error: ${error}`);
      process.exit(1);
    }

    const limit =
      typeof flags.limit === "string" && Number.isFinite(Number(flags.limit))
        ? Math.max(1, Number(flags.limit))
        : facilities.length;
    const sliced = facilities.slice(0, limit);

    if (asJson) {
      console.log(JSON.stringify(sliced, null, 2));
      return;
    }

    for (const f of sliced) {
      const mw = fmtNum(f.power.totalPlannedMw.value, "MW");
      const water =
        f.waterAndCooling.peakOrAvgWaterMgd.epistemic === "undisclosed"
          ? "Water: Undisclosed"
          : `Water: ${fmtNum(f.waterAndCooling.peakOrAvgWaterMgd.value, "MGD")}`;
      console.log(
        `${f.id.padEnd(36)} ${f.state} ${f.isoRegion.padEnd(6)} ${f.lifecycleStatus.padEnd(18)} ${mw.padEnd(12)} ${water} — ${f.name}`,
      );
    }
    console.log(`\nShowing ${sliced.length} of ${facilities.length} matching facilities.`);
    return;
  }

  if (command === "get") {
    const id = positional[0];
    if (!id) {
      console.error("Usage: bun run cli get <facility-id>");
      process.exit(1);
    }
    const facility = getFacilityById(id);
    if (!facility) {
      console.error(`Facility not found: ${id}`);
      process.exit(1);
    }
    const footprints = getFootprintsForFacility(id);
    if (asJson) {
      console.log(JSON.stringify({ facility, footprints }, null, 2));
      return;
    }

    console.log(`${facility.name} (${facility.id})`);
    console.log(
      `Location: ${facility.city}, ${facility.county}, ${facility.state} [${facility.coordinates[1]}, ${facility.coordinates[0]}] | ISO: ${facility.isoRegion} | Status: ${facility.lifecycleStatus}`,
    );
    console.log(`Developer / Operator: ${facility.stakeholders.developer} / ${facility.stakeholders.operator}`);
    console.log(
      `Power: Operational ${fmtNum(facility.power.operationalMw.value, "MW")} (${facility.power.operationalMw.epistemic}) | Planned ${fmtNum(facility.power.totalPlannedMw.value, "MW")} (${facility.power.totalPlannedMw.epistemic}) | ${facility.power.utilityProvider}`,
    );
    console.log(
      `Water: ${facility.waterAndCooling.coolingArchitecture} | Peak/Avg ${fmtNum(facility.waterAndCooling.peakOrAvgWaterMgd.value, "MGD")} (${facility.waterAndCooling.peakOrAvgWaterMgd.epistemic}) | Stress: ${facility.waterAndCooling.watershedStress}`,
    );
    console.log(
      `Telemetry Anchors: NOAA ${facility.waterAndCooling.nwsStationId} | USGS ${facility.waterAndCooling.usgsGaugeSiteId}`,
    );
    console.log(
      `Footprint Zones: ${footprints.features.length} | Permits: ${facility.regulatory.permits.length} | Sources: ${facility.sources.length}`,
    );
    return;
  }

  if (command === "live") {
    const id = positional[0];
    if (!id) {
      console.error("Usage: bun run cli live <facility-id>");
      process.exit(1);
    }
    const facility = getFacilityById(id);
    if (!facility) {
      console.error(`Facility not found: ${id}`);
      process.exit(1);
    }
    const telemetry = await fetchFacilityTelemetry(facility, { refresh: true });
    if (asJson) {
      console.log(JSON.stringify(telemetry, null, 2));
      return;
    }

    const w = telemetry.weather;
    const h = telemetry.hydrology;
    console.log(`Live Telemetry for ${facility.name} (${facility.id})`);
    console.log(
      `NOAA ${w.stationId} [${w.status}]: Temp ${fmtNum(w.tempC, "°C")} (${fmtNum(w.tempF, "°F")}) | RH ${fmtNum(w.relativeHumidityPct, "%")} | Wet-Bulb ${fmtNum(w.wetBulbC, "°C")} (${fmtNum(w.wetBulbF, "°F")}) | Regime: ${w.thermalRegime}`,
    );
    if (w.error) console.log(`  Weather error: ${w.error}`);
    console.log(
      `USGS ${h.siteId} [${h.status}]: Discharge ${fmtNum(h.dischargeCfs, h.unit)} | Observed: ${h.observedAt ?? "unavailable"}`,
    );
    if (h.error) console.log(`  Hydrology error: ${h.error}`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
