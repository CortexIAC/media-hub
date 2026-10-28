# Bunny Media Hub — Sprint 1 report

Status: **complete for the defined Sprint 1 scope**, plus the requested equalizer and online catalogue/search work.

## 1. What was delivered

### Implemented and verified

- Desktop application (Electron 45 + React 19 + TypeScript) that launches independently.
- Frameless shell: sidebar, content area, persistent playback bar, Now Playing view, queue panel, search, settings, toasts, modals, keyboard shortcuts.
- Folder import, incremental scan in a worker thread, metadata + embedded artwork extraction, artwork cache.
- Real audio playback (MP3, WAV, FLAC verified) with seek, volume, mute, next/previous, shuffle, repeat off/all/one.
- Five-band Web Audio equalizer with presets, an independent extra-bass low shelf, and an output boost up to 300% behind a soft limiter; all persisted and verified to keep playback running.
- Lyrics from embedded tags, `.lrc`/`.txt` sidecars and LRCLIB, with synced-line highlighting in Now Playing.
- Fixed a silent-after-unpause bug: Chromium can suspend an idle AudioContext, which silences the element; the player now always resumes the graph before playback and on `statechange`.
- Queue add/remove/jump, playlists (create, rename, add, remove, reorder, delete), favorites.
- Persistence of library, playlists, favorites, settings, equalizer and the last session across restarts.
- Robust handling of missing files, unreadable folders, corrupt and empty files, and recognised-but-unsupported extensions.
- Virtual Library: Open Library, Project Gutenberg (+ Internet Archive mirror fallback), LibriVox, Internet Archive search; optional YouTube Data API search; results open in the browser.
- Online results also appear in global search, so artists outside the local library are no longer "not found".
- One-click Windows launcher (`launch.cmd`).

### Implemented but limited

- Search across public catalogues depends on third-party APIs; failures are displayed, never hidden.
- Equalizer has no per-track presets and no visual spectrum analyser.
- YouTube is search-only by design (policy), not playback.
- M4A/AAC/OGG/Opus/WebM are scanned but not playback-verified (no fixtures available).

### Planned, not implemented

Video playback, in-app browser tabs, Spotify/Apple Music, Cinejoy, network streams, downloads, Bunny Sync, device/multi-speaker sync, cloud accounts, subscriptions, AI playlists. Interfaces and capability documentation exist for these; no fake implementations.

## 2. Architecture summary

Layers are separated as required: application (renderer views/state/theme), core (models, queue, player controller, search, provider contracts, sync contracts), playback (`PlaybackBackend` + `HtmlAudioBackend` + Web Audio EQ), library (scanner worker, metadata, storage), provider layer (main-process catalogue clients), future sync layer (types only). See [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Build and test commands actually used

```bash
npm install
npm run typecheck        # clean
npm test                 # 97 tests / 7 files, pass
npm run build            # clean production build
npm run test:e2e         # 9 tests, pass, screenshots written
npm run bench            # startup + 300-track import numbers
node scripts/check-discovery.mjs   # live catalogue smoke test
```

## 4. Automated test results

- Unit/integration: **109 passed** (queue, player controller, search, discovery helpers, lyrics parsing, scanner, persistence, byte ranges).
- End-to-end: **9 passed** (launch, import, MP3 playback/transport, FLAC playback, lyrics, equalizer + bass/boost + AudioContext resume, Virtual Library, queue/favorites/playlists/search/settings, restart persistence, clean shutdown).
- One transient e2e timeout occurred once in four full runs; it passed on immediate re-run. Documented in [TESTING.md](TESTING.md).

## 5. Formats tested

Verified playback: **MP3, WAV, FLAC**. Scanned only: M4A, AAC, OGG, OGA, Opus, WebM. Explicitly recognised but unsupported: WMA, APE, ALAC, AIFF, WV, DSF, DFF, MIDI, M4P.

## 6. Manual playback verification

Real audio was audible for MP3, WAV and FLAC; seek, volume, next/previous and session restore were exercised by hand on the built app, including equalizer on/off mid-track. Details in [TESTING.md](TESTING.md).

## 7. Screenshots

`screenshots/01`–`13`: empty state, music library, album, now playing, queue, playlist, search, library, streams, settings, restored library, equalizer, virtual library.

## 8. Performance

Cold start ≈ 0.65–0.70 s. 300-track import ≈ 1.0–1.4 s (3–5 ms/track) with the scanner off the UI thread; p95 frame gap 13–21 ms. Two ~310–390 ms main-thread stalls were measured: scan start and the final library commit. Recorded as a known bottleneck.

## 9. Known defects and limitations

1. Final library commit is a single React update; it will become noticeable on very large libraries (planned: `startTransition`, incremental derivation).
2. Album grouping is by album + album-artist, so compilations can split into multiple album entries.
3. Gutendex is unreachable from this network; the Gutenberg source falls back to the Internet Archive mirror.
4. No in-app browser: catalogue and YouTube results open in the system browser.
5. Equalizer and boost are global (not per device or per track) and there is no analyser; aggressive boost settings can still sound loud even with the limiter.
6. Lyrics depend on LRCLIB coverage for tracks without local lyrics; instrumental detection comes from LRCLIB metadata only.
7. E2E playback assertions are timing-sensitive on a fresh build (two flakes observed across runs, both passing on re-run).
8. Artwork is cached at full embedded resolution; very large embedded images are stored as-is (12 MB cap).
9. No packaging/installer: `npm start` and `launch.cmd` run the app from source/build output.

## 10. Version control

The working tree is committed at the end of the sprint; see `git log --oneline` for the phase checkpoints (scaffold, core+runtime, UI, verification, docs).

## 11. Recommended Sprint 2 plan

1. **Player depth**: crossfade/gapless handling, ReplayGain, EQ per-device curve, sleep timer, play-count history.
2. **Library scale**: incremental snapshots (`startTransition`), smarter compilation grouping, duplicate detection, folder watch.
3. **Packaging**: electron-builder installer with code signing, auto-update channel, per-user install.
4. **Provider layer**: implement `RemoteProvider` for Internet Archive audio with real streaming into the local queue (the one source whose terms allow it), then evaluate PeerTube for video.
5. **Books**: reading view for public-domain EPUBs inside the app, plus Open Library borrowing hand-off.
6. **Sync groundwork**: device identity, session sharing over LAN, clock sync — after the interface is exercised by a second device.

## 12. Notes on the extra requests

- **Equalizer**: implemented with Web Audio biquad filters, persisted, verified with real playback.
- **"Mari Glock" not appearing**: the app previously searched only local files. Global search now also queries the online catalogues; copyrighted commercial music still requires Spotify/Apple Music authorisation (Premium) or a YouTube key for search results, because no legal free catalogue offers full-track streaming.
- **Cinejoy**: no public API or developer programme found for cinejoy.pk, so nothing is integrated; adding it needs a partner agreement.
- **Books**: the Virtual Library covers public-domain catalogues. *The Missing* (Margaret Peterson Haddix) is in copyright — Open Library links to legal borrowing, and a local library card via Libby/OverDrive is the free route.
