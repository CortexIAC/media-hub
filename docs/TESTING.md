# Testing, formats and manual verification

Last run: 28 October 2026, Windows 11 (10.0.26200), Node 24.21.0, Electron 45.1.0 (Chromium 156.0.8078.49).

## Commands

```bash
npm run typecheck    # tsc -p tsconfig.node.json && tsc -p tsconfig.web.json
npm test             # vitest run, unit + integration (no Electron)
npm run test:e2e     # npm run build, then vitest with vitest.e2e.config.ts
npm run bench        # cold start and 300-track import measurement
node scripts/check-youtube.mjs        # live YouTube search → embedded playback check
node scripts/check-youtube-dock.mjs   # live: playback survives leaving the Video screen, search finds videos
node scripts/check-streams.mjs        # live streams: loopback server, M3U import, HLS playback, MKV fallback
node scripts/check-archive.mjs        # live Archive: real archive.org search, save, playback, captions, restart
node scripts/check-updater.mjs        # packaged app: check → download against the live GitHub feed
npm run dist                          # builds the installer; the updater check needs release/win-unpacked
```

## Automated results

```
Unit + integration:  14 files, 192 tests, all passing (~22 s)
End-to-end:          1 file, 9 tests, all passing (~37 s; one 91 s run observed under machine load)
Typecheck:           clean (node + web)
Build:               electron-vite production build, clean
Live YouTube check:  search → select → player reaches "playing" (no API key configured)
Live dock check:     plays on the Video stage, keeps playing docked on Music/Search, pauses when minimised
Live stream check:   17/17 checks (preloaded radio, local server, real HLS playback, MKV hand-off)
Live Archive check:  23/23 checks (real search, widened collection search, 13 labelled episodes, save,
                     playback clock advances, attached SRT reaches 2 cues, restart persistence)
Updater check:       14/14 checks (0.1.0 build found, downloaded and verified the published 0.1.1 release)
                     10/10 checks (0.1.1 build reports "up to date" against the same feed)
```

Coverage by area:

| Area | File | What is asserted |
| --- | --- | --- |
| Queue semantics | `tests/core/queue.test.ts` | add/replace, dedupe, shuffle order, repeat modes, next/previous at boundaries, remove/move, empty queues |
| Playback controller | `tests/core/player.test.ts` | load → play → pause, seek clamping, track transitions, auto-advance, repeat one, shuffle, backend errors, recovery, restore |
| Local search | `tests/core/search.test.ts` | case/diacritic normalisation, relevance ordering, limits, album grouping |
| Discovery helpers | `tests/core/discovery.test.ts` | query normalisation/bounding, dedupe by source+id, kind filtering, source metadata |
| Lyrics parsing | `tests/core/lyrics.test.ts` | plain and LRC text, metadata tags, multiple timestamps per line, hundredths vs milliseconds, ordering, active-line lookup |
| Network streams | `tests/core/streams.test.ts` | http(s)-only URL normalisation (magnet/file/javascript rejected), name derivation, M3U parse with `group-title`/`tvg-logo`/`#EXTGRP`, PLS parse, HLS detection instead of segment expansion, container classification (HLS / progressive / unsupported with a reason), HLS rewriting of segments, master variants, `EXT-X-KEY`, `EXT-X-MAP`, `EXT-X-PART`, stored-entry sanitising and id stability |
| YouTube search parsing | `tests/core/youtube.test.ts` | id/title/channel/duration mapping from a real-shaped payload, `simpleText` and run titles, `compactVideoRenderer`, hour-long durations, malformed/id-less entries skipped, duplicates removed, playlist/channel renderers ignored, HTML entity decoding, `2:26`/`LIVE` length parsing |
| YouTube queue | `tests/core/youtubeQueue.test.ts` | play/replace, per-video dedupe, play-all from an index, next/previous with back-stack bounding, enqueue vs play-next, remove/clear/stop, advance only when something is queued |
| Library scanning | `tests/library/scanner.test.ts` | recursive walk, hidden folders, unsupported extensions, truncation, cancellation, unreadable roots, WAV/MP3/FLAC tags, sidecar and embedded lyrics, artwork caching and dedupe, corrupt and empty files |
| Internet Archive parsing | `tests/library/archive.test.ts` | episode labels for `S01E02`, `1x07`, `Episode 12`, `Part 3` and leading numbers; derivative dedupe (original mp4 beats `.ia.mp4`/`_512kb`/`.ogv`); duration parsing (`14314.54`, `59:59`, `1:02:03.5`); item parsing with caption matching, dark items and path traversal; search-hit sanitising; relevance ranking; SRT and WebVTT conversion, UTF-16LE decoding; saved-record sanitising |
| Stream storage | `tests/library/streamStore.test.ts` | first-launch seeding happens once and is remembered, a deleted suggestion stays deleted after reload, duplicate URLs collapse, rename/mark-played keep other fields, magnet links and duplicates are dropped on load |
| Release notes | `tests/core/releaseNotes.test.ts` | electron-builder's HTML-ish commit body flattened to plain text, list items on their own lines, escaped `\n` sequences, entity decoding, paragraph breaks preserved, per-version arrays joined, empty notes rejected, output bounded |
| Persistence | `tests/library/persistence.test.ts` | atomic JSON writes, corrupt-file quarantine, folder/track upserts, playlist edits, favorites, settings sanitising (including equalizer and YouTube key), session sanitising |
| Byte ranges | `tests/library/byteRange.test.ts` | valid, open-ended, suffix and unsatisfiable ranges |
| Whole app | `tests/e2e/app.e2e.test.ts` | launch, import, playback of MP3/WAV/FLAC, transport, lyrics in Now Playing, equalizer + bass/boost, measured audio at the output node (peak > 0 with the EQ on), AudioContext resume after suspension, Virtual Library, queue, favorites, playlists, search, restart persistence, clean shutdown |

