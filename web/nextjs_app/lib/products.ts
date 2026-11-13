export type ProductType = 'toy' | 'machine' | 'service';
export type InventoryMode = 'quantity' | 'individual';
export type ProductRecord = {
  id: string; company_id: string; name: string; description: string | null;
  item_type: ProductType; inventory_mode: InventoryMode; total_quantity: number;
  daily_price: number | string; event_price: number | string | null;
  active: boolean; notes: string | null; created_at: string; updated_at: string;
};
export type ProductFormValues = {
  name: string; description: string; item_type: ProductType; inventory_mode: InventoryMode;
  total_quantity: string; price: string; price_mode: 'daily' | 'event'; active: boolean; notes: string;
};
export type ProductFieldErrors = Partial<Record<keyof ProductFormValues, string>>;
export const EMPTY_PRODUCT: ProductFormValues = {
  name: '', description: '', item_type: 'toy', inventory_mode: 'quantity',
  total_quantity: '1', price: '', price_mode: 'daily', active: true, notes: '',
};
export const PRODUCT_PAGE_SIZE = 20;
export function parsePrice(value: string): number | null {
  const input = value.trim().replace(/\s/g, '');
  if (!input) return null;
  const normalized = input.includes(',') ? input.replace(/\./g, '').replace(',', '.') : input;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed <= 9999999999.99 ? Math.round(parsed * 100) / 100 : null;
}
export function formatPrice(value: number | string | null): string {
  if (value === null || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed);
}
export function normalizeProduct(values: ProductFormValues): ProductFormValues {
  return {
    ...values, name: values.name.trim().replace(/\s+/g, ' '), description: values.description.trim(),
    notes: values.notes.trim(),
    total_quantity: values.item_type === 'service' ? '0' : String(Math.trunc(Number(values.total_quantity))),
    price: values.price.trim(),
  };
}
export function validateProduct(values: ProductFormValues): ProductFieldErrors {
  const normalized = normalizeProduct(values);
  const errors: ProductFieldErrors = {};
  if (normalized.name.length < 2 || normalized.name.length > 160) errors.name = 'Informe um nome entre 2 e 160 caracteres.';
  if (normalized.description.length > 1000) errors.description = 'A descrição deve ter no máximo 1.000 caracteres.';
  if (normalized.notes.length > 2000) errors.notes = 'As observações devem ter no máximo 2.000 caracteres.';
  if (values.item_type !== 'service' && (!/^\d+$/.test(values.total_quantity.trim()) || Number(values.total_quantity) < 0 || Number(values.total_quantity) > 1000000)) {
    errors.total_quantity = 'Informe uma quantidade inteira entre 0 e 1.000.000.';
  }
  if (parsePrice(values.price) === null) errors.price = 'Informe um preço válido, com até duas casas decimais.';
  return errors;
}
export function buildProductSearchFilter(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const escaped = term.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&').replace(/"/g, '\\"');
  const pattern = '"%' + escaped + '%"';
  return ['name', 'description', 'notes'].map((column) => column + '.ilike.' + pattern).join(',');
}
