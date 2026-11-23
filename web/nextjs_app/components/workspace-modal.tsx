'use client';

import { useEffect, useId, useRef } from 'react';

type WorkspaceModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
};

export function WorkspaceModal({ open, title, description, onClose, children, size = 'lg' }: WorkspaceModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const getFocusable = () => panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [];
    const firstFocusable = getFocusable()[0];
    (firstFocusable ?? panelRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) { event.preventDefault(); panelRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;
  const width = size === 'xl' ? 'max-w-5xl' : size === 'md' ? 'max-w-xl' : 'max-w-3xl';

  return (
    <div className="kl-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
        ref={panelRef} tabIndex={-1} className={`kl-modal-panel ${width}`}>
        <header className="kl-modal-header">
          <div className="min-w-0">
            <p className="kl-modal-eyebrow">KIDSLOC · ESPAÇO DE TRABALHO</p>
            <h2 id={titleId} className="kl-modal-title">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm leading-6 text-gray-500">{description}</p>}
          </div>
          <button type="button" aria-label="Fechar janela" onClick={onClose} className="kl-modal-close">×</button>
        </header>
        <div className="kl-modal-content">{children}</div>
      </section>
    </div>
  );
}
