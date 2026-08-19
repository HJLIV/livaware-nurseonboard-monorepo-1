---
name: ElevenLabs beat sync
description: Exact word-level scene sync from ElevenLabs alignment JSON — shape, tempo scaling, and phrase-matching pitfalls.
---

Syncing animation beats to ElevenLabs narration:

- The with-timestamps response alignment JSON has **top-level** keys `characters`, `character_start_times_seconds`, `character_end_times_seconds` — not nested under an `alignment` object once saved per-chunk.
- If the audio is tempo-shifted after generation (e.g. ffmpeg `atempo=1.06`), divide every character time by the same factor when building beat tables.
- Beat lookups that locate a phrase inside the narration text must match the script text **verbatim** — the script uses ASCII apostrophes and exact casing. Prefer phrases without apostrophes, and remember `indexOf` is case-sensitive (a capitalised phrase silently falls back to scene-start timing; that presented as an entire phase never appearing).
- Keep a proportional fallback for unmatched phrases, but treat any fallback hit as a bug to investigate.
- Pronunciation fixes (brand names): respell only the TTS input text ("Livaware" → "Liv-aware"), then drop the extra hyphen char entries from the returned alignment so alignment text equals the script text verbatim — beats keep matching, display spelling unchanged. Assert joined-chars === script text per chapter.
