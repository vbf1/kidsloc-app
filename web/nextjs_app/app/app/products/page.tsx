'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { ProductForm } from '../../../components/product-form';
import { ProductList } from '../../../components/product-list';
import { ProductUnitManager } from '../../../components/product-unit-manager';
import { matchesProductSearch, parsePrice, type ProductFormValues, type ProductRecord, type ProductType } from '../../../lib/products';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';
import { useScrollIntoViewOnChange } from '../../../lib/use-scroll-into-view';
import { supabase } from '../../../lib/supabase';

const PRODUCT_COLUMNS = 'id,company_id,name,description,item_type,inventory_mode,total_quantity,daily_price,event_price,active,notes,image_path,created_at,updated_at';
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
    daily_price: values.item_type === 'service' || (values.item_type === 'machine' && values.price_mode === 'event') ? 0 : price,
    event_price: values.item_type === 'service' || (values.item_type === 'machine' && values.price_mode === 'event') ? price : null,
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
    price: String(product.item_type === 'service' || (product.item_type === 'machine' && product.event_price !== null) ? product.event_price ?? '' : product.daily_price),
    price_mode: product.item_type === 'service' || (product.item_type === 'machine' && product.event_price !== null) ? 'event' : 'daily',
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
  const pageSize = useResponsivePageSize();
  const [pagination, setPagination] = useState({ page: 0, pageSize: 6 });
  const page = pagination.pageSize === pageSize ? pagination.page : 0;
  function setPage(nextPage: number | ((current: number) => number)) {
    const resolvedPage = typeof nextPage === 'function' ? nextPage(page) : nextPage;
    setPagination({ page: resolvedPage, pageSize });
  }
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ProductType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formScrollRequest, setFormScrollRequest] = useState(0);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [managingUnitsProduct, setManagingUnitsProduct] = useState<ProductRecord | null>(null);
  const [unitsScrollRequest, setUnitsScrollRequest] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<ProductRecord | null>(null);
  const [formError, setFormError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadAccess() {
      try {
        if (!supabase) { if (active) setAccessError('O acesso ainda não está configurado. Tente novamente mais tarde.'); return; }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError) { setAccessError('Não foi possível validar sua sessão agora. Confira sua conexão e tente novamente.'); return; }
        if (!user) { router.replace('/login/'); return; }
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

  useScrollIntoViewOnChange(formContainerRef, formOpen ? `${editingProduct?.id ?? 'new'}-${formScrollRequest}` : null);

  useEffect(() => {
    if (!companyId || !supabase) return;
    const client = supabase;
    let active = true;
    async function loadProducts() {
      setListLoading(true);
      setListError('');
      try {
        let request = client.from('products').select(PRODUCT_COLUMNS, { count: 'exact' })
          .eq('company_id', companyId).order('name', { ascending: true });
        if (typeFilter !== 'all') request = request.eq('item_type', typeFilter);
        if (statusFilter !== 'all') request = request.eq('active', statusFilter === 'active');
        if (!searchTerm) request = request.range(page * pageSize, (page + 1) * pageSize - 1);
        const { data, error, count } = await request;
        if (!active) return;
        if (error) { setListError('Não foi possível carregar o catálogo. Tente novamente.'); return; }
        const records = await Promise.all(((data ?? []) as ProductRecord[]).map(async (product) => {
          if (!product.image_path) return { ...product, image_url: null };
          const { data: signedImage } = await client.storage.from('product-images').createSignedUrl(product.image_path, 3600);
          return { ...product, image_url: signedImage?.signedUrl ?? null };
        }));
        if (searchTerm) {
          const matches = records.filter((product) => matchesProductSearch(product, searchTerm));
          setTotalCount(matches.length);
          setProducts(matches.slice(page * pageSize, (page + 1) * pageSize));
        } else {
          setProducts(records);
          setTotalCount(count ?? 0);
        }
      } catch {
        if (active) setListError('Ocorreu um erro ao carregar o catálogo. Confira sua conexão.');
      } finally { if (active) setListLoading(false); }
    }
    void loadProducts();
    return () => { active = false; };
  }, [companyId, page, pageSize, searchTerm, typeFilter, statusFilter, refreshIndex]);

  function openNewProduct() { setEditingProduct(null); setFormError(''); setFormOpen(true); setFormScrollRequest((current) => current + 1); setNotice(''); }
  function openEditProduct(product: ProductRecord) { setEditingProduct(product); setFormError(''); setFormOpen(true); setFormScrollRequest((current) => current + 1); setNotice(''); }
  function closeForm() { if (saving) return; setFormOpen(false); setEditingProduct(null); setFormError(''); }
  async function saveProduct(values: ProductFormValues, imageFile: File | null, removeImage: boolean) {
    if (!supabase || !companyId || saving) return;
    setSaving(true); setFormError(''); setNotice('');
    let uploadedPath: string | null = null;
    try {
      const payload = toPayload(companyId, values);
      if (editingProduct) {
        let nextImagePath = editingProduct.image_path;
        if (imageFile) {
          const extension = imageFile.type === 'image/png' ? 'png' : imageFile.type === 'image/webp' ? 'webp' : 'jpg';
          uploadedPath = `${companyId}/${editingProduct.id}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('product-images').upload(uploadedPath, imageFile, { contentType: imageFile.type, cacheControl: '3600', upsert: false });
          if (uploadError) { setFormError('Não foi possível enviar a foto. Verifique o arquivo e tente novamente.'); return; }
          nextImagePath = uploadedPath;
        } else if (removeImage) nextImagePath = null;
        const { error } = await supabase.from('products').update({ ...payload, image_path: nextImagePath })
          .eq('id', editingProduct.id).eq('company_id', companyId).select('id').single();
        if (error) {
          if (uploadedPath) await supabase.storage.from('product-images').remove([uploadedPath]);
          setFormError('Não foi possível atualizar o item. Confira os dados e tente novamente.'); return;
        }
        if ((imageFile || removeImage) && editingProduct.image_path) await supabase.storage.from('product-images').remove([editingProduct.image_path]);
        setNotice('Item atualizado com sucesso.');
      } else {
        const { data: created, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error || !created) { setFormError('Não foi possível cadastrar o item. Confira os dados e tente novamente.'); return; }
        if (imageFile) {
          const extension = imageFile.type === 'image/png' ? 'png' : imageFile.type === 'image/webp' ? 'webp' : 'jpg';
          uploadedPath = `${companyId}/${created.id}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('product-images').upload(uploadedPath, imageFile, { contentType: imageFile.type, cacheControl: '3600', upsert: false });
          if (uploadError) {
            await supabase.from('products').delete().eq('id', created.id).eq('company_id', companyId);
            setFormError('Não foi possível enviar a foto. O cadastro não foi concluído; verifique o arquivo e tente novamente.'); return;
          }
          const { error: imageUpdateError } = await supabase.from('products').update({ image_path: uploadedPath }).eq('id', created.id).eq('company_id', companyId);
          if (imageUpdateError) {
            await supabase.storage.from('product-images').remove([uploadedPath]);
            await supabase.from('products').delete().eq('id', created.id).eq('company_id', companyId);
            setFormError('Não foi possível salvar a foto. O cadastro não foi concluído; tente novamente.'); return;
          }
        }
        setNotice('Item cadastrado com sucesso.');
      }
      setFormOpen(false); setEditingProduct(null); setPage(0); setListLoading(true);
      setRefreshIndex((current) => current + 1);
    } catch {
      if (uploadedPath) await supabase.storage.from('product-images').remove([uploadedPath]);
      setFormError('Ocorreu um erro ao salvar o item. Confira sua conexão e tente novamente.');
    } finally { setSaving(false); }
  }
  async function deleteProduct(product: ProductRecord) {
    if (!supabase || !companyId || deletingProductId) return;
    setDeletingProductId(product.id); setListError(''); setNotice('');
    try {
      const { data: deleted, error } = await supabase.from('products').delete()
        .eq('id', product.id).eq('company_id', companyId).select('id').maybeSingle();
      if (error || !deleted) {
        setListError(error?.code === '23503'
          ? 'Não é possível excluir este item porque ele possui histórico de locações, estoque ou manutenção. Você pode deixá-lo inativo.'
          : 'Não foi possível excluir o item. Verifique se sua conta tem permissão de administrador ou proprietário.');
        return;
      }
      setNotice('Item excluído com sucesso.');
      if (products.length === 1 && page > 0) setPage((current) => current - 1);
      setRefreshIndex((current) => current + 1);
    } catch {
      setListError('Ocorreu um erro ao excluir o item. Confira sua conexão e tente novamente.');
    } finally { setDeletingProductId(null); setProductToDelete(null); }
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
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Gestão da empresa</p><h1 id="products-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Catálogo</h1><p className="mt-2 text-sm text-gray-500">Organize brinquedos, máquinas, serviços, preços e disponibilidade.</p></div>
          {!formOpen && <button type="button" onClick={openNewProduct} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6e43c4]">+ Novo item</button>}
        </div>
        {notice && !formOpen && <p role="status" className="mb-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {productToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingProductId) setProductToDelete(null); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-description" className="w-full max-w-md rounded-2xl border border-purple-100 bg-white p-6 shadow-2xl sm:p-7">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600" aria-hidden="true">!</div>
            <h2 id="delete-product-title" className="text-xl font-bold tracking-tight text-gray-900">Excluir item?</h2>
            <p id="delete-product-description" className="mt-2 text-sm leading-6 text-gray-600">Tem certeza de que deseja excluir <strong className="font-semibold text-gray-900">{productToDelete.name}</strong>? Essa ação não poderá ser desfeita.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={Boolean(deletingProductId)} onClick={() => setProductToDelete(null)} className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">Cancelar</button>
              <button type="button" disabled={Boolean(deletingProductId)} onClick={() => { if (productToDelete) void deleteProduct(productToDelete); }} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">{deletingProductId ? 'Excluindo...' : 'Sim, excluir'}</button>
            </div>
          </section>
        </div>}
        {formOpen && <div ref={formContainerRef} className="mb-6 scroll-mt-4 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7"><ProductForm key={editingProduct?.id ?? 'new-product'} initialValues={editingProduct ? fromRecord(editingProduct) : undefined} initialImageUrl={editingProduct?.image_url ?? null} saving={saving} error={formError} onCancel={closeForm} onSubmit={saveProduct} /></div>}
        {managingUnitsProduct && <ProductUnitManager key={managingUnitsProduct.id} scrollRequest={unitsScrollRequest} productId={managingUnitsProduct.id} productName={managingUnitsProduct.name} companyId={companyId} totalQuantity={managingUnitsProduct.total_quantity} onClose={() => setManagingUnitsProduct(null)} />}
        <form onSubmit={submitSearch} className="mb-4 rounded-2xl border border-purple-100 bg-white p-3">
          <label htmlFor="product-search" className="sr-only">Pesquisar itens</label>
          <input id="product-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar por nome, descrição ou observações" className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100" />
          <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-500">Mostrar</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
                {([{ value: 'all', label: 'Todos' }, { value: 'toy', label: 'Brinquedos' }, { value: 'machine', label: 'Máquinas' }, { value: 'service', label: 'Serviços' }] as const).map((option) => (
                  <button key={option.value} type="button" aria-pressed={typeFilter === option.value} onClick={() => changeFilter('type', option.value)}
                    className={typeFilter === option.value ? 'rounded-full bg-[#8054d8] px-4 py-2 text-sm font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:border-purple-200 hover:text-[#6840bd]'}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="text-xs font-semibold text-gray-500">Situação<select value={statusFilter} onChange={(event) => changeFilter('status', event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800"><option value="all">Todas</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
              <button type="submit" className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700">Pesquisar</button>
              <button type="button" onClick={clearFilters} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Limpar</button>
            </div>
          </div>
        </form>
        {listError && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p role="alert">{listError}</p><button type="button" onClick={() => setRefreshIndex((current) => current + 1)} className="font-semibold underline">Tentar novamente</button></div>}
        <ProductList products={products} loading={listLoading} totalCount={totalCount} page={page} pageSize={pageSize} onPageChange={(next) => { setPage(next); setListLoading(true); }} onEdit={openEditProduct} onDelete={(product) => setProductToDelete(product)} onManageUnits={(product) => { setManagingUnitsProduct(product); setUnitsScrollRequest((current) => current + 1); setFormOpen(false); setEditingProduct(null); }} />
      </section>
    </AppShell>
  );
}
