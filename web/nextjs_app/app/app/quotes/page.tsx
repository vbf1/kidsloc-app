'use client';
import { hasModuleData, useModuleData } from '../../../lib/module-data-cache';
import { useCompanyRealtimeRefresh } from '../../../lib/use-company-realtime';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';
import { Pagination } from '../../../components/pagination';
import { clearWorkspaceSessionCache, getWorkspaceSessionCache, setWorkspaceSessionCache } from '../../../lib/workspace-session-cache';

type Role = 'admin' | 'staff';
type Customer = { id: string; name: string; phone: string | null; email?: string | null; cpf?: string | null; address?: string | null };
type Product = { id: string; name: string; daily_price: number | string; event_price: number | string | null; item_type: string };
type QuoteItem = { product_id: string; quantity: number; unit_price: number };
type QuoteLine = { quote_id: string; product_id?: string; description: string; quantity: number; unit_price: number | string; subtotal: number | string };
type QuoteDocItem = { product_id?: string; name?: string; description?: string; quantity: number; unit_price: number | string; subtotal?: number | string };
type QuoteSnapshot = {
  company?: { name?: string; logo_url?: string; instagram?: string; tagline?: string; phone?: string; email?: string; address?: string };
  customer?: { name?: string; phone?: string; email?: string; document?: string; address?: string };
  event?: { date?: string; name?: string; local?: string; start_time?: string; end_time?: string; delivery_method?: 'delivery'|'customer_pickup' };
  document?: { title?: string; subtitle?: string; description?: string; inclusions?: string; closing?: string };
  items?: QuoteDocItem[];
  pricing?: { subtotal?: number; delivery_fee?: number; discount?: number; total?: number };
  notes?: string;
};
type Quote = { id: string; quote_number: number; customer_id: string | null; status: string; issue_date: string; valid_until: string | null; event_date: string | null; start_time:string|null; end_time:string|null; delivery_method:'delivery'|'customer_pickup'; delivery_address:string|null; delivery_fee:number|string; discount:number|string; subtotal:number|string; total_amount: number | string; notes: string | null; quote_snapshot?: QuoteSnapshot | null };

