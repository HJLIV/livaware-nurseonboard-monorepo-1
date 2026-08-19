// Builds src/narration/beats.json — exact per-character start times (ms, post-atempo)
// for each narration chunk, from the ElevenLabs alignment JSONs.
//
// Usage: node scripts/build-beats.mjs
// Rerun after regenerating narration audio or alignments.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATEMPO = 1.06; // final chunks were sped up by this factor

const script = JSON.parse(readFileSync(path.join(root, 'src/narration/excellence-blueprint-script.json'), 'utf8'));

const out = [];
for (const scene of script.scenes) {
  const alignPath = path.join(root, 'src/narration/alignment', `${scene.key}.json`);
  const align = JSON.parse(readFileSync(alignPath, 'utf8'));
  const joined = align.characters.join('');
  if (joined !== scene.text) {
    console.warn(`⚠ ${scene.key}: alignment text mismatch (len ${joined.length} vs ${scene.text.length}) — skipping exact beats`);
    continue;
  }
  const charMs = align.character_start_times_seconds.map((s) => Math.round((s / ATEMPO) * 1000));
  out.push({ key: scene.key, text: scene.text, charMs });
  const last = align.character_end_times_seconds.at(-1) / ATEMPO;
  console.log(`✓ ${scene.key}: ${charMs.length} chars, speech ends ${last.toFixed(2)}s (durationSec ${scene.durationSec})`);
}

writeFileSync(path.join(root, 'src/narration/beats.json'), JSON.stringify(out));
console.log(`\nWrote src/narration/beats.json (${out.length} scenes)`);
