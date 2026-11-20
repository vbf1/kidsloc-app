
export type IntentSearchLink = { source: string; description: string; url: string };

export type IntentSignal = {
  classification: 'buyer' | 'vendor' | 'unclear';
  reason: string;
  score: number;
  priority: 'high' | 'medium' | 'low';
  signals: string[];
};

export function classifyPublicIntent(value: string, hasPublicPhone = false): IntentSignal {
  const text = normalizeProspectingText(value);
  if (!text) return {
    classification: 'unclear', reason: 'Cole um trecho público para analisar os sinais de intenção.',
    score: 0, priority: 'low', signals: [],
  };

  const buyerPatterns = [
    /\b(procuro|procurando|busco|buscando)\b/,
    /\b(preciso|necessito)\b/,
    /\b(alguem indica|alguem recomenda|alguma indicacao|alguma recomendacao)\b/,
    /\b(onde encontro|onde acho|onde consigo)\b/,
    /\b(quero contratar|gostaria de contratar|preciso contratar)\b/,
    /\b(quero alugar|preciso alugar|gostaria de alugar)\b/,
    /\b(quero comprar|preciso comprar|gostaria de comprar)\b/,
    /\b(orcamento para|cotacao para)\b/,
    /\b(quem faz|quem trabalha com|alguem conhece)\b/,
  ];
  const vendorPatterns = [
    /\b(alugo|alugamos|locamos|locacao de)\b/,
    /\b(ofereco|oferecemos|vendemos|vendo)\b/,
    /\b(trabalho com|trabalhamos com|atuo com)\b/,
    /\b(sou fornecedor|somos fornecedores|sou prestador|somos prestadores)\b/,
    /\b(temos disponivel|tenho disponivel|disponivel para locacao)\b/,
    /\b(faca seu orcamento|peca seu orcamento|contrate nossos)\b/,
    /\b(atendemos|atendo na regiao)\b/,
  ];
  const buyerCount = buyerPatterns.filter((pattern) => pattern.test(text)).length;
  const vendor = vendorPatterns.some((pattern) => pattern.test(text));
  const buyer = buyerCount > 0;
  if (buyer && vendor) return {
    classification: 'unclear',
    reason: 'O texto mistura sinais de procura e oferta. Confira o contexto da publicação.',
    score: 25, priority: 'low', signals: ['Há expressões de procura e de oferta no mesmo texto'],
  };
  if (vendor) return {
    classification: 'vendor',
    reason: 'O texto contém expressões comuns de alguém oferecendo ou anunciando um produto ou serviço.',
    score: 0, priority: 'low', signals: ['Linguagem de oferta ou anúncio'],
  };
  if (!buyer) return {
    classification: 'unclear',
    reason: 'Não encontrei uma expressão clara de procura ou oferta. Confira o contexto da publicação.',
    score: 15, priority: 'low', signals: [],
  };

  const signals = ['Expressão direta de procura ou contratação'];
  let score = 55;
  if (buyerCount > 1) {
    score += 10;
    signals.push('Mais de uma expressão de intenção de compra');
  }
  if (/\b(urgente|com urgencia|para hoje|ainda hoje|amanha|o quanto antes|essa semana|esta semana)\b/.test(text)) {
    score += 15;
    signals.push('Prazo ou urgência mencionada');
  }
  if (/(r\$\s?\d|orcamento de|ate \d+ reais|valor maximo|quanto custa|qual o preco)/.test(text)) {
    score += 10;
    signals.push('Orçamento, preço ou limite de valor mencionado');
  }
  if (/\b(para dia|no dia|dia [0-9]{1,2}|em [0-9]{1,2}\/[0-9]{1,2}|para o dia)\b/.test(text)) {
    score += 10;
    signals.push('Data ou ocasião específica mencionada');
  }
  if (hasPublicPhone) {
    score += 5;
    signals.push('Telefone público informado na publicação');
  }
  score = Math.min(score, 100);
  const priority = score >= 75 ? 'high' : score >= 60 ? 'medium' : 'low';
  return {
    classification: 'buyer',
    reason: 'O texto contém sinais de alguém procurando comprar ou contratar. A pontuação indica apenas a força desses sinais.',
    score, priority, signals,
  };
}

export type IntentSearchPeriod = 'any' | 'day' | 'week' | 'month' | 'year';

