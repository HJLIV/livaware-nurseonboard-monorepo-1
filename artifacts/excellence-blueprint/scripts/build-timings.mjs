// Builds src/narration/timings.json from the narration script + measured MP3 durations,
// and back-fills startSec/durationSec/totalDurationSec into the narration script JSON.
//
// Usage: node artifacts/excellence-blueprint/scripts/build-timings.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCRIPT_PATH = join(ROOT, "src/narration/excellence-blueprint-script.json");
const TIMINGS_PATH = join(ROOT, "src/narration/timings.json");
const AUDIO_DIR = join(ROOT, "public/audio");

const FPS = 30;
// Lead-in before narration starts / tail after it ends, per scene (seconds).
// Generous on purpose: chapters need to breathe (inter-chapter speech gap =
// previous tail + next lead ≈ 2.8s).
const LEADS = { title: 2.4, default: 1.3 };
const TAILS = { title: 1.4, signature: 1.8, default: 1.5 };
const OUTRO_SEC = 5.6; // logo outro after the last narrated scene

const script = JSON.parse(readFileSync(SCRIPT_PATH, "utf8"));

function probe(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]).toString().trim();
  return parseFloat(out);
}

let cursor = 0;
const scenes = [];
for (const scene of script.scenes) {
  const voDur = probe(join(AUDIO_DIR, `${scene.key}.mp3`));
  const lead = LEADS[scene.key] ?? LEADS.default;
  const tail = TAILS[scene.key] ?? TAILS.default;
  const dur = lead + voDur + tail;
  scenes.push({
    key: scene.key,
    startMs: Math.round(cursor * 1000),
    durMs: Math.round(dur * 1000),
    voStartMs: Math.round((cursor + lead) * 1000),
    voDurMs: Math.round(voDur * 1000),
    audio: `/audio/${scene.key}.mp3`,
  });
  // keep the persisted narration script in the same shape as scripts/explainer-script.json
  scene.startSec = +(cursor + lead).toFixed(3);
  scene.durationSec = +voDur.toFixed(3);
  cursor += dur;
}
scenes.push({
  key: "outro",
  startMs: Math.round(cursor * 1000),
  durMs: Math.round(OUTRO_SEC * 1000),
  voStartMs: 0,
  voDurMs: 0,
  audio: null,
});
cursor += OUTRO_SEC;

const totalMs = Math.round(cursor * 1000);
script.totalDurationSec = +cursor.toFixed(3);

const timings = {
  fps: FPS,
  totalMs,
  totalFrames: Math.ceil((totalMs / 1000) * FPS),
  music: "/audio/music.mp3",
  scenes,
};

writeFileSync(TIMINGS_PATH, JSON.stringify(timings, null, 2) + "\n");
writeFileSync(SCRIPT_PATH, JSON.stringify(script, null, 2) + "\n");
console.log(`[timings] total ${(totalMs / 1000).toFixed(2)}s (${timings.totalFrames} frames @ ${FPS}fps)`);
for (const s of scenes) {
  console.log(`  ${s.key.padEnd(12)} start ${(s.startMs / 1000).toFixed(2).padStart(7)}s  dur ${(s.durMs / 1000).toFixed(2).padStart(6)}s  vo ${(s.voDurMs / 1000).toFixed(2)}s`);
}
