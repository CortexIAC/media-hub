import type { ReactElement, ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  message,
  children
}: {
  icon: ReactNode
  title: string
  message: string
  children?: ReactNode
}): ReactElement {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{message}</p>
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  )
}
