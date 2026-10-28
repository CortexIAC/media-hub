# Bunny Media Hub — Architecture

Sprint 1: Electron 45 (Chromium 156, Node 24) + React 19 + TypeScript, bundled by electron-vite.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Renderer (React, sandboxed, no Node)                                 │
│  views/ components/ theme/                                           │
│  state/data.tsx  state/player.tsx  state/youtube.tsx  state/ui.tsx   │
│  playback/audioEngine.ts  ── HTMLAudioElement + Web Audio EQ chain   │
│  components/YouTubeStage  ── one iframe, stage or dock              │
└───────────────▲──────────────────────────────┬───────────────────────┘
                │ contextBridge (window.bunny) │ bunny-media:// stream
┌───────────────┴──────────────────────────────▼───────────────────────┐
│ Main process                                                         │
│  ipc.ts ── storage/ (library, playlists, settings, session)          │
│  library/scannerService.ts ── Worker ── scanner.core.ts + metadata   │
│  mediaProtocol.ts ── range-aware streaming from disk                 │
│  providers/ ── Open Library, Gutenberg/mirror, LibriVox, IA, YouTube │
└──────────────────────────────────────────────────────────────────────┘
```

## Layers

### Core (`src/core`, no Electron, no React)

| Module | Responsibility |
| --- | --- |
| `models.ts` | `Track`, `Album`, folders, settings (including equalizer), format tables |
| `queue.ts` | Pure queue semantics: set, add, shuffle, repeat, move, remove |
| `player.ts` | `PlayerController`: playback lifecycle, transitions, error recovery, session restore. Talks to a `PlaybackBackend` interface |
| `playback.ts` | `PlaybackBackend` contract + events |
| `search.ts` | Normalisation and relevance-scored local search |
| `providers.ts` | Provider descriptors and capability catalogue (what each service permits) |
| `sync.ts` | Interfaces for a future synchronisation layer — types only, no fake networking |
| `discovery.ts` | Online catalogue result shape plus pure helpers (normalise, dedupe, filter) |

Core is unit-tested without a window: queue behaviour, repeat/shuffle, controller transitions, backend error recovery, search ranking and the discovery helpers all run under vitest.

### Playback

`HtmlAudioBackend` wraps a single `HTMLAudioElement` and implements `PlaybackBackend`. It is the only module that touches DOM audio.

The audio graph is `MediaElementSource → 5 × BiquadFilter → bass low-shelf → boost GainNode → limiter → destination`, created lazily from a user gesture whenever it is needed (EQ on, extra bass > 0 or boost > 100%). Important details:

- When nothing needs processing, no AudioContext is created at all, so audio takes the element's direct output path.
- If a graph exists and the equalizer is disabled later, all filter gains go to 0 dB (no silence) and the bass/boost stages keep working independently.
- The boost stage runs into a `DynamicsCompressorNode` configured as a soft limiter (−1.5 dB threshold, 20:1), so 2–3× gain clips gracefully instead of distorting.
- **Resuming after a pause**: Chromium may suspend an idle AudioContext, which would leave the element silent while the clock keeps running. `play()` always resumes an existing context, and a `statechange` listener re-resumes it if the element is still playing.
- If graph creation throws, the element keeps playing untouched and the failure is logged.

The renderer never sees filesystem paths. `bunny-media://track/<id>` resolves the id through the library index in the main process and streams with HTTP range support; `bunny-media://artwork/<file>` serves hash-named cached art after validating the filename. Missing files return 404, and unsatisfiable ranges fall back to the whole stream.

### Library

`ScannerService` owns a single `worker_threads` worker; a second scan is rejected instead of queued, which prevents duplicate background scans.

The worker walks folders (ignoring hidden directories, symlinks, recycle bins and `node_modules`), stats files, skips unchanged files by `mtime + size`, parses metadata with `music-metadata`, hashes and caches artwork once, and flushes tracks in batches of 15 (or 300 ms). Progress is throttled to one IPC message per 120 ms. Cancellation is checked between entries.