export function buildIntentSearchLinks(service: string, location: string, period: IntentSearchPeriod = 'any'): IntentSearchLink[] {
  const product = service.trim();
  if (!product) return [];
  const area = location.trim();
  const intent = '("procuro" OR "estou procurando" OR "busco" OR "estou buscando" OR "preciso" OR "necessito" OR "alguém indica" OR "alguém recomenda" OR "alguém conhece" OR "alguma indicação" OR "onde encontro" OR "onde consigo" OR "quem faz" OR "orçamento para" OR "cotação para" OR "quero contratar" OR "preciso contratar" OR "quero comprar" OR "preciso comprar" OR "quero alugar" OR "preciso alugar")';
  const local = area ? ' "' + area.replace(/"/g, '') + '"' : '';
  const base = intent + ' "' + product.replace(/"/g, '') + '"' + local;
  const googlePeriod: Record<Exclude<IntentSearchPeriod, 'any'>, string> = { day: 'd', week: 'w', month: 'm', year: 'y' };
  const searches = [
    { source: 'Web (Google)', description: 'Páginas públicas indexadas na web', query: base },
    { source: 'Facebook público', description: 'Grupos, páginas e publicações públicas indexadas', query: base + ' site:facebook.com' },
    { source: 'Instagram público', description: 'Perfis e publicações públicas indexadas', query: base + ' site:instagram.com' },
    { source: 'Reddit', description: 'Discussões e pedidos públicos; confira as regras de uso comercial', query: base + ' site:reddit.com' },
    { source: 'TikTok público', description: 'Páginas e vídeos públicos indexados', query: base + ' site:tiktok.com' },
    { source: 'YouTube', description: 'Vídeos públicos e descrições indexadas', query: base + ' site:youtube.com' },
    { source: 'LinkedIn público', description: 'Publicações e páginas públicas', query: base + ' site:linkedin.com/posts' },
    { source: 'X (Twitter)', description: 'Publicações públicas indexadas', query: base + ' site:x.com OR site:twitter.com' },
    { source: 'Fóruns e comunidades', description: 'Discussões públicas em fóruns e comunidades', query: base + ' (fórum OR comunidade OR discussão)' },
    { source: 'Classificados públicos (OLX)', description: 'Anúncios e pedidos públicos; confira se o autor procura ou oferece', query: base + ' site:olx.com.br' },
    { source: 'Busca alternativa (DuckDuckGo)', description: 'Pesquisa independente na web', query: base },
    { source: 'Busca alternativa (Bing)', description: period === 'any' ? 'Pesquisa independente na web' : 'Pesquisa independente; ajuste o período nos filtros do buscador', query: base },
  ];
  return searches.map((item) => {
    const query = encodeURIComponent(item.query);
    if (item.source === 'Busca alternativa (DuckDuckGo)') {
      const filter = period === 'any' ? '' : '&df=' + googlePeriod[period];
      return { source: item.source, description: item.description, url: 'https://duckduckgo.com/?q=' + query + filter };
    }
    if (item.source === 'Busca alternativa (Bing)') return { source: item.source, description: item.description, url: 'https://www.bing.com/search?q=' + query };
    const filter = period === 'any' ? '' : '&tbs=qdr:' + googlePeriod[period];
    return { source: item.source, description: item.description, url: 'https://www.google.com/search?q=' + query + filter };
  });
}
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
  whatsapp: string;
  mobile: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  openingHours: string;
  description: string;
  brand: string;
  operator: string;
  address: string;
  osmUrl: string;
};

export function normalizeProspectingText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

export function mapOSMElement(element: OSMElement): ProspectResult | null {
  const tags = element.tags ?? {};
  const name = tags.name || tags['name:pt'] || tags.brand || '';
  if (!name.trim()) return null;
  const category = tags.amenity || tags.shop || tags.office || tags.craft ||
    tags.tourism || tags.leisure || tags.healthcare || tags.sport || tags['building:use'] || 'Empresa / estabelecimento';
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
  const social = (key: string) => tags['contact:' + key] || tags[key] || '';
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
    whatsapp: social('whatsapp'),
    mobile: tags.mobile || tags['contact:mobile'] || '',
    instagram: social('instagram'),
    facebook: social('facebook'),
    linkedin: social('linkedin'),
    openingHours: tags.opening_hours || '',
    description: tags.description || tags['description:pt'] || '',
    brand: tags.brand || '',
    operator: tags.operator || '',
    address: address || tags['addr:full'] || '',
    osmUrl: 'https://www.openstreetmap.org/' + element.type + '/' + element.id,
  };
}

const categoryTerms: Record<string, string> = {
  school: 'escola colegio',
  kindergarten: 'creche escola',
  college: 'faculdade colegio',
  university: 'universidade faculdade',
  restaurant: 'restaurante',
  cafe: 'cafe cafeteria',
  fast_food: 'lanchonete restaurante',
  bakery: 'padaria',
  supermarket: 'supermercado mercado',
  pharmacy: 'farmacia drogaria',
  hospital: 'hospital',
  clinic: 'clinica',
  doctors: 'medico consultorio',
  dentist: 'dentista odontologia',
  hairdresser: 'cabeleireiro salao beleza',
  beauty: 'beleza estetica',
  bank: 'banco',
  car_repair: 'oficina mecanica',
  car_dealer: 'concessionaria carros',
  clothes: 'roupas loja',
  furniture: 'moveis loja',
  travel_agency: 'agencia turismo',
  hotel: 'hotel hospedagem',
};

export function matchesProspectingSegment(result: ProspectResult, segment: string, tags: Record<string, string> = {}): boolean {
  const query = normalizeProspectingText(segment);
  if (!query) return true;
  const category = normalizeProspectingText(result.category);
  const aliases = Object.entries(categoryTerms)
    .filter(([key]) => category.includes(key.replace(/_/g, ' ')))
    .map(([, value]) => value);
  const haystack = normalizeProspectingText([
    result.name, result.category, ...aliases,
    ...Object.entries(tags).flatMap(([key, value]) => [key, value]),
  ].join(' '));
  const tokens = query.split(' ').filter((token) => token.length > 2);
  return haystack.includes(query) || tokens.some((token) => haystack.includes(token));
}

export function isDuplicateProspect(
  prospect: Pick<ProspectResult, 'name' | 'phone'>,
  existing: Array<{ name: string; phone: string | null; contact_company: string | null }>,
): boolean {
  const name = normalizeProspectingText(prospect.name);
  const phone = (prospect.phone || '').replace(/\D/g, '');
  return existing.some((lead) => {
    const existingName = normalizeProspectingText(lead.contact_company || lead.name);
    const existingPhone = (lead.phone || '').replace(/\D/g, '');
    return existingName === name || (phone.length >= 8 && existingPhone === phone);
  });
}