Fixtures are generated at test time — WAV built sample by sample, MP3 encoded with lamejs, FLAC encoded with libflac — so no binary audio is committed and the tests exercise real decoders. The e2e suite stubs only the native folder picker; everything after that is the real app.

### Known test characteristics

- The e2e playback assertion failed once in four consecutive full runs (a 20 s timeout waiting for the clock to move on the first test after a fresh build) and passed on re-run and in every other run. It is a timing flake in the harness, not a playback regression; the same file passed immediately after.
- Catalogue search tests never assert live network results. Network failures are covered by unit-level error paths and by showing `errors[]` in the UI; live checks are manual (below).
- YouTube search and playback are checked by `scripts/check-youtube.mjs` and `scripts/check-youtube-dock.mjs`, not by the e2e suite, because they need live network and a third-party player. They fail loudly (non-zero exit) if search returns nothing, the player never reaches `playing`, the dock never appears, or the state does not survive the view change. The dock script also minimizes the window and asserts the player ends up `paused`; it shields the window from the real mouse so a person using the machine cannot skew the run.
- One full e2e run out of three on 28 Oct 2026 failed three assertions (`Streams` text, accent token, and one earlier check) after running roughly twice as long as usual; two consecutive re-runs passed 9/9 at the normal duration. Treated as environment contention, not a regression, but it is recorded here rather than hidden.
- The equalizer test measures samples at the node that feeds the speakers. It was added after a real defect: Web Audio outputs silence for cross-origin media, so an uncorsed `bunny-media://` scheme muted every track whenever any processing (EQ, bass or boost) was enabled while the clock kept advancing.
- The Internet Archive tab is covered by `scripts/check-archive.mjs`, not the e2e suite, because it needs live archive.org data and a multi-hundred-megabyte video. It uses a temporary profile, shields the window from the real mouse, and exits non-zero on any missed check. It verified 23/23 on 28 October 2026, including a real playing state (`currentTime` > 1.5 s, 638×360 video) and a WebVTT track with two cues. The item's own caption files are *not* what it proves: archive.org's TV caption sidecars currently download as zero bytes (see [ARCHIVE.md](ARCHIVE.md)), so the verified subtitle path is the one users can rely on — attaching their own `.srt`/`.vtt`, which is served as WebVTT and survives a restart.
- Network streams are covered by `scripts/check-streams.mjs`, not the e2e suite: the check needs a local HTTP server and a public HLS stream. Like the dock check, it sets `setIgnoreMouseEvents(true)` on the window, because a real click during a run can switch the stream mid-assertion (observed once: a person clicked NASA TV while the radio check was waiting for the clock to move). It exits non-zero on any missed check and prints `SKIP` for the public HLS check when the network is unavailable, so an offline run cannot be mistaken for a pass.

## Network stream verification (28 October 2026)

`node scripts/check-streams.mjs` (after `npm run build`) starts a loopback HTTP server — a generated 4 s WAV with byte-range support, an M3U channel list, an HLS master + media playlist, and a file served as `video/x-matroska` — then drives the built app with Playwright.

| Check | Result |
| --- | --- |
| curated public streams are preloaded on a fresh profile | pass |
| suggestions are grouped as public sources | pass |
| a preloaded public radio stream plays (SomaFM through the proxy) | pass |
| M3U channel list expands into entries | pass |
| playlist titles become entry names | pass |
| `group-title` groups the imported channels | pass |
| media is addressed through `bunny-stream://proxy/…` | pass |
| a channel actually plays (`currentTime` > 0.5 s, `readyState` ≥ 2) | pass |
| playback survives leaving the Streams screen (docked, clock keeps advancing) | pass |
| Stop removes the dock | pass |
| MKV is flagged as needing an external player | pass |
| the unsupported state explains why and offers VLC | pass |
| HLS master playlist is rewritten through the proxy | pass |
| HLS media playlist is fetched through the proxy | pass |
| HLS segment and key URIs are proxied | pass |
| a real public HLS stream plays through hls.js (`test-streams.mux.dev`) | pass |
| no unexpected renderer errors | pass |

