'use client';
import { useState } from 'react';
import type { FormEvent, HTMLInputTypeAttribute } from 'react';
import { FieldFeedback, FormFeedback } from './form-feedback';
import { EMPTY_CUSTOMER, normalizeCustomer, validateCustomer, type CustomerFieldErrors, type CustomerFormValues } from '../lib/customers';
type CustomerFormProps = {
  initialValues?: CustomerFormValues; saving: boolean; error: string; onCancel: () => void;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
};
const inputClass = 'mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100 disabled:bg-gray-50';
const labelClass = 'block text-sm font-medium text-gray-700';
export function CustomerForm({ initialValues = EMPTY_CUSTOMER, saving, error, onCancel, onSubmit }: CustomerFormProps) {
  const [values, setValues] = useState<CustomerFormValues>({ ...initialValues });
  const [fieldErrors, setFieldErrors] = useState<CustomerFieldErrors>({});
  function updateField(field: keyof CustomerFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateCustomer(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await onSubmit(normalizeCustomer(values));
  }
  function field(name: keyof CustomerFormValues, label: string, placeholder: string,
    options: { required?: boolean; maxLength?: number; type?: HTMLInputTypeAttribute } = {}) {
    const errorId = 'customer-' + name + '-error';
    return (
      <label className={labelClass}>
        {label}{options.required ? ' *' : ''}
        <input id={'customer-' + name} name={name} type={options.type ?? 'text'} required={options.required}
          maxLength={options.maxLength} className={inputClass} value={values[name]}
          onChange={(event) => updateField(name, event.target.value)} placeholder={placeholder}
          aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? errorId : undefined} disabled={saving} />
        {fieldErrors[name] && <FieldFeedback id={errorId}>{fieldErrors[name]}</FieldFeedback>}
      </label>
    );
  }
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{initialValues.name ? 'Editar cliente' : 'Novo cliente'}</h2>
        <p className="mt-1 text-sm text-gray-500">Preencha os dados do cliente. Somente o nome é obrigatório.</p>
      </div>
      <section aria-labelledby="customer-personal-heading">
        <h3 id="customer-personal-heading" className="mb-3 text-sm font-bold uppercase tracking-wide text-[#6840bd]">Dados pessoais</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Nome completo', 'Nome do cliente', { required: true, maxLength: 160 })}
          {field('phone', 'Telefone / WhatsApp', '(31) 99999-9999', { maxLength: 30 })}
          {field('email', 'E-mail', 'cliente@exemplo.com', { type: 'email', maxLength: 254 })}
          {field('cpf', 'CPF', '000.000.000-00', { maxLength: 20 })}
          {field('rg', 'RG', 'Documento de identidade', { maxLength: 30 })}
        </div>
      </section>
      <section aria-labelledby="customer-address-heading">
        <h3 id="customer-address-heading" className="mb-3 text-sm font-bold uppercase tracking-wide text-[#6840bd]">Endereço</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('zip', 'CEP', '00000-000', { maxLength: 12 })}
          {field('address', 'Endereço e número', 'Rua, avenida, número e complemento', { maxLength: 300 })}
          {field('neighborhood', 'Bairro', 'Bairro', { maxLength: 120 })}
          {field('city_state', 'Cidade / UF', 'Ex.: Belo Horizonte/MG', { maxLength: 120 })}
        </div>
      </section>
      <section>
        <label className={labelClass} htmlFor="customer-notes">Observações
          <textarea id="customer-notes" name="notes" rows={3} maxLength={2000} className={inputClass}
            value={values.notes} onChange={(event) => updateField('notes', event.target.value)}
            placeholder="Informações adicionais sobre o cliente" aria-invalid={Boolean(fieldErrors.notes)}
            aria-describedby={fieldErrors.notes ? 'customer-notes-error' : undefined} disabled={saving} />
          {fieldErrors.notes && <FieldFeedback id="customer-notes-error">{fieldErrors.notes}</FieldFeedback>}
        </label>
      </section>
      {error && <FormFeedback>{error}</FormFeedback>}
      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6e43c4] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar cliente'}</button>
      </div>
    </form>
  );
}
