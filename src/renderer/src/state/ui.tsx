import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import type { ModalRequest, Route, Toast, ToastKind } from './types'

interface UiContextValue {
  route: Route
  navigate: (route: Route, options?: { replace?: boolean }) => void
  back: () => void
  canGoBack: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  queueOpen: boolean
  setQueueOpen: (open: boolean) => void
  toggleQueue: () => void
  toasts: Toast[]
  pushToast: (toast: { kind?: ToastKind; title?: string; message: string; action?: Toast['action'] }) => void
  dismissToast: (id: number) => void
  modal: ModalRequest | null
  openModal: (modal: ModalRequest) => void
  closeModal: () => void
}

const UiContext = createContext<UiContextValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }): ReactElement {
  const [route, setRoute] = useState<Route>({ name: 'music' })
  const routeRef = useRef<Route>(route)
  const historyRef = useRef<Route[]>([])
  const [historySize, setHistorySize] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [queueOpen, setQueueOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [modal, setModal] = useState<ModalRequest | null>(null)
  const nextToastId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
    const current = routeRef.current
    if (options?.replace !== true && !sameRoute(current, next)) {
      historyRef.current = [...historyRef.current.slice(-30), current]
      setHistorySize(historyRef.current.length)
    }
    routeRef.current = next
    setRoute(next)
  }, [])

  const back = useCallback(() => {
    const previous = historyRef.current[historyRef.current.length - 1]
    if (!previous) return
    historyRef.current = historyRef.current.slice(0, -1)
    setHistorySize(historyRef.current.length)
    routeRef.current = previous
    setRoute(previous)
  }, [])

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback<UiContextValue['pushToast']>(
    (toast) => {
      const id = nextToastId.current++
      const entry: Toast = {
        id,
        kind: toast.kind ?? 'info',
        title: toast.title,
        message: toast.message,
        action: toast.action
      }
      setToasts((current) => [...current.slice(-3), entry])
      const timer = window.setTimeout(() => dismissToast(id), entry.kind === 'error' ? 10_000 : 6000)
      timers.current.set(id, timer)
    },
    [dismissToast]
  )

  const value = useMemo<UiContextValue>(
    () => ({
      route,
      navigate,
      back,
      canGoBack: historySize > 0,
      searchQuery,
      setSearchQuery,
      queueOpen,
      setQueueOpen,
      toggleQueue: () => setQueueOpen((open) => !open),
      toasts,
      pushToast,
      dismissToast,
      modal,
      openModal: setModal,
      closeModal: () => setModal(null)
    }),
    [route, navigate, back, historySize, searchQuery, queueOpen, toasts, pushToast, dismissToast, modal]
  )

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export function useUi(): UiContextValue {
  const context = useContext(UiContext)
  if (!context) throw new Error('useUi must be used inside UiProvider')
  return context
}

function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
