# Internet Archive tab

The Archive tab browses the [Internet Archive](https://archive.org) as a video library: search a title, open the item, see its episodes, save it to **Shows** or **Movies**, and play an episode inside the app. It is a separate tab from Streams because the interaction is a catalogue, not a URL you already have.

Nothing is downloaded, copied or re-encoded. Playback uses archive.org's own public file URLs through the app's existing `bunny-stream:` proxy.

## Endpoints used

| Purpose | Request | Key |
| --- | --- | --- |
| Search | `https://archive.org/advancedsearch.php?q=…&output=json` | none |
| Item detail | `https://archive.org/metadata/{identifier}` | none |
| Poster | `https://archive.org/services/img/{identifier}` | none |
| Episode playback | `https://archive.org/download/{identifier}/{file}` | none |
| Caption sidecar | the item's own `.srt` / `.vtt` file URL | none |

All requests run in the main process with a descriptive User-Agent, a bounded timeout (15 s search, 25 s metadata) and no retry loop. The renderer never talks to the network.

## Search

- Queries match **titles only** (`title:(…)`). The archive's default full-text index includes OCR and caption transcripts, so `barney` would otherwise return yesterday's news bulletins that merely mentioned the name.
- Collections: **Everything on film** (default for search; all film/TV minus the `tvnews` bulletin collection), **Cartoons** (`animationandcartoons`), **Classic TV** (`classic_tv`), **Movies** (`moviesandfilms`), **Old-time radio** (`oldtimeradio`).
- Hits are re-ranked client-side by the pure `rankArchiveSearchDocs` helper: exact title, title prefix, phrase inside the title, full token coverage, a small boost for animation/TV collections, then downloads as a tie-breaker. Apostrophes are dropped, so `blue's clues` also matches uploads titled `Blues Clues`.
- The landing shelf is the cartoon collection sorted by downloads, so the tab is useful before you type anything.
- When a typed search in a narrow collection returns fewer than three items, the app repeats it with **Everything on film**, switches the collection chip, and shows a dismissible "Search widened" banner. This is why a title that lives outside `animationandcartoons` — *Angelina Ballerina*, *Blue's Clues* — is still found instead of being reported as missing.
- One page of up to 36 items is requested. There is no pagination yet; the limitation is listed below.

## From item to episodes

`metadata/{identifier}` lists every file, including several encodings of the same recording. The pure parser in `src/core/archive.ts`:

1. **Drops non-media** (documents, thumbnails, GIF previews, torrents).
2. **Collapses derivatives of one recording** by base name, so `Movie.mp4`, `Movie.ia.mp4`, `Movie_512kb.mp4` and `Movie.ogv` become one episode. The best copy wins: original MP4/M4V, then WebM, then Ogg, then MPEG; `h.264 IA` re-encodes lose to the uploader's file.
3. **Labels each remaining file**:
   - `Tower_Prep_S01E02_Monitored.mp4` → `S01E02 · Monitored`
   - `Show 1x07 Name.mp4` → `S01E07 · Name`
   - `Show - Episode 12 - The Cave.mp4` → `Ep 12 · The Cave`
   - `03 - Show - The Cave.mp4` → `Ep 3 · The Cave`
   - no numbering → the cleaned file name, never an invented episode number.
   The show's own name is removed from the label (token match first, character fallback for names split by underscores).
4. **Sorts** by season/episode, then natural file-name order.
5. **Classifies** an item with more than one episode as a **show**, and a single file as a **movie**.

Durations come from the item metadata (seconds or `mm:ss`/`hh:mm:ss`) and are shown per episode; sizes and formats are shown too.

### "Chopped" episodes

Episodes are chopped **when the upload is per-episode** — the common case for classic TV and cartoon uploads (`S01E01`, `S01E02`, …). A single-file compilation stays one entry. Splitting it would require transcoding or chapter metadata the item does not provide; the app does not fabricate either. The item screen says this explicitly.

## Playback

- Each episode is converted to the same `StreamSourceView` the Streams screen uses: `playUrl` is `bunny-stream://proxy/<archive download URL>`, `kind` is decided by the existing stream classifier.
- MP4/WebM/audio play in-app; MPEG-TS, MKV and other undecodable containers are reported as needing VLC, with the same URL handed to VLC.
- The stage is mounted by the shell, so the episode keeps playing while you browse other screens and docks to the corner. It pauses local music and stops YouTube, exactly like any other stream.
- Playback records `lastPlayedAt` and `lastEpisodeIndex` for saved items, which drives "played just now" and "Last: S01E01 · New Kid" on the shelf.

## Subtitles

Two sources, in this order:

1. **Attached file** (user). On a saved show, every episode without attached captions has **Add subs**. The file picker accepts `.srt` and `.vtt`. The file is validated (non-empty, contains cues), its path is stored, and it is served as WebVTT with `text/vtt` through `bunny-stream://subtitles/local/{identifier}/{index}`. UTF-8 with or without BOM, UTF-16LE and UTF-16BE are decoded by BOM.
2. **Item sidecar**. If the archive item lists a `.srt`/`.vtt` file that matches the episode by base name (ignoring `.cc1`, `.asr`, `.align`, language tags), it is offered through `bunny-stream://subtitles/remote/<encoded url>` and converted to WebVTT on the way through. `CC1`/`CC2` are treated as English, `CC3`/`CC4` as Spanish for labels.

`toWebVtt` normalises CRLF, cue numbers, comma decimals and ASS override tags, and passes valid WebVTT through unchanged. A caption track that fails to load never fails the episode: the player hides it and shows a toast pointing at **Add subs**.

**Observed reality check:** the Internet Archive's caption sidecars for its TV-news items currently download as zero bytes even though metadata lists a size (verified against several items on 28 October 2026). The app therefore cannot promise captions for every item, and the detail screen says so. The attach-your-own path is what the automated check verifies end to end.

## Storage

`archive.json` under Electron's `userData`:

```jsonc
{
  "entries": [
    {
      "item": { "identifier": "…", "title": "…", "episodes": [ { "label": "S01E01 · …", "url": "https://archive.org/download/…", "subtitles": [ … ] } ] },
      "savedAt": 1761600000000,
      "lastPlayedAt": 1761600100000,
      "lastEpisodeIndex": 0
    }
  ],
  "attachments": {
    "identifier#0": { "path": "C:\\Users\\…\\subtitles.srt", "name": "subtitles.srt", "addedAt": 1761600000000 }
  }
}
```

Only stable fields are stored: identifiers, metadata and file URLs. Playback and subtitle URLs are derived on read, so nothing expires. The store is sanitised on load: unknown fields are dropped, identifiers and URLs are validated (archive.org over https only), episodes are re-indexed, and entries are capped at 500. Removing a show deletes its attachments from this file, but never touches the subtitle file on disk.

## Rights and scope

- Uploads on the Internet Archive are **user-contributed**. The item screen shows the licence the uploader set (`CC BY-ND`, public domain mark, none) and links to the item page; that is the app's statement, not a legal clearance.
- The app only plays what archive.org itself serves. It does not search trackers, resolve stream endpoints, scrape pages, bypass restrictions or download media.
- Search results and saved metadata are the archive's public catalogue; posters are fetched through an image proxy restricted to `archive.org` hosts.
- Attached subtitle files stay local and are never uploaded.

## Verification

```bash
npm run build && node scripts/check-archive.mjs
```

The script uses the real APIs and streams a real episode. It checks browsing, a genuine search, a widened search, episode labels, save, a real playing state, a WebVTT track with cues from an attached file, and that both the saved show and the attachment survive a restart.

## Known limitations

1. One page of 36 search results; no "load more".
2. Single-file compilations are not split into episodes.
3. Item-side captions depend on archive.org actually serving the file; empty sidecars are reported rather than hidden.
4. A show's episode list is a single React render; items with hundreds of files will be heavy.
5. Uploads are named by their uploader, so spelling variants (`blue's clues` / `blues clues`) are different archive queries. Ranking tolerates apostrophes, not arbitrary misspellings.
6. The archive occasionally returns items whose files are restricted or dark; those produce a clear error instead of an empty screen.
