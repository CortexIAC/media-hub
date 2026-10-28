# Provider feasibility report

What a third-party desktop app can legitimately do with each source, based on the providers' own published terms and documentation (checked October 2026). This is the basis for the capability catalogue in `src/core/providers.ts` and for what is actually wired up.

## Summary

| Source | Search | Playback in-app | Background play | Downloads | Status in this build |
| --- | --- | --- | --- | --- | --- |
| Local files | yes | yes | yes | n/a | **implemented** |
| Open Library | yes | reading in browser | n/a | borrowing only | **implemented** (search + links) |
| Project Gutenberg | yes | reading in browser | n/a | public domain only | **implemented** (with IA mirror fallback) |
| LibriVox | yes | listening in browser | n/a | public domain only | **implemented** (search + links) |
| Internet Archive | yes | streaming/embed available | yes | per item rights | **implemented** (search + links) |
| YouTube | yes, no key needed | only in the official embedded player, visible | **prohibited** | **prohibited** | **implemented** (search + embedded playback) |
| Spotify | yes, OAuth + Premium | only via Web Playback SDK (browser) | unverified outside a browser | no | not implemented |
| Apple Music | yes, developer token | only via MusicKit (browser) | unverified | no | not implemented |
| Cinejoy (cinejoy.pk) | no public API found | no | no | no | not integrated |

## YouTube

- **Search and metadata**: `search.list`, `videos.list`, `channels.list`, `playlists.list` and `playlistItems.list` are available through the Data API v3. Default quota is 100 `search.list` calls/day plus 10,000 units/day for other endpoints (midnight Pacific reset).
- **Playback**: must use the official IFrame/embedded player, which must stay visible (minimum 200×200) and unobscured. Supplemental controls are allowed only where they do not conflict with YouTube's own UI, and ads must not be blocked or modified.
- **Prohibited**: background playback (playing content while the player is not in the view the user is looking at; the policy guide names continuing playback when the app is minimised or closed), separating or isolating audio, promoting audio separately, downloading or caching audiovisual content, and undocumented APIs or scraping.
- **What this build does**: playback is the official embedded player, visible and unmodified on the Video screen, with playlist/controls left to YouTube; the app only calls documented IFrame API methods and stops the video when you leave the screen. No stream URL, audio track or download is ever produced.
- **Search caveat**: the keyless path posts to YouTube's own `/youtubei/v1/search`, the request its web player makes. That endpoint is not part of the documented API and its Developer Policies discourage undocumented APIs, so it is treated as a removable convenience: a Data API key always takes priority, and the keyless path is isolated behind one function so it can be switched off without touching the rest of the app.
- **Conclusion**: embedded-player playback plus genuine search is permitted; Spotify-style audio-only streaming of YouTube content is not, regardless of the user's Premium status, without prior written approval.

## Spotify

- Desktop apps should use Authorization Code with PKCE (no client secret). Scopes map directly onto endpoints: `user-read-playback-state`, `user-read-currently-playing`, `user-modify-playback-state`, `streaming`, plus library/playlist scopes.
- Rate limits are app-specific over a rolling 30-second window; `429` responses carry `Retry-After`. Development-mode apps are additionally limited (five authorised users, one Client ID) and the app owner needs Premium.
- Playback is only available through the Web Playback SDK, which is a browser player that registers as a Spotify Connect device; the Web API can also control other Connect devices. Electron is not a documented SDK target, so background playback in this app is unverified.
- The developer policy forbids apps that mimic Spotify's core experience and forbids permanent copies/stream ripping; metadata/art caching is narrow, and "Conditional Downloads" are a separate Premium feature.
- **Conclusion**: a real integration means OAuth + Premium + the SDK inside a webview, and still no audio URLs. It is a Sprint 3+ project, not a Sprint 1 feature.

## Apple Music

- MusicKit on the Web needs a MusicKit developer token (paid Apple Developer account) and a Music User Token from user authorisation. Playback requires an active Apple Music subscription — a token is not a subscription.
- Apple supports its own web components or a customised JS player, subject to the Apple Music Identity Guidelines and the developer agreement; playback must be user-initiated and standard controls must exist.
- Electron is not a documented MusicKit target; community reports describe catalogue access working while playback fails. Treat Electron playback as unconfirmed.

## Internet Archive, Open Library, Gutenberg, LibriVox

- **Internet Archive**: `advancedsearch.php` (JSON) for search, `metadata/{identifier}` for item detail, `https://archive.org/download/{identifier}/{file}` for stable file URLs, plus an official item embed. Not every item is downloadable; rights vary per item and IA explicitly does not guarantee them.
- **Open Library**: `search.json` with fields such as `ebook_access`, `ia`, `public_scan_b`. Public scans can be read online; in-copyright works are borrow-only (free account, controlled digital lending).
- **Project Gutenberg**: no official JSON API. Gutendex is the common community mirror; where it is unreachable (as on this network), the Internet Archive `gutenberg` text collection provides the same public-domain texts.
- **LibriVox**: public-domain audiobooks hosted on archive.org; search via the `librivoxaudio` collection.
- Practical requirements: descriptive User-Agent, caching of search results, honouring 429/Backoff, and per-item rights review before offering anything beyond a link.

## Cinejoy / cinejoy.pk

No public API, developer programme or embeddable player was found for Cinejoy (the Cinequest/Creatics online cinema), and cinejoy.pk presents itself as a streaming site without published developer terms. There is no authorised integration path, so Bunny Media Hub does not fetch, index or play its content. If the operator publishes partner terms, that would need a written agreement before any implementation.

## PeerTube (future)

PeerTube exposes a documented REST API (`/api/v1/videos`), and instances can be searched individually. Rights and terms are per instance. This is the most promising open video source for a future sprint because playback URLs are published by the instance itself.

## What this build does

1. Searches Open Library, Gutenberg (Gutendex, with an IA mirror fallback), LibriVox and Internet Archive from the Virtual Library and global search.
2. Searches YouTube (keyless by default, Data API when a key is set) and plays the selected video in the official embedded player, with queue, saved videos and recent history.
3. Shows every result with its access reality — "Read online", "Borrow or preview", "Listen on archive.org", "Open on YouTube" — rather than implying everything is playable.
4. Never extracts audio, bypasses DRM, hides an ad-bearing player, or downloads copyrighted text.
