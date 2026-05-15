import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const URL = process.env.VIDEO_URL ?? "http://localhost:5000/video";
const TOTAL_DURATION_MS = Number(process.env.VIDEO_DURATION_MS ?? 110_000);
const VIDEO_DIR = join(ROOT, ".tmp-video-record");
const OUT_WEBM = join(VIDEO_DIR, "explainer.webm");
const OUT_DIR = join(ROOT, "attached_assets", "videos");
const OUT_MP4 = join(OUT_DIR, "nurse-explainer.mp4");

mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

console.log(`[record] launching chromium`);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
});

const page = await context.newPage();
console.log(`[record] navigating to ${URL}`);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForFunction(() => (window).videoReady === true, { timeout: 30_000 });
console.log(`[record] video ready, recording for ${TOTAL_DURATION_MS}ms`);
await page.waitForTimeout(TOTAL_DURATION_MS);

const recordedPage = page;
await context.close();
await browser.close();

const recordedFiles = readdirSync(VIDEO_DIR)
  .filter((f) => f.endsWith(".webm"))
  .map((f) => ({ name: f, path: join(VIDEO_DIR, f), mtime: statSync(join(VIDEO_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (recordedFiles.length === 0) {
  throw new Error("no .webm produced by playwright");
}

const newest = recordedFiles[0].path;
console.log(`[record] webm captured: ${newest}`);
if (newest !== OUT_WEBM) {
  if (existsSync(OUT_WEBM)) unlinkSync(OUT_WEBM);
  renameSync(newest, OUT_WEBM);
}

console.log(`[record] muxing to mp4 with ffmpeg`);
const ff = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i", OUT_WEBM,
    "-vf", "scale=1280:720:flags=lanczos",
    "-r", "30",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    OUT_MP4,
  ],
  { stdio: "inherit" },
);

if (ff.status !== 0) {
  throw new Error(`ffmpeg failed with status ${ff.status}`);
}

const finalSize = statSync(OUT_MP4).size;
console.log(`[record] done -> ${OUT_MP4} (${(finalSize / 1024 / 1024).toFixed(1)} MB)`);
