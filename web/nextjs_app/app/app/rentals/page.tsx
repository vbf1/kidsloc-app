'use client';
import { hasModuleData, setModuleData, useModuleData } from '../../../lib/module-data-cache';
import { useCompanyRealtimeRefresh } from '../../../lib/use-company-realtime';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { RentalForm } from '../../../components/rental-form';
import { RentalList } from '../../../components/rental-list';
import { WorkspaceModal } from '../../../components/workspace-modal';
import { SearchablePicker } from '../../../components/searchable-picker';
import {
  EMPTY_RENTAL, matchesRentalSearch, formatRentalWhatsAppMessage, normalizeWhatsAppPhone,
  parseRentalPrice, type RentalCustomer, type RentalFormValues, type RentalItemRecord,
  type RentalMember, type RentalProduct, type RentalRecord, type RentalStatus,
} from '../../../lib/rentals';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';
import { supabase } from '../../../lib/supabase';
import { clearWorkspaceSessionCache, getWorkspaceSessionCache, setWorkspaceSessionCache } from '../../../lib/workspace-session-cache';

type CompanyRole = 'admin' | 'staff';
type RentalPaymentSummary = { total_amount: number; deposit_amount: number; paid_total: number; deposit_paid: number; deposit_remaining: number; balance_remaining: number };

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
  const cachedWorkspace = getWorkspaceSessionCache();
  const workspaceScope = cachedWorkspace ? `${cachedWorkspace.userId}:${cachedWorkspace.companyId}` : '';
  const [email, setEmail] = useState(cachedWorkspace?.email ?? '');
  const [companyName, setCompanyName] = useState(cachedWorkspace?.companyName ?? '');
  const [role, setRole] = useState<CompanyRole | undefined>(cachedWorkspace?.role === 'admin' || cachedWorkspace?.role === 'staff' ? cachedWorkspace.role : undefined);
  const [companyId, setCompanyId] = useState<string | null>(cachedWorkspace?.companyId ?? null);
  const [currentUserId, setCurrentUserId] = useState(cachedWorkspace?.userId ?? '');
  const [accessLoading, setAccessLoading] = useState(!cachedWorkspace);
  const [accessError, setAccessError] = useState('');
  const [rentals, setRentals] = useModuleData<RentalRecord[]>('rentals','records',workspaceScope,[]);
  const [customers, setCustomers] = useModuleData<RentalCustomer[]>('rentals','customers',workspaceScope,[]);
  const [products, setProducts] = useModuleData<RentalProduct[]>('rentals','products',workspaceScope,[]);
  const [members, setMembers] = useModuleData<RentalMember[]>('rentals','members',workspaceScope,[]);
  const [listLoading, setListLoading] = useState(!hasModuleData('rentals', workspaceScope));
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [rentalPaymentSummary, setRentalPaymentSummary] = useState<RentalPaymentSummary | null>(null);
  const [rentalPaymentLoading, setRentalPaymentLoading] = useState(false);
  const [rentalPaymentSaving, setRentalPaymentSaving] = useState(false);
  const [rentalPaymentError, setRentalPaymentError] = useState('');
  const [confirmationRental, setConfirmationRental] = useState<RentalRecord | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  useCompanyRealtimeRefresh(companyId, ['rentals', 'rental_items', 'rental_item_units', 'rental_responsibles', 'rental_events', 'product_units', 'financial_transactions', 'payments'], () => setRefreshIndex((value) => value + 1));
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
  const [viewingRental, setViewingRental] = useState<RentalRecord | null>(null);
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
        if (!user) { clearWorkspaceSessionCache(); router.replace('/login/'); return; }
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
        setRole(membership.role as CompanyRole);
        setCompanyId(membership.company_id);
        setWorkspaceSessionCache({ userId: user.id, email: user.email ?? 'E-mail não informado', companyName: name.trim(), companyId: membership.company_id, role: membership.role as CompanyRole });
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
          next.push(responsible.employee_name_snapshot || (responsible.user_id ? profileById.get(responsible.user_id) : undefined) || 'Funcionário');
          responsibleNamesByRental.set(responsible.rental_id, next);
        }
        const rentalRecords = baseRentals.map((rental) => ({
          ...rental,
          rental_number: Number(rental.rental_number),
          customer_name: rental.customer_id ? (customerById.get(rental.customer_id)?.name ?? 'Cliente não disponível') : 'Cliente não disponível',
          items: itemsByRental.get(rental.id) ?? [],
          responsible_names: responsibleNamesByRental.get(rental.id) ?? [],
          responsible_user_ids: (responsibleResult.data ?? []).filter((responsible) => responsible.rental_id === rental.id && responsible.user_id).map((responsible) => responsible.user_id as string),
        })) as RentalRecord[];
        const customerRows = (customerResult.data ?? []) as RentalCustomer[];
        const productRows = (productResult.data ?? []) as RentalProduct[];
        const membersData = (memberResult.data ?? []).map((member) => ({
          user_id: member.user_id, role: member.role,
          full_name: profileById.get(member.user_id) || (member.user_id === currentUserId ? email : 'Funcionário'),
        })) as RentalMember[];
        const cached = getWorkspaceSessionCache();
        const scope = cached?.companyId === companyId ? `${cached.userId}:${cached.companyId}` : '';
        setModuleData('rentals','records',scope,rentalRecords);
        setModuleData('rentals','customers',scope,customerRows);
        setModuleData('rentals','products',scope,productRows);
        setModuleData('rentals','members',scope,membersData);
        setRentals(rentalRecords);
        setCustomers(customerRows);
        setProducts(productRows);
        setMembers(membersData);
      } catch {
        if (active) setListError('Ocorreu um erro ao carregar as locações. Confira sua conexão e tente novamente.');
      } finally { if (active) setListLoading(false); }
    }
    void loadRentals();
    return () => { active = false; };
  }, [companyId, currentUserId, email, refreshIndex]);

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
    const depositAmount = parseRentalPrice(values.deposit_amount);
    if (depositAmount === null || depositAmount > (totalAmount ?? -1)) { setFormError('O sinal deve ser válido e não pode ser maior que o valor total.'); setSaving(false); return; }
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
      let rentalId = editingRental?.id ?? null;
      if (editingRental) {
        const { error } = await supabase.rpc('update_rental_with_items', {
          ...commonArgs, p_rental_id: editingRental.id,
        });
        if (error) { setFormError(formatSaveError(error.message)); return; }
      } else {
        const { data, error } = await supabase.rpc('create_rental_with_items', commonArgs);
        if (error) { setFormError(formatSaveError(error.message)); return; }
        rentalId = typeof data === 'string' ? data : null;
      }
      if (!rentalId) { setFormError('A locação foi salva, mas não foi possível identificar o registro para salvar o sinal. Abra a locação e tente novamente.'); return; }
      const { error: depositError } = await supabase.rpc('set_rental_deposit_amount', {
        p_company_id: companyId, p_rental_id: rentalId, p_deposit_amount: depositAmount,
      });
      if (depositError) { setFormError('A locação foi salva, mas o sinal não foi atualizado: ' + depositError.message); return; }
      setNotice(editingRental ? 'Locação atualizada com sucesso.' : 'Locação criada com sucesso. A confirmação pelo WhatsApp fica disponível nos detalhes da locação.');
      setFormOpen(false);
      setEditingRental(null);
      setPage(0);
      
      setRefreshIndex((current) => current + 1);
    } catch {
      setFormError('Ocorreu um erro ao salvar a locação. Confira sua conexão e tente novamente.');
    } finally { setSaving(false); }
  }

  useEffect(() => {
    if (!viewingRental || !companyId || !supabase || role === 'staff') {
      setRentalPaymentSummary(null);
      setRentalPaymentError('');
      return;
    }
    let active = true;
    setRentalPaymentLoading(true);
    setRentalPaymentError('');
    supabase.rpc('get_rental_payment_summary', {
      p_company_id: companyId, p_rental_id: viewingRental.id,
    }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setRentalPaymentSummary(null);
        setRentalPaymentError(error.message);
      } else {
        setRentalPaymentSummary(data as RentalPaymentSummary);
      }
      setRentalPaymentLoading(false);
    });
    return () => { active = false; };
  }, [viewingRental?.id, companyId, role, refreshIndex]);

  async function registerRentalPaymentStage(stage: 'deposit' | 'balance') {
    if (!supabase || !companyId || !viewingRental || rentalPaymentSaving) return;
    setRentalPaymentSaving(true);
    setRentalPaymentError('');
    try {
      const { error } = await supabase.rpc('register_rental_payment_stage', {
        p_company_id: companyId,
        p_rental_id: viewingRental.id,
        p_stage: stage,
        p_payment_method: null,
        p_paid_at: localDateValue(),
      });
      if (error) {
        setRentalPaymentError(error.message);
        return;
      }
      const { data, error: summaryError } = await supabase.rpc('get_rental_payment_summary', {
        p_company_id: companyId, p_rental_id: viewingRental.id,
      });
      if (summaryError) setRentalPaymentError(summaryError.message);
      else setRentalPaymentSummary(data as RentalPaymentSummary);
      setNotice(stage === 'deposit' ? 'Sinal registrado no Financeiro.' : 'Quitação registrada no Financeiro.');
      setRefreshIndex((value) => value + 1);
    } catch {
      setRentalPaymentError('Não foi possível registrar o recebimento. Tente novamente.');
    } finally {
      setRentalPaymentSaving(false);
    }
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
      clearWorkspaceSessionCache();
      router.push('/login/');
    } catch { setListError('Não foi possível encerrar sua sessão. Tente novamente.'); }
    finally { setSigningOut(false); }
  }

  if (accessLoading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">Verificando seu acesso...</p></main>;
  if (accessError) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><section className="w-full max-w-md rounded-2xl border border-purple-100 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">Não foi possível abrir Locações</h1><p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{accessError}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white">Tentar novamente</button></section></main>;
  if (!companyId) return null;

  return (
    <AppShell companyName={companyName} email={email} role={role} companyId={companyId ?? undefined} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={signingOut} onSignOut={signOut}>
      <section className="kl-workspace-refresh" aria-labelledby="rentals-title">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Gestão da empresa</p><h1 id="rentals-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Locações</h1><p className="mt-2 text-sm text-gray-500">Acompanhe reservas, períodos, itens e funcionários responsáveis.</p></div>
          {!formOpen && <button type="button" onClick={openNewRental} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6e43c4]">+ Nova locação</button>}
        </div>
        {notice && !formOpen && <div role="status" className="mb-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
        <WorkspaceModal open={formOpen} title={editingRental ? 'Editar locação #' + editingRental.rental_number : 'Nova locação'} description="Organize cliente, período, equipamentos, valores e responsáveis." onClose={closeForm} size="xl">
          <RentalForm key={editingRental?.id ?? 'new-rental'} initialValues={editingRental ? {
            customer_id: editingRental.customer_id ?? '',
            start_date: editingRental.start_date, end_date: editingRental.end_date,
            start_time: editingRental.start_time?.slice(0,5) ?? '09:00',
            end_time: editingRental.end_time?.slice(0,5) ?? '18:00',
            status: editingRental.status, delivery_method: editingRental.delivery_method,
            delivery_address: editingRental.delivery_address ?? '',
            total_amount: String(editingRental.total_amount).replace('.', ','),
            deposit_amount: String(editingRental.deposit_amount ?? 0).replace('.', ','),
            deposit_percentage: Number(editingRental.total_amount) > 0 ? (Number(editingRental.deposit_amount ?? 0) / Number(editingRental.total_amount) * 100).toFixed(2).replace('.', ',') : '0',
            responsible_user_ids: editingRental.responsible_user_ids, items: editingRental.items.map((item) => ({
              product_id: item.product_id, quantity: String(item.quantity),
              unit_price: String(item.unit_price).replace('.', ','),
            })),
          } : newFormDefaults} isEditing={Boolean(editingRental)} saving={saving} error={formError}
            customers={customers} products={products} members={members} currentUserId={currentUserId}
            onCancel={closeForm} onSubmit={saveRental} />
        </WorkspaceModal>
        <WorkspaceModal open={Boolean(viewingRental)} title={viewingRental ? 'Locação #' + viewingRental.rental_number : 'Detalhes da locação'} description="Resumo completo do registro selecionado." onClose={() => setViewingRental(null)} size="lg">
          {viewingRental && <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-purple-50 p-4">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-purple-600">Cliente</p><h3 className="mt-1 text-xl font-bold text-gray-900">{viewingRental.customer_name}</h3></div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-purple-700">{viewingRental.status === 'completed' ? 'Concluída' : viewingRental.status === 'confirmed' ? 'Confirmada' : viewingRental.status === 'ongoing' ? 'Em andamento' : viewingRental.status === 'cancelled' ? 'Cancelada' : 'Pendente'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 p-4"><p className="text-xs text-gray-500">Período</p><p className="mt-1 font-semibold text-gray-900">{viewingRental.start_date} – {viewingRental.end_date}</p><p className="mt-1 text-sm text-gray-500">{viewingRental.start_time?.slice(0,5) ?? '—'} às {viewingRental.end_time?.slice(0,5) ?? '—'}</p></div>
              <div className="rounded-xl border border-gray-100 p-4"><p className="text-xs text-gray-500">Entrega ou retirada</p><p className="mt-1 font-semibold text-gray-900">{viewingRental.delivery_method === 'delivery' ? 'Entrega' : 'Retirada'}</p>{viewingRental.delivery_address && <p className="mt-1 text-sm text-gray-500">{viewingRental.delivery_address}</p>}</div>
            </div>
            <div><h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-purple-700">Itens da locação</h3><div className="divide-y divide-gray-100 rounded-xl border border-gray-100">{viewingRental.items.map(item => <div key={item.id} className="flex justify-between gap-3 p-3 text-sm"><span className="text-gray-700">{item.product_name} × {item.quantity}</span><strong className="text-gray-900">{item.unit_price === 0 ? 'Incluído no combo' : 'R$ ' + Number(item.subtotal).toFixed(2).replace('.', ',')}</strong></div>)}</div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Responsáveis</p><p className="mt-1 text-sm font-semibold text-gray-900">{viewingRental.responsible_names.join(', ') || 'Não definidos'}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Valor total</p><p className="mt-1 text-2xl font-bold text-gray-900">R$ {Number(viewingRental.total_amount).toFixed(2).replace('.', ',')}</p><p className="mt-2 text-xs text-gray-500">Sinal configurado: <strong className="text-gray-800">R$ {Number(viewingRental.deposit_amount ?? 0).toFixed(2).replace('.', ',')}</strong></p></div></div>
            {role !== 'staff' && <section className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div><h3 className="text-sm font-bold text-emerald-900">Pagamentos da locação</h3><p className="mt-1 text-xs text-emerald-800">Registre o sinal ou quite o saldo com um toque, sem digitar valores.</p></div>
              {rentalPaymentLoading ? <p className="text-sm text-gray-600">Consultando pagamentos...</p> : rentalPaymentSummary ? <div className="grid gap-2 sm:grid-cols-3">
                <div><p className="text-xs text-gray-500">Já recebido</p><strong className="text-sm text-gray-900">R$ {Number(rentalPaymentSummary.paid_total).toFixed(2).replace('.', ',')}</strong></div>
                <div><p className="text-xs text-gray-500">Sinal pendente</p><strong className="text-sm text-gray-900">R$ {Number(rentalPaymentSummary.deposit_remaining).toFixed(2).replace('.', ',')}</strong></div>
                <div><p className="text-xs text-gray-500">Saldo para quitar</p><strong className="text-sm text-gray-900">R$ {Number(rentalPaymentSummary.balance_remaining).toFixed(2).replace('.', ',')}</strong></div>
              </div> : <p className="text-sm text-gray-600">Não foi possível consultar os pagamentos. {rentalPaymentError}</p>}
              {rentalPaymentError && rentalPaymentSummary && <p role="alert" className="text-sm text-red-700">{rentalPaymentError}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={rentalPaymentSaving || rentalPaymentLoading || !rentalPaymentSummary || rentalPaymentSummary.deposit_remaining <= 0 || viewingRental.status === 'cancelled'} onClick={() => registerRentalPaymentStage('deposit')} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Pagou sinal</button>
                <button type="button" disabled={rentalPaymentSaving || rentalPaymentLoading || !rentalPaymentSummary || rentalPaymentSummary.balance_remaining <= 0 || viewingRental.status === 'cancelled'} onClick={() => registerRentalPaymentStage('balance')} className="rounded-xl bg-[#8054d8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Quitou saldo restante</button>
                {rentalPaymentSaving && <span className="self-center text-xs text-gray-500">Registrando recebimento...</span>}
              </div>
            </section>}
            <div className="flex flex-col-reverse justify-end gap-2 border-t border-gray-100 pt-4 sm:flex-row">
              <button type="button" onClick={() => { const customer = customers.find((item) => item.id === viewingRental.customer_id); setConfirmationText(formatRentalWhatsAppMessage({ companyName, customerName: viewingRental.customer_name, startDate: viewingRental.start_date, endDate: viewingRental.end_date, startTime: viewingRental.start_time?.slice(0,5) ?? '—', endTime: viewingRental.end_time?.slice(0,5) ?? '—', items: viewingRental.items.map((item) => ({ name: item.product_name, quantity: item.quantity })), deliveryMethod: viewingRental.delivery_method, deliveryAddress: viewingRental.delivery_address ?? '', totalAmount: Number(viewingRental.total_amount) })); setConfirmationRental(viewingRental); }} className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700">Preparar confirmação</button>
              <button type="button" onClick={() => setViewingRental(null)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700">Fechar</button>
              <button type="button" onClick={() => { const selected = viewingRental; setViewingRental(null); openEditRental(selected); }} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white">Editar locação</button>
            </div>
          </div>}
        </WorkspaceModal>
        <WorkspaceModal open={Boolean(confirmationRental)} title="Confirmar locação pelo WhatsApp" description="Revise e personalize a mensagem antes de abrir o WhatsApp." onClose={() => setConfirmationRental(null)} size="lg">
          {confirmationRental && (() => {
            const customer = customers.find((item) => item.id === confirmationRental.customer_id);
            const phone = normalizeWhatsAppPhone(customer?.phone);
            return <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#f1eaff] to-[#f8f5ff] p-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#8054d8] shadow-sm"><span className="text-xl">✉</span></div>
                <div><p className="text-sm font-bold text-gray-900">{confirmationRental.customer_name}</p><p className="text-xs text-gray-500">Locação #{confirmationRental.rental_number} · {phone ? '+' + phone : 'Telefone não cadastrado'}</p></div>
              </div>
              <label htmlFor="rental-confirmation-message" className="block text-sm font-semibold text-gray-800">Mensagem para o cliente</label>
              <textarea id="rental-confirmation-message" value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} rows={12} className="block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-700 outline-none transition focus:border-[#8054d8] focus:ring-4 focus:ring-purple-100" />
              <div className="flex items-center justify-between text-xs text-gray-400"><span>Você pode editar qualquer informação antes de enviar.</span><span>{confirmationText.length} caracteres</span></div>
              <div className="rounded-xl border border-green-100 bg-green-50/70 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-green-800">Prévia da mensagem</p>
                <div className="whitespace-pre-wrap rounded-xl rounded-tl-sm bg-white p-4 text-sm leading-6 text-gray-700 shadow-sm">{confirmationText || 'Digite a mensagem que deseja enviar.'}</div>
              </div>
              {!phone && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Cadastre um telefone válido para este cliente antes de enviar a confirmação.</p>}
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-gray-100 pt-4 sm:flex-row">
                <button type="button" onClick={() => setConfirmationRental(null)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700">Fechar</button>
                <button type="button" disabled={!phone || !confirmationText.trim()} onClick={() => window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(confirmationText), '_blank', 'noopener,noreferrer')} className="rounded-xl bg-[#16a34a] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40">Abrir WhatsApp para enviar</button>
              </div>
            </div>;
          })()}
        </WorkspaceModal>
        <form onSubmit={submitSearch} className="mb-4 rounded-2xl border border-purple-100 bg-white p-3">
          <label htmlFor="rental-search" className="sr-only">Pesquisar locações</label>
          <input id="rental-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar por número, cliente, item ou responsável" className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100" />
          <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full min-w-0 text-xs font-semibold text-gray-500 sm:w-auto sm:min-w-48">Situação
              <div className="mt-1"><SearchablePicker title="Filtrar por situação" value={statusFilter} options={[
                { value: 'all', label: 'Todas' }, { value: 'pending', label: 'Pendentes' }, { value: 'confirmed', label: 'Confirmadas' },
                { value: 'ongoing', label: 'Em andamento' }, { value: 'completed', label: 'Concluídas' }, { value: 'cancelled', label: 'Canceladas' },
              ]} placeholder="Todas" searchPlaceholder="Buscar situação..." emptyText="Nenhuma situação encontrada." onChange={(value) => { setStatusFilter(value as 'all' | RentalStatus); setPage(0); }} /></div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 sm:flex-none">Pesquisar</button>
              <button type="button" onClick={clearFilters} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Limpar</button>
            </div>
          </div>
        </form>
        {listError && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p role="alert">{listError}</p><button type="button" onClick={() => setRefreshIndex((current) => current + 1)} className="font-semibold underline">Tentar novamente</button></div>}
        <RentalList rentals={visibleRentals} loading={listLoading} totalCount={filteredRentals.length} page={page} pageSize={pageSize}
          onPageChange={(next) => setPage(Math.max(0, Math.min(next, pageCount - 1)))} onEdit={openEditRental} onView={setViewingRental} />
        {!listLoading && filteredRentals.length > 0 && <p className="mt-3 text-right text-xs text-gray-400">Exibindo somente locações às quais sua conta tem acesso.</p>}
      </section>
    </AppShell>
  );
}
