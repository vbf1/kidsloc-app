import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEAD, formatLeadCurrency, matchesLeadSearch, normalizeLead, validateLead,
  type LeadRecord,
} from '../lib/leadfesta';

const lead: LeadRecord = {
  id: 'lead-1', company_id: 'company-1', stage_id: 'stage-1', name: 'Maria Oliveira',
  phone: '31999990000', email: 'maria@example.com', contact_company: 'Festa Feliz',
  source: 'Instagram', estimated_value: 1250, expected_close_date: null, next_contact_at: null,
  notes: 'Solicitou orçamento para evento.', converted_customer_id: null,
  created_at: '2026-11-20T12:00:00.000Z', updated_at: '2026-11-20T12:00:00.000Z',
};

describe('LeadFesta data helpers', () => {
  it('normalizes contact data and defaults the source', () => {
    expect(normalizeLead({ ...EMPTY_LEAD, name: '  Maria   Oliveira ', email: ' MARIA@EXAMPLE.COM ' }))
      .toMatchObject({ name: 'Maria Oliveira', email: 'maria@example.com', source: 'Não informado' });
  });

  it('requires a valid lead name and validates email', () => {
    expect(validateLead({ ...EMPTY_LEAD, name: 'M', email: 'not-an-email' })).toMatchObject({
      name: expect.any(String), email: expect.any(String),
    });
    expect(validateLead({ ...EMPTY_LEAD, name: 'Maria', email: 'maria@example.com' })).toEqual({});
  });

  it('rejects negative or malformed estimated values', () => {
    expect(validateLead({ ...EMPTY_LEAD, name: 'Maria', estimated_value: '-10' }).estimated_value).toBeTruthy();
    expect(validateLead({ ...EMPTY_LEAD, name: 'Maria', estimated_value: '10,50' })).toEqual({});
  });

  it('searches accent-insensitively across lead fields', () => {
    expect(matchesLeadSearch(lead, 'maria')).toBe(true);
    expect(matchesLeadSearch(lead, 'orcamento')).toBe(true);
    expect(matchesLeadSearch(lead, 'inexistente')).toBe(false);
  });

  it('formats currency in Brazilian reais', () => {
    expect(formatLeadCurrency(1250)).toContain('1.250,00');
    expect(formatLeadCurrency(null)).toBe('—');
  });
});
