# Bunny Media Hub — Sprint 1 report

Status: **complete for the defined Sprint 1 scope**, plus the requested equalizer, online catalogue/search work and network stream playback.

## 1. What was delivered

### Implemented and verified

- Desktop application (Electron 45 + React 19 + TypeScript) that launches independently.
- Frameless shell: sidebar, content area, persistent playback bar, Now Playing view, queue panel, search, settings, toasts, modals, keyboard shortcuts.
- Folder import, incremental scan in a worker thread, metadata + embedded artwork extraction, artwork cache.
- Real audio playback (MP3, WAV, FLAC verified) with seek, volume, mute, next/previous, shuffle, repeat off/all/one.
- Five-band Web Audio equalizer with presets, an independent extra-bass low shelf, and an output boost up to 300% behind a soft limiter; all persisted and verified to keep playback running.
- Lyrics from embedded tags, `.lrc`/`.txt` sidecars and LRCLIB, with synced-line highlighting in Now Playing.
- Fixed a silent-after-unpause bug: Chromium can suspend an idle AudioContext, which silences the element; the player now always resumes the graph before playback and on `statechange`.
- Fixed the real cause of "playing but no sound" with the equalizer on: Web Audio outputs silence for cross-origin media, and `bunny-media://` was cross-origin to the renderer, so any EQ/bass/boost setting muted every track while the clock advanced. The scheme is now CORS-enabled with `Access-Control-Allow-Origin`, the element loads with `crossOrigin='anonymous'`, and the e2e suite measures samples at the output node.
- YouTube pipeline: keyless search (no key, no account), optional Data API path with fallback, real embedded playback of the selected video, queue/next/previous, saved videos and recent history. The renderer is served from a loopback HTTP origin so the embed has a valid origin and referrer.
- Queue add/remove/jump, playlists (create, rename, add, remove, reorder, delete), favorites.
- Persistence of library, playlists, favorites, settings, equalizer and the last session across restarts.
- Robust handling of missing files, unreadable folders, corrupt and empty files, and recognised-but-unsupported extensions.
- Virtual Library: Open Library, Project Gutenberg (+ Internet Archive mirror fallback), LibriVox, Internet Archive search; catalogue results open in the browser.
- Online results also appear in global search, so artists outside the local library are no longer "not found".
- Network streams: paste a direct media URL, an HLS playlist or an M3U/PLS channel list; links are probed before saving, channel lists expand into entries, media is proxied through `bunny-stream:` with range support, and containers Chromium cannot decode (MKV/AVI/MPEG-TS/HEVC) hand off to VLC. The player docks so a stream keeps playing while browsing.
- One-click Windows launcher (`launch.cmd`).

### Implemented but limited

- Search across public catalogues depends on third-party APIs; failures are displayed, never hidden.
- Equalizer has no per-track presets and no visual spectrum analyser.
- YouTube: search, embedded playback, queue, saved videos and recent history work; YouTube playlists and a persistent YouTube queue do not exist yet. See [YOUTUBE.md](YOUTUBE.md).
- M4A/AAC/OGG/Opus/WebM are scanned but not playback-verified (no fixtures available).

### Planned, not implemented

A browsable video catalogue beyond YouTube, in-app browser tabs, Spotify/Apple Music, Cinejoy, torrent/indexer APIs, downloads, Bunny Sync, device/multi-speaker sync, cloud accounts, subscriptions, AI playlists. Interfaces and capability documentation exist for these; no fake implementations.

## 2. Architecture summary

