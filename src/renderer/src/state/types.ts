export type Route =
  | { name: 'music' }
  | { name: 'video' }
  | { name: 'streams' }
  | { name: 'virtual-library' }
  | { name: 'library' }
  | { name: 'devices' }
  | { name: 'settings' }
  | { name: 'favorites' }
  | { name: 'search' }
  | { name: 'now-playing' }
  | { name: 'album'; key: string }
  | { name: 'artist'; artist: string }
  | { name: 'playlist'; id: string }

export type ToastKind = 'info' | 'error' | 'success'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  kind: ToastKind
  title?: string
  message: string
  action?: ToastAction
}

export type ModalRequest =
  | { kind: 'create-playlist'; trackIds: string[] }
  | { kind: 'rename-playlist'; id: string; currentName: string }
  | { kind: 'delete-playlist'; id: string; name: string }
