'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { ProductForm } from '../../../components/product-form';
import { ProductList } from '../../../components/product-list';
import { ProductUnitManager } from '../../../components/product-unit-manager';
import { buildProductSearchFilter, parsePrice, PRODUCT_PAGE_SIZE, type ProductFormValues, type ProductRecord, type ProductType } from '../../../lib/products';
import { supabase } from '../../../lib/supabase';

const PRODUCT_COLUMNS = 'id,company_id,name,description,item_type,inventory_mode,total_quantity,daily_price,event_price,active,notes,created_at,updated_at';
type ProductPayload = {
  company_id: string;
  name: string;
  description: string | null;
  item_type: ProductType;
  inventory_mode: 'quantity' | 'individual';
  total_quantity: number;
  daily_price: number;
  event_price: number | null;
  active: boolean;
  notes: string | null;
  updated_at: string;
};
function toPayload(companyId: string, values: ProductFormValues): ProductPayload {
  const price = parsePrice(values.price);
  if (price === null) throw new Error('Preço inválido.');
  return {
    company_id: companyId,
    name: values.name.trim().replace(/\s+/g, ' '),
    description: values.description.trim() || null,
    item_type: values.item_type,
    inventory_mode: values.item_type === 'service' ? 'quantity' : values.inventory_mode,
    total_quantity: values.item_type === 'service' ? 0 : Number(values.total_quantity),
    daily_price: values.item_type === 'toy' ? price : 0,
    event_price: values.item_type === 'service' ? price : null,
    active: values.active,
    notes: values.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
}
function fromRecord(product: ProductRecord): ProductFormValues {
  return {
    name: product.name,
    description: product.description ?? '',
    item_type: product.item_type,
    inventory_mode: product.inventory_mode,
    total_quantity: String(product.total_quantity),
    price: String(product.item_type === 'toy' ? product.daily_price : product.event_price ?? ''),
    active: product.active,
    notes: product.notes ?? '',
  };
}
export default function ProductsPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ProductType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [managingUnitsProduct, setManagingUnitsProduct] = useState<ProductRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadAccess() {
      try {
        if (!supabase) { if (active) setAccessError('O acesso ainda não está configurado. Tente novamente mais tarde.'); return; }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError || !user) { router.replace('/login/'); return; }
        setEmail(user.email ?? 'E-mail não informado');
        const { data: membership, error: membershipError } = await supabase
          .from('company_members').select('company_id, companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
        if (!active) return;
        if (membershipError) { setAccessError('Não foi possível confirmar o vínculo com a empresa. Tente novamente.'); return; }
        if (!membership?.company_id) { router.replace('/app/company/'); return; }
        const relatedCompany = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies;
        const name = relatedCompany && typeof relatedCompany === 'object' && 'name' in relatedCompany ? relatedCompany.name : null;
        if (typeof name !== 'string' || !name.trim()) { setAccessError('Não foi possível identificar a empresa vinculada à sua conta.'); return; }
        setCompanyName(name.trim());
        setCompanyId(membership.company_id);
      } catch {
        if (active) setAccessError('Ocorreu um erro ao verificar seu acesso. Confira sua conexão.');
      } finally { if (active) setAccessLoading(false); }
    }
    void loadAccess();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!companyId || !supabase) return;
    const client = supabase;
    let active = true;
    async function loadProducts() {
      setListLoading(true);
      setListError('');
      try {
        const filter = buildProductSearchFilter(searchTerm);
        let request = client.from('products').select(PRODUCT_COLUMNS, { count: 'exact' })
          .eq('company_id', companyId).order('name', { ascending: true })
          .range(page * PRODUCT_PAGE_SIZE, (page + 1) * PRODUCT_PAGE_SIZE - 1);
        if (filter) request = request.or(filter);
        if (typeFilter !== 'all') request = request.eq('item_type', typeFilter);
        if (statusFilter !== 'all') request = request.eq('active', statusFilter === 'active');
        const { data, error, count } = await request;
        if (!active) return;
        if (error) { setListError('Não foi possível carregar o catálogo. Tente novamente.'); return; }
        setProducts((data ?? []) as ProductRecord[]);
        setTotalCount(count ?? 0);
      } catch {
        if (active) setListError('Ocorreu um erro ao carregar o catálogo. Confira sua conexão.');
      } finally { if (active) setListLoading(false); }
    }
    void loadProducts();
    return () => { active = false; };
  }, [companyId, page, searchTerm, typeFilter, statusFilter, refreshIndex]);

  function openNewProduct() { setEditingProduct(null); setFormError(''); setFormOpen(true); setNotice(''); }
  function openEditProduct(product: ProductRecord) { setEditingProduct(product); setFormError(''); setFormOpen(true); setNotice(''); }
  function closeForm() { if (saving) return; setFormOpen(false); setEditingProduct(null); setFormError(''); }
  async function saveProduct(values: ProductFormValues) {
    if (!supabase || !companyId || saving) return;
    setSaving(true); setFormError(''); setNotice('');
    try {
      const payload = toPayload(companyId, values);
      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload)
          .eq('id', editingProduct.id).eq('company_id', companyId).select('id').single();
        if (error) { setFormError('Não foi possível atualizar o item. Confira os dados e tente novamente.'); return; }
        setNotice('Item atualizado com sucesso.');
      } else {
        const { error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) { setFormError('Não foi possível cadastrar o item. Confira os dados e tente novamente.'); return; }
        setNotice('Item cadastrado com sucesso.');
      }
      setFormOpen(false); setEditingProduct(null); setPage(0); setListLoading(true);
      setRefreshIndex((current) => current + 1);
    } catch {
      setFormError('Ocorreu um erro ao salvar o item. Confira sua conexão e tente novamente.');
    } finally { setSaving(false); }
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPage(0); setSearchTerm(searchDraft.trim()); setListLoading(true); setNotice('');
    setRefreshIndex((current) => current + 1);
  }
  function changeFilter(type: 'type' | 'status', value: string) {
    setPage(0);
    if (type === 'type') setTypeFilter(value as 'all' | ProductType);
    else setStatusFilter(value as 'all' | 'active' | 'inactive');
    setListLoading(true);
  }
  function clearFilters() {
    setSearchDraft(''); setSearchTerm(''); setTypeFilter('all'); setStatusFilter('all'); setPage(0);
    setRefreshIndex((current) => current + 1);
  }
  async function signOut() {
    if (!supabase || signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { setListError('Não foi possível encerrar sua sessão. Tente novamente.'); return; }
      router.push('/login/');
    } catch { setListError('Não foi possível encerrar sua sessão. Tente novamente.'); }
    finally { setSigningOut(false); }
  }

  if (accessLoading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">Verificando seu acesso...</p></main>;
  if (accessError) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><section className="w-full max-w-md rounded-2xl border border-purple-100 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">Não foi possível abrir o catálogo</h1><p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{accessError}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white">Tentar novamente</button></section></main>;
  if (!companyId) return null;
  return (
    <AppShell companyName={companyName} email={email} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={signingOut} onSignOut={signOut}>
      <section aria-labelledby="products-title">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Gestão da empresa</p><h1 id="products-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Brinquedos e serviços</h1><p className="mt-2 text-sm text-gray-500">Organize seu catálogo, preços e disponibilidade.</p></div>
          {!formOpen && <button type="button" onClick={openNewProduct} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6e43c4]">+ Novo item</button>}
        </div>
        {notice && !formOpen && <p role="status" className="mb-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {formOpen && <div className="mb-6 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7"><ProductForm key={editingProduct?.id ?? 'new-product'} initialValues={editingProduct ? fromRecord(editingProduct) : undefined} saving={saving} error={formError} onCancel={closeForm} onSubmit={saveProduct} /></div>}
        {managingUnitsProduct && <ProductUnitManager key={managingUnitsProduct.id} productId={managingUnitsProduct.id} productName={managingUnitsProduct.name} companyId={companyId} onClose={() => setManagingUnitsProduct(null)} />}
        <form onSubmit={submitSearch} className="mb-4 rounded-2xl border border-purple-100 bg-white p-3">
          <label htmlFor="product-search" className="sr-only">Pesquisar itens</label>
          <input id="product-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar por nome, descrição ou observações" className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100" />
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <label className="text-xs font-semibold text-gray-500">Tipo<select value={typeFilter} onChange={(event) => changeFilter('type', event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800"><option value="all">Todos</option><option value="toy">Brinquedos</option><option value="service">Serviços</option></select></label>
            <label className="text-xs font-semibold text-gray-500">Situação<select value={statusFilter} onChange={(event) => changeFilter('status', event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800"><option value="all">Todas</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
            <button type="submit" className="self-end rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700">Pesquisar</button>
            <button type="button" onClick={clearFilters} className="self-end rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Limpar</button>
          </div>
        </form>
        {listError && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p role="alert">{listError}</p><button type="button" onClick={() => setRefreshIndex((current) => current + 1)} className="font-semibold underline">Tentar novamente</button></div>}
        <ProductList products={products} loading={listLoading} totalCount={totalCount} page={page} pageSize={PRODUCT_PAGE_SIZE} onPageChange={(next) => { setPage(next); setListLoading(true); }} onEdit={openEditProduct} onManageUnits={(product) => { setManagingUnitsProduct(product); setFormOpen(false); setEditingProduct(null); }} />
      </section>
    </AppShell>
  );
}
