#!/usr/bin/env bun
import type { ActivityWindow, IsoRegion, PulseStream } from "../src/shared/types.ts";
import {
  ALL_INDEX_ITEMS,
  FLEET_SUMMARY,
  getFacilityRecordById,
  getFootprintsForFacility,
} from "../src/worker/dataset.ts";
import { fetchLiveGridFeed, getGridSnapshotForIso } from "../src/worker/grid.ts";
import { parseActivityWindow } from "../src/worker/http.ts";
import { filterFacilityIndex } from "../src/worker/index.ts";
import { ALL_PULSE_STREAMS, fetchLivePulseFeed } from "../src/worker/pulse.ts";
import { fetchFacilityTelemetry } from "../src/worker/telemetry.ts";

function printHelp(): void {
  console.log(`Gridline CLI — US Data Center Infrastructure & Live Observatory

Usage:
  bun run cli summary [--json]
  bun run cli list [--tier flagship,registry] [--verified-only] [--iso PJM] [--status contested] [--state VA] [--window 30d] [--cooling closed_loop_liquid] [--contested] [--undisclosed-water] [--min-mw 100] [--q term] [--limit 20] [--json]
  bun run cli get <facility-id> [--json]
  bun run cli live <facility-id> [--json]
  bun run cli grid [--iso PJM] [--json]
  bun run cli pulse [--stream federal_register|sec_edgar|peeringdb|all] [--window 90d] [--limit 20] [--json]
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

function fmtNum(value: number | null, unit = "", nullLabel = "Undisclosed"): string {
  if (value === null) return nullLabel;
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
    if (asJson) {
      console.log(JSON.stringify(FLEET_SUMMARY, null, 2));
      return;
    }

    console.log(
      `National Fleet: ${FLEET_SUMMARY.totalFacilities.toLocaleString()} campuses across ${FLEET_SUMMARY.statesCovered} states/DC`,
    );
    console.log(
      `Tiers: flagship=${FLEET_SUMMARY.byTier.flagship} | registry=${FLEET_SUMMARY.byTier.registry} | provisional=${FLEET_SUMMARY.byTier.provisional}`,
    );
    console.log(
      `Footprints: verified_polygons=${FLEET_SUMMARY.byFootprintCoverage.verified_polygons} | point_only=${FLEET_SUMMARY.byFootprintCoverage.point_only}`,
    );
    console.log(
      `Verified Capacity: ${FLEET_SUMMARY.verifiedOperationalMwTotal.toLocaleString()} MW operational | ${FLEET_SUMMARY.verifiedPlannedMwTotal.toLocaleString()} MW planned`,
    );
    console.log(
      `Reported / Unpermitted Proposed Pipeline: ${FLEET_SUMMARY.reportedOrProposedMwTotal.toLocaleString()} MW (segregated)`,
    );
    console.log(
      `Contested / Moratorium / Active Litigation: ${FLEET_SUMMARY.contestedOrMoratoriumCount}`,
    );
    console.log(
      `Water Disclosures: ${FLEET_SUMMARY.disclosedWaterFacilityCount} disclosed | ${FLEET_SUMMARY.undisclosedWaterFacilityCount} undisclosed`,
    );
    console.log("By ISO:", JSON.stringify(FLEET_SUMMARY.byIso));
    console.log("By Status:", JSON.stringify(FLEET_SUMMARY.byStatus));
    return;
  }

  if (command === "list") {
    const params = new URLSearchParams();
    if (typeof flags.tier === "string") params.set("tier", flags.tier);
    if (flags["verified-only"]) params.set("verifiedOnly", "1");
    if (typeof flags.iso === "string") params.set("iso", flags.iso);
    if (typeof flags.status === "string") params.set("status", flags.status);
    if (typeof flags.state === "string") params.set("state", flags.state);
    if (typeof flags.window === "string") params.set("window", flags.window);
    if (typeof flags.cooling === "string") params.set("cooling", flags.cooling);
    if (flags.contested) params.set("contested", "1");
    if (flags["undisclosed-water"]) params.set("undisclosedWater", "1");
    if (typeof flags["min-mw"] === "string") params.set("minMw", flags["min-mw"]);
    if (typeof flags.q === "string") params.set("q", flags.q);

    const { items, error } = filterFacilityIndex(
      ALL_INDEX_ITEMS,
      params,
      getFacilityRecordById,
    );
    if (error) {
      console.error(`Filter error: ${error}`);
      process.exit(1);
    }

    const limit =
      typeof flags.limit === "string" && Number.isFinite(Number(flags.limit))
        ? Math.max(1, Number(flags.limit))
        : items.length;
    const sliced = items.slice(0, limit);

    if (asJson) {
      console.log(JSON.stringify(sliced, null, 2));
      return;
    }

    for (const item of sliced) {
      const mwRaw = fmtNum(item.totalPlannedMw, "MW");
      const mw =
        item.totalPlannedMwEpistemic === "reported" ? `${mwRaw} (rep)` : mwRaw;
      const water =
        item.waterEpistemic === "undisclosed"
          ? "Water: Undisclosed"
          : `Water: ${fmtNum(item.peakOrAvgWaterMgd, "MGD")}`;
      console.log(
        `${item.id.padEnd(36)} ${item.catalogTier.padEnd(11)} ${item.state.padEnd(3)} ${item.isoRegion.padEnd(6)} ${item.lifecycleStatus.padEnd(18)} ${mw.padEnd(16)} ${water.padEnd(18)} ${item.footprintCoverage} — ${item.name}`,
      );
    }
    console.log(`\nShowing ${sliced.length} of ${items.length} matching campuses.`);
    return;
  }

  if (command === "get") {
    const id = positional[0];
    if (!id) {
      console.error("Usage: bun run cli get <facility-id>");
      process.exit(1);
    }
    const facility = getFacilityRecordById(id);
    if (!facility) {
      console.error(`Facility not found: ${id}`);
      process.exit(1);
    }
    const footprints = getFootprintsForFacility(id);
    if (asJson) {
      console.log(JSON.stringify({ facility, footprints }, null, 2));
      return;
    }

    const tier = facility.catalogTier ?? "flagship";
    const coverage =
      facility.footprintCoverage ??
      (footprints.features.length > 0 ? "verified_polygons" : "point_only");

    console.log(`${facility.name} (${facility.id}) [${tier} // ${coverage}]`);
    console.log(
      `Location: ${facility.city}, ${facility.county}, ${facility.state} [${facility.coordinates[1]}, ${facility.coordinates[0]}] | ISO: ${facility.isoRegion} | Status: ${facility.lifecycleStatus}`,
    );
    console.log(
      `Developer / Operator: ${facility.stakeholders.developer} / ${facility.stakeholders.operator}`,
    );
    console.log(
      `Power: Operational ${fmtNum(facility.power.operationalMw.value, "MW")} (${facility.power.operationalMw.epistemic}) | Planned ${fmtNum(facility.power.totalPlannedMw.value, "MW")} (${facility.power.totalPlannedMw.epistemic}) | ${facility.power.utilityProvider}`,
    );
    console.log(
      `Water: ${facility.waterAndCooling.coolingArchitecture} | Peak/Avg ${fmtNum(facility.waterAndCooling.peakOrAvgWaterMgd.value, "MGD")} (${facility.waterAndCooling.peakOrAvgWaterMgd.epistemic}) | Stress: ${facility.waterAndCooling.watershedStress}`,
    );
    console.log(
      `Telemetry Anchors: NOAA ${facility.waterAndCooling.nwsStationId} | USGS ${facility.waterAndCooling.usgsGaugeSiteId}`,
    );
    if (facility.registryMetadata) {
      console.log(`Registry Metadata: ${JSON.stringify(facility.registryMetadata)}`);
    }
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
    const facility = getFacilityRecordById(id);
    if (!facility) {
      console.error(`Facility not found: ${id}`);
      process.exit(1);
    }
    const [telemetry, gridSnapshot] = await Promise.all([
      fetchFacilityTelemetry(facility, { refresh: true }),
      getGridSnapshotForIso(facility.isoRegion, {}, { refresh: true }),
    ]);
    if (asJson) {
      console.log(JSON.stringify({ ...telemetry, gridSnapshot }, null, 2));
      return;
    }

    const w = telemetry.weather;
    const h = telemetry.hydrology;
    console.log(`Live Telemetry for ${facility.name} (${facility.id})`);
    console.log(
      `NOAA ${w.stationId} [${w.status}]: Temp ${fmtNum(w.tempC, "°C", "Unavailable")} (${fmtNum(w.tempF, "°F", "Unavailable")}) | RH ${fmtNum(w.relativeHumidityPct, "%", "Unavailable")} | Wet-Bulb ${fmtNum(w.wetBulbC, "°C", "Unavailable")} (${fmtNum(w.wetBulbF, "°F", "Unavailable")}) | Regime: ${w.thermalRegime}`,
    );
    if (w.error) console.log(`  Weather error: ${w.error}`);
    console.log(
      `USGS ${h.siteId} [${h.status}]: Discharge ${fmtNum(h.dischargeCfs, h.unit, "Unavailable")} | Observed: ${h.observedAt ?? "Unavailable"}`,
    );
    if (h.error) console.log(`  Hydrology error: ${h.error}`);
    if (gridSnapshot) {
      console.log(
        `EIA ${gridSnapshot.isoRegion} (${gridSnapshot.eiaRespondent}) [${gridSnapshot.status}]: Demand ${fmtNum(gridSnapshot.demandMw, "MW", "Unavailable")} | NetGen ${fmtNum(gridSnapshot.netGenerationMw, "MW", "Unavailable")} | Interchange ${fmtNum(gridSnapshot.interchangeMw, "MW", "Unavailable")} | Observed: ${gridSnapshot.observedAt ?? "Unavailable"}`,
      );
      if (gridSnapshot.fuelMix.length > 0) {
        const topMix = gridSnapshot.fuelMix
          .slice(0, 5)
          .map((m) => `${m.label} ${m.sharePct}%`)
          .join(", ");
        console.log(`  Fuel Mix: ${topMix}`);
      }
      if (gridSnapshot.error) console.log(`  Grid error: ${gridSnapshot.error}`);
    }
    return;
  }

  if (command === "grid") {
    const feed = await fetchLiveGridFeed({}, { refresh: true });
    const isoArg =
      typeof flags.iso === "string" ? (flags.iso.trim().toUpperCase() as IsoRegion) : null;

    if (isoArg && !feed.regions[isoArg]) {
      console.error(`Unknown ISO region: ${isoArg}`);
      process.exit(1);
    }

    if (asJson) {
      console.log(
        JSON.stringify(
          isoArg ? { ...feed, regions: { [isoArg]: feed.regions[isoArg] } } : feed,
          null,
          2,
        ),
      );
      return;
    }

    console.log(
      `Live EIA US Grid Dispatch [${feed.status}] fetched=${feed.fetchedAt}`,
    );
    if (feed.error) console.log(`Diagnostics: ${feed.error}`);
    const entries = isoArg
      ? ([[isoArg, feed.regions[isoArg]]] as Array<
          [IsoRegion, (typeof feed.regions)[IsoRegion]]
        >)
      : (Object.entries(feed.regions) as Array<
          [IsoRegion, (typeof feed.regions)[IsoRegion]]
        >);

    for (const [iso, snap] of entries) {
      if (!snap) continue;
      const topMix = snap.fuelMix
        .slice(0, 4)
        .map((m) => `${m.fuel}:${m.sharePct}%`)
        .join(" ");
      console.log(
        `${iso.padEnd(7)} (${snap.eiaRespondent.padEnd(4)}) [${snap.status.padEnd(8)}] Demand=${fmtNum(snap.demandMw, "MW", "N/A").padEnd(11)} NetGen=${fmtNum(snap.netGenerationMw, "MW", "N/A").padEnd(11)} Int=${fmtNum(snap.interchangeMw, "MW", "N/A").padEnd(10)} ${snap.observedAt ?? "N/A"}${topMix ? ` | ${topMix}` : ""}`,
      );
    }
    return;
  }

  if (command === "pulse") {
    const rawStream =
      typeof flags.stream === "string" ? flags.stream.trim().toLowerCase() : "all";
    if (
      rawStream !== "all" &&
      !ALL_PULSE_STREAMS.includes(rawStream as PulseStream)
    ) {
      console.error(
        `Invalid stream "${rawStream}". Expected: all | ${ALL_PULSE_STREAMS.join(" | ")}`,
      );
      process.exit(1);
    }

    const windowArg =
      typeof flags.window === "string"
        ? parseActivityWindow(flags.window)
        : ("90d" as ActivityWindow);
    if (!windowArg) {
      console.error(
        `Invalid window "${String(flags.window)}". Expected: 24h | 7d | 30d | 90d | all`,
      );
      process.exit(1);
    }

    const feed = await fetchLivePulseFeed(
      {},
      {
        stream: rawStream as PulseStream | "all",
        window: windowArg,
        refresh: true,
        facilities: ALL_INDEX_ITEMS,
      },
    );

    const limit =
      typeof flags.limit === "string" && Number.isFinite(Number(flags.limit))
        ? Math.max(1, Number(flags.limit))
        : feed.items.length;
    const sliced = feed.items.slice(0, limit);

    if (asJson) {
      console.log(JSON.stringify({ ...feed, items: sliced }, null, 2));
      return;
    }

    console.log(
      `Live Infrastructure Pulse [${feed.status}] window=${feed.window} | streams=${JSON.stringify(feed.streamStatus)}`,
    );
    if (feed.error) console.log(`Diagnostics: ${feed.error}`);
    for (const item of sliced) {
      const dateStr = item.publishedAt.slice(0, 10);
      const statesStr =
        item.states && item.states.length > 0 ? `[${item.states.join(",")}]` : "";
      const headline = item.title.startsWith(item.publisher)
        ? item.title
        : `${item.publisher} — ${item.title}`;
      console.log(
        `${dateStr} ${item.stream.padEnd(16)} ${item.epistemic.padEnd(9)} ${statesStr.padEnd(8)} ${headline}\n  ${item.url}`,
      );
    }
    console.log(`\nShowing ${sliced.length} of ${feed.items.length} signals.`);
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
