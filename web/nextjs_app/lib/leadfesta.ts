export type LeadStage = {
  id: string;
  company_id: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type LeadRecord = {
  id: string;
  company_id: string;
  stage_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_company: string | null;
  source: string;
  estimated_value: number | string | null;
  expected_close_date: string | null;
  next_contact_at: string | null;
  notes: string | null;
  converted_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadActivity = {
  id: string;
  company_id: string;
  lead_id: string;
  activity_type: 'note' | 'call' | 'email' | 'whatsapp' | 'meeting' | 'status_change' | 'conversion';
  body: string;
  created_at: string;
};

export type LeadFormValues = {
  name: string;
  phone: string;
  email: string;
  contact_company: string;
  source: string;
  estimated_value: string;
  expected_close_date: string;
  next_contact_at: string;
  notes: string;
};

export const EMPTY_LEAD: LeadFormValues = {
  name: '', phone: '', email: '', contact_company: '', source: '', estimated_value: '',
  expected_close_date: '', next_contact_at: '', notes: '',
};

export function normalizeLead(values: LeadFormValues): LeadFormValues {
  return {
    name: values.name.trim().replace(/\s+/g, ' '),
    phone: values.phone.replace(/[^\d+]/g, '').slice(0, 20),
    email: values.email.trim().toLowerCase(),
    contact_company: values.contact_company.trim().replace(/\s+/g, ' '),
    source: values.source.trim().replace(/\s+/g, ' ') || 'Não informado',
    estimated_value: values.estimated_value.trim().replace(',', '.'),
    expected_close_date: values.expected_close_date,
    next_contact_at: values.next_contact_at,
    notes: values.notes.trim(),
  };
}

export function validateLead(values: LeadFormValues): Partial<Record<keyof LeadFormValues, string>> {
  const value = normalizeLead(values);
  const errors: Partial<Record<keyof LeadFormValues, string>> = {};
  if (value.name.length < 2 || value.name.length > 160) errors.name = 'Informe um nome entre 2 e 160 caracteres.';
  if (value.phone.length > 20) errors.phone = 'O telefone deve ter até 20 caracteres.';
  if (value.email && (value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) errors.email = 'Informe um e-mail válido.';
  if (value.contact_company.length > 160) errors.contact_company = 'Use até 160 caracteres.';
  if (value.source.length > 100) errors.source = 'Use até 100 caracteres.';
  if (value.notes.length > 4000) errors.notes = 'Use até 4.000 caracteres.';
  if (value.estimated_value && (!/^\d+(\.\d{1,2})?$/.test(value.estimated_value) || Number(value.estimated_value) < 0)) {
    errors.estimated_value = 'Informe um valor válido, sem sinal negativo.';
  }
  return errors;
}

export function matchesLeadSearch(lead: LeadRecord, search: string): boolean {
  const term = search.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
  if (!term) return true;
  return [lead.name, lead.phone, lead.email, lead.contact_company, lead.source, lead.notes]
    .some((value) => value !== null && value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').includes(term));
}

export function formatLeadCurrency(value: number | string | null): string {
  if (value === null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

export function formatLeadDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value + (value.length === 10 ? 'T12:00:00' : ''));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR').format(date);
}