const money = (value: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
const statusLabel: Record<string,string> = { draft:'Rascunho', sent:'Enviado', accepted:'Aprovado', rejected:'Recusado', expired:'Expirado', converted:'Convertido em locação', cancelled:'Cancelado' };

export default function QuotesPage() {
  const router = useRouter();
  const cachedWorkspace = getWorkspaceSessionCache();
  const workspaceScope = cachedWorkspace ? `${cachedWorkspace.userId}:${cachedWorkspace.companyId}` : '';
  const [companyId,setCompanyId] = useState('');
  const [companyName,setCompanyName] = useState('');
  const [companyLogoUrl,setCompanyLogoUrl] = useState('');
  const [companySettings,setCompanySettings] = useState<Record<string, string>>({});
  const [editCompanyName,setEditCompanyName] = useState('');
  const [editCompanyTagline,setEditCompanyTagline] = useState('');
  const [editCompanyInstagram,setEditCompanyInstagram] = useState('');
  const [editCompanyPhone,setEditCompanyPhone] = useState('');
  const [editCompanyAddress,setEditCompanyAddress] = useState('');
  const [email,setEmail] = useState('');
  const [role,setRole] = useState<Role>();
  const [loading,setLoading] = useState(!hasModuleData('quotes', workspaceScope));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [customers,setCustomers] = useModuleData<Customer[]>('quotes','customers',workspaceScope,[]);
  const [products,setProducts] = useModuleData<Product[]>('quotes','products',workspaceScope,[]);
  const [quotes,setQuotes] = useModuleData<Quote[]>('quotes','quotes',workspaceScope,[]);
  const [quoteLines,setQuoteLines] = useModuleData<Record<string,QuoteLine[]>>('quotes','quoteLines',workspaceScope,{});
  const [names,setNames] = useModuleData<Record<string,string>>('quotes','names',workspaceScope,{});
  const [showForm,setShowForm] = useState(false);
  const [customerId,setCustomerId] = useState('');
  const [validUntil,setValidUntil] = useState('');
  const [eventDate,setEventDate] = useState('');
  const [startTime,setStartTime] = useState('09:00');
  const [endTime,setEndTime] = useState('18:00');
  const [deliveryMethod,setDeliveryMethod] = useState<'delivery'|'customer_pickup'>('delivery');
  const [address,setAddress] = useState('');
  const [deliveryFee,setDeliveryFee] = useState('0');
  const [discount,setDiscount] = useState('0');
  const [notes,setNotes] = useState('');
  const [items,setItems] = useState<QuoteItem[]>([]);
  const [productId,setProductId] = useState('');
  const [quantity,setQuantity] = useState('1');
  const [unitPrice,setUnitPrice] = useState('');
  const [printQuote,setPrintQuote] = useState<Quote|null>(null);
  const [editingQuote,setEditingQuote] = useState<Quote|null>(null);
  const [savingEdit,setSavingEdit] = useState(false);
  const [editCustomerId,setEditCustomerId] = useState('');
  const [editCustomerName,setEditCustomerName] = useState('');
  const [editCustomerPhone,setEditCustomerPhone] = useState('');
  const [editCustomerEmail,setEditCustomerEmail] = useState('');
  const [editCustomerDocument,setEditCustomerDocument] = useState('');
  const [editEventDate,setEditEventDate] = useState('');
  const [editEventName,setEditEventName] = useState('');
  const [editLocal,setEditLocal] = useState('');
  const [editStartTime,setEditStartTime] = useState('');
  const [editEndTime,setEditEndTime] = useState('');
  const [editDeliveryMethod,setEditDeliveryMethod] = useState<'delivery'|'customer_pickup'>('delivery');
  const [editTitle,setEditTitle] = useState('ORÇAMENTO COMERCIAL');
  const [editSubtitle,setEditSubtitle] = useState('Proposta de locação');
  const [editDescription,setEditDescription] = useState('');
  const [editInclusions,setEditInclusions] = useState('Todo o material necessário\n2 monitores');
  const [editClosing,setEditClosing] = useState('Agradecemos pela oportunidade de fazer parte do seu evento! Será um prazer levar diversão e alegria para sua comemoração.');
  const [editNotes,setEditNotes] = useState('');
  const [editItemsText,setEditItemsText] = useState('');
  const [editDeliveryFee,setEditDeliveryFee] = useState('0');
  const [editDiscount,setEditDiscount] = useState('0');
  const [page,setPage] = useState(0);
  const pageSize = useResponsivePageSize();
  const visibleQuotes = quotes.slice(page * pageSize, (page + 1) * pageSize);

  const load = useCallback(async () => {
    await Promise.resolve();
    if (!supabase) { setError('A conexão com o banco não está configurada.'); setLoading(false); return; }
    const { data:{user}, error:authError } = await supabase.auth.getUser();
    if (authError || !user) { clearWorkspaceSessionCache(); router.replace('/login/'); return; }
    setEmail(user.email ?? '');
    const cached=getWorkspaceSessionCache();let workspaceCompanyId:string;let workspaceCompanyName:string;let workspaceRole:Role;
    if(cached?.userId===user.id){workspaceCompanyId=cached.companyId;workspaceCompanyName=cached.companyName;workspaceRole=cached.role as Role;}
    else {const { data:m, error:mError } = await supabase.from('company_members').select('company_id,role,companies(name,contract_logo_url,contract_settings)').eq('user_id',user.id).limit(1).maybeSingle();
      if (mError || !m?.company_id) { setError('Não foi possível identificar a empresa da sua conta.'); setLoading(false); return; }
      const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
      workspaceCompanyId=m.company_id;workspaceCompanyName=c?.name ?? 'Minha empresa';workspaceRole=m.role as Role;setCompanyLogoUrl(c?.contract_logo_url??'');setCompanySettings((c?.contract_settings??{}) as Record<string, string>);
      setWorkspaceSessionCache({userId:user.id,email:user.email??'',companyName:workspaceCompanyName,companyId:workspaceCompanyId,role:workspaceRole});}
    setCompanyId(workspaceCompanyId); setCompanyName(workspaceCompanyName); setRole(workspaceRole);
    const [cr,pr,qr,companyResult] = await Promise.all([
      supabase.from('customers').select('id,name,phone,email,cpf,address').eq('company_id',workspaceCompanyId).order('name'),
      supabase.from('products').select('id,name,daily_price,event_price,item_type').eq('company_id',workspaceCompanyId).eq('active',true).order('name'),
      supabase.from('rental_quotes').select('id,quote_number,customer_id,status,issue_date,valid_until,event_date,start_time,end_time,delivery_method,delivery_address,delivery_fee,discount,subtotal,total_amount,notes,quote_snapshot').eq('company_id',workspaceCompanyId).order('created_at',{ascending:false}).limit(200),
      supabase.from('companies').select('name,contract_logo_url,contract_settings').eq('id',workspaceCompanyId).maybeSingle()
    ]);
    if (cr.error || pr.error || qr.error || companyResult.error) setError('Não foi possível carregar os dados de orçamento.');
    else {
      setCustomers(cr.data ?? []); setProducts(pr.data ?? []); setQuotes((qr.data ?? []) as Quote[]);setCompanyLogoUrl(companyResult.data?.contract_logo_url??'');setCompanySettings((companyResult.data?.contract_settings??{}) as Record<string, string>);
      const quoteIds = (qr.data ?? []).map(q => q.id);
      if (quoteIds.length) {
        const { data: lines, error: linesError } = await supabase.from('rental_quote_items').select('quote_id,product_id,description,quantity,unit_price,subtotal').eq('company_id', workspaceCompanyId).in('quote_id', quoteIds);
        if (!linesError) {
          const grouped: Record<string,QuoteLine[]> = {};
          for (const line of lines ?? []) (grouped[line.quote_id] ??= []).push(line as QuoteLine);
          setQuoteLines(grouped);
        }
      }
      setNames(Object.fromEntries((cr.data ?? []).map(x=>[x.id,x.name])));
    }
    setLoading(false);
  }, [router]);
  useCompanyRealtimeRefresh(companyId, ['rental_quotes', 'rental_quote_items', 'customers', 'products'], () => { void load(); });
  // This effect starts an asynchronous data request; state updates occur after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ void load(); },[load]);

  const subtotal = useMemo(()=>items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0),[items]);
  const total = Math.max(0,subtotal+(Number(deliveryFee)||0)-(Number(discount)||0));
  function addItem() {
    const product=products.find(p=>p.id===productId);
    const qty=Number(quantity), price=Number(unitPrice);
    if (!product || !Number.isInteger(qty) || qty<1 || !Number.isFinite(price) || price<0) { setError('Confira o item, a quantidade e o preço.'); return; }
    if (items.some(item => item.product_id === product.id)) { setError('Este item já foi adicionado ao orçamento. Ajuste a quantidade na linha existente ou remova antes de adicionar novamente.'); return; }
    setItems(current=>[...current,{product_id:product.id,quantity:qty,unit_price:price}]);
    setProductId(''); setQuantity('1'); setUnitPrice(''); setError('');
  }
  async function saveQuote(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !companyId || busy) return;
    if (!customerId || items.length===0) { setError('Selecione o cliente e adicione pelo menos um item.'); return; }
    if (deliveryMethod==='delivery' && !address.trim()) { setError('Informe o endereço de entrega.'); return; }
    setBusy(true); setError('');
    const {data:createdQuoteId,error:saveError}=await supabase.rpc('create_rental_quote_with_items',{
      p_company_id:companyId,p_customer_id:customerId,p_valid_until:validUntil||null,
      p_event_date:eventDate||null,p_start_time:startTime||null,p_end_time:endTime||null,
      p_delivery_method:deliveryMethod,p_delivery_address:address,
      p_delivery_fee:Number(deliveryFee)||0,p_discount:Number(discount)||0,p_notes:notes,
      p_items:items
    });
    if (saveError) setError(saveError.message || 'Não foi possível salvar o orçamento.');
    else {
      const customer=customers.find(c=>c.id===customerId);
      const selectedItems=items.map(item=>{const product=products.find(p=>p.id===item.product_id);return {product_id:item.product_id,name:product?.name??'Item',description:product?.name??'Item',quantity:item.quantity,unit_price:item.unit_price,subtotal:item.quantity*item.unit_price};});
      const snapshot:QuoteSnapshot={company:{name:companyName,logo_url:companyLogoUrl,instagram:companySettings.instagram??'',tagline:companySettings.tagline??'Locação de brinquedos para festas e eventos',phone:companySettings.phone??'',email:companySettings.email??'',address:companySettings.address??''},customer:{name:customer?.name??'',phone:customer?.phone??'',email:customer?.email??'',document:customer?.cpf??'',address:customer?.address??''},event:{date:eventDate, name:'',local:address,start_time:startTime,end_time:endTime,delivery_method:deliveryMethod},document:{title:'ORÇAMENTO COMERCIAL',subtitle:'Proposta de locação',description:'Apresentamos nossa proposta de locação para tornar seu evento ainda mais especial.',inclusions:'Todo o material necessário\\nEquipe de atendimento',closing:'Agradecemos pela oportunidade! Será um prazer fazer parte do seu evento.'},items:selectedItems,pricing:{delivery_fee:Number(deliveryFee)||0,discount:Number(discount)||0,subtotal,total},notes};
      if(createdQuoteId) {
        const {error:snapshotError}=await supabase.from('rental_quotes').update({quote_snapshot:snapshot}).eq('id',createdQuoteId).eq('company_id',companyId);
        if(snapshotError) setError('Orçamento criado, mas não foi possível salvar o modelo do documento: '+snapshotError.message);
      }
      setNotice('Orçamento criado com sucesso.'); setShowForm(false); setCustomerId('');setItems([]);setAddress('');setNotes('');await load();
    }
    setBusy(false);
  }
  function beginEditQuote(q:Quote) {
    const s=q.quote_snapshot??{};
    const customer=s.customer??{};
    const event=s.event??{};
    const doc=s.document??{};
    const oldItems=s.items??(quoteLines[q.id]??[]).map(line=>({...line,name:line.description,product_id:line.product_id}));
    setEditingQuote(q);setEditCustomerId(q.customer_id??'');setEditCustomerName(customer.name??names[q.customer_id??'']??'');setEditCustomerPhone(customer.phone??'');setEditCustomerEmail(customer.email??'');setEditCustomerDocument(customer.document??'');setEditCompanyName(s.company?.name??companyName);setEditCompanyTagline(s.company?.tagline??'Locação de brinquedos para festas e eventos');setEditCompanyInstagram(s.company?.instagram??companySettings.instagram??'');setEditCompanyPhone(s.company?.phone??companySettings.phone??'');setEditCompanyAddress(s.company?.address??companySettings.address??'');
    setEditEventDate(q.event_date??'');setEditEventName(event.name??'');setEditLocal(event.local??q.delivery_address??'');setEditStartTime(q.start_time?.slice(0,5)??'09:00');setEditEndTime(q.end_time?.slice(0,5)??'13:00');setEditDeliveryMethod(q.delivery_method);
    setEditTitle(doc.title??'ORÇAMENTO COMERCIAL');setEditSubtitle(doc.subtitle??'Proposta de locação');setEditDescription(doc.description??'');setEditInclusions(doc.inclusions??'');setEditClosing(doc.closing??'');setEditNotes(q.notes??s.notes??'');
    setEditItemsText(oldItems.map((item:QuoteDocItem)=>[item.description??item.name,item.quantity,item.unit_price,products.find(p=>p.id===item.product_id)?.name??''].join(' | ')).join('\\n'));
    setEditDeliveryFee(String(q.delivery_fee??0));setEditDiscount(String(q.discount??0));setError('');
  }
  async function saveQuoteEdit() {
    if(!supabase||!editingQuote||savingEdit)return;
    if(!editCustomerName.trim()||!editEventDate||!editItemsText.trim()){setError('Preencha o cliente, a data do evento e pelo menos um item.');return;}
    const oldItems=editingQuote.quote_snapshot?.items??(quoteLines[editingQuote.id]??[]).map(line=>({...line,name:line.description,product_id:line.product_id}));
    const parsed=editItemsText.split('\\n').map((line,index)=>{const [description,qty,price,productLabel]=line.split('|').map(v=>v.trim());if(!description)return null;const previous=oldItems[index];const product=products.find(p=>p.name.toLocaleLowerCase('pt-BR')===(productLabel||description).toLocaleLowerCase('pt-BR'));const productId=product?.id||previous?.product_id;return {product_id:productId,description,name:description,quantity:Math.max(1,Number(qty)||1),unit_price:Math.max(0,Number((price??'0').replace(',','.'))||0)};}).filter(Boolean) as Array<{product_id:string;description:string;name:string;quantity:number;unit_price:number}>;
    if(!parsed.length||parsed.some(item=>!item.product_id||!products.some(p=>p.id===item.product_id))){setError('Cada item precisa corresponder a um produto ou serviço cadastrado. Use: descrição | quantidade | valor unitário | ID do produto.');return;}
    const subtotalEdit=parsed.reduce((sum,item)=>sum+item.quantity*item.unit_price,0);const fee=Math.max(0,Number(editDeliveryFee.replace(',','.'))||0);const discountValue=Math.max(0,Number(editDiscount.replace(',','.'))||0);const totalEdit=Math.max(0,subtotalEdit+fee-discountValue);
    const snapshot:QuoteSnapshot={company:{name:editCompanyName.trim()||companyName,logo_url:companyLogoUrl,instagram:editCompanyInstagram.trim(),tagline:editCompanyTagline.trim(),phone:editCompanyPhone.trim(),address:editCompanyAddress.trim(),email:companySettings.email??''},customer:{name:editCustomerName.trim(),phone:editCustomerPhone.trim(),email:editCustomerEmail.trim(),document:editCustomerDocument.trim()},event:{date:editEventDate,name:editEventName.trim(),local:editLocal.trim(),start_time:editStartTime,end_time:editEndTime,delivery_method:editDeliveryMethod},document:{title:editTitle.trim(),subtitle:editSubtitle.trim(),description:editDescription.trim(),inclusions:editInclusions,closing:editClosing.trim()},items:parsed,pricing:{subtotal:subtotalEdit,delivery_fee:fee,discount:discountValue,total:totalEdit},notes:editNotes.trim()};
    setSavingEdit(true);setError('');
    const {error:saveError}=await supabase.rpc('update_rental_quote_document',{p_quote_id:editingQuote.id,p_customer_id:editCustomerId||null,p_event_date:editEventDate,p_start_time:editStartTime||null,p_end_time:editEndTime||null,p_delivery_method:editDeliveryMethod,p_delivery_address:editLocal.trim(),p_delivery_fee:fee,p_discount:discountValue,p_notes:editNotes.trim(),p_items:parsed.map(item=>({product_id:item.product_id,description:item.description,quantity:item.quantity,unit_price:item.unit_price})),p_snapshot:snapshot});
    setSavingEdit(false);
    if(saveError){setError(saveError.message||'Não foi possível salvar as alterações.');return;}
    setEditingQuote(null);setNotice('Orçamento atualizado.');await load();
  }
  async function convertQuote(id:string) {
    if (!supabase || !companyId) return;
    setError('');
    const { error:err } = await supabase.rpc('convert_rental_quote_to_rental', { p_quote_id: id });
    if (err) setError(err.message || 'Não foi possível converter o orçamento em locação.');
    else { setNotice('Orçamento convertido em locação com sucesso.'); await load(); }
  }
  async function updateStatus(id:string,status:string) {
    if (!supabase) return;
    const {error:err}=await supabase.from('rental_quotes').update({status}).eq('id',id).eq('company_id',companyId);
    if(err) setError('Não foi possível atualizar a situação do orçamento.');
    else {setNotice('Situação do orçamento atualizada.');await load();}
  }
  async function signOut(){if(!supabase)return;await supabase.auth.signOut();router.push('/login/');}

  if(loading && !hasModuleData('quotes', workspaceScope)) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p>Carregando orçamentos...</p></main>;
  return <AppShell companyName={companyName} email={email} role={role} companyId={companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH??''} signingOut={false} onSignOut={signOut}>
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#8054d8]">Gestão comercial</p><h1 className="mt-2 text-3xl font-bold">Orçamentos</h1><p className="mt-2 text-sm text-gray-500">Monte propostas com itens, valores, validade e dados do evento.</p></div>
      {!showForm && <button onClick={()=>{setShowForm(true);setError('');setNotice('');}} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white">+ Novo orçamento</button>}</div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {showForm && <form onSubmit={saveQuote} className="mb-6 space-y-5 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Novo orçamento</h2><button type="button" onClick={()=>setShowForm(false)} className="text-sm text-gray-500">Fechar</button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-gray-700">Cliente<select required value={customerId} onChange={e=>setCustomerId(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"><option value="">Selecione</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-gray-700">Data do evento<input required type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Válido até<input type="date" min={today()} value={validUntil} onChange={e=>setValidUntil(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Horário<input required type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} placeholder="09:00" className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Término<input required type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} placeholder="18:00" className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Entrega ou retirada<select value={deliveryMethod} onChange={e=>setDeliveryMethod(e.target.value as 'delivery'|'customer_pickup')} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"><option value="delivery">Entrega</option><option value="customer_pickup">Retirada pelo cliente</option></select></label>
          {deliveryMethod==='delivery' && <label className="text-sm font-semibold text-gray-700 sm:col-span-2">Endereço de entrega<input required value={address} onChange={e=>setAddress(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>}
        </div>
        <div className="rounded-xl border border-gray-100 p-4"><h3 className="font-bold">Itens do orçamento</h3><div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_100px_140px_auto]">
          <select value={productId} onChange={e=>{setProductId(e.target.value);const p=products.find(x=>x.id===e.target.value);setUnitPrice(String(p?(p.item_type==='toy'?p.daily_price:p.event_price??0):''));}} className="min-w-0 w-full rounded-xl border border-gray-200 p-3 text-sm sm:col-span-2 lg:col-span-1"><option value="">Selecione um brinquedo ou serviço</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input aria-label="Quantidade" type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} className="min-w-0 w-full rounded-xl border border-gray-200 p-3 text-sm"/>
          <input aria-label="Preço unitário" type="number" min="0" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} placeholder="Valor unitário" className="min-w-0 w-full rounded-xl border border-gray-200 p-3 text-sm"/>
          <button type="button" onClick={addItem} className="rounded-xl border border-purple-200 px-4 py-3 text-sm font-semibold text-[#6840bd] sm:col-span-2 lg:col-span-1">Adicionar</button></div>
          <div className="mt-3 divide-y divide-gray-100">{items.map((item,index)=>{const p=products.find(x=>x.id===item.product_id);return <div key={index} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{p?.name} × {item.quantity}</span><span className="font-semibold">{money(item.quantity*item.unit_price)} <button type="button" onClick={()=>setItems(v=>v.filter((_,i)=>i!==index))} className="ml-2 text-red-600">Remover</button></span></div>;})}{!items.length&&<p className="py-3 text-sm text-gray-400">Nenhum item adicionado.</p>}</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Taxa de entrega<input type="number" min="0" step="0.01" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label><label className="text-sm font-semibold">Desconto<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label><div className="rounded-xl bg-purple-50 p-3"><p className="text-xs text-purple-700">Total do orçamento</p><p className="mt-1 text-2xl font-bold text-gray-900">{money(total)}</p></div></div>
        <label className="block text-sm font-semibold">Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={()=>setShowForm(false)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold">Cancelar</button><button disabled={busy} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Salvando...':'Salvar orçamento'}</button></div>
      </form>}
      {printQuote&&(()=>{const s=printQuote.quote_snapshot??{};const company=s.company??{name:companyName,logo_url:companyLogoUrl,tagline:'Locação de brinquedos para festas e eventos'};const customer=s.customer??{name:names[printQuote.customer_id??'']??'Cliente'};const event=s.event??{};const doc=s.document??{};const lines=s.items??(quoteLines[printQuote.id]??[]).map(line=>({description:line.description,quantity:line.quantity,unit_price:Number(line.unit_price),subtotal:Number(line.subtotal)}));const pricing=s.pricing??{subtotal:Number(printQuote.subtotal),delivery_fee:Number(printQuote.delivery_fee),discount:Number(printQuote.discount),total:Number(printQuote.total_amount)};return <div className="quote-print-overlay fixed inset-0 z-[160] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="quote-print-title"><article className="quote-print-document w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-9">
        <header className="flex flex-wrap items-center gap-4 border-b-2 border-[#2d5a87] pb-5">{company.logo_url&&<img src={company.logo_url} alt="Logomarca da empresa" className="h-20 w-24 object-contain"/>}<div className="min-w-0 flex-1"><h2 className="text-xl font-extrabold uppercase tracking-wide text-[#244d78]">{company.name??companyName}</h2><p className="mt-1 text-sm text-slate-500">{company.tagline??'Locação de brinquedos para festas e eventos'}</p>{company.instagram&&<p className="mt-1 text-xs text-slate-500">Instagram: {company.instagram}</p>}{company.phone&&<p className="text-xs text-slate-500">{company.phone}</p>}</div></header>
        <div className="mt-5"><h1 id="quote-print-title" className="text-xl font-extrabold text-[#244d78]">{doc.title??'ORÇAMENTO COMERCIAL'}</h1><p className="mt-1 text-sm text-slate-500">{doc.subtitle??'Proposta de locação'} · Orçamento #{printQuote.quote_number}</p></div>
        <div className="mt-5 grid gap-0 overflow-hidden rounded-lg border border-slate-200 bg-[#f1f6fb] text-sm sm:grid-cols-2"><div className="border-b border-slate-200 p-3 sm:border-r"><span className="font-bold text-slate-600">Cliente: </span>{customer.name??'Cliente'}{customer.document&&<p className="text-xs text-slate-500">Documento: {customer.document}</p>}{customer.phone&&<p className="text-xs text-slate-500">Telefone: {customer.phone}</p>}{customer.email&&<p className="text-xs text-slate-500">{customer.email}</p>}</div><div className="border-b border-slate-200 p-3"><span className="font-bold text-slate-600">Data: </span>{new Date(printQuote.issue_date+'T00:00:00').toLocaleDateString('pt-BR')}</div><div className="p-3 sm:border-r"><span className="font-bold text-slate-600">Evento: </span>{event.name||'—'}{printQuote.event_date&&<p className="text-xs text-slate-500">Data: {new Date(printQuote.event_date+'T00:00:00').toLocaleDateString('pt-BR')}</p>}</div><div className="p-3"><span className="font-bold text-slate-600">Local: </span>{event.local??printQuote.delivery_address??'—'}<p className="text-xs text-slate-500">Horário: {(event.start_time??printQuote.start_time??'').slice(0,5)||'—'} às {(event.end_time??printQuote.end_time??'').slice(0,5)||'—'}</p></div></div>
        <section className="mt-6"><h3 className="text-sm font-extrabold uppercase tracking-wide text-[#244d78]">Descrição do pacote</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{doc.description??'Apresentamos nossa proposta de locação para tornar seu evento ainda mais especial.'}</p></section>
        <section className="mt-5"><table className="w-full border-collapse text-sm"><thead><tr className="bg-[#244d78] text-left text-white"><th className="w-14 p-3">ITEM</th><th className="p-3">DESCRIÇÃO</th><th className="w-16 p-3 text-right">QTD.</th></tr></thead><tbody>{lines.map((line:QuoteDocItem,index:number)=><tr key={index} className={index%2?'bg-[#f1f6fb]':'bg-white'}><td className="border border-slate-200 p-3 font-bold text-[#244d78]">{String(index+1).padStart(2,'0')}</td><td className="border border-slate-200 p-3">{line.description??line.name}</td><td className="border border-slate-200 p-3 text-right">{line.quantity}</td></tr>)}</tbody></table></section>
        {doc.inclusions&&<section className="mt-6"><h3 className="text-sm font-extrabold uppercase tracking-wide text-[#244d78]">Incluso no pacote</h3><div className="mt-2 whitespace-pre-wrap rounded-lg border border-green-100 bg-green-50 p-3 text-sm leading-6 text-slate-700">{doc.inclusions.split('\\n').map((v:string)=>v.trim()).filter(Boolean).map((v:string,i:number)=><p key={i}>✓ {v}</p>)}</div></section>}
        <section className="mt-6"><h3 className="text-sm font-extrabold uppercase tracking-wide text-[#244d78]">Investimento</h3><div className="mt-2 divide-y divide-slate-200 text-sm"><div className="flex justify-between gap-3 py-2"><span>{doc.subtitle??'Itens do pacote'}</span><strong>{money(pricing.subtotal??printQuote.subtotal)}</strong></div>{Number(pricing.delivery_fee)>0&&<div className="flex justify-between py-2"><span>Frete / entrega</span><strong>{money(pricing.delivery_fee)}</strong></div>}{Number(pricing.discount)>0&&<div className="flex justify-between py-2"><span>Desconto</span><strong>− {money(pricing.discount)}</strong></div>}</div><div className="mt-3 flex items-center justify-between gap-3 border border-[#f4d86c] bg-[#fff8d9] p-4"><strong className="text-sm uppercase text-[#244d78]">Valor total do orçamento</strong><strong className="text-2xl font-extrabold text-[#244d78]">{money(pricing.total??printQuote.total_amount)}</strong></div></section>
        {s.notes&&<section className="mt-5 border-t pt-4"><h3 className="text-xs font-bold uppercase text-slate-500">Observações</h3><p className="mt-1 whitespace-pre-wrap text-sm">{s.notes}</p></section>}
        {doc.closing&&<p className="mt-6 whitespace-pre-wrap border-t pt-4 text-sm leading-6 text-slate-600">{doc.closing}</p>}
        <div className="quote-print-actions mt-6 flex flex-wrap justify-end gap-2"><button onClick={()=>setPrintQuote(null)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Fechar</button><button onClick={()=>window.print()} className="rounded-xl bg-[#8054d8] px-4 py-2.5 text-sm font-semibold text-white">Imprimir / Salvar PDF</button></div>
      </article></div>})()}
      {editingQuote&&<div className="fixed inset-0 z-[170] flex items-end justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:items-center sm:p-5"><section className="flex max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex shrink-0 items-center justify-between border-b px-4 py-4 sm:px-6"><div><h2 className="font-bold">Editar orçamento #{editingQuote.quote_number}</h2><p className="text-xs text-slate-500">As alterações ficam neste documento, sem modificar o cadastro do cliente.</p></div><button onClick={()=>setEditingQuote(null)} className="rounded-lg border px-3 py-2 text-xs">Fechar</button></header><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <h3 className="font-bold text-[#6840bd]">Dados da empresa neste orçamento</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Nome da empresa<input value={editCompanyName} onChange={e=>setEditCompanyName(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Instagram<input value={editCompanyInstagram} onChange={e=>setEditCompanyInstagram(e.target.value)} placeholder="@suaempresa" className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Descrição curta<input value={editCompanyTagline} onChange={e=>setEditCompanyTagline(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Telefone<input value={editCompanyPhone} onChange={e=>setEditCompanyPhone(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold sm:col-span-2">Endereço da empresa<input value={editCompanyAddress} onChange={e=>setEditCompanyAddress(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label></div>
        <h3 className="font-bold text-[#6840bd]">Cliente e evento</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Nome do cliente<input value={editCustomerName} onChange={e=>setEditCustomerName(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Documento<input value={editCustomerDocument} onChange={e=>setEditCustomerDocument(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Telefone<input value={editCustomerPhone} onChange={e=>setEditCustomerPhone(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">E-mail<input value={editCustomerEmail} onChange={e=>setEditCustomerEmail(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Data do evento<input type="date" value={editEventDate} onChange={e=>setEditEventDate(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Nome / tipo do evento<input value={editEventName} onChange={e=>setEditEventName(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Horário inicial<input type="time" value={editStartTime} onChange={e=>setEditStartTime(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Horário final<input type="time" value={editEndTime} onChange={e=>setEditEndTime(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold sm:col-span-2">Local / endereço<input value={editLocal} onChange={e=>setEditLocal(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Entrega ou retirada<select value={editDeliveryMethod} onChange={e=>setEditDeliveryMethod(e.target.value as 'delivery'|'customer_pickup')} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"><option value="delivery">Entrega</option><option value="customer_pickup">Retirada pelo cliente</option></select></label></div>
        <h3 className="font-bold text-[#6840bd]">Apresentação do orçamento</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Título<input value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Subtítulo<input value={editSubtitle} onChange={e=>setEditSubtitle(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold sm:col-span-2">Descrição do pacote<textarea rows={3} value={editDescription} onChange={e=>setEditDescription(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold sm:col-span-2">O que está incluso (um item por linha)<textarea rows={3} value={editInclusions} onChange={e=>setEditInclusions(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label></div>
        <h3 className="font-bold text-[#6840bd]">Itens do orçamento</h3><p className="text-xs text-slate-500">Um item por linha: descrição | quantidade | valor unitário | nome do produto no catálogo. Para adicionar um item, informe no último campo o nome exato do produto/serviço cadastrado.</p><textarea rows={6} value={editItemsText} onChange={e=>setEditItemsText(e.target.value)} className="w-full rounded-xl border p-3 font-mono text-xs"/><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Frete / entrega (R$)<input value={editDeliveryFee} onChange={e=>setEditDeliveryFee(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold">Desconto (R$)<input value={editDiscount} onChange={e=>setEditDiscount(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold sm:col-span-2">Observações<textarea rows={3} value={editNotes} onChange={e=>setEditNotes(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label><label className="text-xs font-semibold sm:col-span-2">Mensagem de encerramento<textarea rows={2} value={editClosing} onChange={e=>setEditClosing(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm font-normal"/></label></div>
      </div><footer className="flex shrink-0 flex-col-reverse gap-2 border-t bg-white p-4 sm:flex-row sm:justify-end sm:px-6"><button onClick={()=>setEditingQuote(null)} className="rounded-xl border px-4 py-3 text-sm font-semibold">Cancelar</button><button disabled={savingEdit} onClick={()=>void saveQuoteEdit()} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{savingEdit?'Salvando...':'Salvar alterações'}</button></footer></section></div>}
      <div className="space-y-3">{visibleQuotes.map(q=><article key={q.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-purple-700">ORÇAMENTO #{q.quote_number}</p><h2 className="mt-1 text-lg font-bold">{names[q.customer_id??'']??'Cliente'}</h2><p className="mt-1 text-xs text-gray-500">Criado em {new Date(q.issue_date+'T00:00:00').toLocaleDateString('pt-BR')} {q.event_date?'· Evento '+new Date(q.event_date+'T00:00:00').toLocaleDateString('pt-BR'):''}</p></div><div className="text-right"><p className="text-xl font-bold">{money(q.total_amount)}</p><span className="text-xs font-semibold text-gray-500">{statusLabel[q.status]??q.status}</span></div></div>
        <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100">{(quoteLines[q.id]??[]).map((line,index)=><div key={index} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="text-gray-700">{line.description} × {line.quantity}</span><strong>{money(line.subtotal)}</strong></div>)}</div><div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>setPrintQuote(q)} className="rounded-lg border border-purple-200 px-3 py-2 text-xs font-semibold text-[#6840bd]">Visualizar / PDF</button>{role==='admin'&&q.status!=='converted'&&q.status!=='cancelled'&&<button onClick={()=>beginEditQuote(q)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Editar orçamento</button>}{q.status==='draft'&&<button onClick={()=>void updateStatus(q.id,'sent')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">Marcar como enviado</button>}{q.status==='sent'&&<><button onClick={()=>void updateStatus(q.id,'accepted')} className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">Aprovar</button><button onClick={()=>void updateStatus(q.id,'rejected')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">Recusar</button></>}{q.status==='accepted'&&<button onClick={()=>void convertQuote(q.id)} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white">Converter em locação</button>}</div>
      </article>)}{!quotes.length&&<div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">Nenhum orçamento cadastrado ainda.</div>}</div><Pagination totalCount={quotes.length} page={page} pageSize={pageSize} onPageChange={setPage}/>
    </section>
  </AppShell>;
}
