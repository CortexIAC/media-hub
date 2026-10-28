import { useEffect, useState, type ReactElement } from 'react'
import { useUi } from '../state/ui'
import {
  ChevronLeftIcon,
  CloseIcon,
  MaximizeIcon,
  MinimizeIcon,
  MusicIcon,
  RestoreIcon,
  SearchIcon
} from './Icons'

export function TitleBar(): ReactElement {
  const ui = useUi()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.bunny.app.isMaximized().then(setMaximized)
  }, [])

  const onSearchChange = (value: string): void => {
    ui.setSearchQuery(value)
    if (value.trim().length > 0) {
      if (ui.route.name !== 'search') ui.navigate({ name: 'search' })
    } else if (ui.route.name === 'search') {
      ui.navigate({ name: 'music' })
    }
  }

  const toggleMaximize = (): void => {
    void window.bunny.app.toggleMaximize().then(setMaximized)
  }

  return (
    <header className="titlebar">
      <div className="titlebar-drag" onDoubleClick={toggleMaximize}>
        <div className="brand-mark">
          <MusicIcon size={11} />
        </div>
        <span className="titlebar-title">Bunny Media Hub</span>
      </div>

      <div className="titlebar-center">
        {ui.canGoBack ? (
          <button type="button" className="btn-icon btn-icon-sm no-drag" aria-label="Back" onClick={ui.back} style={{ marginRight: 6 }}>
            <ChevronLeftIcon size={15} />
          </button>
        ) : null}
        <div className="global-search">
          <span className="search-icon">
            <SearchIcon size={13} />
          </span>
          <input
            id="global-search"
            className="input"
            type="search"
            placeholder="Search tracks, albums, artists"
            value={ui.searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                ui.setSearchQuery('')
                if (ui.route.name === 'search') ui.navigate({ name: 'music' })
                event.currentTarget.blur()
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Ctrl F</kbd>
        </div>
      </div>

      <div className="window-controls">
        <button type="button" className="window-control" aria-label="Minimize" onClick={() => void window.bunny.app.minimize()}>
          <MinimizeIcon size={14} />
        </button>
        <button type="button" className="window-control" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={toggleMaximize}>
          {maximized ? <RestoreIcon size={13} /> : <MaximizeIcon size={13} />}
        </button>
        <button type="button" className="window-control close" aria-label="Close" onClick={() => void window.bunny.app.close()}>
          <CloseIcon size={14} />
        </button>
      </div>
    </header>
  )
}
