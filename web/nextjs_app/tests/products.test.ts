import { describe, expect, it } from 'vitest';
import { buildProductSearchFilter, formatPrice, formatProductInventoryError, matchesProductSearch, normalizeProduct, parsePrice, validateProduct, type ProductFormValues } from '../lib/products';
const toy: ProductFormValues = { name: '  Cama   Elástica ', description: ' Brinquedo ', item_type: 'toy', inventory_mode: 'individual', total_quantity: '3', price: '85,50', price_mode: 'daily', active: true, notes: '' };
const service: ProductFormValues = { ...toy, name: 'Recreação', item_type: 'service', total_quantity: '0', price: '150,00', price_mode: 'event' };
const machine: ProductFormValues = { ...toy, name: 'Máquina de pipoca', item_type: 'machine', total_quantity: '2', price: '300,00', price_mode: 'event' };
describe('product price handling', () => {
  it('parses Brazilian and dot-decimal prices and rejects malformed or excessive values', () => {
    expect(parsePrice('85,50')).toBe(85.5); expect(parsePrice('85.50')).toBe(85.5);
    expect(parsePrice('1.250,00')).toBe(1250); expect(parsePrice('0')).toBe(0);
    expect(parsePrice('-1')).toBeNull(); expect(parsePrice('10,999')).toBeNull(); expect(parsePrice('')).toBeNull();
  });
  it('formats currency in Brazilian locale', () => { expect(formatPrice(85.5)).toContain('85,50'); });
});
describe('product normalization and validation', () => {
  it('normalizes names and keeps toy inventory', () => {
    expect(normalizeProduct(toy)).toMatchObject({ name: 'Cama Elástica', total_quantity: '3', inventory_mode: 'individual' });
    expect(validateProduct(toy)).toEqual({});
  });
  it('normalizes services to zero physical stock', () => { expect(normalizeProduct(service).total_quantity).toBe('0'); expect(validateProduct(service)).toEqual({}); });
  it('validates machines with physical stock and event-based pricing', () => { expect(normalizeProduct(machine)).toMatchObject({ item_type: 'machine', total_quantity: '2', price_mode: 'event' }); expect(validateProduct(machine)).toEqual({}); });
  it('rejects missing names, invalid price and fractional or negative toy quantities', () => {
    expect(validateProduct({ ...toy, name: 'A' }).name).toBeTruthy();
    expect(validateProduct({ ...toy, price: 'abc' }).price).toBeTruthy();
    expect(validateProduct({ ...toy, total_quantity: '-1' }).total_quantity).toBeTruthy();
    expect(validateProduct({ ...toy, total_quantity: '1.5' }).total_quantity).toBeTruthy();
  });
  it('validates maximum field lengths', () => {
    expect(validateProduct({ ...toy, description: 'D'.repeat(1001) }).description).toBeTruthy();
    expect(validateProduct({ ...toy, notes: 'N'.repeat(2001) }).notes).toBeTruthy();
  });
});
describe('product search filter', () => {
  it('searches name, description and notes', () => {
    expect(buildProductSearchFilter('cama')).toBe('name.ilike."%cama%",description.ilike."%cama%",notes.ilike."%cama%"');
  });
  it('escapes wildcard and quote delimiters', () => { expect(buildProductSearchFilter('a%_b"c')).toContain('a\\%\\_b\\"c'); });
  it('returns null for empty search', () => { expect(buildProductSearchFilter('  ')).toBeNull(); });
});

describe('product accent-insensitive search', () => {
  const product = { name: 'Máquina de Pipoca', description: 'Açúcar refinado', notes: 'Manutenção preventiva' };
  it('finds product text fields regardless of accents or letter case', () => {
    for (const term of ['maquina', 'PIPOCA', 'acucar refinado', 'manutencao']) {
      expect(matchesProductSearch(product, term), term).toBe(true);
    }
  });
});

describe('product inventory error messages', () => {
  it('explains reserved units and inventory count constraints', () => {
    expect(formatProductInventoryError('Não é possível alterar a situação enquanto ela estiver reservada em uma locação ativa.', 'Falha.')).toContain('reservada');
    expect(formatProductInventoryError('Todas as unidades físicas previstas já foram cadastradas (3).', 'Falha.')).toContain('3');
    expect(formatProductInventoryError('A quantidade total não pode ser menor que o número de unidades físicas já cadastradas (2).', 'Falha.')).toContain('(2)');
  });
  it('uses a safe fallback for unrelated database errors', () => {
    expect(formatProductInventoryError('permission denied', 'Não foi possível salvar.')).toBe('Não foi possível salvar.');
  });
});
