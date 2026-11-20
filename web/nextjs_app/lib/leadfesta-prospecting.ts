export type OSMElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type ProspectResult = {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  osmUrl: string;
};

export function normalizeProspectingText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .trim().toLocaleLowerCase('pt-BR').replace(/\\s+/g, ' ');
}

export function mapOSMElement(element: OSMElement): ProspectResult | null {
  const tags = element.tags ?? {};
  const name = tags.name || tags['name:pt'] || tags.brand || '';
  if (!name.trim()) return null;
  const category = tags.amenity || tags.shop || tags.office || tags.craft ||
    tags.tourism || tags.leisure || tags.healthcare || tags.sport || tags['building:use'] || 'Empresa / estabelecimento';
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
  const district = tags['addr:suburb'] || tags['addr:neighbourhood'] || '';
  const city = tags['addr:city'] || '';
  const address = [street, district, city].filter(Boolean).join(' - ');
  return {
    id: element.type + '/' + element.id,
    name: name.trim(),
    category: String(category).replace(/_/g, ' '),
    phone: tags.phone || tags['contact:phone'] || '',
    email: tags.email || tags['contact:email'] || '',
    website: tags.website || tags['contact:website'] || '',
    address,
    osmUrl: 'https://www.openstreetmap.org/' + element.type + '/' + element.id,
  };
}

export function matchesProspectingSegment(result: ProspectResult, segment: string, tags: Record<string, string> = {}): boolean {
  const query = normalizeProspectingText(segment);
  if (!query) return true;
  const haystack = normalizeProspectingText([
    result.name, result.category, ...Object.entries(tags).flatMap(([key, value]) => [key, value]),
  ].join(' '));
  const tokens = query.split(' ').filter((token) => token.length > 2);
  return haystack.includes(query) || tokens.some((token) => haystack.includes(token));
}

export function isDuplicateProspect(
  prospect: Pick<ProspectResult, 'name' | 'phone'>,
  existing: Array<{ name: string; phone: string | null; contact_company: string | null }>,
): boolean {
  const name = normalizeProspectingText(prospect.name);
  const phone = (prospect.phone || '').replace(/\\D/g, '');
  return existing.some((lead) => {
    const existingName = normalizeProspectingText(lead.contact_company || lead.name);
    const existingPhone = (lead.phone || '').replace(/\\D/g, '');
    return existingName === name || (phone.length >= 8 && existingPhone === phone);
  });
}
