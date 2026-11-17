import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { ALL_FACILITIES, ISO_REGIONS } from "../src/data/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const CACHE_DIR = resolve(ROOT, "video/.cache");
const PLATES_DIR = resolve(CACHE_DIR, "plates");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 8799;
const INSPECTOR_PORT = 9249;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(timeoutMs = 25000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(400);
  }
  throw new Error(`wrangler dev failed to respond at ${BASE_URL}/api/health within ${timeoutMs}ms`);
}

function projectToStage(lon: number, lat: number): [number, number] {
  // Contiguous US bounding box: lon [-125.5, -66.5], lat [24.2, 49.5]
  // Mapped cleanly into 1100 x 680 SVG stage with slight cosine latitude aspect adjustment
  const lonMin = -125.5;
  const lonMax = -66.5;
  const latMin = 24.0;
  const latMax = 49.8;
  const x = ((lon - lonMin) / (lonMax - lonMin)) * 1100;
  const y = (1 - (lat - latMin) / (latMax - latMin)) * 680;
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

function ringToSvgPath(ring: number[][]): string {
  if (ring.length === 0) return "";
  const step = ring.length > 120 ? 2 : 1;
  const pts: string[] = [];
  for (let i = 0; i < ring.length; i += step) {
    const [lon, lat] = ring[i];
    const [x, y] = projectToStage(lon, lat);
    pts.push(`${i === 0 ? "M" : "L"}${x},${y}`);
  }
  pts.push("Z");
  return pts.join(" ");
}

function exportGeoSummary(): void {
  const isoPaths = ISO_REGIONS.features.map((feat) => {
    const geom = feat.geometry;
    const dParts: string[] = [];
    if (geom.type === "Polygon") {
      if (geom.coordinates[0]) dParts.push(ringToSvgPath(geom.coordinates[0]));
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        if (poly[0]) dParts.push(ringToSvgPath(poly[0]));
      }
    }
    return {
      id: feat.properties.id,
      name: feat.properties.name,
      stress: feat.properties.gridStressLevel,
      d: dParts.join(" "),
    };
  });

  const facilities = ALL_FACILITIES.map((f) => {
    const [x, y] = projectToStage(f.coordinates[0], f.coordinates[1]);
    return {
      id: f.id,
      name: f.name,
      state: f.state,
      iso: f.isoRegion,
      status: f.lifecycleStatus,
      operationalMw: f.power.operationalMw.value ?? 0,
      plannedMw: f.power.totalPlannedMw.value ?? 0,
      undisclosedWater:
        f.waterAndCooling.peakOrAvgWaterMgd.epistemic === "undisclosed" ||
        f.waterAndCooling.peakOrAvgWaterMgd.value === null,
      x,
      y,
    };
  });

  writeFileSync(
    resolve(CACHE_DIR, "geo-summary.json"),
    JSON.stringify({ isoPaths, facilities }, null, 2),
  );
  console.log(
    `Exported geo-summary.json (${isoPaths.length} ISO regions, ${facilities.length} facilities)`,
  );
}

