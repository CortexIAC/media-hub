# Dependency and licence inventory

Verified against `package.json` / `package-lock.json` and the installed `node_modules` on 27 October 2026.

## Runtime dependencies (shipped inside the app bundle)

| Package | Version | Licence | Role |
| --- | --- | --- | --- |
| electron | 45.1.0 | MIT | Desktop runtime (Chromium 156, Node 24.22) |
| react | 19.3.1 | MIT | UI |
| react-dom | 19.3.1 | MIT | UI rendering |
| music-metadata | 12.3.2 | MIT | Tag, duration and artwork parsing |

Bundled transitively by the above (all permissive):

- **MIT** — `@borewit/text-codec`, `@tokenizer/inflate`, `@tokenizer/token`, `content-type`, `debug`, `file-type`, `media-typer`, `ms`, `strtok3`, `token-types`, `uint8array-extras`, `win-guid`, `scheduler`
- **BSD-3-Clause** — `ieee754`

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
| playwright-core | 1.64.1 | Apache-2.0 | Drives Electron in e2e tests |
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
| Internet Archive | `advancedsearch.php` read API | no | IA developer APIs; per-item rights apply |
| LibriVox | IA collection `librivoxaudio` | no | Public-domain recordings |
| YouTube | Data API v3 `search.list` | yes, user-supplied | YouTube API Services Terms + Developer Policies; search-only, links out |
| LRCLIB | `/api/get`, `/api/search` | no | Free, open lyrics service ([lrclib.net](https://lrclib.net)); only title/artist/album/duration are sent |

No audio or text content is downloaded, cached or redistributed by the app. Results open in the user's browser.

## Updating this document

`npm ls --omit=dev` shows the shipped tree; `node -e "..."` walks `music-metadata`'s dependency graph if the direct list changes. Re-run before any release that changes dependencies.
