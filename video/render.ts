import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { extname, resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dir, "..");
const VIDEO_DIR = resolve(ROOT, "video");
const CACHE_DIR = resolve(VIDEO_DIR, ".cache");
const SEG_DIR = resolve(CACHE_DIR, "segments");
const OUT_DIR = resolve(ROOT, "out");
const OUT_MP4 = resolve(OUT_DIR, "gridline-launch.mp4");
const OUT_STORYBOARD = resolve(OUT_DIR, "gridline-storyboard.png");
const AUDIO_WAV = resolve(OUT_DIR, "gridline-audio.wav");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const DURATION_SEC = 50;
const TOTAL_FRAMES = FPS * DURATION_SEC; // 3000 frames
const WORKER_COUNT = 4;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

declare global {
  interface Window {
    setFrame: (frame: number, fps: number) => void;
    __gridlineReady?: boolean;
  }
}

function writeToStream(stream: NodeJS.WritableStream, chunk: Buffer): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    const ok = stream.write(chunk, (err) => {
      if (err) rejectWrite(err);
    });
    if (ok) {
      resolveWrite();
    } else {
      stream.once("drain", resolveWrite);
    }
  });
}

function waitForProcess(proc: ChildProcess, label: string): Promise<void> {
  return new Promise((resolveProc, rejectProc) => {
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    proc.on("error", rejectProc);
    proc.on("close", (code) => {
      if (code === 0) {
        resolveProc();
      } else {
        rejectProc(new Error(`${label} exited with code ${code}:\n${stderr.slice(-1500)}`));
      }
    });
  });
}

function runFfmpeg(args: string[], label: string): Promise<void> {
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  return waitForProcess(proc, label);
}

async function renderSegment(
  browser: import("playwright-core").Browser,
  baseUrl: string,
  workerIdx: number,
  startFrame: number,
  endFrame: number,
): Promise<string> {
  const segPath = resolve(SEG_DIR, `seg_${workerIdx}.mp4`);
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      String(FPS),
      "-i",
      "-",
      "-vf",
      "scale=in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "15",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
      "-g",
      String(FPS),
      segPath,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );

  const ffDone = waitForProcess(ff, `ffmpeg-seg-${workerIdx}`);

  try {
    await page.goto(`${baseUrl}/scene.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__gridlineReady === true, null, {
      timeout: 15000,
    });

    const total = endFrame - startFrame;
    for (let f = startFrame; f < endFrame; f++) {
      await page.evaluate(
        ([frame, fps]) => {
          window.setFrame(frame, fps);
        },
        [f, FPS] as const,
      );
      await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => r())),
      );
      const jpeg = await page.screenshot({ type: "jpeg", quality: 96 });
      if (!ff.stdin) throw new Error("ffmpeg stdin unavailable");
      await writeToStream(ff.stdin, jpeg);

      const doneCount = f - startFrame + 1;
      if (doneCount % 150 === 0 || f === endFrame - 1) {
        console.log(
          `[worker ${workerIdx}] rendered ${doneCount}/${total} frames (${startFrame}..${endFrame - 1})`,
        );
      }
    }

    ff.stdin?.end();
    await ffDone;
    return segPath;
  } finally {
    await context.close().catch(() => {});
  }
}

async function run(): Promise<void> {
  if (!existsSync(resolve(CACHE_DIR, "geo-summary.json"))) {
    throw new Error("Missing video/.cache/geo-summary.json — run `bun run video:plates` first.");
  }
  if (!existsSync(AUDIO_WAV)) {
    throw new Error("Missing out/gridline-audio.wav — run `bun run video:audio` first.");
  }

  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(SEG_DIR, { recursive: true, force: true });
  mkdirSync(SEG_DIR, { recursive: true });

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      let reqPath = decodeURIComponent(url.pathname);
      if (reqPath === "/") reqPath = "/scene.html";
      const filePath = resolve(VIDEO_DIR, `.${reqPath}`);
      if (!filePath.startsWith(VIDEO_DIR) || !existsSync(filePath)) {
        return new Response("Not Found", { status: 404 });
      }
      const ext = extname(filePath);
      return new Response(Bun.file(filePath), {
        headers: {
          "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        },
      });
    },
  });

  const baseUrl = `http://127.0.0.1:${server.port}`;
  console.log(`Serving motion stage at ${baseUrl}`);

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const framesPerWorker = Math.ceil(TOTAL_FRAMES / WORKER_COUNT);
    const jobs: Array<Promise<string>> = [];
    for (let w = 0; w < WORKER_COUNT; w++) {
      const start = w * framesPerWorker;
      const end = Math.min(TOTAL_FRAMES, (w + 1) * framesPerWorker);
      if (start < end) {
        jobs.push(renderSegment(browser, baseUrl, w, start, end));
      }
    }

    const segmentPaths = await Promise.all(jobs);
    const concatPath = resolve(SEG_DIR, "concat.txt");
    writeFileSync(
      concatPath,
      segmentPaths.map((p) => `file '${p}'`).join("\n") + "\n",
    );

    console.log("Muxing 1080p60 segments + 48kHz stereo soundtrack ->", OUT_MP4);
    await runFfmpeg(
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-i",
        AUDIO_WAV,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-ar",
        "48000",
        "-shortest",
        "-movflags",
        "+faststart",
        OUT_MP4,
      ],
      "ffmpeg-mux",
    );

    // Build 4x3 12-keyframe storyboard preview across all 7 scenes
    const sampleFrames = [150, 270, 540, 840, 960, 1110, 1320, 1560, 1920, 2310, 2490, 2790];
    const selectExpr = sampleFrames.map((n) => `eq(n\\,${n})`).join("+");
    await runFfmpeg(
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        OUT_MP4,
        "-vf",
        `select='${selectExpr}',scale=480:270,tile=4x3:padding=8:margin=8:color=#070b11`,
        "-frames:v",
        "1",
        OUT_STORYBOARD,
      ],
      "ffmpeg-storyboard",
    );

    console.log(`Launch video rendered cleanly: ${OUT_MP4}`);
    console.log(`Storyboard grid saved: ${OUT_STORYBOARD}`);
  } finally {
    await browser.close().catch(() => {});
    server.stop();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
