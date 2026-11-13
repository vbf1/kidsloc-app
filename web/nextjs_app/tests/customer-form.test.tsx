import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerForm } from '../components/customer-form';
afterEach(() => cleanup());

describe('CustomerForm', () => {
  it('shows a validation message and does not submit without a name', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CustomerForm saving={false} error="" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    expect(screen.getByText('Informe um nome entre 2 e 160 caracteres.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('submits normalized customer values when the form is valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CustomerForm saving={false} error="" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: '  Ana   Souza ' } });
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: ' ANA@EXAMPLE.COM ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana Souza', email: 'ana@example.com' })));
  });
});
