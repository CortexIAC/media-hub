# YouTube search and playback

Status: **working and verified** in this build. Search works with no key, no account and no signup, and a selected video plays in YouTube's own embedded player inside the app.

## How a search becomes a playing video

```
Video screen (renderer)
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

Playback is not a fallback to a browser tab: the iframe stays visible in the Video view and the app mirrors its real state (`unstarted`, `cued`, `buffering`, `playing`, `paused`, `ended`, `error`) into the transport row, the queue and the history.

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
- No hidden or background playback: leaving the Video screen unmounts the player.
- No use of the video's media outside the iframe. The renderer loads no media bytes from YouTube itself.

## Required environment and dependencies

None. No environment variables, no keys, no extra npm packages — search and playback use the runtime's `fetch` and the iframe the renderer already loads. Network access is required for search and for playback (YouTube serves the video).

## Commands

```bash
npm install
npm run build                        # typecheck + production build
npm start                            # run the built app
node scripts/check-youtube.mjs       # live check: keyless search → streams the top result (needs a build)
npm test                             # 115 unit tests, includes the search-page parser
npm run test:e2e                     # 9 end-to-end tests against the real app
```

## Verification performed

Automated:

- `tests/core/youtube.test.ts` — 6 tests over a real-shaped search payload: id/title/channel/duration mapping, `simpleText` titles, `compactVideoRenderer`, hour-long durations, malformed and id-less entries skipped, duplicates removed, playlist and channel renderers ignored, HTML entities decoded.
- `node scripts/check-youtube.mjs` (run 27 Oct 2026, no key configured): 17 result cards for "mari glock lil noonie" with real titles, top result `Lil Noonie x Lil Sy - Mari Glock (Official Music Video)`, the embedded player reached `playing` with duration 2:26 and no console errors. Screenshot: `screenshots/14-youtube.png`.

Manual checklist for a human on this machine:

1. Open Video → search "mari glock lil noonie" with no key → results appear within a few seconds.
2. Click the top card → the iframe loads and audio/video plays; the state chip reads `playing` and the seek bar advances.
3. Pause/play, seek, volume and mute act on the real player.
4. "Next" and "Queue" move between results; leaving and returning to Video keeps the selected video but stops playback (by design).
5. Save a video, play another, restart the app → Saved and Recent still list them.
6. Paste a `youtu.be` link → it resolves through oEmbed and plays.
7. A private/blocked video shows "This video can't play here" with the reason and an "Open on YouTube" button, and the app keeps working.

## Known limitations

- **Queue is per-session** for YouTube: it survives navigating away from the screen but not a restart. Saved videos and recent history do persist.
- **YouTube playlists** are not supported yet; playlist links are rejected with a clear message.
- The keyless search endpoint is undocumented. If YouTube changes it, search shows an error and suggests adding a key or pasting a link; playback keeps working.
- Region/age-restricted videos fail inside the embed even when they play on youtube.com; the UI reports the player's own error code.
- The player is created when a video is selected; switching videos calls `loadVideoById` on the same instance rather than creating a second iframe.
