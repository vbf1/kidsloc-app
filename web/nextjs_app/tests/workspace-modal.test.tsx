import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    const { rerender } = render(
      <>
        <WorkspaceModal open title="Detalhes" onClose={() => undefined}>
          Conteúdo dos detalhes
        </WorkspaceModal>
        <WorkspaceModal open={false} title="Editar" onClose={() => undefined}>
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
        <WorkspaceModal open title="Editar" onClose={() => undefined}>
          Formulário
        </WorkspaceModal>
      </>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar janela' }));
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
