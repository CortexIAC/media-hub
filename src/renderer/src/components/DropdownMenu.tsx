import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuEntry {
  key: string
  label?: string
  icon?: ReactNode
  onSelect?: () => void
  separator?: boolean
  header?: boolean
  disabled?: boolean
  danger?: boolean
}

interface DropdownMenuProps {
  entries: MenuEntry[]
  label: string
  trigger?: ReactNode
  triggerClassName?: string
  iconOnly?: boolean
}

/** Small portal-based menu that closes on outside click, Escape or scroll. */
export function DropdownMenu({ entries, label, trigger, triggerClassName, iconOnly }: DropdownMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    // Menu is intentionally not closed on scroll: scrolling a long track list
    // (or the browser scrolling a focused row into view) should not dismiss it.
    // Outside click, Escape and window resize still close it.
    const onResize = (): void => setOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 240
    const estimatedHeight = Math.min(420, entries.length * 32 + 24)
    const top = Math.min(rect.bottom + 6, window.innerHeight - estimatedHeight - 12)
    const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12)
    setPosition({ top: Math.max(12, top), left })
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={triggerClassName ?? 'btn-icon btn-icon-sm'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      >
        {trigger}
        {iconOnly ? null : <span className="sr-only">{label}</span>}
      </button>
      {open
        ? createPortal(
            <div className="dropdown" role="menu" aria-label={label} ref={menuRef} style={{ top: position.top, left: position.left }}>
              {entries.map((entry) => {
                if (entry.separator) return <div className="dropdown-separator" key={entry.key} />
                if (entry.header)
                  return (
                    <div className="dropdown-label" key={entry.key}>
                      {entry.label}
                    </div>
                  )
                return (
                  <button
                    type="button"
                    role="menuitem"
                    key={entry.key}
                    className="dropdown-item"
                    disabled={entry.disabled}
                    style={entry.danger ? { color: 'var(--danger)' } : undefined}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpen(false)
                      entry.onSelect?.()
                    }}
                  >
                    {entry.icon}
                    <span className="truncate">{entry.label}</span>
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
