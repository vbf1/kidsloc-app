'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { RentalForm } from '../../../components/rental-form';
import { RentalList } from '../../../components/rental-list';
import {
  EMPTY_RENTAL, matchesRentalSearch,
  parseRentalPrice, type RentalCustomer, type RentalFormValues, type RentalItemRecord,
  type RentalMember, type RentalProduct, type RentalRecord, type RentalStatus,
} from '../../../lib/rentals';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';
import { useScrollIntoViewOnChange } from '../../../lib/use-scroll-into-view';
import { supabase } from '../../../lib/supabase';

const RENTAL_COLUMNS = 'id,company_id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,delivery_method,delivery_address,delivery_fee,discount,total_amount,deposit_amount,notes,created_by,created_at,updated_at';
function localDateValue() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
function formatSaveError(message: string | undefined): string {
  if (message) {
    const known = [
      'Estoque insuficiente', 'Unidades individuais disponíveis insuficientes',
      'Você não tem permissão', 'Cliente não encontrado nesta empresa',
      'Período da locação inválido', 'Horário da locação inválido',
      'Informe o endereço de entrega', 'Funcionário foi selecionado',
      'Um dos responsáveis não pertence mais à empresa', 'Brinquedo não encontrado ou inativo',
    ];
    const match = known.find((phrase) => message.includes(phrase));
    if (match) return message;
  }
  return 'Não foi possível salvar a locação. Confira os dados, a disponibilidade dos itens e tente novamente.';
}
export default function RentalsPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [rentals, setRentals] = useState<RentalRecord[]>([]);
  const [customers, setCustomers] = useState<RentalCustomer[]>([]);
  const [products, setProducts] = useState<RentalProduct[]>([]);
  const [members, setMembers] = useState<RentalMember[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RentalStatus>('all');
  const pageSize = useResponsivePageSize();
  const [pagination, setPagination] = useState({ page: 0, pageSize: 6 });
  const page = pagination.pageSize === pageSize ? pagination.page : 0;
  function setPage(nextPage: number) {
    setPagination({ page: nextPage, pageSize });
  }
  const [formOpen, setFormOpen] = useState(false);
  const [formScrollRequest, setFormScrollRequest] = useState(0);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const [editingRental, setEditingRental] = useState<RentalRecord | null>(null);
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
        if (authError) { setAccessError('Não foi possível validar sua sessão agora. Confira sua conexão e tente novamente.'); return; }
        if (!user) { router.replace('/login/'); return; }
        setCurrentUserId(user.id);
        setEmail(user.email ?? 'E-mail não informado');
        const { data: membership, error: membershipError } = await supabase
          .from('company_members').select('company_id,role,companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
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
    async function loadRentals() {
      setListLoading(true);
      setListError('');
      try {
        const [rentalResult, customerResult, productResult, memberResult] = await Promise.all([
          client.from('rentals').select(RENTAL_COLUMNS).eq('company_id', companyId).order('start_date', { ascending: false }).limit(1000),
          client.from('customers').select('id,name,phone').eq('company_id', companyId).order('name', { ascending: true }).limit(1000),
          client.from('products').select('id,name,item_type,inventory_mode,total_quantity,daily_price,event_price').eq('company_id', companyId).eq('active', true).order('name', { ascending: true }).limit(1000),
          client.from('company_members').select('user_id,role').eq('company_id', companyId),
        ]);
        if (!active) return;
        if (rentalResult.error || customerResult.error || productResult.error || memberResult.error) {
          setListError('Não foi possível carregar as locações e os dados necessários. Confira suas permissões e tente novamente.');
          return;
        }
        const baseRentals = rentalResult.data ?? [];
        const rentalIds = baseRentals.map((rental) => rental.id);
        const [itemResult, responsibleResult, profileResult] = rentalIds.length
          ? await Promise.all([
              client.from('rental_items').select('id,rental_id,product_id,quantity,unit_price,subtotal').eq('company_id', companyId).in('rental_id', rentalIds),
              client.from('rental_responsibles').select('rental_id,user_id,employee_name_snapshot').eq('company_id', companyId).in('rental_id', rentalIds),
              client.from('profiles').select('id,full_name').in('id', (memberResult.data ?? []).map((member) => member.user_id)),
            ])
          : [
              { data: [], error: null }, { data: [], error: null },
              await client.from('profiles').select('id,full_name').in('id', (memberResult.data ?? []).map((member) => member.user_id)),
            ];
        if (!active) return;
        if (itemResult.error || responsibleResult.error || profileResult.error) {
          setListError('Não foi possível carregar os itens ou responsáveis das locações. Tente novamente.');
          return;
        }
        const customerById = new Map((customerResult.data ?? []).map((customer) => [customer.id, customer]));
        const productById = new Map((productResult.data ?? []).map((product) => [product.id, product]));
        const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
        const itemsByRental = new Map<string, RentalItemRecord[]>();
        for (const item of itemResult.data ?? []) {
          const product = productById.get(item.product_id);
          const next = itemsByRental.get(item.rental_id) ?? [];
          next.push({
            ...item, product_name: product?.name ?? 'Item do catálogo',
            item_type: (product?.item_type ?? 'toy') as RentalItemRecord['item_type'],
          });
          itemsByRental.set(item.rental_id, next);
        }
        const responsibleNamesByRental = new Map<string, string[]>();
        for (const responsible of responsibleResult.data ?? []) {
          const next = responsibleNamesByRental.get(responsible.rental_id) ?? [];
          next.push(responsible.employee_name_snapshot || profileById.get(responsible.user_id) || 'Funcionário');
          responsibleNamesByRental.set(responsible.rental_id, next);
        }
        setRentals(baseRentals.map((rental) => ({
          ...rental,
          rental_number: Number(rental.rental_number),
          customer_name: customerById.get(rental.customer_id)?.name ?? 'Cliente não disponível',
          items: itemsByRental.get(rental.id) ?? [],
          responsible_names: responsibleNamesByRental.get(rental.id) ?? [],
          responsible_user_ids: (responsibleResult.data ?? []).filter((responsible) => responsible.rental_id === rental.id && responsible.user_id).map((responsible) => responsible.user_id as string),
        })) as RentalRecord[]);
        setCustomers((customerResult.data ?? []) as RentalCustomer[]);
        setProducts((productResult.data ?? []) as RentalProduct[]);
        const membersData = (memberResult.data ?? []).map((member) => ({
          user_id: member.user_id, role: member.role,
          full_name: profileById.get(member.user_id) || (member.user_id === currentUserId ? email : 'Funcionário'),
        })) as RentalMember[];
        setMembers(membersData);
      } catch {
        if (active) setListError('Ocorreu um erro ao carregar as locações. Confira sua conexão e tente novamente.');
      } finally { if (active) setListLoading(false); }
    }
    void loadRentals();
    return () => { active = false; };
  }, [companyId, currentUserId, email, refreshIndex]);

  useScrollIntoViewOnChange(formContainerRef, formOpen ? `${editingRental?.id ?? 'new'}-${formScrollRequest}` : null);

  const filteredRentals = useMemo(() => rentals.filter((rental) =>
    (statusFilter === 'all' || rental.status === statusFilter) && matchesRentalSearch(rental, searchTerm)
  ), [rentals, searchTerm, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRentals.length / pageSize));
  const visibleRentals = filteredRentals.slice(page * pageSize, (page + 1) * pageSize);

  function openNewRental() {
    const today = localDateValue();
    setEditingRental(null);
    setFormError('');
    setNotice('');
    setFormOpen(true);
    setFormScrollRequest((current) => current + 1);
    setPage(0);
    setNewFormDefaults({
      ...EMPTY_RENTAL, start_date: today, end_date: today,
      responsible_user_ids: currentUserId ? [currentUserId] : [],
    });
  }
  const [newFormDefaults, setNewFormDefaults] = useState<RentalFormValues>(EMPTY_RENTAL);
  function openEditRental(rental: RentalRecord) {
    setEditingRental(rental);
    setFormError('');
    setNotice('');
    setFormOpen(true);
    setFormScrollRequest((current) => current + 1);
  }
  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingRental(null);
    setFormError('');
  }
  async function saveRental(values: RentalFormValues) {
    if (!supabase || !companyId || saving) return;
    setSaving(true);
    setFormError('');
    setNotice('');
    const totalAmount = parseRentalPrice(values.total_amount);
    if (totalAmount === null) { setFormError('Informe um valor total válido.'); setSaving(false); return; }
    const items = values.items.map((item) => ({
      product_id: item.product_id, quantity: Number(item.quantity),
      unit_price: parseRentalPrice(item.unit_price),
    }));
    if (items.some((item) => item.unit_price === null)) {
      setFormError('Confira o preço unitário dos itens.');
      setSaving(false);
      return;
    }
    const commonArgs = {
      p_company_id: companyId,
      p_customer_id: values.customer_id,
      p_start_date: values.start_date,
      p_end_date: values.end_date,
      p_status: values.status,
      p_delivery_method: values.delivery_method,
      p_total_amount: totalAmount,
      p_items: items,
      p_delivery_address: values.delivery_method === 'delivery' ? values.delivery_address.trim() : null,
      p_responsible_user_ids: values.responsible_user_ids,
      p_start_time: values.start_time,
      p_end_time: values.end_time,
    };
    try {
      if (editingRental) {
        const { error } = await supabase.rpc('update_rental_with_items', {
          ...commonArgs, p_rental_id: editingRental.id,
        });
        if (error) { setFormError(formatSaveError(error.message)); return; }
        setNotice('Locação atualizada com sucesso.');
      } else {
        const { error } = await supabase.rpc('create_rental_with_items', commonArgs);
        if (error) { setFormError(formatSaveError(error.message)); return; }
        setNotice('Locação criada com sucesso.');
      }
      setFormOpen(false);
      setEditingRental(null);
      setPage(0);
      setListLoading(true);
      setRefreshIndex((current) => current + 1);
    } catch {
      setFormError('Ocorreu um erro ao salvar a locação. Confira sua conexão e tente novamente.');
    } finally { setSaving(false); }
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setSearchTerm(searchDraft.trim());
    setNotice('');
  }
  function clearFilters() {
    setSearchDraft('');
    setSearchTerm('');
    setStatusFilter('all');
    setPage(0);
    setNotice('');
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
  if (accessError) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><section className="w-full max-w-md rounded-2xl border border-purple-100 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">Não foi possível abrir Locações</h1><p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{accessError}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white">Tentar novamente</button></section></main>;
  if (!companyId) return null;

  return (
    <AppShell companyName={companyName} email={email} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={signingOut} onSignOut={signOut}>
      <section aria-labelledby="rentals-title">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Gestão da empresa</p><h1 id="rentals-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Locações</h1><p className="mt-2 text-sm text-gray-500">Acompanhe reservas, períodos, itens e funcionários responsáveis.</p></div>
          {!formOpen && <button type="button" onClick={openNewRental} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6e43c4]">+ Nova locação</button>}
        </div>
        {notice && !formOpen && <p role="status" className="mb-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {formOpen && <div ref={formContainerRef} className="mb-6 scroll-mt-4 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7">
          <RentalForm key={editingRental?.id ?? 'new-rental'} initialValues={editingRental ? {
            customer_id: editingRental.customer_id ?? '',
            start_date: editingRental.start_date, end_date: editingRental.end_date,
            start_time: editingRental.start_time?.slice(0,5) ?? '09:00',
            end_time: editingRental.end_time?.slice(0,5) ?? '18:00',
            status: editingRental.status, delivery_method: editingRental.delivery_method,
            delivery_address: editingRental.delivery_address ?? '',
            total_amount: String(editingRental.total_amount).replace('.', ','),
            responsible_user_ids: editingRental.responsible_user_ids, items: editingRental.items.map((item) => ({
              product_id: item.product_id, quantity: String(item.quantity),
              unit_price: String(item.unit_price).replace('.', ','),
            })),
          } : newFormDefaults} isEditing={Boolean(editingRental)} saving={saving} error={formError}
            customers={customers} products={products} members={members} currentUserId={currentUserId}
            onCancel={closeForm} onSubmit={saveRental} />
        </div>}
        <form onSubmit={submitSearch} className="mb-4 rounded-2xl border border-purple-100 bg-white p-3">
          <label htmlFor="rental-search" className="sr-only">Pesquisar locações</label>
          <input id="rental-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar por número, cliente, item ou responsável" className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100" />
          <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="text-xs font-semibold text-gray-500">Situação
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as 'all' | RentalStatus); setPage(0); }} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800 sm:min-w-48">
                <option value="all">Todas</option><option value="pending">Pendentes</option><option value="confirmed">Confirmadas</option><option value="ongoing">Em andamento</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 sm:flex-none">Pesquisar</button>
              <button type="button" onClick={clearFilters} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Limpar</button>
            </div>
          </div>
        </form>
        {listError && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p role="alert">{listError}</p><button type="button" onClick={() => setRefreshIndex((current) => current + 1)} className="font-semibold underline">Tentar novamente</button></div>}
        <RentalList rentals={visibleRentals} loading={listLoading} totalCount={filteredRentals.length} page={page} pageSize={pageSize}
          onPageChange={(next) => setPage(Math.max(0, Math.min(next, pageCount - 1)))} onEdit={openEditRental} />
        {!listLoading && filteredRentals.length > 0 && <p className="mt-3 text-right text-xs text-gray-400">Exibindo somente locações às quais sua conta tem acesso.</p>}
      </section>
    </AppShell>
  );
}
