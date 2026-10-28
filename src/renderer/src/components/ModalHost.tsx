import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useData } from '../state/data'
import { useUi } from '../state/ui'

export function ModalHost(): ReactElement | null {
  const ui = useUi()
  const data = useData()
  const modal = ui.modal
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setValue(modal?.kind === 'rename-playlist' ? modal.currentName : '')
    if (modal && modal.kind !== 'delete-playlist') {
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [modal])

  useEffect(() => {
    if (!modal) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') ui.closeModal()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [modal, ui])

  if (!modal) return null

  const submit = async (): Promise<void> => {
    if (busy) return
    if (modal.kind === 'create-playlist') {
      const name = value.trim()
      if (!name) return
      setBusy(true)
      const playlist = await data.createPlaylist(name, modal.trackIds)
      setBusy(false)
      ui.closeModal()
      if (playlist) ui.navigate({ name: 'playlist', id: playlist.id })
      return
    }
    if (modal.kind === 'rename-playlist') {
      const name = value.trim()
      if (!name) return
      setBusy(true)
      await data.renamePlaylist(modal.id, name)
      setBusy(false)
      ui.closeModal()
      return
    }
    setBusy(true)
    await data.deletePlaylist(modal.id)
    setBusy(false)
    ui.closeModal()
    if (ui.route.name === 'playlist' && ui.route.id === modal.id) ui.navigate({ name: 'music' })
  }

  const title =
    modal.kind === 'create-playlist' ? 'New playlist' : modal.kind === 'rename-playlist' ? 'Rename playlist' : 'Delete playlist?'

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && ui.closeModal()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">{title}</h2>
        {modal.kind === 'delete-playlist' ? (
          <p>
            “{modal.name}” will be deleted. The tracks stay in your library and are not removed from disk.
          </p>
        ) : (
          <>
            <p>
              {modal.kind === 'create-playlist' && modal.trackIds.length > 0
                ? `${modal.trackIds.length} ${modal.trackIds.length === 1 ? 'track' : 'tracks'} will be added.`
                : 'Give the playlist a name. You can add tracks from any track menu.'}
            </p>
            <input
              ref={inputRef}
              className="input"
              value={value}
              maxLength={120}
              placeholder="Playlist name"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
            />
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={ui.closeModal}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${modal.kind === 'delete-playlist' ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy || (modal.kind !== 'delete-playlist' && value.trim().length === 0)}
            onClick={() => void submit()}
          >
            {modal.kind === 'delete-playlist' ? 'Delete' : modal.kind === 'rename-playlist' ? 'Rename' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
