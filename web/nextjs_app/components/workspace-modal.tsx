'use client';

import { useEffect, useId } from 'react';

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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'xl' ? 'max-w-5xl' : size === 'md' ? 'max-w-xl' : 'max-w-3xl';

  return (
    <div className="kl-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
        className={`kl-modal-panel ${width}`}>
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
