# Dependency and licence inventory

Verified against `package.json` / `package-lock.json` and the installed `node_modules` on 28 October 2026. No dependency was added for the Internet Archive tab: search, metadata, episode parsing, subtitle conversion and storage use built-in `fetch`/`TextDecoder` and the existing JSON store.

Two dependencies were added for packaging and updates: `electron-updater` (ships with the app, MIT) and `electron-builder` (build-time only, MIT). electron-builder's own dependency tree, including the NSIS and 7-Zip binaries it downloads on first use, is build tooling and is not part of the installed application.

## Runtime dependencies (shipped inside the app bundle)

| Package | Version | Licence | Role |
| --- | --- | --- | --- |
| electron | 45.1.0 | MIT | Desktop runtime (Chromium 156, Node 24.22) |
| react | 19.3.1 | MIT | UI |
| react-dom | 19.3.1 | MIT | UI rendering |
| music-metadata | 12.3.2 | MIT | Tag, duration and artwork parsing |
| hls.js | 1.7.3 | Apache-2.0 | HLS (`.m3u8`) playback in the renderer; loaded as a separate lazily-imported chunk |
| electron-updater | 6.8.11 | MIT | Update checks, downloads and install hand-over in the main process. Required at runtime from `node_modules` (bundled into the asar, not inlined into `out/main`) |

Bundled transitively by the above (all permissive):

- **MIT** — `@borewit/text-codec`, `@tokenizer/inflate`, `@tokenizer/token`, `content-type`, `debug`, `file-type`, `media-typer`, `ms`, `strtok3`, `token-types`, `uint8array-extras`, `win-guid`, `scheduler`; from the updater: `builder-util-runtime`, `fs-extra`, `jsonfile`, `js-yaml`, `lazy-val`, `lodash.escaperegexp`, `lodash.isequal`, `tiny-typed-emitter`, `universalify`
- **BSD-3-Clause** — `ieee754`
- **ISC** — `graceful-fs`, `semver`
- **BlueOak-1.0.0** — `sax` (via `js-yaml`)
- **Python-2.0** — `argparse` (via `js-yaml`)

No GPL, LGPL or AGPL code is present in the shipped bundle.

## Development and test dependencies (not shipped)

| Package | Version | Licence | Role |
| --- | --- | --- | --- |
| electron-vite | 6.0.0 | MIT | Build tooling |
| vite | 8.3.5 | MIT | Bundler |
| vitest | 5.0.5 | MIT | Test runner |
| typescript | 5.9.3 | Apache-2.0 | Types |
| @vitejs/plugin-react | 6.1.2 | MIT | JSX transform |
| @types/node, @types/react, @types/react-dom | — | MIT | Type declarations |
| playwright-core | 1.64.1 | Apache-2.0 | Drives Electron in e2e tests and in `scripts/check-*.mjs` |
| electron-builder | 26.18.0 | MIT | Windows NSIS installer, icon/version resources, GitHub release upload |
| @breezystack/lamejs | 1.2.7 | LGPL-3.0 | MP3 **fixture encoding only** (test helper) |
| libflacjs | 5.6.0 | MIT | FLAC **fixture encoding only** (test helper) |

`@breezystack/lamejs` is LGPL-3.0 but never linked into the application: it is imported solely by `tests/helpers/audio-fixtures.ts`, which runs in Node during tests. It does not appear in `out/`. If the project ever ships its own MP3 encoder, its licence obligations must be revisited.

## Platform components

- **Chromium/Electron**: Electron's default ffmpeg build includes proprietary codecs (AAC, H.264) under the corresponding patent licences. Distribution of an Electron app is subject to Electron's MIT licence plus the Chromium third-party licence set shipped with the runtime.
- **Fonts/artwork**: no third-party fonts or artwork are bundled. Album art is read from the user's files; placeholder covers are generated CSS gradients.
- **No telemetry, analytics or crash-reporting SDKs** are present.

## Data and network services

| Service | What is used | Key required | Terms |
| --- | --- | --- | --- |
| Open Library | `search.json` read API | no | Open Library API; catalogue data is CC0 |
| Project Gutenberg | Gutendex (`gutendex.com`) | no | Gutendex is a community mirror of Gutenberg metadata |
| Internet Archive | `advancedsearch.php` (title search), `metadata/{identifier}` (item detail), `services/img/{identifier}` (posters), `download/{identifier}/{file}` (episode and caption playback through the app's proxy) | no | IA developer APIs; per-item/uploader rights apply. The app streams, never downloads; posters and captions are fetched only from archive.org |
| LibriVox | IA collection `librivoxaudio` | no | Public-domain recordings |
| YouTube | keyless `/youtubei/v1/search` (the request YouTube's own web player sends) plus optional Data API v3 `search.list` / `videos.list`; oEmbed for pasted links | no (key optional) | YouTube API Services Terms + Developer Policies. Playback only inside the official embedded IFrame player; no stream extraction, no background playback. The keyless search endpoint is undocumented and can change without notice — a key is the supported fallback |
| LRCLIB | `/api/get`, `/api/search` | no | Free, open lyrics service ([lrclib.net](https://lrclib.net)); only title/artist/album/duration are sent |
| User-supplied stream URLs | HTTP(S) GET with byte-range support, proxied through `bunny-stream:` | no | Whatever the source of the link sets. The app is a pass-through: it does not search trackers, resolve stream endpoints, cache media, or bundle any catalogue |

No audio or text content is downloaded, cached or redistributed by the app. Catalogue results open in the user's browser; YouTube results play in YouTube's embedded player, which serves its own media; stream URLs are fetched live while you watch and are never written to disk. Archive episodes stream the same way, posters are cached in memory for the session only, and a subtitle file you attach stays on your machine.

`hls.js` is bundled into `out/renderer/assets/hls-*.js` and is Apache-2.0, so it adds no copyleft obligation to the shipped bundle.

## Updating this document

`npm ls --omit=dev` shows the shipped tree; `node -e "..."` walks `music-metadata`'s dependency graph if the direct list changes. Re-run before any release that changes dependencies.
