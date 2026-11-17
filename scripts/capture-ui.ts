/**
 * Capture named UI states as PNGs so a person or an agent can inspect the
 * real rendered app. Needs the dev servers running (`bun run dev:worker` and
 * `bun run dev`) and a local Chrome.
 *
 *   bun run capture                      # every state for the viewport, dark, 1440x900
 *   bun run capture --theme light
 *   bun run capture --size 390x844 --states home,mobile-menu
 *   bun run capture --base http://127.0.0.1:8788 --out out/ui
 *
 * Console errors and page errors are printed and make the run exit 1.
 */
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((p): p is string => Boolean(p));

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://localhost:5173");
const theme = arg("theme", "dark");
const [width, height] = arg("size", "1440x900").split("x").map(Number);
const outDir = resolve(arg("out", "out/ui"));
const settleMs = 2500;

const isPhone = width <= 768;

// The phone layout keeps the lenses on the map and the directory behind a tab.
const lens = (label: string) => (p: Page) =>
  isPhone
    ? p.locator(`.map-mobile-group button[title="${label}"]`).click()
    : p.locator(".segmented-group").getByRole("button", { name: label, exact: true }).click();

async function firstCampus(p: Page): Promise<void> {
  if (isPhone) await p.locator(".rail-collapsed-tab").click();
  await p.locator(".facility-card-main").first().click();
}

/** Each state starts from a fresh page load, so states never depend on order. */
const STATES: Record<string, (page: Page) => Promise<void>> = {
  home: async () => {},
  "lens-water": lens("Water"),
  "lens-grid": lens("Grid"),
  "lens-activity": lens("Activity"),
  search: (p) => p.getByRole("searchbox").fill("meta"),
  filters: async (p) => {
    if (isPhone) await p.locator(".rail-collapsed-tab").click();
    await p.getByRole("button", { name: /^Filters/ }).click();
  },
  dossier: firstCampus,
  site: async (p) => {
    await firstCampus(p);
    await p.getByRole("button", { name: "View site" }).click();
    await p.waitForTimeout(4000);
  },
  compare: async (p) => {
    if (isPhone) await p.locator(".rail-collapsed-tab").click();
    await p.locator(".card-pin-btn").nth(0).click();
    await p.locator(".card-pin-btn").nth(1).click();
    // On a phone the directory covers the compare dock until it is closed.
    if (isPhone) await p.getByRole("button", { name: "Collapse directory" }).click();
    await p.getByRole("button", { name: "Compare", exact: true }).click();
  },
  live: async (p) => {
    if (isPhone) await p.locator(".topbar-mobile-btn").click();
    await p.getByRole(isPhone ? "menuitem" : "button", { name: /^Live/ }).first().click();
  },
  // Phone only: the overflow menu that holds Jump to, Live, Export and theme.
  "mobile-menu": (p) => p.locator(".topbar-mobile-btn").click(),
};

const defaultStates = Object.keys(STATES).filter(
  (name) => isPhone || name !== "mobile-menu",
);

const requested = arg("states", defaultStates.join(","))
  .split(",")
  .filter((name) => {
    if (STATES[name]) return true;
    console.error(`Unknown state "${name}". Known: ${Object.keys(STATES).join(", ")}`);
    process.exit(2);
  });

const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.");
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width, height },
  colorScheme: theme === "light" ? "light" : "dark",
});

let problems = 0;
for (const name of requested) {
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    problems += 1;
    console.error(`[${name}] console error: ${msg.text().slice(0, 300)}`);
  });
  page.on("pageerror", (err) => {
    problems += 1;
    console.error(`[${name}] page error: ${err.message.slice(0, 300)}`);
  });
  try {
    await page.goto(`${base}/?theme=${theme}`);
    await page.locator(".facility-card-main, .rail-collapsed-tab").first().waitFor();
    await page.locator(".rail-title, .rail-tab-count").first().waitFor();
    await page.waitForTimeout(settleMs);
    await STATES[name](page);
    await page.waitForTimeout(settleMs);
    const file = resolve(outDir, `${name}-${theme}-${width}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  } catch (err) {
    problems += 1;
    console.error(`[${name}] could not reach state: ${(err as Error).message.split("\n")[0]}`);
  }
  await page.close();
}

await browser.close();
process.exit(problems > 0 ? 1 : 0);
