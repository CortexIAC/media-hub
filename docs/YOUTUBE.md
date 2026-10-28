# YouTube search and playback

Status: **working and verified** in this build. Search works with no key, no account and no signup, and a selected video plays in YouTube's own embedded player inside the app.

## How a search becomes a playing video

Search has two entry points that end in the same place: the Video screen's own field, and the global search field in the title bar, which shows YouTube results (up to 8, with Play/Next/Queue/save) above your local matches and the catalogue results.

```
Video screen or global search (renderer)
  └─ window.bunny.youtube.search(query)            preload → IPC 'youtube:search'
       └─ main/ipc.ts
            ├─ Data API key saved? → providers/youtube.ts searchYouTubeVideos()   (documented API)
            │     └─ on failure → falls through to the keyless path
            └─ no key → searchYouTubeKeyless()
                  └─ POST https://www.youtube.com/youtubei/v1/search  (the request YouTube's web player makes)
                        └─ core/youtube.ts parseYouTubeSearchPage()  (pure, unit-tested)
  └─ click a result → components/YouTubePlayer
       └─ official IFrame Player API  (https://www.youtube.com/iframe_api)
            └─ player.playVideo() … player state events drive the UI
```

Playback is not a fallback to a browser tab: the app mirrors the iframe's real state (`unstarted`, `cued`, `buffering`, `playing`, `paused`, `ended`, `error`) into the transport row, the queue and the history.

### One player, two positions

The player element is mounted once by the application shell (`components/YouTubeStage.tsx`) and its playback state lives in `state/youtube.tsx`, not in a view. On the Video screen it is the large stage; on every other screen it docks to the bottom-right corner and keeps playing. Only its CSS box changes when you switch screens — the iframe is never unmounted and re-created, which is what would otherwise stop the audio.

The dock is deliberately visible and at least 366×206 px, and minimising the window pauses playback. That is the boundary of YouTube's API terms, not a bug: a playlist that keeps sounding while the player is off screen (or the window is in the tray) is background playback and is not permitted.

## No API key required

There are two search paths, and neither is needed for playback of a pasted link.

| Path | Needs | Used when | Notes |
| --- | --- | --- | --- |
| Web search | nothing | default | Posts to `/youtubei/v1/search` with YouTube's own `WEB` client context. Returns the same public results, including durations. Undocumented, can change without notice. |
| Data API v3 | a free Google Cloud key | a key is saved in Settings | Documented and stable. 100 `search.list` calls/day on the free tier, plus one `videos.list` call per search for durations. |

A saved key that fails (revoked, quota exhausted, offline) does not break search: the app falls back to the web path and says so in the results header.

### Getting a key (optional, ~5 minutes, no card)

1. <https://console.cloud.google.com/apis/library/youtube.googleapis.com> → **Enable**.
2. **Credentials → Create credentials → API key** → copy it.
3. Settings → Online catalogues → **YouTube Data API key** → Save.

The key is stored in `settings.json` in the app's data folder and only ever used for search.

## What the app deliberately does not do

- No stream URL extraction, no audio-only playback, no downloads, no ad modification.
- No hidden or background playback. Browsing the app keeps the video playing because the player stays visible in the corner; minimising the window pauses it, and nothing plays once the app is closed.
- No use of the video's media outside the iframe. The renderer loads no media bytes from YouTube itself.

## Required environment and dependencies

None. No environment variables, no keys, no extra npm packages — search and playback use the runtime's `fetch` and the iframe the renderer already loads. Network access is required for search and for playback (YouTube serves the video).

## Commands

```bash
npm install
npm run build                        # typecheck + production build
npm start                            # run the built app
node scripts/check-youtube.mjs       # live check: keyless search → streams the top result (needs a build)
node scripts/check-youtube-dock.mjs  # live: play, leave the Video screen, confirm the dock keeps playing
npm test                             # 132 unit tests, includes the search-page parser and queue transitions
npm run test:e2e                     # 9 end-to-end tests against the real app
```

## Verification performed

Automated:

- `tests/core/youtube.test.ts` — 6 tests over a real-shaped search payload: id/title/channel/duration mapping, `simpleText` titles, `compactVideoRenderer`, hour-long durations, malformed and id-less entries skipped, duplicates removed, playlist and channel renderers ignored, HTML entities decoded.
- `tests/core/youtubeQueue.test.ts` — 17 tests over the pure queue transitions (play, play-all, next/previous, back-stack bounding and de-duplication, enqueue, play-next, remove, clear, stop, end-of-video advance).
- `node scripts/check-youtube.mjs` (run 27 Oct 2026, no key configured): 17 result cards for "mari glock lil noonie" with real titles, top result `Lil Noonie x Lil Sy - Mari Glock (Official Music Video)`, the embedded player reached `playing` with duration 2:26 and no console errors. Screenshot: `screenshots/14-youtube.png`.
- `node scripts/check-youtube-dock.mjs` (run 28 Oct 2026): 17 results, selecting the first one reached `playing` without a second click, the stage measured 768×432, switching to Music left exactly one `.yt-host` in the DOM now classed `is-dock` at 366×206 while the state stayed `playing`, minimizing the window moved it to `paused`, and typing "mari glock" in the global search field produced 8 playable cards with playback still running in the dock. Screenshots: `screenshots/15-youtube-stage.png`, `16-youtube-dock.png`, `17-search-youtube.png`.

Manual checklist for a human on this machine:

1. Open Video → search "mari glock lil noonie" with no key → results appear within a few seconds.
2. Click the top card → the iframe loads and audio/video plays; the state chip reads `playing` and the seek bar advances.
3. Pause/play, seek, volume and mute act on the real player.
4. "Next" and "Queue" move between results; leaving Video keeps the same video playing in the corner dock. Minimising the window pauses it; restoring does not resume by itself.
5. Save a video, play another, restart the app → Saved and Recent still list them.
6. Paste a `youtu.be` link → it resolves through oEmbed and plays.
7. A private/blocked video shows "This video can't play here" with the reason and an "Open on YouTube" button, and the app keeps working.

## Known limitations

- **Queue is per-session** for YouTube: it survives navigating away from the screen but not a restart. Saved videos and recent history do persist.
- **Only one video at a time**, and the YouTube player and the local music player are independent: starting a video does not pause a track that is already playing. There is no cross-source ducking or mixing policy yet.
- **Minimised means paused.** Restoring the window leaves the video paused until you press play, and it never auto-starts on launch.
- **YouTube playlists** are not supported yet; playlist links are rejected with a clear message.
- The keyless search endpoint is undocumented. If YouTube changes it, search shows an error and suggests adding a key or pasting a link; playback keeps working.
- Region/age-restricted videos fail inside the embed even when they play on youtube.com; the UI reports the player's own error code.
- The player is created when a video is selected; switching videos calls `loadVideoById` on the same instance rather than creating a second iframe.
