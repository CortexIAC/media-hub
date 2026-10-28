import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import type {
  ArchiveCollection,
  ArchiveEpisodeView,
  ArchiveItemView,
  ArchiveSearchHit,
  StreamSourceView
} from '@shared/ipc'
import { useStreams } from './streams'
import { useUi } from './ui'

export type ArchiveTab = 'discover' | 'shows' | 'movies'

interface ArchiveContextValue {
  tab: ArchiveTab
  setTab: (tab: ArchiveTab) => void
  query: string
  setQuery: (query: string) => void
  collection: ArchiveCollection
  setCollection: (collection: ArchiveCollection) => void
  /** Results of the last search; null until the first one runs. */
  hits: ArchiveSearchHit[] | null
  searching: boolean
  searchError: string | null
  /** True when a thin narrow search was widened to all film and TV. */
  broadened: boolean
  dismissBroadened: () => void
  runSearch: () => Promise<void>
  searchFor: (query: string) => Promise<void>
  browse: () => Promise<void>
  selected: ArchiveItemView | null
  opening: boolean
  openError: string | null
  open: (identifier: string) => Promise<void>
  closeSelected: () => void
  library: ArchiveItemView[]
  save: (item: ArchiveItemView) => Promise<void>
  forget: (identifier: string) => Promise<void>
  attachSubtitle: (item: ArchiveItemView, episode: ArchiveEpisodeView) => Promise<void>
  detachSubtitle: (item: ArchiveItemView, episode: ArchiveEpisodeView) => Promise<void>
  play: (item: ArchiveItemView, episode: ArchiveEpisodeView) => void
}

const ArchiveContext = createContext<ArchiveContextValue | null>(null)

/**
 * Internet Archive discovery and the saved shows/movies shelf.
 *
 * Search results and the open item live here, not in the view, so opening a
 * saved show, playing an episode and coming back preserves the screen. Network
 * calls all run in the main process; the renderer only ever sees parsed data.
 */
