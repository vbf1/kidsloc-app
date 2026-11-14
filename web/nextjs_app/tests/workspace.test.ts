import { describe, expect, it } from 'vitest';
import { getWorkspaceCompanyName } from '../lib/workspace';

describe('getWorkspaceCompanyName', () => {
  it('returns the company name from a relationship object', () => {
    expect(getWorkspaceCompanyName({ name: 'Sonho Kids' })).toBe('Sonho Kids');
  });

  it('supports a relationship returned as an array', () => {
    expect(getWorkspaceCompanyName([{ name: 'Sonho Kids' }])).toBe('Sonho Kids');
  });

  it('trims whitespace from the company name', () => {
    expect(getWorkspaceCompanyName({ name: '  Sonho Kids  ' })).toBe('Sonho Kids');
  });

  it('returns null when the relationship is missing or malformed', () => {
    expect(getWorkspaceCompanyName(null)).toBeNull();
    expect(getWorkspaceCompanyName([])).toBeNull();
    expect(getWorkspaceCompanyName({ name: '   ' })).toBeNull();
    expect(getWorkspaceCompanyName({ name: 42 })).toBeNull();
  });
});
