// Inserts breathing room between sentences inside each narration chunk.
//
// Reads the ORIGINAL ElevenLabs takes (public/audio/raw/<key>.mp3, pre-atempo)
// and original alignments (src/narration/alignment/original/<key>.json — created
// on first run from the current alignment files), pads every sentence gap up to
// TARGET_GAP_POST (measured post-atempo, i.e. in final-film seconds) by splicing
// digital silence at the midpoint of the existing gap, re-applies atempo, and
// writes:
//   - public/audio/<key>.mp3            (new padded, atempo'd chunk)
//   - src/narration/alignment/<key>.json (raw-domain alignment with shifted times)
//
// Idempotent: always builds from raw/ + alignment/original/, so re-running with a
// different TARGET_GAP_POST is safe. Previous finals are kept once in
// public/audio/pre-pause/.
//
// Usage: node scripts/add-breathing-room.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATEMPO = 1.06;                 // must match scripts/build-beats.mjs
const TARGET_GAP_POST = 0.85;        // desired pause between sentences, seconds (post-atempo)
const MIN_INSERT = 0.05;             // ignore boundaries already close to target

const AUDIO = path.join(root, 'public/audio');
const RAW = path.join(AUDIO, 'raw');
const PRE_PAUSE = path.join(AUDIO, 'pre-pause');
const ALIGN = path.join(root, 'src/narration/alignment');
const ALIGN_ORIG = path.join(ALIGN, 'original');

mkdirSync(PRE_PAUSE, { recursive: true });
mkdirSync(ALIGN_ORIG, { recursive: true });

const script = JSON.parse(readFileSync(path.join(root, 'src/narration/excellence-blueprint-script.json'), 'utf8'));

function probe(file) {
  return parseFloat(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]).toString().trim());
}

let totalInsertedPost = 0;
for (const scene of script.scenes) {
  const key = scene.key;
  const rawMp3 = path.join(RAW, `${key}.mp3`);
  const outMp3 = path.join(AUDIO, `${key}.mp3`);
  const alignPath = path.join(ALIGN, `${key}.json`);
  const alignOrigPath = path.join(ALIGN_ORIG, `${key}.json`);

  // Seed originals on first run; afterwards originals are the source of truth.
  if (!existsSync(alignOrigPath)) copyFileSync(alignPath, alignOrigPath);
  const prePausePath = path.join(PRE_PAUSE, `${key}.mp3`);
  if (!existsSync(prePausePath)) copyFileSync(outMp3, prePausePath);

  const align = JSON.parse(readFileSync(alignOrigPath, 'utf8'));
  const chars = align.characters;
  const st = align.character_start_times_seconds.slice();
  const en = align.character_end_times_seconds.slice();

  // Find sentence boundaries: .!? followed by whitespace then a non-space char.
  const boundaries = [];
  for (let i = 0; i < chars.length - 1; i++) {
    if (!/[.!?]/.test(chars[i]) || !/\s/.test(chars[i + 1])) continue;
    let j = i + 1;
    while (j < chars.length && /\s/.test(chars[j])) j++;
    if (j >= chars.length) continue;
    const gapRaw = st[j] - en[i];
    const insertRaw = TARGET_GAP_POST * ATEMPO - gapRaw;
    if (insertRaw < MIN_INSERT * ATEMPO) continue;
    boundaries.push({ i, j, cutRaw: en[i] + gapRaw / 2, insertRaw });
  }

  if (boundaries.length === 0) {
    console.log(`[${key}] no boundaries need padding`);
    continue;
  }

  // Build ffmpeg filter: segments interleaved with silences, then atempo.
  const rawDur = probe(rawMp3);
  const parts = [];
  const labels = [];
  let prev = 0;
  boundaries.forEach((b, n) => {
    parts.push(`[0:a]atrim=start=${prev.toFixed(4)}:end=${b.cutRaw.toFixed(4)},asetpts=PTS-STARTPTS[p${n}]`);
    parts.push(`anullsrc=r=44100:cl=mono,atrim=0:${b.insertRaw.toFixed(4)}[s${n}]`);
    labels.push(`[p${n}]`, `[s${n}]`);
    prev = b.cutRaw;
  });
  const nSeg = boundaries.length;
  parts.push(`[0:a]atrim=start=${prev.toFixed(4)},asetpts=PTS-STARTPTS[p${nSeg}]`);
  labels.push(`[p${nSeg}]`);
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[cat]`);
  parts.push(`[cat]atempo=${ATEMPO}[out]`);

  execFileSync('ffmpeg', [
    '-y', '-i', rawMp3,
    '-filter_complex', parts.join(';'),
    '-map', '[out]', '-ar', '44100', '-ac', '1', '-q:a', '2',
    outMp3,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Shift alignment times (raw domain) for all chars at/after each boundary's j.
  let shifted = 0;
  for (const b of boundaries) {
    for (let k = b.j; k < chars.length; k++) {
      st[k] += b.insertRaw;
      en[k] += b.insertRaw;
    }
    shifted += b.insertRaw;
  }
  writeFileSync(alignPath, JSON.stringify({
    ...align,
    character_start_times_seconds: st,
    character_end_times_seconds: en,
  }));

  const insertedPost = shifted / ATEMPO;
  totalInsertedPost += insertedPost;
  const expectPost = (rawDur + shifted) / ATEMPO;
  const gotPost = probe(outMp3);
  const drift = Math.abs(gotPost - expectPost);
  console.log(
    `[${key}] ${boundaries.length} pauses, +${insertedPost.toFixed(2)}s post-atempo ` +
    `(new dur ${gotPost.toFixed(2)}s, expected ${expectPost.toFixed(2)}s, drift ${drift.toFixed(3)}s)` +
    (drift > 0.08 ? '  ⚠ DRIFT' : '')
  );
}
console.log(`\nTotal narration lengthened by ${totalInsertedPost.toFixed(2)}s`);
console.log('Next: node scripts/build-timings.mjs && node scripts/build-beats.mjs');