Unreadable files still produce a track record flagged `unreadable`, so the UI can show the failure rather than silently dropping it. Scans keep tracks for folders that are currently unplugged until the user removes the folder.

### Lyrics

Lyrics resolved in two stages, both in the main process where the file and network access live:

1. **Local** — the scanner stores a `.lrc` sidecar (preferred, usually synced), an embedded lyrics tag (`USLT`, `LYRICS`), or a `.txt` sidecar on the track record.
2. **LRCLIB** — when no local lyrics exist, the main process asks LRCLIB for an exact match and then a search, caching both hits and misses per track.

The renderer parses LRC timestamps with `core/lyrics.ts` (pure, unit-tested), highlights the active line from the playhead and scrolls it into view.

### Storage

Four JSON stores (`JsonFile`) with atomic temp-file writes, corrupt-file quarantine, and schema sanitising on load. Nothing is written on every state tick: the renderer persists the playback session every 5 s and on hide/quit.

### Providers and catalogue search

`src/main/providers/` performs all network I/O in the main process. Each source has a bounded timeout (5.5–9 s), a descriptive User-Agent, and no retry loop. `searchCatalogues` fans out with `Promise.allSettled`, so one failing service never blanks the results: failures come back as `errors[]` and are shown in the UI.

YouTube has two search paths in `providers/youtube.ts`: the documented Data API v3 when the user supplies a key, and otherwise the same public `/youtubei/v1/search` request YouTube's own web player sends (no key, no account). A failing key falls back to the keyless path instead of blanking the results. Search payloads are parsed by the pure `core/youtube.ts` parser, so the shaping logic is unit-tested without a network call.

Playback never leaves YouTube's own player: `components/YouTubePlayer` embeds the IFrame API, and the app only calls documented player methods (`playVideo`, `pauseVideo`, `seekTo`, `setVolume`). No stream URL is requested or produced — that is a deliberate policy decision, documented in [PROVIDER-FEASIBILITY.md](PROVIDER-FEASIBILITY.md) and [YOUTUBE.md](YOUTUBE.md).

### Network streams

A saved stream is a URL, an inferred kind and a name (`core/streams.ts`). On first launch `core/streamSeeds.ts` supplies a curated set of publicly available links (public radio, NASA TV, Internet Archive public-domain film and audiobooks); `storage/streamStore.ts` records `seededAt` so deleting a suggestion is permanent instead of being undone on the next start. Everything that decides what a link *is* is pure and unit tested:

- `normalizeStreamUrl` accepts http(s) only, so torrent/magnet and `file:` links never reach the player;
- `parsePlaylist` expands M3U and PLS channel lists but deliberately refuses to expand an HLS playlist, whose entries are three-second media segments rather than channels;
- `classifyStream` decides between HLS, progressive media and containers Chromium cannot demux (MKV, AVI, MPEG-TS, HEVC), with the reason shown in the UI instead of a bare decoder error;
- `rewriteHlsPlaylist` routes every URI in a playlist — variants, segments, `EXT-X-KEY`, `EXT-X-MAP`, `EXT-X-PART` — back through the app's proxy.

Media never touches the renderer's network stack. `main/streamProtocol.ts` registers `bunny-stream://proxy/<encoded url>`, fetches the target with `net.fetch`, forwards `Range`/`Content-Range` so seeking works, and pipes the body through. HLS playlists are read, rewritten against the response's final URL (after redirects) and returned as `application/vnd.apple.mpegurl`.

The proxy exists for three reasons rather than convenience: the content security policy can stay closed (one scheme instead of wildcard `https:`), responses are CORS-enabled so Web Audio can read them at all, and the renderer still makes no direct network requests. `hls.js` consumes the same scheme for `.m3u8`, with its worker disabled because the policy permits scripts only from `'self'`.

The player element is mounted once by the shell (`components/StreamStage.tsx`), exactly like the YouTube host: the large stage on the Streams screen, a corner dock everywhere else, so a stream keeps playing while you browse. Chromium cannot decode MKV/AVI/MPEG-TS/HEVC, so those links are handed to VLC (`main/externalPlayer.ts`) rather than being faked.