Layers are separated as required: application (renderer views/state/theme), core (models, queue, player controller, search, provider contracts, sync contracts), playback (`PlaybackBackend` + `HtmlAudioBackend` + Web Audio EQ), library (scanner worker, metadata, storage), provider layer (main-process catalogue clients), future sync layer (types only). See [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Build and test commands actually used

```bash
npm install
npm run typecheck        # clean
npm test                 # 157 tests / 11 files, pass
npm run build            # clean production build
npm run test:e2e         # 9 tests, pass, screenshots written
npm run bench            # startup + 300-track import numbers
node scripts/check-discovery.mjs   # live catalogue smoke test
node scripts/check-youtube.mjs     # live YouTube search → embedded playback
node scripts/check-streams.mjs     # live streams: loopback server, M3U import, HLS playback
```

## 4. Automated test results

- Unit/integration: **157 passed** (queue, player controller, search, discovery helpers, lyrics parsing, YouTube search parsing, network stream parsing/HLS rewriting, scanner, persistence, byte ranges).
- Live stream harness: **14/14 checks** — M3U import, real audio through the proxy, playback surviving navigation, MKV hand-off, HLS rewriting, and real HLS playback through hls.js.
- End-to-end: **9 passed** (launch, import, MP3 playback/transport, FLAC playback, lyrics, equalizer + bass/boost + AudioContext resume, Virtual Library, queue/favorites/playlists/search/settings, restart persistence, clean shutdown).
- One transient e2e timeout occurred once in four full runs; it passed on immediate re-run. Documented in [TESTING.md](TESTING.md).

## 5. Formats tested

Verified playback: **MP3, WAV, FLAC**. Scanned only: M4A, AAC, OGG, OGA, Opus, WebM. Explicitly recognised but unsupported: WMA, APE, ALAC, AIFF, WV, DSF, DFF, MIDI, M4P.

## 6. Manual playback verification

Real audio was audible for MP3, WAV and FLAC; seek, volume, next/previous and session restore were exercised by hand on the built app, including equalizer on/off mid-track. Details in [TESTING.md](TESTING.md).

## 7. Screenshots

`screenshots/01`–`14`: empty state, music library, album, now playing, queue, playlist, search, library, streams, settings, restored library, equalizer, virtual library, and YouTube search + embedded playback. `15`–`17`: YouTube stage, docked playback and search results. `18`–`20`: stream stage with real audio, docked stream, and the MKV hand-off state.

## 8. Performance

Cold start ≈ 0.65–0.70 s. 300-track import ≈ 1.0–1.4 s (3–5 ms/track) with the scanner off the UI thread; p95 frame gap 13–21 ms. Two ~310–390 ms main-thread stalls were measured: scan start and the final library commit. Recorded as a known bottleneck.

## 9. Known defects and limitations

1. Final library commit is a single React update; it will become noticeable on very large libraries (planned: `startTransition`, incremental derivation).
2. Album grouping is by album + album-artist, so compilations can split into multiple album entries.
3. Gutendex is unreachable from this network; the Gutenberg source falls back to the Internet Archive mirror.
4. No in-app browser: catalogue results open in the system browser. YouTube now plays in the embedded player instead. YouTube playlists and a queue that survives restarts are not implemented.
4b. The keyless YouTube search endpoint is undocumented and may change; a Data API key is the supported fallback.
5. Equalizer and boost are global (not per device or per track) and there is no analyser; aggressive boost settings can still sound loud even with the limiter.
6. Lyrics depend on LRCLIB coverage for tracks without local lyrics; instrumental detection comes from LRCLIB metadata only.
7. E2E playback assertions are timing-sensitive on a fresh build (two flakes observed across runs, both passing on re-run).
8. Artwork is cached at full embedded resolution; very large embedded images are stored as-is (12 MB cap).
9. No packaging/installer: `npm start` and `launch.cmd` run the app from source/build output.
10. Streams: the VLC hand-off is not automated in the harness (it would open a real player window); encrypted HLS, alternative audio renditions and DRM-protected sources are not exercised. Stream servers that require a Referer or a browser User-Agent are refused by design. No torrent/magnet or indexer support.

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
- **"Mari Glock" not appearing**: the app previously searched only local files. Global search now also queries the online catalogues, and the Video screen searches YouTube without any key. Copyrighted commercial music still cannot be streamed as audio by any legal free catalogue; YouTube play happens in YouTube's own player.
- **YouTube while browsing**: the player is now mounted once by the shell and docks to the corner on every other screen, so a video keeps playing while you browse (and global search returns playable YouTube results). It pauses when the window is minimised — that is the line YouTube's API terms draw, not a missing feature. True background playback is not available under those terms.
- **Cinejoy**: no public API or developer programme found for cinejoy.pk, so nothing is integrated; adding it needs a partner agreement.
- **Network streams / "the VLC aspect"**: implemented as a real player for links you supply — direct media, HLS and M3U/PLS lists — with a VLC hand-off for containers Chromium cannot decode. It is not a "search the internet for a stream" feature: indexer APIs, torrent/magnet links and scraped endpoints are deliberately absent, so the app never becomes a content source it cannot justify. Formats verified: HLS (public test stream) and WAV (local server) play in-app; MKV is refused in-app and offered to VLC.
- **Books**: the Virtual Library covers public-domain catalogues. *The Missing* (Margaret Peterson Haddix) is in copyright — Open Library links to legal borrowing, and a local library card via Libby/OverDrive is the free route.
