export type RentalStatus = 'pending' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';
export type RentalDeliveryMethod = 'delivery' | 'customer_pickup';
export type RentalProductType = 'toy' | 'machine' | 'service';
export type RentalProduct = {
  id: string; name: string; item_type: RentalProductType; inventory_mode: 'quantity' | 'individual';
  total_quantity: number; daily_price: number | string; event_price: number | string | null;
};
export type RentalCustomer = { id: string; name: string; phone: string | null };
export type RentalMember = { user_id: string; full_name: string; role: string };
export type RentalItemValue = { product_id: string; quantity: string; unit_price: string };
export type RentalAddressParts = {
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
};
export const EMPTY_RENTAL_ADDRESS: RentalAddressParts = {
  postal_code: '', street: '', number: '', complement: '',
  neighborhood: '', city: '', state: '', reference: '',
};
export function parseRentalAddress(value: string | null | undefined): RentalAddressParts {
  const raw = value?.trim() ?? '';
  if (!raw) return { ...EMPTY_RENTAL_ADDRESS };
  const labels: Record<string, keyof RentalAddressParts> = {
    'Rua': 'street', 'Número': 'number', 'Complemento': 'complement',
    'Bairro': 'neighborhood', 'Cidade': 'city', 'Estado': 'state',
    'CEP': 'postal_code', 'Referência': 'reference',
  };
  const parsed = { ...EMPTY_RENTAL_ADDRESS };
  let recognized = 0;
  for (const part of raw.split(' | ')) {
    const separator = part.indexOf(': ');
    if (separator < 0) continue;
    const field = labels[part.slice(0, separator)];
    if (!field) continue;
    parsed[field] = part.slice(separator + 2);
    recognized++;
  }
  // Legacy addresses remain untouched in the street field.
  return recognized > 0 ? parsed : { ...EMPTY_RENTAL_ADDRESS, street: raw };
}
export function formatRentalAddress(parts: RentalAddressParts): string {
  const entries: Array<[string, string]> = [
    ['Rua', parts.street], ['Número', parts.number], ['Complemento', parts.complement],
    ['Bairro', parts.neighborhood], ['Cidade', parts.city], ['Estado', parts.state],
    ['CEP', parts.postal_code], ['Referência', parts.reference],
  ];
  return entries.filter(([, value]) => value.trim())
    .map(([label, value]) => label + ': ' + value.trim()).join(' | ').slice(0, 500);
}
export function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits.length >= 12 && digits.length <= 13 ? digits : null;
}
export function formatRentalWhatsAppMessage(args: {
  companyName: string; customerName: string; startDate: string; endDate: string;
  startTime: string; endTime: string; items: Array<{ name: string; quantity: number }>;
  deliveryMethod: RentalDeliveryMethod; deliveryAddress: string; totalAmount: number;
}): string {
  const date = (value: string) => {
    const [year, month, day] = value.split('-');
    return year && month && day ? day + '/' + month + '/' + year : value;
  };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(args.totalAmount);
  const itemLines = args.items.map(item => '- ' + item.name + ' (quantidade: ' + item.quantity + ')').join('\n');
  return [
    'Olá, ' + args.customerName + '! Tudo bem?',
    'Aqui é da ' + args.companyName + '. Seu agendamento foi registrado com os seguintes dados:',
    '',
    'Data: ' + date(args.startDate) + (args.endDate !== args.startDate ? ' até ' + date(args.endDate) : ''),
    'Horário: ' + args.startTime + ' às ' + args.endTime,
    'Itens:',
    itemLines,
    'Entrega: ' + (args.deliveryMethod === 'delivery' ? 'no endereço' : 'retirada pelo cliente'),
    ...(args.deliveryMethod === 'delivery' && args.deliveryAddress ? ['Endereço: ' + args.deliveryAddress] : []),
    'Valor total: ' + money,
    '',
    'Por favor, confira se está tudo correto. Obrigado pela preferência!',
  ].join('\n');
}
export type RentalFormValues = {
  customer_id: string; start_date: string; end_date: string; start_time: string; end_time: string;
  status: RentalStatus; delivery_method: RentalDeliveryMethod; delivery_address: string;
  total_amount: string; deposit_amount: string; responsible_user_ids: string[]; items: RentalItemValue[];
};
export type RentalFieldErrors = Partial<Record<'customer_id' | 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'delivery_address' | 'total_amount' | 'items', string>>;
export type RentalRecord = {
  id: string; company_id: string; rental_number: number; customer_id: string | null;
  start_date: string; end_date: string; start_time: string | null; end_time: string | null;
  status: RentalStatus; delivery_method: RentalDeliveryMethod; delivery_address: string | null;
  delivery_fee: number | string; discount: number | string; total_amount: number | string;
  deposit_amount: number | string; notes: string | null; created_by: string | null;
  created_at: string; updated_at: string;
  customer_name: string; items: RentalItemRecord[]; responsible_names: string[]; responsible_user_ids: string[];
};
export type RentalItemRecord = {
  id: string; rental_id: string; product_id: string; quantity: number;
  unit_price: number | string; subtotal: number | string;
  product_name: string; item_type: RentalProductType;
};
export const RENTAL_STATUSES: RentalStatus[] = ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'];
export const EMPTY_RENTAL: RentalFormValues = {
  customer_id: '', start_date: '', end_date: '', start_time: '09:00', end_time: '18:00',
  status: 'pending', delivery_method: 'customer_pickup', delivery_address: '',
  total_amount: '0,00', deposit_amount: '0,00', responsible_user_ids: [], items: [],
};
export function parseRentalPrice(value: string): number | null {
  const input = value.trim().replace(/\s/g, '');
  if (!input) return null;
  const normalized = input.includes(',') ? input.replace(/\./g, '').replace(',', '.') : input;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 9999999999.99 ? Math.round(parsed * 100) / 100 : null;
}
export function formatRentalPrice(value: number | string | null | undefined): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed);
}
export function rentalDays(startDate: string, endDate: string): number {
  const parse = (value: string) => {
    const parts = value.split('-').map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : NaN;
  };
  const start = parse(startDate), end = parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}