async function waitForAppSettle(
  page: import("playwright-core").Page,
  extraMs = 2600,
): Promise<void> {
  await page.waitForSelector("canvas.maplibregl-canvas", { timeout: 20000 });
  await page
    .waitForSelector(".workspace-loading-pill", { state: "detached", timeout: 20000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(extraMs);
}

async function run(): Promise<void> {
  mkdirSync(PLATES_DIR, { recursive: true });
  exportGeoSummary();

  if (!existsSync(resolve(ROOT, "dist/client/index.html"))) {
    console.log("dist/client missing; running vite build first...");
    const buildProc = Bun.spawnSync(["bun", "run", "build"], {
      cwd: ROOT,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (buildProc.exitCode !== 0) {
      throw new Error("bun run build failed");
    }
  }

  const wranglerBin = resolve(ROOT, "node_modules/.bin/wrangler");
  const workerProc: ChildProcess = spawn(
    wranglerBin,
    [
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--inspector-port",
      String(INSPECTOR_PORT),
      "--local",
      "--show-interactive-dev-session",
      "false",
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let browser: import("playwright-core").Browser | null = null;
  try {
    await waitForHealth();
    console.log(`Local wrangler dev healthy at ${BASE_URL}`);

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // 1. Macro Dark
    console.log("Capturing 01-macro-dark.png...");
    await page.goto(`${BASE_URL}/?theme=dark&lat=38.6000&lng=-101.2000&z=3.62`, {
      waitUntil: "domcontentloaded",
    });
    await waitForAppSettle(page, 2800);
    await page.screenshot({ path: resolve(PLATES_DIR, "01-macro-dark.png") });

    // 2. Macro Light + Water & Cooling Stress Lens
    console.log("Capturing 02-macro-light-water.png...");
    await page.goto(`${BASE_URL}/?theme=light&lens=water&lat=38.6000&lng=-101.2000&z=3.62`, {
      waitUntil: "domcontentloaded",
    });
    await waitForAppSettle(page, 2800);
    await page.screenshot({ path: resolve(PLATES_DIR, "02-macro-light-water.png") });

    // 3. Undisclosed Water Filter (Dark)
    console.log("Capturing 03-filter-undisclosed.png...");
    await page.goto(`${BASE_URL}/?theme=dark&undisclosedWater=1&lat=38.6000&lng=-101.2000&z=3.62`, {
      waitUntil: "domcontentloaded",
    });
    await waitForAppSettle(page, 2600);
    await page.screenshot({ path: resolve(PLATES_DIR, "03-filter-undisclosed.png") });

    // 4. Regional Corridor: Northern Virginia
    console.log("Capturing 04-corridor-nova.png...");
    await page.goto(`${BASE_URL}/?theme=dark&lat=38.9800&lng=-77.4800&z=9.20`, {
      waitUntil: "domcontentloaded",
    });
    await waitForAppSettle(page, 2800);
    await page.screenshot({ path: resolve(PLATES_DIR, "04-corridor-nova.png") });

    // 5. Granular Parcel Inspection: Equinix Ashburn Satellite + Dossier
    console.log("Capturing 05-parcel-ashburn-satellite.png...");
    await page.goto(
      `${BASE_URL}/?facility=equinix-ashburn&lat=39.0164&lng=-77.4591&z=15.80&pitch=35&basemap=satellite&theme=dark`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForSelector(".drawer", { timeout: 15000 });
    await page.waitForSelector(".live-telemetry-grid", { timeout: 15000 }).catch(() => {});
    await waitForAppSettle(page, 3600);
    await page.screenshot({
      path: resolve(PLATES_DIR, "05-parcel-ashburn-satellite.png"),
    });

    // 6. Dossier Scrolled: Regulatory + Symmetric Proponent vs. Critic Perspectives
    console.log("Capturing 06-dossier-perspectives.png...");
    await page.evaluate(() => {
      const body = document.querySelector(".drawer-body");
      const persp = document.querySelector(".perspectives-grid");
      if (body && persp) {
        const bodyTop = body.getBoundingClientRect().top;
        const perspTop = persp.getBoundingClientRect().top;
        body.scrollTop += perspTop - bodyTop - 160;
      } else if (body) {
        body.scrollTop = 760;
      }
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(PLATES_DIR, "06-dossier-perspectives.png"),
    });

    // 7. Side-by-Side Comparison Matrix Modal
    console.log("Capturing 07-comparison-matrix.png...");
    await page.goto(
      `${BASE_URL}/?theme=dark&lat=38.6000&lng=-101.2000&z=3.62&compare=meta-richland-parish-hyperion,prince-william-digital-gateway`,
      { waitUntil: "domcontentloaded" },
    );
    await waitForAppSettle(page, 2200);
    await page.waitForSelector(".compare-open-btn:not(:disabled)", { timeout: 15000 });
    await page.click(".compare-open-btn");
    await page.waitForSelector(".compare-table", { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(PLATES_DIR, "07-comparison-matrix.png") });

    // 8. Live Federal Regulatory Pulse Modal
    console.log("Capturing 08-federal-pulse.png...");
    await page.goto(`${BASE_URL}/?theme=dark`, { waitUntil: "domcontentloaded" });
    await waitForAppSettle(page, 2000);
    await page.click('button[title*="Federal Regulatory Pulse"]');
    await page.waitForSelector(".reg-list .reg-item", { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(PLATES_DIR, "08-federal-pulse.png") });

    console.log("All 8 2x Retina plates captured cleanly into", PLATES_DIR);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (!workerProc.killed) {
      workerProc.kill("SIGTERM");
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
