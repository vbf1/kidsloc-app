import { describe, expect, it } from 'vitest';
import { buildCustomerSearchFilter, isValidCpf, matchesCustomerSearch, normalizeCustomer, validateCustomer, type CustomerFormValues } from '../lib/customers';
const validValues: CustomerFormValues = {
  name: '  Maria   da Silva ', phone: '(31) 99999-1234', email: ' MARIA@EXAMPLE.COM ',
  cpf: '529.982.247-25', rg: 'MG-12.345.678', zip: '30.000-000', address: 'Rua das Flores, 10',
  neighborhood: 'Centro', city_state: 'Belo Horizonte/MG', notes: ' Cliente prefere contato pela manhã. ',
};
describe('customer normalization', () => {
  it('normalizes whitespace, email and numeric document/contact fields', () => {
    expect(normalizeCustomer(validValues)).toEqual({
      name: 'Maria da Silva', phone: '31999991234', email: 'maria@example.com', cpf: '52998224725',
      rg: 'MG-12.345.678', zip: '30000000', address: 'Rua das Flores, 10', neighborhood: 'Centro',
      city_state: 'Belo Horizonte/MG', notes: 'Cliente prefere contato pela manhã.',
    });
  });
});
describe('customer validation', () => {
  it('accepts valid optional data', () => { expect(validateCustomer(validValues)).toEqual({}); });
  it('requires a name between 2 and 160 characters', () => {
    expect(validateCustomer({ ...validValues, name: ' ' }).name).toBeTruthy();
    expect(validateCustomer({ ...validValues, name: 'A'.repeat(161) }).name).toBeTruthy();
  });
  it('validates optional email, CPF and CEP', () => {
    expect(validateCustomer({ ...validValues, email: 'not-an-email' }).email).toBeTruthy();
    expect(validateCustomer({ ...validValues, cpf: '111.111.111-11' }).cpf).toBeTruthy();
    expect(validateCustomer({ ...validValues, zip: '1234' }).zip).toBeTruthy();
  });
  it('validates optional field length limits', () => {
    expect(validateCustomer({ ...validValues, phone: '1'.repeat(21) }).phone).toBeTruthy();
    expect(validateCustomer({ ...validValues, rg: 'R'.repeat(31) }).rg).toBeTruthy();
    expect(validateCustomer({ ...validValues, address: 'A'.repeat(301) }).address).toBeTruthy();
    expect(validateCustomer({ ...validValues, neighborhood: 'B'.repeat(121) }).neighborhood).toBeTruthy();
    expect(validateCustomer({ ...validValues, city_state: 'C'.repeat(121) }).city_state).toBeTruthy();
    expect(validateCustomer({ ...validValues, notes: 'N'.repeat(2001) }).notes).toBeTruthy();
  });
});
describe('CPF validation', () => {
  it('accepts a valid CPF and rejects invalid or repeated digits', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
  });
});
describe('customer search filter', () => {
  it('searches name, phone, email and CPF with a quoted literal term', () => {
    expect(buildCustomerSearchFilter('maria')).toBe('name.ilike."%maria%",phone.ilike."%maria%",email.ilike."%maria%",cpf.ilike."%maria%"');
  });
  it('escapes LIKE wildcards and PostgREST quote delimiters', () => {
    expect(buildCustomerSearchFilter('a%_b"c')).toBe('name.ilike."%a\\%\\_b\\"c%",phone.ilike."%a\\%\\_b\\"c%",email.ilike."%a\\%\\_b\\"c%",cpf.ilike."%a\\%\\_b\\"c%"');
  });
  it('also searches digits-only formatted phone and CPF values', () => {
    expect(buildCustomerSearchFilter('(31) 999-1234')).toContain('phone.ilike."%319991234%"');
    expect(buildCustomerSearchFilter('(31) 999-1234')).toContain('cpf.ilike."%319991234%"');
  });
  it('returns null for an empty search', () => { expect(buildCustomerSearchFilter('   ')).toBeNull(); });
});

describe('customer accent-insensitive search', () => {
  const customer = {
    id: 'customer-1', company_id: 'company-1', name: 'Márcia Oliveira', phone: '31999991234',
    email: 'marcia@example.com', cpf: '52998224725', rg: 'MG-12.345.678', zip: '30000000',
    address: 'Rua São João, 10', neighborhood: 'Jardim América', city_state: 'Belo Horizonte/MG',
    notes: 'Prefere contato pela manhã.', created_at: '', updated_at: '',
  };
  it('finds customer text fields regardless of accents or letter case', () => {
    for (const term of ['marcia', 'Sao Joao', 'jardim america', 'belo horizonte', 'prefere contato pela manha']) {
      expect(matchesCustomerSearch(customer, term), term).toBe(true);
    }
  });
});
