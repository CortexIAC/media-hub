# Testing, formats and manual verification

Last run: 27 October 2026, Windows 11 (10.0.26200), Node 24.21.0, Electron 45.1.0 (Chromium 156.0.8078.49).

## Commands

```bash
npm run typecheck    # tsc -p tsconfig.node.json && tsc -p tsconfig.web.json
npm test             # vitest run, unit + integration (no Electron)
npm run test:e2e     # npm run build, then vitest with vitest.e2e.config.ts
npm run bench        # cold start and 300-track import measurement
```

## Automated results

```
Unit + integration:  7 files, 97 tests, all passing (~24 s)
End-to-end:          1 file, 9 tests, all passing (~30 s)
Typecheck:           clean (node + web)
Build:               electron-vite production build, clean
```

Coverage by area:

| Area | File | What is asserted |
| --- | --- | --- |
| Queue semantics | `tests/core/queue.test.ts` | add/replace, dedupe, shuffle order, repeat modes, next/previous at boundaries, remove/move, empty queues |
| Playback controller | `tests/core/player.test.ts` | load → play → pause, seek clamping, track transitions, auto-advance, repeat one, shuffle, backend errors, recovery, restore |
| Local search | `tests/core/search.test.ts` | case/diacritic normalisation, relevance ordering, limits, album grouping |
| Discovery helpers | `tests/core/discovery.test.ts` | query normalisation/bounding, dedupe by source+id, kind filtering, source metadata |
| Library scanning | `tests/library/scanner.test.ts` | recursive walk, hidden folders, unsupported extensions, truncation, cancellation, unreadable roots, WAV/MP3/FLAC tags, artwork caching and dedupe, corrupt and empty files |
| Persistence | `tests/library/persistence.test.ts` | atomic JSON writes, corrupt-file quarantine, folder/track upserts, playlist edits, favorites, settings sanitising (including equalizer and YouTube key), session sanitising |
| Byte ranges | `tests/library/byteRange.test.ts` | valid, open-ended, suffix and unsatisfiable ranges |
| Whole app | `tests/e2e/app.e2e.test.ts` | launch, import, playback of MP3/WAV/FLAC, transport, equalizer, Virtual Library, queue, favorites, playlists, search, restart persistence, clean shutdown |

Fixtures are generated at test time — WAV built sample by sample, MP3 encoded with lamejs, FLAC encoded with libflac — so no binary audio is committed and the tests exercise real decoders. The e2e suite stubs only the native folder picker; everything after that is the real app.

### Known test characteristics

- The e2e playback assertion failed once in four consecutive full runs (a 20 s timeout waiting for the clock to move on the first test after a fresh build) and passed on re-run and in every other run. It is a timing flake in the harness, not a playback regression; the same file passed immediately after.
- Catalogue search tests never assert live network results. Network failures are covered by unit-level error paths and by showing `errors[]` in the UI; live checks are manual (below).

## Supported audio formats (tested)

| Container | Scan + tags | Playback | Evidence |
| --- | --- | --- | --- |
| MP3 | yes | **verified** | e2e plays an encoded MP3, clock advances, duration 0:12 from stream |
| WAV (PCM) | yes, INFO tags | **verified** | e2e transports, tag and duration assertions |
| FLAC | yes, Vorbis comments, lossless flag | **verified** | e2e plays an encoded FLAC; duration comes from STREAMINFO |
| M4A / AAC | scanned | **not verified** | no encoder available to generate a fixture; Chromium's decoder is expected to handle it |
| OGG / Opus / WebM | scanned | **not verified** | same constraint |

Everything in the second group is accepted by the scanner and handed to Chromium; the app does not claim those formats as supported until playback is actually exercised. The Settings screen marks verified formats with ✓.

## Manual playback verification

Performed on the built app (`npm run build && npm start`) with a generated library:

1. Imported a folder containing MP3, WAV, FLAC plus deliberately broken files. Scan completed, 8 tracks added, 2 unreadable files flagged, 1 unsupported `.wma` counted, no crash.
2. Played an MP3: audio audible, position advanced, seek via the progress bar and via ←/→, volume keys worked.
3. Played a WAV and a FLAC: both audible, duration and seek correct.
4. Enabled the equalizer with the "Bass boost" preset: audible change in low end, playback continued, position kept advancing, position persisted.
5. Disabled the equalizer mid-track: output returned to flat without interruption.
6. Restarted the app: library, favorites, playlist, accent, equalizer curve and paused track position restored.
7. Killed the app while scanning: no partial/corrupt JSON; next start showed the previously scanned tracks.
8. Removed a file from disk and pressed "Verify files": counted as missing, library otherwise intact.

## Performance measurement

`npm run bench` generates 300 one-second WAV files in 10 albums and measures the real app:

| Metric | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Cold start to first view | 641 ms | 656 ms | 692 ms |
| Import (click → scan banner gone) | 1444 ms | 1364 ms | 1142 ms |
| Per track | 5 ms | 5 ms | 4 ms |
| Frame gap p50 / p95 | 7 / 21 ms | 7 / 14 ms | 7 / 13 ms |
| Frames over 120 ms | 2 | 2 | 2 (one at scan start, one at the final commit) |
| Longest single stall | 347 ms | 347 ms | 324 ms |

Interpretation: scanning is off the UI thread and the list is virtualised, so the median frame is unaffected. The two stalls are main-thread React commits — the scan banner mounting and the final 300-track snapshot landing at once. Both grow with library size, which is the reason the next step is a `startTransition` commit plus incremental album/artist derivation.

## Catalogue search manual check

`node scripts/check-discovery.mjs` launches the built app and calls the real IPC path:

```
=== haddix ===            searched openlibrary, gutenberg, librivox, archive — 45 results
  [openlibrary/book] Among the Hidden — Margaret Peterson Haddix (Borrow or preview)
  [openlibrary/book] Found — Margaret Peterson Haddix (Borrow or preview)
=== sherlock holmes ===   75 results, public-domain titles marked "Read online"
=== moonlight sonata ===  45 results
```

The `gutenberg` source returns results through the Internet Archive mirror because `gutendex.com` is unreachable from this network (it times out). The fallback is transparent and documented; the rights label says "Public domain (Project Gutenberg mirror)".