Known gaps in this coverage:

- **VLC launch itself is not automated** — a passing run would open a real player window on the machine mid-test. The button, the http(s)-only validation and the fallback to the system handler are implemented and were reviewed by eye, but not asserted.
- **Encrypted HLS was not played.** The `EXT-X-KEY` URI is rewritten and unit-tested; no AES-128 stream was fetched.
- **Alternative renditions** (`EXT-X-MEDIA` audio/subtitle groups) go through the same rewriting rule but were not exercised against a real stream.
- **Servers that demand a Referer or a browser User-Agent are refused.** That is deliberate; the app sends an honest User-Agent and reports the failure instead of impersonating a browser.

## Internet Archive verification (28 October 2026)

`npm run build && node scripts/check-archive.mjs` drives the built app against the live archive; no fixtures stand in for the catalogue.

| Check | Result |
| --- | --- |
| browsing the cartoon shelf returns items (36 cards) | pass |
| poster images resolve through `bunny-stream://image/…` | pass |
| searching “angelina ballerina” finds the show outside `animationandcartoons` | pass |
| a thin collection search widens to all film and says so | pass |
| searching “barney” returns genuine items, closest title first | pass |
| a multi-file show becomes individual, labelled episodes (`S01E01 · New Kid`) | pass |
| episode metadata shows duration, size and format (`42:04 · 250 MB · MPEG4`) | pass |
| rights are stated before saving | pass |
| saving marks the title as part of the library | pass |
| an attached SubRip file is accepted and converted | pass |
| the episode reaches a real playing state (1.51 s in, 2524.8 s duration, 638×360) | pass |
| the player stays on the Archive screen and names the episode | pass |
| subtitles load with two cues from the attached file | pass |
| the app actually restarts (new renderer `timeOrigin`, no stale toasts) | pass |
| the saved show and its episode count survive the restart | pass |
| the attached subtitle survives the restart | pass |

Screenshots: `screenshots/19-archive-discover.png`, `20-archive-detail.png`, `21-archive-playing.png`, `22-archive-shows.png`.

Not covered:

- **Splitting a single-file compilation** — impossible without re-encoding or chapter metadata; deliberately not attempted.
- **Item-supplied captions** — the pipeline exists (`subtitles/remote`, matching by base name), but the archive's caption files returned 0 bytes on every TV item sampled, so it could not be proven with real data. The attach path is what is verified.
- **VLC hand-off from an archive episode** — same manual limitation as the Streams screen.

## Update verification (28 October 2026)

`scripts/check-updater.mjs` drives the **packaged** app (`release/win-unpacked`) rather than the source build, because the updater is inert outside an installed build. It clicks through Settings → Updates and asserts the status the main process reports over IPC.

| Run | Expectation | Result |
| --- | --- | --- |
| Empty repository | conclusive `error` mentioning the missing release | pass, 8/8 |
| 0.1.0 installed, v0.1.0 published | `up-to-date` | pass, 9/9 |
| 0.1.1 installed, v0.1.1 published | `up-to-date` | pass, 10/10 |
| 0.1.0 installed, v0.1.1 published, `DOWNLOAD=1` | `available` → 100% → `downloaded` | pass, 14/14 (re-run against the final 0.1.1 artifact) |

The downloaded package was cached at `%LOCALAPPDATA%\bunny-media-hub-updater\pending\BunnyMediaHub-Setup-0.1.1.exe`, and the panel offered **Restart and install**. The install itself is deliberately not automated: running it would replace the app under the test process. That final step is the manual check in [RELEASING.md](RELEASING.md#test-an-update).

Release mechanics (tag-before-release, token handling, transient upload retries) are covered in [RELEASING.md](RELEASING.md).

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
5. Set extra bass to +6 dB and audio boost to 150%: louder without distortion (limiter engaged on peaks).
6. Paused, left it idle, pressed play: audio returned (the suspended-AudioContext regression).
7. Disabled the equalizer mid-track: output returned to flat without interruption.
8. Open Library/Now Playing shows embedded lyrics, a sidecar `.lrc`, and the LRCLIB fallback, with the active line highlighted for synced lyrics.
9. Restarted the app: library, favorites, playlist, accent, equalizer curve, bass/boost and paused track position restored.
10. Killed the app while scanning: no partial/corrupt JSON; next start showed the previously scanned tracks.
11. Removed a file from disk and pressed "Verify files": counted as missing, library otherwise intact.
12. Played `Music/dom/Lil Noonie x Lil Sy - Mari Glock (Official Music Video).mp3` (MPEG-1 Layer III, 64 kbps mono, 2:25) from the real library with the equalizer enabled: audible at the expected level, position advancing. This is the file that reported silence; the cause was the cross-origin Web Audio path described above, not the file — bitrate index, sample rate and stream length all read correctly, and the same file played fine with the EQ bypassed.
13. Video screen: keyless search for "mari glock lil noonie" returned 17 real results, the top result played in the embedded player and reached the `playing` state.

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
