import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchablePicker } from '../components/searchable-picker';

afterEach(() => cleanup());

describe('SearchablePicker', () => {
  it('finds options when the search omits accents', () => {
    render(
      <SearchablePicker
        title="Selecionar produto"
        value=""
        options={[
          { value: 'popcorn', label: 'Máquina de Pipoca', description: 'Algodão doce e pipoca' },
          { value: 'trampoline', label: 'Cama Elástica' },
        ]}
        placeholder="Selecione um produto"
        searchPlaceholder="Buscar produto..."
        emptyText="Nenhum produto encontrado."
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Selecione um produto' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar opções' }), {
      target: { value: 'maquina de pipoca' },
    });

    expect(screen.getByRole('option', { name: /Máquina de Pipoca/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Cama Elástica/ })).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar opções' }), {
      target: { value: 'algodao doce' },
    });

    expect(screen.getByRole('option', { name: /Máquina de Pipoca/ })).toBeTruthy();
  });
});
