import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceModal } from '../components/workspace-modal';

beforeEach(() => {
  document.body.style.overflow = '';
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('WorkspaceModal body scroll lock', () => {
  it('restores page scrolling after the last of multiple open modals closes', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <WorkspaceModal open title="Detalhes" onClose={() => undefined}>
          Conteúdo dos detalhes
        </WorkspaceModal>
        <WorkspaceModal open={false} title="Editar" onClose={onClose}>
          Formulário
        </WorkspaceModal>
      </>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <WorkspaceModal open={false} title="Detalhes" onClose={() => undefined}>
          Conteúdo dos detalhes
        </WorkspaceModal>
        <WorkspaceModal open title="Editar" onClose={onClose}>
          Formulário
        </WorkspaceModal>
      </>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar janela' }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <>
        <WorkspaceModal open={false} title="Detalhes" onClose={() => undefined}>
          Conteúdo dos detalhes
        </WorkspaceModal>
        <WorkspaceModal open={false} title="Editar" onClose={onClose}>
          Formulário
        </WorkspaceModal>
      </>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the body overflow value that existed before opening', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(
      <WorkspaceModal open title="Nova locação" onClose={() => undefined}>
        Formulário
      </WorkspaceModal>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });
});
