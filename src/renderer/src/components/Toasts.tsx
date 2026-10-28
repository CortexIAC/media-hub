import type { ReactElement } from 'react'
import { useUi } from '../state/ui'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './Icons'

export function Toasts(): ReactElement {
  const ui = useUi()

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {ui.toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span style={{ color: toast.kind === 'error' ? 'var(--danger)' : toast.kind === 'success' ? 'var(--accent)' : 'var(--text-dim)', marginTop: 1 }}>
            {toast.kind === 'error' ? <AlertIcon size={15} /> : toast.kind === 'success' ? <CheckIcon size={15} /> : <InfoIcon size={15} />}
          </span>
          <div className="toast-body">
            {toast.title ? <strong>{toast.title}</strong> : null}
            {toast.message}
            {toast.action ? (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    toast.action?.run()
                    ui.dismissToast(toast.id)
                  }}
                >
                  {toast.action.label}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="btn-icon btn-icon-sm" aria-label="Dismiss" onClick={() => ui.dismissToast(toast.id)}>
            <CloseIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
