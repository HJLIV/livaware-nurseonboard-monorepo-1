---
name: Video artifact render pipeline
description: Rendering a deterministic ?render=1 video artifact to MP4 with Playwright + ffmpeg in this workspace — chromium binary, frame format, chunking, and shell footguns.
---

Rendering a video artifact (deterministic `?render=1` + `window.__setFrame(ms)` page) to MP4 here:

- **Chromium binary**: `playwright` (root npm dep) has no downloaded browsers. Launch with `executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (a nix-store chromium) + `--no-sandbox`. `npx playwright install` is unnecessary.
- **Frame format**: screenshot as **JPEG quality ~92, not PNG** — PNG encode at 1080p was the bottleneck (2.6fps → ~19-29fps with 5 parallel pages). Quality cost is nil because the final encode is yuv420p (chroma subsampled anyway). Encode segments `-preset veryfast -crf 16`, then re-encode once at mux time (`-preset medium -crf 19`).
- **Parallelism**: one browser, N pages each rendering a contiguous frame range to its own segment mp4, then ffmpeg concat (`-f concat -c copy`). **Concat list paths resolve relative to the list file's directory** — write bare filenames into a list that sits next to the segments.
- **ShellExec limits**: backgrounded `nohup ... &` jobs do NOT reliably run after the call returns — the spawned shell stalls/dies. Run renders as **foreground chunks sized under the 300s timeout** (measure throughput on a small chunk first), `mv` each chunk aside, concat at the end. Pipe long output to a log file, not `| tail`, or a timeout kill loses everything.
- **pkill footgun**: `pkill -f "render-video"` matches the invoking shell's own command line and kills it instantly (exit -1, no output). Use a bracket pattern like `pgrep -f 'render-video[.]mjs'`.
- **Paint sync**: after `__setFrame(ms)`, await a double `requestAnimationFrame` inside the same `page.evaluate` before screenshotting, or you capture stale frames.
- **Don't edit artifact src while rendering** — Vite HMR reloads the render pages mid-run.
- **Audio mix sanity**: `volumedetect` on narration vs music first; set the music bed so its mean sits ~17-20dB under VO mean (here: music `volume=0.085` + limiter after `amix normalize=0`); verify with windowed volumedetect at VO gaps and fades. Generated ambient tracks may open near-silent — check the source before blaming the fade.
- **Looping a music bed**: when the film outgrows the track, `acrossfade` two copies BUT `atrim` copy-1 to end *before* the track's composed ending (they decay to near-silence over the last ~10s) — otherwise the loop seam lands in that fade and a chapter gap gets seconds of dead air. Always re-run a `silencedetect noise=-50dB:d=2` scan after any duration change.
- **Pacing revisions without re-recording**: sentence pauses can be spliced into existing TTS takes from the alignment char times (cut at gap midpoints, insert anullsrc, re-apply atempo, shift alignment times by the inserts) — takes stay identical, beats/timings rebuild downstream. Users perceive back-to-back narration (~1s chapter gaps, ~0.3s sentence gaps) as "rushed"; ~0.85s sentence gaps and ~2.8s chapter gaps read as calm.
