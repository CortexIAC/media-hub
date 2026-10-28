import { useState, type CSSProperties, type ReactElement } from 'react'

export function SeekBar({
  positionMs,
  durationMs,
  disabled,
  onSeek,
  className,
  step = 250
}: {
  positionMs: number
  durationMs: number
  disabled?: boolean
  onSeek: (positionMs: number) => void
  className?: string
  step?: number
}): ReactElement {
  const [dragging, setDragging] = useState(false)
  const [draft, setDraft] = useState(0)
  const max = Math.max(1, durationMs)
  const value = dragging ? draft : Math.min(positionMs, max)
  const fill = Math.min(100, (value / max) * 100)

  return (
    <input
      type="range"
      className={`rail ${className ?? ''}`}
      min={0}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label="Seek"
      style={{ ['--fill' as string]: `${fill}%`, flex: 1 } as CSSProperties}
      onPointerDown={() => {
        setDragging(true)
        setDraft(positionMs)
      }}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (dragging) setDraft(next)
        else onSeek(next)
      }}
      onPointerUp={(event) => {
        if (!dragging) return
        const next = Number((event.target as HTMLInputElement).value)
        setDragging(false)
        onSeek(next)
      }}
      onKeyUp={(event) => {
        if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
          onSeek(Number((event.target as HTMLInputElement).value))
        }
      }}
    />
  )
}
