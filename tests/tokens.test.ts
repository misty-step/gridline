import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DARK_MAP_PALETTE,
  LIGHT_MAP_PALETTE,
  type MapColorPalette,
} from "../src/client/lib/constants";

// MapLibre paint cannot read CSS custom properties, so the map palettes repeat
// token values. This keeps tokens.css the source of truth.
const css = readFileSync("src/client/styles/tokens.css", "utf8");
const darkStart = css.indexOf(':root[data-resolved-theme="dark"]');

function parseTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const light = parseTokens(css.slice(0, darkStart));
const dark = { ...light, ...parseTokens(css.slice(darkStart)) };

function expectedPalette(t: Record<string, string>): MapColorPalette {
  return {
    lifecycle: {
      operational: t["--status-operational"],
      expanding: t["--status-expanding"],
      under_construction: t["--status-under-construction"],
      permitted: t["--status-permitted"],
      proposed: t["--status-proposed"],
      contested: t["--status-contested"],
      moratorium: t["--status-moratorium"],
    },
    stress: {
      low: t["--stress-low"],
      low_medium: t["--stress-low-medium"],
      medium_high: t["--stress-medium-high"],
      high: t["--stress-high"],
      extremely_high: t["--stress-extremely-high"],
    },
    grid: {
      energized: t["--grid-energized"],
      phased_energization: t["--grid-phased"],
      interconnection_queue: t["--grid-queue"],
      transmission_upgrade_pending: t["--grid-upgrade"],
      ferc_or_puc_contested: t["--grid-contested"],
    },
    tier: {
      flagship: t["--tier-flagship"],
      registry: t["--tier-registry"],
      provisional: t["--tier-provisional"],
    },
    zones: {
      boundary: t["--zone-boundary"],
      operational: t["--zone-operational"],
      expansion: t["--zone-expansion"],
      substation: t["--zone-substation"],
      cooling: t["--zone-cooling"],
    },
    border: t["--text-primary"],
    accent: t["--accent-primary"],
    warnRing: t["--status-contested"],
    moratoriumRing: t["--status-moratorium"],
    undisclosedRing: t["--epistemic-undisclosed"],
    activityGlow: t["--accent-primary"],
  };
}

describe("map palettes mirror tokens.css", () => {
  test("dark", () => {
    expect(DARK_MAP_PALETTE).toEqual(expectedPalette(dark));
  });
  test("light", () => {
    expect(LIGHT_MAP_PALETTE).toEqual(expectedPalette(light));
  });
});
