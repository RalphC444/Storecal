import { useState } from "react";

// A confirm/cancel dialog for destructive actions. Shows a busy state while the
// async onConfirm runs.
export function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal" onMouseDown={onCancel}>
      <div className="modal__panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button className="modal__x" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          <div className="danger-note">
            <p style={{ margin: 0 }}>{message}</p>
          </div>
          <div className="form__actions">
            <button type="button" className="action" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Deleting…" : confirmLabel || "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
