# Phase 0 — Environment Inspection and Stack Decision

**Date:** 2026-10-27
**Project:** Bunny Media Hub (Sprint 1)
**Location:** `C:\Users\Dom\Desktop\Media Hub`

## 1. Workspace inspection

The target folder was empty except for the Freebuff project marker:

```
Media Hub/
└── .freebuff/        (Freebuff metadata: project-id, .gitignore — not project source)
```

No git repository existed. Nothing had to be moved, overwritten or preserved.

## 2. Environment

| Tool | Version | Notes |
| --- | --- | --- |
| OS | Windows 11 Home 10.0.26200 | x64, MINGW64 bash shell |
| Node.js | v24.21.0 | Electron 45 embeds Node 24 |
| npm | 11.19.0 | registry.npmjs.org reachable |
| Rust | 1.98.1 | available, not used |
| Python | 3.9.9 | available, not used |
| ffmpeg / ffprobe | **not installed** | metadata is read in-process instead |
| bun | **not installed** | npm used |
| .NET | see Bunny Studio | used by Bunny Studio, not this project |

## 3. Existing Bunny ecosystem

| Project | Stack | Relationship to Media Hub |
| --- | --- | --- |
| `bunnyos` | C / x86 kernel | Future host OS; Media Hub must stay independently runnable |
| `bunny studio` | .NET 10 / WPF, no third-party deps | Separate design tool; **not touched** |
| `CortexOS`, `VANTAGE_Alpha`, `Aether_BunnyOS_Website_FullStack` | Python / web | Unrelated to media |
| `aether_bunny_web` | static HTML/CSS/JS | Marketing site |

There is no shared JavaScript or Rust stack in the ecosystem to inherit. The only
platform-level conventions worth carrying over are the dark, restrained visual
language and the "Windows desktop app that runs on its own" shape used by Bunny
Studio.

Media Hub lives in its own folder and its own git repository. It does not import
from, link to, or modify Bunny Studio or BunnyOS.

## 4. Playback library evaluation

| Option | Verdict | Why |
| --- | --- | --- |
| **Chromium `<audio>` inside Electron** | **chosen** | Real decoder, gapless-enough seeking, hardware volume, `timeupdate`/`ended` events, no native build step. Codec support is whatever Chromium ships: MP3, AAC/M4A, FLAC, WAV, Ogg Vorbis, Opus, WebM. |
| Web Audio API | rejected for sprint 1 | Same decoder, but adds graph complexity (gain nodes, decoding whole files for `decodeAudioData`) with no sprint-1 benefit. Can be layered later behind the same `PlaybackBackend` interface. |
| Tauri 2 + `rodio`/WebView2 | rejected | Smaller binary, but playback then depends on a Rust audio stack plus WebView2's own media pipeline, and video/web embedding for later phases is weaker. Also needs MSVC + WebView2 bootstrapping on this machine. |
| mpv / libmpv / VLC bindings | rejected | Native binary distribution and licensing complexity (LGPL/GPL) for marginal format gain now. |
| `howler.js` / `tone.js` | rejected | Thin wrappers over the same `<audio>` element; another dependency, no additional codec support. |
| .NET WPF + MediaElement | rejected | Matches Bunny Studio, but poor FLAC/Opus support and a much weaker path to embedded web content (YouTube/archive.org) later. |

**Decision: Electron 45 + Vite + React 19 + TypeScript, with a custom
`bunny-media://` streaming protocol and `music-metadata` for tags/artwork.**

Why this stack:

- Chromium gives a genuine, tested media pipeline on Windows with no native
  compiler step — the central Sprint 1 requirement.
- The main process has full Node filesystem access for folder scanning and
  artwork caching; the renderer stays sandboxed (`contextIsolation: true`,
  `sandbox: true`, no `nodeIntegration`).
- Later provider work (YouTube embedded player, archive.org embeds) needs an
  embedded browser surface. Electron's `BrowserView`/`WebContentsView` makes that
  a first-class capability rather than a workaround — and YouTube's terms require
  a *visible* embedded player, which this stack supports.
- TypeScript + Vitest let the core (queue, queue transitions, search, playlist
  persistence) be tested headlessly without launching a window.

Known costs, documented rather than hidden: ~100 MB Electron runtime, Chromium
codec list frozen at build time (no APE/WMA/ALAC-in-M4A coverage), and Electron
security patching has to follow upstream.

## 5. Data and privacy model

All library data lives on the machine, under Electron's `userData` directory:

```
%APPDATA%/bunny-media-hub/
  library.json      tracks, imported folders
  playlists.json    playlists + favorites
  settings.json     volume, repeat, shuffle, theme accent
  session.json      last track / position / queue
  artwork/          cached cover images, one file per album image
```

No account, no telemetry, no network calls in Sprint 1. Nothing is uploaded.

## 6. Version control

`git init` in this folder, baseline commit before implementation, then one
checkpoint commit per phase.
