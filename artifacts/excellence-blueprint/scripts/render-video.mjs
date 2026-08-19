// Renders the Excellence Blueprint film to MP4.
//
// Phase 1 (video): drives the dev server's ?render=1 mode frame-by-frame via
// Playwright, piping 1920×1080 PNG frames into ffmpeg (H.264, yuv420p).
// Phase 2 (mux): lays each narration chunk at its timeline offset, adds the
// ambient music bed (ducked), and writes the final faststart MP4.
//
// Usage (from artifacts/excellence-blueprint):
//   node scripts/render-video.mjs               # full render + mux
//   node scripts/render-video.mjs --video-only  # phase 1 only
//   node scripts/render-video.mjs --mux-only    # phase 2 only (reuses video)
//   node scripts/render-video.mjs --start 0 --end 90   # frame subrange (smoke test)
//
// Env: RENDER_URL (default http://127.0.0.1:21027/?render=1)

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
mkdirSync(outDir, { recursive: true });

const timings = JSON.parse(readFileSync(path.join(root, 'src/narration/timings.json'), 'utf8'));
const FPS = timings.fps;
const TOTAL_MS = timings.totalMs;
const TOTAL_FRAMES = timings.totalFrames;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const num = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};

const START = num('--start', 0);
const END = num('--end', TOTAL_FRAMES);
const URL = process.env.RENDER_URL ?? 'http://127.0.0.1:21027/?render=1';
const VIDEO_ONLY_MP4 = path.join(outDir, 'video-only.mp4');
const FINAL_MP4 = path.join(outDir, 'excellence-blueprint.mp4');

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

const WORKERS = num('--workers', 5);

let framesDone = 0;

async function renderSegment(browser, segIdx, segStart, segEnd, t0) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__renderReady === true && typeof window.__setFrame === 'function', null, { timeout: 30000 });

  const totalInPage = await page.evaluate(() => window.__EB_TOTAL_MS);
  if (Math.abs(totalInPage - TOTAL_MS) > 1) {
    throw new Error(`Page total ${totalInPage}ms != timings total ${TOTAL_MS}ms — rebuild timings?`);
  }

  const segPath = path.join(outDir, `seg-${String(segIdx).padStart(2, '0')}.mp4`);
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16',
      '-pix_fmt', 'yuv420p',
      segPath,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const ffmpegDone = new Promise((resolve, reject) => {
    ffmpeg.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`segment ffmpeg exited ${code}`))));
    ffmpeg.on('error', reject);
  });

  for (let i = segStart; i < segEnd; i++) {
    const ms = (i * 1000) / FPS;
    // Set the frame and wait for React to commit + the compositor to paint.
    await page.evaluate(
      (m) =>
        new Promise((resolve) => {
          window.__setFrame(m);
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
      ms,
    );
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, animations: 'disabled', caret: 'hide' });
    if (!ffmpeg.stdin.write(buf)) {
      await new Promise((resolve) => ffmpeg.stdin.once('drain', resolve));
    }
    framesDone++;
    if (framesDone % 250 === 0) {
      const rate = framesDone / ((Date.now() - t0) / 1000);
      const eta = Math.round((END - START - framesDone) / rate);
      console.log(`  ${framesDone}/${END - START} frames (${rate.toFixed(1)} fps, ~${eta}s left)`);
    }
  }
  ffmpeg.stdin.end();
  await ffmpegDone;
  await page.close();
  return segPath;
}

async function renderVideo() {
  console.log(`Rendering frames ${START}..${END - 1} of ${TOTAL_FRAMES} @ ${FPS}fps from ${URL} (${WORKERS} workers)`);
  const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const t0 = Date.now();
  const total = END - START;
  const per = Math.ceil(total / WORKERS);
  const jobs = [];
  for (let w = 0; w < WORKERS; w++) {
    const s = START + w * per;
    const e = Math.min(START + (w + 1) * per, END);
    if (s >= e) break;
    jobs.push(renderSegment(browser, w, s, e, t0));
  }
  const segPaths = await Promise.all(jobs);
  await browser.close();

  // Concatenate segments losslessly.
  const listPath = path.join(outDir, 'segments.txt');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(listPath, segPaths.map((p) => `file '${p}'`).join('\n'));
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', '-movflags', '+faststart',
    VIDEO_ONLY_MP4,
  ]);
  console.log(`✓ video-only render complete → ${VIDEO_ONLY_MP4} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

async function muxAudio() {
  const scenes = timings.scenes.filter((s) => s.audio);
  const totalSec = TOTAL_MS / 1000;
  const inputs = ['-i', VIDEO_ONLY_MP4];
  for (const s of scenes) inputs.push('-i', path.join(root, 'public', s.audio.replace(/^\//, '')));

  const voFilters = scenes.map((s, i) => `[${i + 1}:a]aresample=48000,adelay=${s.voStartMs}:all=1[v${i}]`);
  const parts = [...voFilters];
  let mixInputs = scenes.map((_, i) => `[v${i}]`).join('');
  let nMix = scenes.length;
  if (!NO_MUSIC) {
    // Music bed input twice: crossfaded into itself so it covers films longer
    // than the track (192s) without an audible loop seam.
    const musicPath = path.join(root, 'public', timings.music.replace(/^\//, ''));
    inputs.push('-i', musicPath, '-i', musicPath);
    const musicIdx = scenes.length + 1;
    const fadeOutStart = (totalSec - 4.2).toFixed(3);
    // Trim loop-1 to 180s so its composed ending (which decays to near-silence
    // from ~182s) never plays; the crossfade then happens mid-track at level.
    parts.push(
      `[${musicIdx}:a]atrim=0:180[m1];` +
      `[m1][${musicIdx + 1}:a]acrossfade=d=8:c1=tri:c2=tri[mloop];` +
      `[mloop]aresample=48000,atrim=0:${totalSec.toFixed(3)},volume=${MUSIC_VOL},afade=t=in:st=0:d=2.5,afade=t=out:st=${fadeOutStart}:d=4[m]`
    );
    mixInputs += '[m]';
    nMix += 1;
  }
  parts.push(`${mixInputs}amix=inputs=${nMix}:normalize=0:duration=longest[mx]`);
  // Without music the mixed track ends at the last VO take; pad silence to full length.
  parts.push(`[mx]apad=whole_dur=${totalSec.toFixed(3)},alimiter=limit=0.89[aout]`);
  const filter = parts.join(';');

  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', totalSec.toFixed(3),
    '-movflags', '+faststart',
    FINAL_MP4,
  ]);
  console.log(`✓ muxed → ${FINAL_MP4}`);
}

const MUSIC_VOL = process.env.MUSIC_VOL ?? '0.085';
const NO_MUSIC = parseFloat(MUSIC_VOL) === 0; // MUSIC_VOL=0 → mux narration only

if (!flag('--mux-only')) await renderVideo();
if (!flag('--video-only')) await muxAudio();
