import { describe, expect, it } from 'vitest';
import { isValidCompanySlug, slugifyCompanyName } from '../lib/company';

describe('company identifier', () => {
  it('normalizes Brazilian company names', () => {
    expect(slugifyCompanyName('Sonho Kids Brinquedos')).toBe('sonho-kids-brinquedos');
    expect(slugifyCompanyName('Locação & Diversão São José')).toBe('locacao-diversao-sao-jose');
  });

  it('rejects empty, uppercase and malformed identifiers', () => {
    expect(isValidCompanySlug('')).toBe(false);
    expect(isValidCompanySlug('Minha Empresa')).toBe(false);
    expect(isValidCompanySlug('-kidsloc')).toBe(false);
    expect(isValidCompanySlug('kidsloc-')).toBe(false);
  });

  it('accepts lowercase hyphenated identifiers', () => {
    expect(isValidCompanySlug('sonho-kids')).toBe(true);
  });
});
