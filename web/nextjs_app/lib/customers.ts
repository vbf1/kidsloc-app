export type CustomerRecord = {
  id: string; company_id: string; name: string; phone: string | null; email: string | null;
  address: string | null; notes: string | null; created_at: string; updated_at: string;
  cpf: string | null; rg: string | null; zip: string | null; neighborhood: string | null; city_state: string | null;
};
export type CustomerFormValues = {
  name: string; phone: string; email: string; cpf: string; rg: string; zip: string;
  address: string; neighborhood: string; city_state: string; notes: string;
};
export type CustomerFieldErrors = Partial<Record<keyof CustomerFormValues, string>>;
export const EMPTY_CUSTOMER: CustomerFormValues = {
  name: '', phone: '', email: '', cpf: '', rg: '', zip: '', address: '', neighborhood: '', city_state: '', notes: '',
};
export const CUSTOMER_PAGE_SIZE = 25;
export function onlyDigits(value: string): string { return value.replace(/\D/g, ''); }
export function normalizeCustomer(values: CustomerFormValues): CustomerFormValues {
  return {
    name: values.name.trim().replace(/\s+/g, ' '), phone: onlyDigits(values.phone),
    email: values.email.trim().toLowerCase(), cpf: onlyDigits(values.cpf), rg: values.rg.trim(),
    zip: onlyDigits(values.zip), address: values.address.trim(), neighborhood: values.neighborhood.trim(),
    city_state: values.city_state.trim(), notes: values.notes.trim(),
  };
}
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calculateDigit = (base: string, factor: number) => {
    let total = 0;
    for (const character of base) { total += Number(character) * factor; factor -= 1; }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculateDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calculateDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
}
export function validateCustomer(values: CustomerFormValues): CustomerFieldErrors {
  const normalized = normalizeCustomer(values);
  const errors: CustomerFieldErrors = {};
  if (normalized.name.length < 2 || normalized.name.length > 160) errors.name = 'Informe um nome entre 2 e 160 caracteres.';
  if (normalized.phone.length > 20) errors.phone = 'O telefone deve ter no máximo 20 números.';
  if (normalized.email && (normalized.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email))) errors.email = 'Informe um e-mail válido.';
  if (normalized.cpf && !isValidCpf(normalized.cpf)) errors.cpf = 'Confira o CPF informado.';
  if (normalized.rg.length > 30) errors.rg = 'O RG deve ter no máximo 30 caracteres.';
  if (normalized.zip && normalized.zip.length !== 8) errors.zip = 'O CEP deve conter 8 números.';
  if (normalized.address.length > 300) errors.address = 'O endereço deve ter no máximo 300 caracteres.';
  if (normalized.neighborhood.length > 120) errors.neighborhood = 'O bairro deve ter no máximo 120 caracteres.';
  if (normalized.city_state.length > 120) errors.city_state = 'A cidade/UF deve ter no máximo 120 caracteres.';
  if (normalized.notes.length > 2000) errors.notes = 'As observações devem ter no máximo 2.000 caracteres.';
  return errors;
}
export function buildCustomerSearchFilter(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const escaped = term.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&').replace(/"/g, '\\"');
  const pattern = '"%' + escaped + '%"';
  const filters = ['name', 'phone', 'email', 'cpf'].map((column) => column + '.ilike.' + pattern);
  const numericTerm = onlyDigits(term);
  if (numericTerm && numericTerm !== term) {
    filters.push('phone.ilike."%' + numericTerm + '%"');
    filters.push('cpf.ilike."%' + numericTerm + '%"');
  }
  return filters.join(',');
}
