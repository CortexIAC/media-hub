import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

interface VirtualListProps<T> {
  items: T[]
  rowHeight: number
  renderRow: (item: T, index: number) => ReactNode
  overscan?: number
  className?: string
}

/**
 * Fixed-height virtual list. Keeps the DOM proportionate to the viewport when
 * the library holds thousands of tracks.
 */
export function VirtualList<T>({ items, rowHeight, renderRow, overscan = 8, className }: VirtualListProps<T>): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(480)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = (): void => setHeight(element.clientHeight || 480)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  useEffect(() => {
    if (scrollTop > Math.max(0, items.length * rowHeight - height)) {
      setScrollTop(0)
      if (containerRef.current) containerRef.current.scrollTop = 0
    }
  }, [items.length, rowHeight, height, scrollTop])

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(height / rowHeight) + overscan * 2
  const end = Math.min(items.length, start + visibleCount)
  const visible = items.slice(start, end)

  return (
    <div className={`list-virtual ${className ?? ''}`} ref={containerRef} onScroll={onScroll}>
      <div className="virtual-spacer" style={{ height: Math.max(items.length * rowHeight, 0) }}>
        <div className="virtual-window" style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {visible.map((item, offset) => (
            <div key={start + offset} style={{ height: rowHeight }}>
              {renderRow(item, start + offset)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