Mutual exclusion is explicit: starting a stream pauses local playback and stops YouTube; starting either of those stops the stream.

### YouTube session and the docked player

YouTube playback outlives any single view, so its state is not owned by a view:

- `state/youtube.tsx` holds the current video, the queue and the back-stack, saved videos and history, and the player's reported state. `core/youtubeQueue.ts` performs the transitions as pure functions, so next/previous/play-all/enqueue/end have unit tests and no player is needed to test them.
- `components/YouTubeStage.tsx` is the only mounted player. The shell renders it inside `.content`; on the Video route it is a flex item (`is-stage`, ~50vh tall) and everywhere else it is `position: fixed` in the bottom-right (`is-dock`, 384 px wide). Switching routes changes classes only, so the `<iframe>` and its playback are untouched.
- The global search field and the Video screen both feed the same session, which is why a video started from search keeps playing while you browse the library.
- The main process reports window visibility (`window:visibility`) on `minimize`/`hide`/`restore`/`show`, because a minimised Electron window still reports `document.visibilityState === 'visible'`. The player pauses when the window leaves the screen: YouTube's terms do not permit background playback.
- Starting a video also calls `playVideo()` on `onReady` (with `autoplay: 1`), so the click that selects a result is the only click needed.

### Application shell

- Custom frameless window with native window controls via IPC.
- Routes are a discriminated union in `state/types.ts`; no router dependency.
- Theme tokens live in `styles/theme.css`; the accent is a single CSS variable (`--accent`) that a future BunnyOS appearance service can set.
- Keyboard shortcuts: Space, Ctrl/⌘+←/→, arrows, ↑/↓, M/S/R, Ctrl+F, Ctrl+I, Ctrl+Shift+Q.

## Security boundaries

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Preload exposes a narrow typed API (`window.bunny`); no ipcRenderer passthrough.
- CSP locks scripts to `'self'` plus the YouTube IFrame API, media to `bunny-media:`/`bunny-stream:`/`blob:`, and frames to the YouTube embed domains. The policy is applied only to the app document, never to the embedded player's own document. No wildcard remote origin is allowed: network media is only ever addressed through the proxy scheme.
- In production the built renderer is served from a loopback HTTP origin (`main/rendererServer.ts`, bound to 127.0.0.1 on a random port). A `file://` page has no origin or referrer, which the YouTube embed rejects; loopback keeps `contextIsolation`/`sandbox` unchanged and is unreachable from other machines.
- Both custom schemes (`bunny-media:` for local files, `bunny-stream:` for remote streams) send `Access-Control-Allow-Origin` and are registered with CORS enabled. Web Audio refuses to read samples from cross-origin media, so without CORS the equalizer/boost graph silently mutes every track.
- Permission requests (camera, microphone, notifications) are denied.
- External navigation is blocked; only validated http(s) URLs are handed to `shell.openExternal`.
- The renderer performs no network requests: catalogue search, media reads and file access all happen in the main process.

## Deliberate omissions

These exist as interfaces or documentation, never as fake implementations:

- `sync.ts` defines device identity, timeline and clock-sync shapes; no transport is implemented.
- `providers.ts` describes Spotify, Apple Music, YouTube and Cinejoy capability by capability; only the catalogue sources listed above are wired up.
- In-app browsing and downloads are not implemented. Network streams play from a URL the user supplies: there is no catalogue, indexer or tracker integration, and saved streams are URLs only (`storage/streamStore.ts`). YouTube queue and history live in `storage/youtubeStore.ts`; YouTube playlists do not exist yet (the playlist store is track-id based).

## Known performance characteristics

Measured on Windows 11 (see [TESTING.md](TESTING.md)):

- cold start ≈ 0.65–0.70 s;
- 300-track WAV import ≈ 1.0–1.4 s (3–5 ms per file), scanner on a worker thread;
- p95 frame gap during the import 13–21 ms, with two single stalls of ~310–390 ms (scan start and the final library commit).

The final commit cost grows with library size because the whole snapshot is replaced in one React update; a `startTransition`-based commit is the planned mitigation.
