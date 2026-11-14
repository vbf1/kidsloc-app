'use client';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { FieldFeedback, FormFeedback } from './form-feedback';
import { SearchablePicker } from './searchable-picker';
import {
  defaultRentalUnitPrice, EMPTY_RENTAL, formatRentalPrice, parseRentalPrice, rentalItemsTotal,
  validateRental, type RentalCustomer, type RentalFieldErrors, type RentalFormValues,
  type RentalMember, type RentalProduct,
} from '../lib/rentals';

type RentalFormProps = {
  initialValues?: RentalFormValues;
  isEditing: boolean;
  saving: boolean;
  error: string;
  customers: RentalCustomer[];
  products: RentalProduct[];
  members: RentalMember[];
  currentUserId: string;
  onCancel: () => void;
  onSubmit: (values: RentalFormValues) => Promise<void>;
};
const inputClass = 'mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100 disabled:bg-gray-50';
const labelClass = 'block text-sm font-medium text-gray-700';
function moneyInput(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
export function RentalForm({
  initialValues = EMPTY_RENTAL, isEditing, saving, error, customers, products, members,
  currentUserId, onCancel, onSubmit,
}: RentalFormProps) {
  const [values, setValues] = useState<RentalFormValues>(() => ({
    ...initialValues,
    responsible_user_ids: initialValues.responsible_user_ids.length
      ? [...initialValues.responsible_user_ids] : (!isEditing && currentUserId ? [currentUserId] : []),
    items: initialValues.items.map((item) => ({ ...item })),
  }));
  const [pricingMode, setPricingMode] = useState<'individual' | 'combo'>(() => initialValues.items.length > 0 && initialValues.items.every((item) => parseRentalPrice(item.unit_price) === 0) ? 'combo' : 'individual');
  const [fieldErrors, setFieldErrors] = useState<RentalFieldErrors>({});
  const [productToAdd, setProductToAdd] = useState('');
  const availableProducts = useMemo(() => products.filter((product) => product.item_type !== 'service' && !values.items.some((item) => item.product_id === product.id)), [products, values.items]);
  function updateField<K extends keyof RentalFormValues>(field: K, value: RentalFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }
  function addItem() {
    const product = products.find((item) => item.id === productToAdd);
    if (!product || values.items.some((item) => item.product_id === product.id)) return;
    const nextItems = [...values.items, {
      product_id: product.id, quantity: '1',
      unit_price: pricingMode === 'combo' ? '0,00' : moneyInput(defaultRentalUnitPrice(product, values.start_date, values.end_date)),
    }];
    setValues((current) => ({ ...current, items: nextItems, total_amount: pricingMode === 'combo' ? current.total_amount : moneyInput(rentalItemsTotal(nextItems)) }));
    setFieldErrors((current) => ({ ...current, items: undefined }));
    setProductToAdd('');
  }
  function updateItem(index: number, field: 'quantity' | 'unit_price', value: string) {
    const nextItems = values.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item);
    setValues((current) => ({ ...current, items: nextItems, total_amount: pricingMode === 'combo' ? current.total_amount : moneyInput(rentalItemsTotal(nextItems)) }));
    setFieldErrors((current) => ({ ...current, items: undefined }));
  }
  function removeItem(index: number) {
    const nextItems = values.items.filter((_, itemIndex) => itemIndex !== index);
    setValues((current) => ({ ...current, items: nextItems, total_amount: pricingMode === 'combo' ? current.total_amount : moneyInput(rentalItemsTotal(nextItems)) }));
  }
  function updateDate(field: 'start_date' | 'end_date', value: string) {
    const next = { ...values, [field]: value };
    const nextItems = values.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.product_id);
      if (pricingMode === 'combo' || !product || product.item_type !== 'toy') return item;
      return { ...item, unit_price: moneyInput(defaultRentalUnitPrice(product, next.start_date, next.end_date)) };
    });
    setValues((current) => ({ ...current, [field]: value, items: nextItems, total_amount: pricingMode === 'combo' ? current.total_amount : moneyInput(rentalItemsTotal(nextItems)) }));
    setFieldErrors((current) => ({ ...current, [field]: undefined, end_date: undefined }));
  }
  function changePricingMode(mode: 'individual' | 'combo') {
    setPricingMode(mode);
    const nextItems = values.items.map((item) => {
      if (mode === 'combo') return { ...item, unit_price: '0,00' };
      const product = products.find((candidate) => candidate.id === item.product_id);
      return product ? { ...item, unit_price: moneyInput(defaultRentalUnitPrice(product, values.start_date, values.end_date)) } : item;
    });
    setValues((current) => ({ ...current, items: nextItems, total_amount: mode === 'combo' ? current.total_amount : moneyInput(rentalItemsTotal(nextItems)) }));
  }
  function toggleResponsible(userId: string, checked: boolean) {
    const next = checked
      ? [...values.responsible_user_ids, userId]
      : values.responsible_user_ids.filter((id) => id !== userId);
    updateField('responsible_user_ids', next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateRental(values, isEditing);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    await onSubmit({
      ...values,
      delivery_address: values.delivery_method === 'delivery' ? values.delivery_address.trim() : '',
      total_amount: moneyInput(parseRentalPrice(values.total_amount) ?? 0),
      items: values.items.map((item) => ({
        ...item, quantity: String(Number(item.quantity)),
        unit_price: moneyInput(parseRentalPrice(item.unit_price) ?? 0),
      })),
    });
  }
  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{isEditing ? 'Editar locação' : 'Nova locação'}</h2>
          <p className="mt-1 text-sm text-gray-500">Informe o cliente, período, itens e funcionários responsáveis.</p>
        </div>
        <span className="text-xs text-gray-400">* Campos obrigatórios</span>
      </div>
      {error && <FormFeedback>{error}</FormFeedback>}
      <section aria-labelledby="rental-customer-heading">
        <h3 id="rental-customer-heading" className="mb-3 text-sm font-bold uppercase tracking-wide text-[#6840bd]">Cliente e período</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Cliente *</label>
            <div className="mt-1">
              <SearchablePicker
                title="Selecionar cliente"
                value={values.customer_id}
                options={customers.map((customer) => ({ value: customer.id, label: customer.name, description: customer.phone || 'Telefone não informado' }))}
                placeholder="Selecione um cliente"
                searchPlaceholder="Buscar por nome ou telefone..."
                emptyText="Nenhum cliente encontrado."
                disabled={saving}
                onChange={(value) => updateField('customer_id', value)}
              />
            </div>
            {fieldErrors.customer_id && <FieldFeedback id="rental-customer-error">{fieldErrors.customer_id}</FieldFeedback>}
          </div>
          <div className={labelClass}>Situação
            <div className="mt-1"><SearchablePicker title="Situação da locação" value={values.status} options={[
              { value: 'pending', label: 'Pendente' }, { value: 'confirmed', label: 'Confirmada' }, { value: 'ongoing', label: 'Em andamento' },
              ...(isEditing ? [{ value: 'completed', label: 'Concluída' }, { value: 'cancelled', label: 'Cancelada' }] : []),
            ]} placeholder="Selecione a situação" searchPlaceholder="Buscar situação..." emptyText="Nenhuma situação encontrada." disabled={saving} onChange={(value) => updateField('status', value as RentalFormValues['status'])} /></div>
          </div>
          <label className={labelClass}>Data inicial *
            <input type="date" value={values.start_date} onChange={(event) => updateDate('start_date', event.target.value)} className={inputClass} disabled={saving} />
            {fieldErrors.start_date && <FieldFeedback id="rental-start-date-error">{fieldErrors.start_date}</FieldFeedback>}
          </label>
          <label className={labelClass}>Data final *
            <input type="date" value={values.end_date} min={values.start_date || undefined} onChange={(event) => updateDate('end_date', event.target.value)} className={inputClass} disabled={saving} />
            {fieldErrors.end_date && <FieldFeedback id="rental-end-date-error">{fieldErrors.end_date}</FieldFeedback>}
          </label>
          <label className={labelClass}>Horário inicial *
            <input type="time" value={values.start_time} onChange={(event) => updateField('start_time', event.target.value)} className={inputClass} disabled={saving} />
            {fieldErrors.start_time && <FieldFeedback id="rental-start-time-error">{fieldErrors.start_time}</FieldFeedback>}
          </label>
          <label className={labelClass}>Horário final *
            <input type="time" value={values.end_time} onChange={(event) => updateField('end_time', event.target.value)} className={inputClass} disabled={saving} />
            {fieldErrors.end_time && <FieldFeedback id="rental-end-time-error">{fieldErrors.end_time}</FieldFeedback>}
          </label>
        </div>
      </section>
      <section aria-labelledby="rental-delivery-heading">
        <h3 id="rental-delivery-heading" className="mb-3 text-sm font-bold uppercase tracking-wide text-[#6840bd]">Entrega</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={labelClass}>Modalidade
            <div className="mt-1"><SearchablePicker title="Modalidade de entrega" value={values.delivery_method} options={[
              { value: 'customer_pickup', label: 'Retirada pelo cliente', description: 'O cliente busca os equipamentos' },
              { value: 'delivery', label: 'Entrega no endereço', description: 'A equipe leva os equipamentos ao local' },
            ]} placeholder="Selecione a modalidade" searchPlaceholder="Buscar modalidade..." emptyText="Nenhuma modalidade encontrada." disabled={saving} onChange={(value) => updateField('delivery_method', value as RentalFormValues['delivery_method'])} /></div>
          </div>
          {values.delivery_method === 'delivery' && <label className={labelClass + ' sm:col-span-2'}>Endereço de entrega (opcional)
            <textarea rows={2} maxLength={500} value={values.delivery_address} onChange={(event) => updateField('delivery_address', event.target.value)} className={inputClass} placeholder="Rua, número, bairro, cidade" disabled={saving} />
            {fieldErrors.delivery_address && <FieldFeedback id="rental-address-error">{fieldErrors.delivery_address}</FieldFeedback>}
          </label>}
        </div>
      </section>
      <section aria-labelledby="rental-items-heading">
        <h3 id="rental-items-heading" className="mb-3 text-sm font-bold uppercase tracking-wide text-[#6840bd]">Itens da locação</h3>
        <fieldset className="mb-4 rounded-xl border border-gray-200 p-3">
          <legend className="px-1 text-sm font-semibold text-gray-800">Forma de cobrança</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={'flex cursor-pointer items-start gap-3 rounded-lg border p-3 ' + (pricingMode === 'individual' ? 'border-purple-300 bg-purple-50' : 'border-gray-200')}>
              <input type="radio" name="rental-pricing-mode" checked={pricingMode === 'individual'} onChange={() => changePricingMode('individual')} disabled={saving} className="mt-1 accent-[#8054d8]" />
              <span><strong className="block text-sm text-gray-900">Preço por equipamento</strong><span className="text-xs text-gray-500">Cada item tem seu preço individual.</span></span>
            </label>
            <label className={'flex cursor-pointer items-start gap-3 rounded-lg border p-3 ' + (pricingMode === 'combo' ? 'border-purple-300 bg-purple-50' : 'border-gray-200')}>
              <input type="radio" name="rental-pricing-mode" checked={pricingMode === 'combo'} onChange={() => changePricingMode('combo')} disabled={saving} className="mt-1 accent-[#8054d8]" />
              <span><strong className="block text-sm text-gray-900">Combo / pacote fechado</strong><span className="text-xs text-gray-500">Um único valor para todos os equipamentos selecionados.</span></span>
            </label>
          </div>
        </fieldset>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className={labelClass}>Brinquedo ou máquina</label>
            <div className="mt-1">
              <SearchablePicker
                title="Adicionar equipamento"
                value={productToAdd}
                options={availableProducts.map((product) => ({ value: product.id, label: product.name, description: product.item_type === 'toy' ? 'Brinquedo' : 'Máquina' }))}
                placeholder="Selecione um brinquedo ou máquina"
                searchPlaceholder="Buscar equipamento..."
                emptyText="Nenhum equipamento disponível."
                disabled={saving || !availableProducts.length}
                onChange={setProductToAdd}
              />
            </div>
          </div>
          <button type="button" onClick={addItem} disabled={saving || !productToAdd} className="rounded-xl border border-purple-200 px-4 py-3 text-sm font-semibold text-[#6840bd] hover:bg-purple-50 disabled:opacity-50">Adicionar item</button>
        </div>
        {fieldErrors.items && <FieldFeedback id="rental-items-error">{fieldErrors.items}</FieldFeedback>}
        {values.items.length > 0 ? (
          <div className="mt-3 space-y-3">
            {values.items.map((item, index) => {
              const product = products.find((candidate) => candidate.id === item.product_id);
              return (
                <div key={item.product_id} className={'grid gap-3 rounded-xl border border-gray-200 p-3 sm:items-end ' + (pricingMode === 'combo' ? 'sm:grid-cols-[minmax(0,1fr)_100px_auto]' : 'sm:grid-cols-[minmax(0,1fr)_100px_150px_auto]')}>
                  <div className="min-w-0"><p className="text-sm font-semibold text-gray-900">{product?.name ?? 'Item do catálogo'}</p><p className="mt-1 text-xs text-gray-500">{product?.item_type === 'toy' ? 'Preço por dia × período' : 'Preço por evento'}</p></div>
                  <label className={labelClass}>Quantidade
                    <input type="number" min="1" max="1000000" step="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} className={inputClass} disabled={saving} />
                  </label>
                  {pricingMode === 'individual' ? <label className={labelClass}>Preço unitário (R$)
                    <input inputMode="decimal" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} className={inputClass} disabled={saving} />
                  </label> : <p className="self-center text-sm font-medium text-purple-700">Incluído no combo</p>}
                  <button type="button" onClick={() => removeItem(index)} disabled={saving} className="rounded-xl border border-red-100 px-3 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Remover</button>
                  <p className={'text-xs text-gray-500 ' + (pricingMode === 'combo' ? 'sm:col-span-3' : 'sm:col-span-4')}>{pricingMode === 'combo' ? 'Equipamento incluído no valor fechado do pacote.' : <>Subtotal: <strong className="text-gray-800">{formatRentalPrice((Number(item.quantity) || 0) * (parseRentalPrice(item.unit_price) ?? 0))}</strong></>}</p>
                </div>
              );
            })}
          </div>
        ) : <p className="mt-3 rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">Nenhum item adicionado.</p>}
      </section>
      <section aria-labelledby="rental-total-heading">
        <h3 id="rental-total-heading" className="mb-3 text-sm font-bold uppercase tracking-wide text-[#6840bd]">Valor</h3>
        <label className={labelClass}>{pricingMode === 'combo' ? 'Valor total do combo (R$) *' : 'Valor total da locação (R$) *' }
          <input inputMode="decimal" value={values.total_amount} onChange={(event) => updateField('total_amount', event.target.value)} className={inputClass} disabled={saving} />
          {pricingMode === 'combo' && <span className="mt-1 block text-xs font-normal text-gray-500">Informe o preço combinado para todos os equipamentos do pacote.</span>}
          {fieldErrors.total_amount && <FieldFeedback id="rental-total-error">{fieldErrors.total_amount}</FieldFeedback>}
        </label>
      </section>
      <section aria-labelledby="rental-responsibles-heading">
        <h3 id="rental-responsibles-heading" className="mb-2 text-sm font-bold uppercase tracking-wide text-[#6840bd]">Funcionários responsáveis</h3>
        <p className="mb-3 text-xs text-gray-500">A locação ficará visível ao criador, aos funcionários selecionados e aos administradores da empresa.</p>
        {members.length ? <div className="grid gap-2 sm:grid-cols-2">
          {members.map((member) => <label key={member.user_id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-700">
            <input type="checkbox" checked={values.responsible_user_ids.includes(member.user_id)} onChange={(event) => toggleResponsible(member.user_id, event.target.checked)} disabled={saving} className="size-4 accent-[#8054d8]" />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{member.full_name}{member.user_id === currentUserId ? ' (você)' : ''}</span><span className="text-xs text-gray-500">{member.role === 'owner' ? 'Proprietário' : member.role === 'admin' ? 'Administrador' : 'Funcionário'}</span></span>
          </label>)}
        </div> : <p className="text-sm text-gray-500">Não foi possível listar os funcionários desta empresa.</p>}
      </section>
      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#6e43c4] disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar locação'}</button>
      </div>
    </form>
  );
}
