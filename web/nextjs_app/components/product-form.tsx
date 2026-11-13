'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { FieldFeedback, FormFeedback } from './form-feedback';
import { EMPTY_PRODUCT, normalizeProduct, validateProduct, type ProductFieldErrors, type ProductFormValues } from '../lib/products';

type ProductFormProps = {
  initialValues?: ProductFormValues;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
};
const inputClass = 'mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100 disabled:bg-gray-50';
const labelClass = 'block text-sm font-medium text-gray-700';
export function ProductForm({ initialValues = EMPTY_PRODUCT, saving, error, onCancel, onSubmit }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>({ ...initialValues });
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  function updateField(field: keyof ProductFormValues, value: string | boolean) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateProduct(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await onSubmit(normalizeProduct(values));
  }
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{initialValues.name ? 'Editar item' : 'Novo item do catálogo'}</h2>
        <p className="mt-1 text-sm text-gray-500">Cadastre brinquedos, máquinas e serviços em um só catálogo.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="product-item-type">Tipo de item
          <select id="product-item-type" value={values.item_type} disabled={saving || Boolean(initialValues.name)}
            onChange={(event) => {
              const item_type = event.target.value as ProductFormValues['item_type'];
              setValues((current) => ({ ...current, item_type, inventory_mode: 'quantity', total_quantity: item_type === 'service' ? '0' : '1', price_mode: item_type === 'service' ? 'event' : 'daily' }));
              setFieldErrors({});
            }} className={inputClass}>
            <option value="toy">Brinquedo</option>
            <option value="machine">Máquina</option>
            <option value="service">Serviço</option>
          </select>
          {initialValues.name && <span className="mt-1 block text-xs text-gray-400">O tipo não pode ser alterado após o cadastro para preservar o histórico.</span>}
        </label>
        <label className={labelClass} htmlFor="product-name">Nome *
          <input id="product-name" value={values.name} maxLength={160} disabled={saving} onChange={(event) => updateField('name', event.target.value)} placeholder="Ex.: Cama elástica" className={inputClass} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'product-name-error' : undefined} />
          {fieldErrors.name && <FieldFeedback id="product-name-error">{fieldErrors.name}</FieldFeedback>}
        </label>
      </div>
      <label className={labelClass} htmlFor="product-description">Descrição
        <textarea id="product-description" rows={2} maxLength={1000} value={values.description} disabled={saving} onChange={(event) => updateField('description', event.target.value)} className={inputClass} placeholder="Detalhes do brinquedo ou serviço" aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? 'product-description-error' : undefined} />
        {fieldErrors.description && <FieldFeedback id="product-description-error">{fieldErrors.description}</FieldFeedback>}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="product-price">{values.item_type === 'service' || (values.item_type === 'machine' && values.price_mode === 'event') ? 'Preço por evento (R$) *' : 'Preço por diária (R$) *'}
          <input id="product-price" inputMode="decimal" value={values.price} disabled={saving} onChange={(event) => updateField('price', event.target.value)} placeholder="0,00" className={inputClass} aria-invalid={Boolean(fieldErrors.price)} aria-describedby={fieldErrors.price ? 'product-price-error' : undefined} />
          {fieldErrors.price && <FieldFeedback id="product-price-error">{fieldErrors.price}</FieldFeedback>}
        </label>
        {values.item_type === 'machine' && <label className={labelClass} htmlFor="product-price-mode">Cobrança
          <select id="product-price-mode" value={values.price_mode} disabled={saving} onChange={(event) => updateField('price_mode', event.target.value)} className={inputClass}>
            <option value="daily">Por diária</option><option value="event">Por evento</option>
          </select>
        </label>}
        {values.item_type !== 'service' && <>
          <label className={labelClass} htmlFor="product-inventory-mode">Controle de estoque
            <select id="product-inventory-mode" value={values.inventory_mode} disabled={saving} onChange={(event) => updateField('inventory_mode', event.target.value)} className={inputClass}>
              <option value="quantity">Por quantidade</option>
              <option value="individual">Unidades individuais</option>
            </select>
          </label>
          <label className={labelClass} htmlFor="product-quantity">Quantidade total *
            <input id="product-quantity" type="number" min="0" max="1000000" step="1" value={values.total_quantity} disabled={saving} onChange={(event) => updateField('total_quantity', event.target.value)} className={inputClass} aria-invalid={Boolean(fieldErrors.total_quantity)} aria-describedby={fieldErrors.total_quantity ? 'product-quantity-error' : undefined} />
            {fieldErrors.total_quantity && <FieldFeedback id="product-quantity-error">{fieldErrors.total_quantity}</FieldFeedback>}
          </label>
        </>}
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
        <input type="checkbox" checked={values.active} disabled={saving} onChange={(event) => updateField('active', event.target.checked)} className="size-4 accent-[#8054d8]" />
        Item ativo e disponível para uso
      </label>
      <label className={labelClass} htmlFor="product-notes">Observações internas
        <textarea id="product-notes" rows={3} maxLength={2000} value={values.notes} disabled={saving} onChange={(event) => updateField('notes', event.target.value)} className={inputClass} placeholder="Informações internas" aria-invalid={Boolean(fieldErrors.notes)} aria-describedby={fieldErrors.notes ? 'product-notes-error' : undefined} />
        {fieldErrors.notes && <FieldFeedback id="product-notes-error">{fieldErrors.notes}</FieldFeedback>}
      </label>
      {error && <FormFeedback>{error}</FormFeedback>}
      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6e43c4] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar item'}</button>
      </div>
    </form>
  );
}
