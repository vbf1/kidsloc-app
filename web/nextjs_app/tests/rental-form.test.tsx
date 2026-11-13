import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RentalForm } from '../components/rental-form';
import { EMPTY_RENTAL, type RentalCustomer, type RentalProduct } from '../lib/rentals';

afterEach(() => cleanup());

const customers: RentalCustomer[] = [
  { id: 'customer-1', name: 'Ana Souza', phone: '31999990000' },
];
const products: RentalProduct[] = [
  {
    id: 'toy-1', name: 'Cama Elástica', item_type: 'toy', inventory_mode: 'quantity',
    total_quantity: 2, daily_price: 100, event_price: null,
  },
  {
    id: 'machine-1', name: 'Máquina de Pipoca', item_type: 'machine', inventory_mode: 'quantity',
    total_quantity: 1, daily_price: 0, event_price: 300,
  },
];
const members = [{ user_id: 'member-1', full_name: 'Responsável', role: 'owner' }];

function fillRequiredFields() {
  fireEvent.click(screen.getByRole('button', { name: 'Selecione um cliente' }));
  fireEvent.click(screen.getByRole('option', { name: /Ana Souza/ }));
  fireEvent.change(screen.getByLabelText('Data inicial *'), { target: { value: '2026-11-20' } });
  fireEvent.change(screen.getByLabelText('Data final *'), { target: { value: '2026-11-20' } });
  fireEvent.change(screen.getByLabelText('Horário inicial *'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('Horário final *'), { target: { value: '18:00' } });
}

describe('RentalForm', () => {
  it('submits a fixed-price combo with multiple items and no delivery address', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RentalForm
        isEditing={false}
        saving={false}
        error=""
        customers={customers}
        products={products}
        members={members}
        currentUserId="member-1"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('radio', { name: /Combo \/ pacote fechado/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirada pelo cliente' }));
    fireEvent.click(screen.getByRole('option', { name: /Entrega no endereço/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecione um brinquedo ou máquina' }));
    fireEvent.click(screen.getByRole('option', { name: /Cama Elástica/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecione um brinquedo ou máquina' }));
    fireEvent.click(screen.getByRole('option', { name: /Máquina de Pipoca/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Valor total do combo/ }), { target: { value: '450,00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar locação' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      delivery_method: 'delivery',
      delivery_address: '',
      total_amount: '450,00',
      items: [
        { product_id: 'toy-1', quantity: '1', unit_price: '0,00' },
        { product_id: 'machine-1', quantity: '1', unit_price: '0,00' },
      ],
    })));
  });

  it('recognizes an existing combo while editing and preserves its fixed total', () => {
    render(
      <RentalForm
        initialValues={{
          ...EMPTY_RENTAL,
          customer_id: 'customer-1',
          start_date: '2026-11-20',
          end_date: '2026-11-20',
          start_time: '09:00',
          end_time: '18:00',
          delivery_method: 'delivery',
          delivery_address: '',
          total_amount: '450,00',
          items: [
            { product_id: 'toy-1', quantity: '1', unit_price: '0,00' },
            { product_id: 'machine-1', quantity: '1', unit_price: '0,00' },
          ],
        }}
        isEditing
        saving={false}
        error=""
        customers={customers}
        products={products}
        members={members}
        currentUserId="member-1"
        onCancel={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect((screen.getByRole('radio', { name: /Combo \/ pacote fechado/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Valor total do combo (R$) *') as HTMLInputElement).value).toBe('450,00');
    expect(screen.getAllByText('Incluído no combo')).toHaveLength(2);
  });
});
