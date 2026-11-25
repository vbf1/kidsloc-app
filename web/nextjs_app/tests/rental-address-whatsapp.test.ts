import { describe, expect, it } from 'vitest';
import {
  formatRentalAddress,
  formatRentalWhatsAppMessage,
  normalizeWhatsAppPhone,
  parseRentalAddress,
} from '../lib/rentals';

describe('rental delivery address', () => {
  it('preserves legacy addresses when opening an existing rental', () => {
    const parts = parseRentalAddress('Rua das Flores, 120, Centro, Belo Horizonte - MG');
    expect(parts.street).toBe('Rua das Flores, 120, Centro, Belo Horizonte - MG');
    expect(parts.city).toBe('');
    expect(formatRentalAddress(parts)).toBe('Rua: Rua das Flores, 120, Centro, Belo Horizonte - MG');
  });


  it('round-trips structured fields when editing a saved rental', () => {
    const formatted = formatRentalAddress({
      postal_code: '30110-000', street: 'Rua das Flores', number: '120',
      complement: 'Casa 2', neighborhood: 'Centro', city: 'Belo Horizonte',
      state: 'MG', reference: 'Próximo à praça',
    });
    expect(parseRentalAddress(formatted)).toEqual({
      postal_code: '30110-000', street: 'Rua das Flores', number: '120',
      complement: 'Casa 2', neighborhood: 'Centro', city: 'Belo Horizonte',
      state: 'MG', reference: 'Próximo à praça',
    });
  });

  it('combines the structured address fields for the existing database field', () => {
    expect(formatRentalAddress({
      postal_code: '30110-000',
      street: 'Rua das Flores',
      number: '120',
      complement: 'Casa 2',
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      reference: 'Próximo à praça',
    })).toBe('Rua: Rua das Flores | Número: 120 | Complemento: Casa 2 | Bairro: Centro | Cidade: Belo Horizonte | Estado: MG | CEP: 30110-000 | Referência: Próximo à praça');
  });
});

describe('rental WhatsApp confirmation', () => {
  it('normalizes Brazilian phone numbers without duplicating the country code', () => {
    expect(normalizeWhatsAppPhone('(31) 99999-8888')).toBe('5531999998888');
    expect(normalizeWhatsAppPhone('+55 31 99999-8888')).toBe('5531999998888');
    expect(normalizeWhatsAppPhone('telefone inválido')).toBeNull();
  });

  it('creates a reviewable confirmation with the rental details', () => {
    const message = formatRentalWhatsAppMessage({
      companyName: 'KidsLoc Eventos',
      customerName: 'Ana',
      startDate: '2026-12-20',
      endDate: '2026-12-20',
      startTime: '14:00',
      endTime: '18:00',
      items: [{ name: 'Cama elástica', quantity: 1 }],
      deliveryMethod: 'delivery',
      deliveryAddress: 'Rua das Flores, 120, Centro',
      totalAmount: 350,
    });
    expect(message).toContain('Olá, Ana!');
    expect(message).toContain('20/12/2026');
    expect(message).toContain('Cama elástica (quantidade: 1)');
    expect(message).toContain('Rua das Flores, 120, Centro');
    expect(message).toContain('350,00');
  });
});
