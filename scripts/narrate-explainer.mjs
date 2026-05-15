import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCRIPT = JSON.parse(readFileSync(join(ROOT, "scripts/explainer-script.json"), "utf8"));
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error("ELEVENLABS_API_KEY missing");

const TMP = join(ROOT, ".tmp-narration");
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const VOICE_ID = SCRIPT.voiceId;
const MODEL = SCRIPT.model || "eleven_turbo_v2_5";

async function tts(text, outPath) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 400)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  return buf.length;
}

const sceneFiles = [];
for (const scene of SCRIPT.scenes) {
  const out = join(TMP, `${scene.key}.mp3`);
  process.stdout.write(`[tts] ${scene.key} (${scene.text.length} chars) ... `);
  const bytes = await tts(scene.text, out);
  console.log(`${(bytes / 1024).toFixed(1)} KB`);
  sceneFiles.push({ ...scene, file: out });
}

console.log("[mux] building filtergraph");
const inputs = [];
const filters = [];
sceneFiles.forEach((s, i) => {
  inputs.push("-i", s.file);
  filters.push(`[${i + 1}:a]adelay=${s.startSec * 1000}|${s.startSec * 1000},apad[a${i}]`);
});
const mixInputs = sceneFiles.map((_, i) => `[a${i}]`).join("");
const totalMs = SCRIPT.totalDurationSec * 1000;
filters.push(`${mixInputs}amix=inputs=${sceneFiles.length}:normalize=0:dropout_transition=0[amix]`);
filters.push(`[amix]atrim=0:${SCRIPT.totalDurationSec},aresample=44100,acompressor=threshold=-18dB:ratio=3:attack=20:release=250[aout]`);

const inMp4 = join(ROOT, "attached_assets/videos/nurse-explainer.mp4");
const outMp4 = join(ROOT, "attached_assets/videos/nurse-explainer-narrated.mp4");

const args = [
  "-y",
  "-i", inMp4,
  ...inputs,
  "-filter_complex", filters.join(";"),
  "-map", "0:v",
  "-map", "[aout]",
  "-c:v", "copy",
  "-c:a", "aac",
  "-b:a", "192k",
  "-shortest",
  "-movflags", "+faststart",
  outMp4,
];
console.log("[mux] running ffmpeg");
const ff = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.status}`);

const finalMp4 = join(ROOT, "attached_assets/videos/nurse-explainer.mp4");
spawnSync("cp", [outMp4, finalMp4], { stdio: "inherit" });
spawnSync("cp", [outMp4, join(ROOT, "public/videos/nurse-explainer.mp4")], { stdio: "inherit" });
mkdirSync(join(ROOT, "client/public/videos"), { recursive: true });
spawnSync("cp", [outMp4, join(ROOT, "client/public/videos/nurse-explainer.mp4")], { stdio: "inherit" });
console.log(`[done] narrated MP4 written: ${outMp4}`);
console.log(`[done] replaced ${finalMp4} and public/videos/nurse-explainer.mp4`);
console.log(`(total narration window: ${totalMs}ms)`);