export function ArchiveProvider({ children }: { children: ReactNode }): ReactElement {
  const ui = useUi()
  const streams = useStreams()

  const [tab, setTab] = useState<ArchiveTab>('discover')
  const [query, setQuery] = useState('')
  const [collection, setCollectionState] = useState<ArchiveCollection>('cartoons')
  const [hits, setHits] = useState<ArchiveSearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [broadened, setBroadened] = useState(false)
  const [selected, setSelected] = useState<ArchiveItemView | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [library, setLibrary] = useState<ArchiveItemView[]>([])

  const requestId = useRef(0)
  const libraryRef = useRef<ArchiveItemView[]>([])
  libraryRef.current = library

  useEffect(() => {
    let cancelled = false
    void window.bunny.archive
      .state()
      .then((state) => {
        if (!cancelled) setLibrary(state.items)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const applySearch = useCallback(
    async (text: string, scope: ArchiveCollection, allowWiden: boolean): Promise<void> => {
      const id = ++requestId.current
      setSearching(true)
      setSearchError(null)
      setBroadened(false)
      try {
        let result = await window.bunny.archive.search(text, scope)
        if (requestId.current !== id) return

        // A narrow collection can be too narrow to be useful: "angelina
        // ballerina" has no matches in `animationandcartoons`, and "barney" only
        // two. When a typed search comes back nearly empty, try everything on
        // film and say so, rather than reporting a false "not found".
        if (allowWiden && text.trim().length > 0 && scope !== 'all' && !result.error && result.hits.length < 3) {
          const wider = await window.bunny.archive.search(text, 'all')
          if (requestId.current !== id) return
          if (wider.hits.length > result.hits.length) {
            result = wider
            setCollectionState('all')
            setBroadened(true)
          }
        }

        setHits(result.hits)
        setSearchError(result.error)
      } catch (error) {
        if (requestId.current !== id) return
        setHits([])
        setSearchError(error instanceof Error ? error.message : String(error))
      } finally {
        if (requestId.current === id) setSearching(false)
      }
    },
    []
  )

  const runSearch = useCallback(() => applySearch(query, collection, true), [applySearch, query, collection])

  const searchFor = useCallback(
    (text: string) => {
      setQuery(text)
      return applySearch(text, collection, true)
    },
    [applySearch, collection]
  )

  const browse = useCallback(() => {
    if (hits !== null || searching) return Promise.resolve()
    return applySearch('', collection, false)
  }, [applySearch, hits, searching, collection])

  const setCollection = useCallback(
    (next: ArchiveCollection) => {
      // A chip is an explicit scope, so it is never widened behind the user.
      setCollectionState(next)
      return applySearch(query, next, false)
    },
    [applySearch, query]
  )

  const dismissBroadened = useCallback(() => setBroadened(false), [])

  const open = useCallback(async (identifier: string) => {
    const cached = libraryRef.current.find((item) => item.identifier === identifier)
    setSelected(cached ?? null)
    setOpening(true)
    setOpenError(null)
    try {
      const result = await window.bunny.archive.item(identifier)
      if (result.item) {
        setSelected(result.item)
      } else {
        setOpenError(result.error ?? 'That item could not be opened.')
        if (!cached) setSelected(null)
      }
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error))
    } finally {
      setOpening(false)
    }
  }, [])

  const closeSelected = useCallback(() => {
    setSelected(null)
    setOpenError(null)
    setOpening(false)
  }, [])

  const save = useCallback(
    async (item: ArchiveItemView) => {
      try {
        const state = await window.bunny.archive.save(item)
        setLibrary(state.items)
        const fresh = state.items.find((candidate) => candidate.identifier === item.identifier) ?? null
        setSelected((current) => (current && current.identifier === item.identifier ? fresh : current))
        if (fresh) {
          ui.pushToast({
            kind: 'success',
            title: fresh.kind === 'show' ? 'Added to Shows' : 'Added to Movies',
            message:
              fresh.kind === 'show'
                ? `${fresh.episodes.length} episodes saved. They stream from archive.org.`
                : 'Saved. It streams from archive.org.'
          })
        }
      } catch (error) {
        ui.pushToast({ kind: 'error', title: 'Could not save', message: String(error) })
      }
    },
    [ui]
  )

  const forget = useCallback(
    async (identifier: string) => {
      try {
        const state = await window.bunny.archive.remove(identifier)
        setLibrary(state.items)
        setSelected((current) => (current?.identifier === identifier ? null : current))
        ui.pushToast({ title: 'Removed from your library', message: 'The item is still on archive.org.' })
      } catch (error) {
        ui.pushToast({ kind: 'error', title: 'Could not remove', message: String(error) })
      }
    },
    [ui]
  )

  const attachSubtitle = useCallback(
    async (item: ArchiveItemView, episode: ArchiveEpisodeView) => {
      try {
        const result = await window.bunny.archive.attachSubtitle(item.identifier, episode.index)
        setLibrary(result.state.items)
        if (result.item) setSelected(result.item)
        if (result.error) {
          ui.pushToast({ kind: 'error', title: 'Subtitle not attached', message: result.error })
        } else if (!result.cancelled) {
          ui.pushToast({
            kind: 'success',
            title: 'Subtitles attached',
            message: `Captions for ${episode.label} now load with the episode.`
          })
        }
      } catch (error) {
        ui.pushToast({ kind: 'error', title: 'Subtitle not attached', message: String(error) })
      }
    },
    [ui]
  )

  const detachSubtitle = useCallback(
    async (item: ArchiveItemView, episode: ArchiveEpisodeView) => {
      try {
        const result = await window.bunny.archive.removeSubtitle(item.identifier, episode.index)
        setLibrary(result.state.items)
        if (result.item) setSelected(result.item)
        if (result.error) {
          ui.pushToast({ kind: 'error', title: 'Could not remove subtitles', message: result.error })
        }
      } catch (error) {
        ui.pushToast({ kind: 'error', title: 'Could not remove subtitles', message: String(error) })
      }
    },
    [ui]
  )

  const play = useCallback(
    (item: ArchiveItemView, episode: ArchiveEpisodeView) => {
      const source: StreamSourceView = {
        id: `archive:${item.identifier}:${episode.index}`,
        name: `${item.title} — ${episode.label}`,
        url: episode.url,
        group: 'Internet Archive',
        logoUrl: item.posterUrl,
        kind: episode.kind,
        addedAt: Date.now(),
        lastPlayedAt: Date.now(),
        playUrl: episode.playUrl,
        unsupportedReason: episode.unsupportedReason,
        subtitleUrl: episode.subtitleUrl,
        subtitleLabel: episode.subtitleLabel
      }
      streams.play(source)
      if (item.saved) {
        void window.bunny.archive
          .markPlayed(item.identifier, episode.index)
          .then((state) => setLibrary(state.items))
          .catch(() => undefined)
      }
    },
    [streams]
  )

  const value = useMemo<ArchiveContextValue>(
    () => ({
      tab,
      setTab,
      query,
      setQuery,
      collection,
      setCollection,
      hits,
      searching,
      searchError,
      broadened,
      dismissBroadened,
      runSearch,
      searchFor,
      browse,
      selected,
      opening,
      openError,
      open,
      closeSelected,
      library,
      save,
      forget,
      attachSubtitle,
      detachSubtitle,
      play
    }),
    [
      tab,
      query,
      collection,
      setCollection,
      hits,
      searching,
      searchError,
      broadened,
      dismissBroadened,
      runSearch,
      searchFor,
      browse,
      selected,
      opening,
      openError,
      open,
      closeSelected,
      library,
      save,
      forget,
      attachSubtitle,
      detachSubtitle,
      play
    ]
  )

  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>
}

export function useArchive(): ArchiveContextValue {
  const context = useContext(ArchiveContext)
  if (!context) throw new Error('useArchive must be used inside ArchiveProvider')
  return context
}
