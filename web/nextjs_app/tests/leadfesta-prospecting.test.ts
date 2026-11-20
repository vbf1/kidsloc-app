import { describe, expect, it } from 'vitest';
import { buildIntentSearchLinks, classifyPublicIntent, isDuplicateProspect, mapOSMElement, matchesProspectingSegment, normalizeProspectingText } from '../lib/leadfesta-prospecting';

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

  it('extracts additional public contact and business details', () => {
    expect(mapOSMElement({
      type: 'way', id: 456,
      tags: {
        name: 'Clínica Exemplo', amenity: 'clinic',
        'contact:whatsapp': '+55 31 99999-0000',
        'contact:instagram': '@clinicaexemplo',
        'contact:facebook': 'https://facebook.com/clinicaexemplo',
        opening_hours: 'Mo-Fr 08:00-18:00',
        description: 'Atendimento especializado',
        brand: 'Rede Exemplo',
        operator: 'Grupo Exemplo',
        'addr:full': 'Av. Central, 100 - Centro',
      },
    })).toMatchObject({
      whatsapp: '+55 31 99999-0000',
      instagram: '@clinicaexemplo',
      facebook: 'https://facebook.com/clinicaexemplo',
      openingHours: 'Mo-Fr 08:00-18:00',
      description: 'Atendimento especializado',
      brand: 'Rede Exemplo',
      operator: 'Grupo Exemplo',
      address: 'Av. Central, 100 - Centro',
    });
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

  it('does not match unrelated businesses when searching for a rental service', () => {
    const pharmacy = mapOSMElement({ type: 'node', id: 99, tags: { name: 'Farmácia Central', amenity: 'pharmacy' } })!;
    expect(matchesProspectingSegment(pharmacy, 'locação de brinquedos', { amenity: 'pharmacy' })).toBe(false);
  });

  it('builds generic intent searches across public sources', () => {
    const links = buildIntentSearchLinks('fotografia', 'Contagem, MG');
    expect(links.length).toBeGreaterThanOrEqual(6);
    expect(links[0].url).toContain('google.com/search?q=');
    expect(decodeURIComponent(links[0].url)).toContain('procuro');
    expect(decodeURIComponent(links[0].url)).toContain('fotografia');
    expect(decodeURIComponent(links[0].url)).toContain('Contagem, MG');
    expect(links.some((link) => link.source === 'Facebook público')).toBe(true);
    expect(buildIntentSearchLinks('', 'Contagem, MG')).toEqual([]);
  });

  it('applies selected publication recency to supported search engines', () => {
    const day = buildIntentSearchLinks('serviço de limpeza', 'Contagem, MG', 'day');
    const month = buildIntentSearchLinks('serviço de limpeza', 'Contagem, MG', 'month');
    const any = buildIntentSearchLinks('serviço de limpeza', 'Contagem, MG', 'any');
    expect(day[0].url).toContain('tbs=qdr:d');
    expect(month[0].url).toContain('tbs=qdr:m');
    expect(any[0].url).not.toContain('tbs=qdr:');
    expect(day.find((link) => link.source === 'Busca alternativa (DuckDuckGo)')?.url).toContain('df=d');
    expect(day.find((link) => link.source === 'Busca alternativa (Bing)')?.description).toContain('ajuste o período');
  });

  it('builds broad buyer-intent searches without assuming a specific industry', () => {
    const links = buildIntentSearchLinks('consultoria financeira', 'Contagem, MG');
    expect(links.length).toBeGreaterThan(5);
    expect(links[0].url).toContain(encodeURIComponent('"busco"'));
    expect(links[0].url).toContain(encodeURIComponent('"quero comprar"'));
    expect(links[0].url).toContain(encodeURIComponent('consultoria financeira'));
    expect(links[0].url).toContain(encodeURIComponent('Contagem, MG'));
  });

  it('classifies buyer intent across different business sectors', () => {
    expect(classifyPublicIntent('Estou procurando fotógrafo para casamento')).toMatchObject({ classification: 'buyer' });
    expect(classifyPublicIntent('Alguém indica uma empresa de limpeza?')).toMatchObject({ classification: 'buyer' });
    expect(classifyPublicIntent('Preciso contratar um contador')).toMatchObject({ classification: 'buyer' });
  });

  it('scores buyer intent transparently using only public post signals', () => {
    expect(classifyPublicIntent('Estou procurando um fotógrafo para casamento')).toMatchObject({
      classification: 'buyer', score: 55, priority: 'low',
    });
    expect(classifyPublicIntent('Preciso contratar um eletricista urgente para hoje, orçamento de R$ 300, para dia 22', true)).toMatchObject({
      classification: 'buyer', score: 100, priority: 'high',
    });
    expect(classifyPublicIntent('Alugo brinquedos para festas')).toMatchObject({
      classification: 'vendor', score: 0, priority: 'low',
    });
    expect(classifyPublicIntent('')).toMatchObject({ classification: 'unclear', score: 0 });
  });

  it('identifies service providers and keeps ambiguous posts for human review', () => {
    expect(classifyPublicIntent('Alugo brinquedos para festas')).toMatchObject({ classification: 'vendor' });
    expect(classifyPublicIntent('Oferecemos serviços de fotografia')).toMatchObject({ classification: 'vendor' });
    expect(classifyPublicIntent('Fotografia para casamento')).toMatchObject({ classification: 'unclear' });
    expect(classifyPublicIntent('Procuro fotógrafo, também ofereço decoração')).toMatchObject({ classification: 'unclear' });
    expect(classifyPublicIntent('')).toMatchObject({ classification: 'unclear' });
  });

  it('detects duplicates by company name or phone', () => {
    const existing = [{ name: 'Escola Horizonte', contact_company: 'Escola Horizonte', phone: '31999990000' }];
    expect(isDuplicateProspect({ name: '  escola horizonte ', phone: '' }, existing)).toBe(true);
    expect(isDuplicateProspect({ name: 'Outro nome', phone: '(31) 99999-0000' }, existing)).toBe(true);
    expect(isDuplicateProspect({ name: 'Outra empresa', phone: '' }, existing)).toBe(false);
  });
});
