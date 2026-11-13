import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductForm } from '../components/product-form';
afterEach(() => cleanup());
describe('ProductForm', () => {
  it('validates required name and price before submitting', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm saving={false} error="" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar item' }));
    expect(screen.getByText('Informe um nome entre 2 e 160 caracteres.')).toBeTruthy();
    expect(screen.getByText('Informe um preço válido, com até duas casas decimais.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('submits a normalized toy with daily price and quantity inventory', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm saving={false} error="" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: '  Cama   Elástica ' } });
    fireEvent.change(screen.getByLabelText('Preço por dia (R$) *'), { target: { value: '80,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar item' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cama Elástica', item_type: 'toy', price: '80,00' }), null, false));
  });
  it('switches to service fields and submits event price without stock', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm saving={false} error="" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brinquedo' }));
    fireEvent.click(screen.getByRole('option', { name: 'Serviço' }));
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Recreação' } });
    fireEvent.change(screen.getByLabelText('Preço por evento (R$) *'), { target: { value: '150,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar item' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Recreação', item_type: 'service', total_quantity: '0' }), null, false));
  });
  it('shows machine stock controls and allows event-based pricing', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm saving={false} error="" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brinquedo' }));
    fireEvent.click(screen.getByRole('option', { name: 'Máquina' }));
    expect(screen.getByText('Controle de estoque')).toBeTruthy();
    expect(screen.getByLabelText('Quantidade total *')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Por diária' }));
    fireEvent.click(screen.getByRole('option', { name: 'Por evento' }));
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Máquina de pipoca' } });
    fireEvent.change(screen.getByLabelText('Preço por evento (R$) *'), { target: { value: '300,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar item' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Máquina de pipoca', item_type: 'machine', price_mode: 'event', total_quantity: '1',
    }), null, false));
  });

});