export function defaultRentalUnitPrice(product: RentalProduct, startDate: string, endDate: string): number {
  if (product.item_type === 'machine' || product.item_type === 'service') return Number(product.event_price ?? 0);
  return Number(product.daily_price ?? 0) * Math.max(1, rentalDays(startDate, endDate));
}
export function rentalItemsTotal(items: RentalItemValue[]): number {
  return Math.round(items.reduce((sum, item) => {
    const quantity = Number(item.quantity), price = parseRentalPrice(item.unit_price);
    return sum + (Number.isInteger(quantity) && quantity > 0 && price !== null ? quantity * price : 0);
  }, 0) * 100) / 100;
}
export function normalizeRentalSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}
export function matchesRentalSearch(rental: Pick<RentalRecord, 'rental_number' | 'customer_name' | 'delivery_address' | 'items' | 'responsible_names'>, search: string): boolean {
  const term = normalizeRentalSearch(search.trim());
  if (!term) return true;
  const fields = [String(rental.rental_number), rental.customer_name, rental.delivery_address ?? '',
    ...rental.items.map((item) => item.product_name), ...rental.responsible_names];
  return fields.some((field) => normalizeRentalSearch(field).includes(term));
}
export function validateRental(values: RentalFormValues, isEditing = false): RentalFieldErrors {
  const errors: RentalFieldErrors = {};
  if (!values.customer_id) errors.customer_id = 'Selecione um cliente.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.start_date)) errors.start_date = 'Informe a data inicial.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.end_date)) errors.end_date = 'Informe a data final.';
  if (values.start_date && values.end_date && rentalDays(values.start_date, values.end_date) < 1) errors.end_date = 'A data final deve ser igual ou posterior à inicial.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.start_time)) errors.start_time = 'Informe um horário válido.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.end_time)) errors.end_time = 'Informe um horário válido.';
  if (values.start_date && values.end_date && values.start_date === values.end_date && values.start_time && values.end_time && values.end_time <= values.start_time) {
    errors.end_time = 'O horário final deve ser posterior ao inicial.';
  }
  if (values.delivery_address.trim().length > 500) errors.delivery_address = 'O endereço deve ter no máximo 500 caracteres.';
  if (parseRentalPrice(values.total_amount) === null) errors.total_amount = 'Informe um valor total válido.';
  const totalAmount = parseRentalPrice(values.total_amount);
  const depositAmount = parseRentalPrice(values.deposit_amount);
  if (depositAmount === null) errors.deposit_amount = 'Informe um valor de sinal válido.';
  else if (totalAmount !== null && depositAmount > totalAmount) errors.deposit_amount = 'O sinal não pode ser maior que o valor total da locação.';
  if (!values.items.length) errors.items = 'Adicione pelo menos um item à locação.';
  else {
    const ids = values.items.map((item) => item.product_id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.items = 'Selecione itens diferentes e válidos.';
    else if (values.items.some((item) => !/^\d+$/.test(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 1000000)) errors.items = 'Cada item precisa ter uma quantidade inteira maior que zero.';
    else if (values.items.some((item) => parseRentalPrice(item.unit_price) === null)) errors.items = 'Confira o preço unitário dos itens.';
  }
  if (!isEditing && !['pending', 'confirmed', 'ongoing'].includes(values.status)) errors.items = 'Status inválido para uma nova locação.';
  return errors;
}
export function rentalStatusLabel(status: RentalStatus): string {
  const labels: Record<RentalStatus, string> = {
    pending: 'Pendente', confirmed: 'Confirmada', ongoing: 'Em andamento',
    completed: 'Concluída', cancelled: 'Cancelada',
  };
  return labels[status] ?? status;
}
export function formatRentalDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}
