import { describe, expect, it } from 'vitest';
import { isValidCompanyName, normalizeCompanyName } from '../lib/company';

describe('company name validation', () => {
  it('trims leading and trailing spaces and collapses repeated spaces', () => {
    expect(normalizeCompanyName('  Minha   Locadora  ')).toBe('Minha Locadora');
  });

  it('rejects names shorter than two characters', () => {
    expect(isValidCompanyName('')).toBe(false);
    expect(isValidCompanyName(' A ')).toBe(false);
  });

  it('accepts names within the database length limit', () => {
    expect(isValidCompanyName('Sonho Kids Brinquedos')).toBe(true);
    expect(isValidCompanyName('A'.repeat(160))).toBe(true);
  });

  it('rejects names longer than 160 characters', () => {
    expect(isValidCompanyName('A'.repeat(161))).toBe(false);
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(isValidCompanyName('😀'.repeat(80))).toBe(true);
    expect(isValidCompanyName('😀'.repeat(161))).toBe(false);
  });
});
