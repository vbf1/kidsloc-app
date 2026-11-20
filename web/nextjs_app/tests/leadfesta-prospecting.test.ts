import { describe, expect, it } from 'vitest';
import { isDuplicateProspect, mapOSMElement, matchesProspectingSegment, normalizeProspectingText } from '../lib/leadfesta-prospecting';

describe('LeadFesta prospecting helpers', () => {
  it('normalizes accents and spacing', () => {
    expect(normalizeProspectingText('  SÃO   PAULO ')).toBe('sao paulo');
  });

  it('maps public OpenStreetMap business data', () => {
    expect(mapOSMElement({
      type: 'node', id: 123, lat: -19.9, lon: -44,
      tags: { name: 'Escola Exemplo', amenity: 'school', phone: '+55 31 3333-4444', 'addr:street': 'Rua A' },
    })).toMatchObject({ id: 'node/123', name: 'Escola Exemplo', category: 'school', phone: '+55 31 3333-4444', address: 'Rua A' });
  });

  it('ignores unnamed map objects', () => {
    expect(mapOSMElement({ type: 'node', id: 1, tags: { amenity: 'school' } })).toBeNull();
  });

  it('matches a free-text segment against business tags', () => {
    const prospect = mapOSMElement({ type: 'node', id: 1, tags: { name: 'Colégio Horizonte', amenity: 'school' } })!;
    expect(matchesProspectingSegment(prospect, 'escola', { amenity: 'school' })).toBe(true);
    expect(matchesProspectingSegment(prospect, 'colégio', { amenity: 'school' })).toBe(true);
    expect(matchesProspectingSegment(prospect, '', {})).toBe(true);
  });

  it('detects duplicates by company name or phone', () => {
    const existing = [{ name: 'Escola Horizonte', contact_company: 'Escola Horizonte', phone: '31999990000' }];
    expect(isDuplicateProspect({ name: '  escola horizonte ', phone: '' }, existing)).toBe(true);
    expect(isDuplicateProspect({ name: 'Outro nome', phone: '(31) 99999-0000' }, existing)).toBe(true);
    expect(isDuplicateProspect({ name: 'Outra empresa', phone: '' }, existing)).toBe(false);
  });
});
