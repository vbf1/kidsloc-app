'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type ProductUnit = {
  id: string;
  asset_code: string | null;
  description: string | null;
  status: 'available' | 'maintenance' | 'inactive';
};
type ProductUnitManagerProps = {
  productId: string;
  productName: string;
  companyId: string;
  totalQuantity: number;
  onClose: () => void;
};

export function ProductUnitManager({ productId, productName, companyId, totalQuantity, onClose }: ProductUnitManagerProps) {
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [assetCode, setAssetCode] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUnits = useCallback(async () => {
    if (!supabase) return;
    setError('');
    const { data, error: queryError } = await supabase
      .from('product_units')
      .select('id,asset_code,description,status')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .order('created_at', { ascending: true });
    if (queryError) setError('Não foi possível carregar as unidades. Tente novamente.');
    else setUnits((data ?? []) as ProductUnit[]);
    setLoading(false);
  }, [companyId, productId]);

  useEffect(() => { void loadUnits(); }, [loadUnits]);

  async function addUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    if (units.length >= totalQuantity) { setError('Todas as unidades previstas já foram cadastradas. Ajuste a quantidade no cadastro do brinquedo se necessário.'); return; }
    const code = assetCode.trim();
    if (!code) { setError('Informe o código de identificação da unidade.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('product_units').select('id')
        .eq('company_id', companyId).eq('asset_code', code).limit(1);
      if (duplicateError) { setError('Não foi possível validar o código. Tente novamente.'); return; }
      if (duplicate?.length) { setError('Esse código já está sendo usado por outra unidade da empresa.'); return; }
      const { error: insertError } = await supabase.from('product_units').insert({
        company_id: companyId,
        product_id: productId,
        asset_code: code,
        description: description.trim() || null,
        status: 'available',
      });
      if (insertError) { setError('Não foi possível cadastrar a unidade. Confira os dados e tente novamente.'); return; }
      setAssetCode(''); setDescription('');
      setNotice('Unidade cadastrada com sucesso.');
      await loadUnits();
    } catch {
      setError('Ocorreu um erro ao cadastrar a unidade. Confira sua conexão.');
    } finally { setSaving(false); }
  }

  async function updateUnit(unit: ProductUnit, field: 'asset_code' | 'description' | 'status', value: string) {
    if (!supabase || saving) return;
    const normalized = value.trim();
    if (field === 'asset_code' && !normalized) { setError('O código de identificação não pode ficar vazio.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      if (field === 'asset_code') {
        const { data: duplicate, error: duplicateError } = await supabase
          .from('product_units').select('id')
          .eq('company_id', companyId).eq('asset_code', normalized).neq('id', unit.id).limit(1);
        if (duplicateError) { setError('Não foi possível validar o código. Tente novamente.'); return; }
        if (duplicate?.length) { setError('Esse código já está sendo usado por outra unidade da empresa.'); return; }
      }
      const { error: updateError } = await supabase.from('product_units')
        .update({ [field]: field === 'description' ? normalized || null : normalized })
        .eq('id', unit.id).eq('company_id', companyId).eq('product_id', productId);
      if (updateError) { setError('Não foi possível atualizar a unidade. Tente novamente.'); return; }
      setNotice('Unidade atualizada com sucesso.');
      await loadUnits();
    } catch {
      setError('Ocorreu um erro ao atualizar a unidade. Confira sua conexão.');
    } finally { setSaving(false); }
  }

  return (
    <section className="mb-6 rounded-2xl border border-purple-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="product-units-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Controle individual</p>
          <h2 id="product-units-title" className="mt-1 text-xl font-bold text-gray-900">Unidades de {productName}</h2>
          <p className="mt-1 text-sm text-gray-500">Cadastre cada unidade física com seu código e acompanhe sua situação. Unidades não são excluídas para preservar o histórico.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Fechar</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-purple-50 px-3 py-1 font-semibold text-purple-800">{units.length} de {totalQuantity} previstas</span>
        <span className="rounded-full bg-green-50 px-3 py-1 text-green-800">{units.filter((unit) => unit.status === 'available').length} disponíveis</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{units.filter((unit) => unit.status === 'maintenance').length} em manutenção</span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">{units.filter((unit) => unit.status === 'inactive').length} inativas</span>
      </div>
      {notice && <p role="status" className="mt-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <form onSubmit={addUnit} className="mt-5 grid gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-gray-700">Código da unidade *
          <input value={assetCode} onChange={(event) => setAssetCode(event.target.value)} maxLength={80} required disabled={saving} placeholder="Ex.: CAMA-ELASTICA-01" className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm" />
        </label>
        <label className="text-sm font-medium text-gray-700">Descrição (opcional)
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} disabled={saving} placeholder="Ex.: lona azul" className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm" />
        </label>
        <button type="submit" disabled={loading || saving || units.length >= totalQuantity} className="self-end rounded-lg bg-[#8054d8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Adicionar unidade'}</button>
      </form>
      <div className="mt-5">
        <h3 className="text-sm font-bold text-gray-900">Unidades cadastradas</h3>
        {loading ? <p role="status" className="mt-3 text-sm text-gray-500">Carregando unidades...</p> : units.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">Nenhuma unidade cadastrada. Adicione a primeira acima.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {units.map((unit) => (
              <li key={unit.id} className="grid gap-3 rounded-xl border border-gray-100 p-4 sm:grid-cols-[1fr_1fr_180px]">
                <label className="text-xs font-semibold text-gray-500">Código
                  <input key={unit.id + unit.asset_code} defaultValue={unit.asset_code ?? ''} maxLength={80} disabled={saving} onBlur={(event) => { if (event.target.value !== (unit.asset_code ?? '')) void updateUnit(unit, 'asset_code', event.target.value); }} className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900" />
                </label>
                <label className="text-xs font-semibold text-gray-500">Descrição
                  <input key={unit.id + unit.description} defaultValue={unit.description ?? ''} maxLength={500} disabled={saving} onBlur={(event) => { if (event.target.value !== (unit.description ?? '')) void updateUnit(unit, 'description', event.target.value); }} className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900" />
                </label>
                <label className="text-xs font-semibold text-gray-500">Situação
                  <select value={unit.status} disabled={saving} onChange={(event) => void updateUnit(unit, 'status', event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900">
                    <option value="available">Disponível</option>
                    <option value="maintenance">Em manutenção</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
