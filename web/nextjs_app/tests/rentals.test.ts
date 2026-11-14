import { describe, expect, it } from 'vitest';
import {
  defaultRentalUnitPrice, formatRentalPrice, matchesRentalSearch, parseRentalPrice,
  rentalDays, rentalItemsTotal, rentalStatusLabel, validateRental,
  type RentalFormValues, type RentalProduct, type RentalRecord,
} from '../lib/rentals';

const toy: RentalProduct = {
  id: 'toy-1', name: 'Cama Elástica', item_type: 'toy', inventory_mode: 'individual',
  total_quantity: 2, daily_price: 100, event_price: null,
};
const machine: RentalProduct = {
  id: 'machine-1', name: 'Máquina de Pipoca', item_type: 'machine', inventory_mode: 'individual',
  total_quantity: 1, daily_price: 0, event_price: 300,
};
const valid: RentalFormValues = {
  customer_id: 'customer-1', start_date: '2026-11-20', end_date: '2026-11-21',
  start_time: '09:00', end_time: '18:00', status: 'pending',
  delivery_method: 'customer_pickup', delivery_address: '', total_amount: '200,00',
  responsible_user_ids: ['member-1'], items: [{ product_id: 'toy-1', quantity: '1', unit_price: '200,00' }],
};
describe('rental price and date calculations', () => {
  it('parses Brazilian prices and rejects malformed values', () => {
    expect(parseRentalPrice('1.250,50')).toBe(1250.5);
    expect(parseRentalPrice('85.50')).toBe(85.5);
    expect(parseRentalPrice('-10')).toBeNull();
    expect(parseRentalPrice('1,999')).toBeNull();
    expect(parseRentalPrice('')).toBeNull();
  });
  it('counts rental days inclusively and avoids timezone shifts', () => {
    expect(rentalDays('2026-11-20', '2026-11-20')).toBe(1);
    expect(rentalDays('2026-11-20', '2026-11-22')).toBe(3);
    expect(rentalDays('2026-11-22', '2026-11-20')).toBe(0);
  });
  it('uses daily pricing for toys and event pricing for machines', () => {
    expect(defaultRentalUnitPrice(toy, '2026-11-20', '2026-11-22')).toBe(300);
    expect(defaultRentalUnitPrice(machine, '2026-11-20', '2026-11-22')).toBe(300);
  });
  it('calculates line totals and formats currency in pt-BR', () => {
    expect(rentalItemsTotal([{ product_id: 'toy-1', quantity: '2', unit_price: '75,50' }])).toBe(151);
    expect(formatRentalPrice(151)).toContain('151,00');
  });
});
describe('rental validation', () => {
  it('accepts a valid new rental', () => { expect(validateRental(valid)).toEqual({}); });
  it('requires a customer, dates, at least one item and a valid total', () => {
    const errors = validateRental({ ...valid, customer_id: '', start_date: '', items: [], total_amount: 'abc' });
    expect(errors.customer_id).toBeTruthy();
    expect(errors.start_date).toBeTruthy();
    expect(errors.items).toBeTruthy();
    expect(errors.total_amount).toBeTruthy();
  });
  it('rejects reversed dates and invalid time ranges', () => {
    expect(validateRental({ ...valid, end_date: '2026-11-19' }).end_date).toBeTruthy();
    expect(validateRental({ ...valid, start_date: '2026-11-20', end_date: '2026-11-20', start_time: '18:00', end_time: '09:00' }).end_time).toBeTruthy();
  });
  it('allows delivery without an address and accepts an optional address when provided', () => {
    expect(validateRental({ ...valid, delivery_method: 'delivery', delivery_address: '' })).toEqual({});
    expect(validateRental({ ...valid, delivery_method: 'delivery', delivery_address: 'Rua A, 10' })).toEqual({});
  });
  it('accepts a fixed-price combo with zero individual item prices', () => {
    expect(validateRental({ ...valid, total_amount: '500,00', items: [
      { product_id: 'toy-1', quantity: '1', unit_price: '0,00' },
      { product_id: 'machine-1', quantity: '1', unit_price: '0,00' },
    ] })).toEqual({});
  });
  it('rejects duplicate products and invalid quantities', () => {
    expect(validateRental({ ...valid, items: [...valid.items, ...valid.items] }).items).toBeTruthy();
    expect(validateRental({ ...valid, items: [{ ...valid.items[0], quantity: '1.5' }] }).items).toBeTruthy();
  });
  it('allows completed and cancelled statuses only while editing', () => {
    expect(validateRental({ ...valid, status: 'completed' }).items).toBeTruthy();
    expect(validateRental({ ...valid, status: 'completed' }, true)).toEqual({});
    expect(validateRental({ ...valid, status: 'cancelled' }, true)).toEqual({});
  });
});
describe('rental search', () => {
  const rental = {
    rental_number: 42, customer_name: 'Márcia Oliveira', delivery_address: 'Rua São João',
    items: [{ product_name: 'Cama Elástica' }], responsible_names: ['João Pedro'],
  } as RentalRecord;
  it('searches by customer, item and responsible regardless of accents', () => {
    expect(matchesRentalSearch(rental, 'marcia')).toBe(true);
    expect(matchesRentalSearch(rental, 'cama elastica')).toBe(true);
    expect(matchesRentalSearch(rental, 'joao pedro')).toBe(true);
  });
  it('labels statuses in Portuguese', () => { expect(rentalStatusLabel('ongoing')).toBe('Em andamento'); });
});
