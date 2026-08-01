import React, { useEffect } from 'react';

export function Modal({ title, onClose, onSave, saveLabel = 'Save', wide, xwide, footer, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim open" onClick={(e) => { if (e.target.classList.contains('scrim')) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''} ${xwide ? 'xwide' : ''}`}>
        <div className="mh">
          <h3>{title}</h3>
          <button className="x" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mb">{children}</div>
        <div className="mf">
          {footer !== undefined ? footer : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              {onSave && <button className="btn btn-teal" onClick={onSave}>{saveLabel}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, onClose, onConfirm, confirmLabel = 'Delete' }) {
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </>}>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{message}</p>
    </Modal>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast show${toast.err ? ' err' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        {toast.err ? <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></> : <path d="M20 6 9 17l-5-5" />}
      </svg>
      {toast.msg}
    </div>
  );
}

export function Callout({ children, warn }) {
  return (
    <div className={`callout${warn ? ' warn' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16v-4M12 8h.01" /><circle cx="12" cy="12" r="10" /></svg>
      <span>{children}</span>
    </div>
  );
}

export function Pill({ color, children }) {
  return <span className={`pill ${color}`}>{children}</span>;
}

export function EmptyState({ thing, onAdd }) {
  return (
    <div className="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 13h6M9 17h4M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
      <h4>No {thing} yet</h4>
      <p>Create your first {thing} to get started.</p>
      {onAdd && <button className="btn btn-teal" onClick={onAdd}>Add {thing}</button>}
    </div>
  );
}
