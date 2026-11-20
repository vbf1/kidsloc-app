'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';

type Role = 'owner' | 'admin' | 'manager' | 'staff';
type Customer = { id: string; name: string; phone: string | null };
type Product = { id: string; name: string; daily_price: number | string; event_price: number | string | null; item_type: string };
type QuoteItem = { product_id: string; quantity: number; unit_price: number };
type Quote = { id: string; quote_number: number; customer_id: string | null; status: string; issue_date: string; valid_until: string | null; event_date: string | null; total_amount: number | string; notes: string | null };

const money = (value: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
const statusLabel: Record<string,string> = { draft:'Rascunho', sent:'Enviado', accepted:'Aprovado', rejected:'Recusado', expired:'Expirado', converted:'Convertido em locação', cancelled:'Cancelado' };

export default function QuotesPage() {
  const router = useRouter();
  const [companyId,setCompanyId] = useState('');
  const [companyName,setCompanyName] = useState('');
  const [email,setEmail] = useState('');
  const [role,setRole] = useState<Role>();
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [customers,setCustomers] = useState<Customer[]>([]);
  const [products,setProducts] = useState<Product[]>([]);
  const [quotes,setQuotes] = useState<Quote[]>([]);
  const [names,setNames] = useState<Record<string,string>>({});
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

  const load = useCallback(async () => {
    await Promise.resolve();
    if (!supabase) { setError('A conexão com o banco não está configurada.'); setLoading(false); return; }
    const { data:{user}, error:authError } = await supabase.auth.getUser();
    if (authError || !user) { router.replace('/login/'); return; }
    setEmail(user.email ?? '');
    const { data:m, error:mError } = await supabase.from('company_members').select('company_id,role,companies(name)').eq('user_id',user.id).limit(1).maybeSingle();
    if (mError || !m?.company_id) { setError('Não foi possível identificar a empresa da sua conta.'); setLoading(false); return; }
    const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
    setCompanyId(m.company_id); setCompanyName(c?.name ?? 'Minha empresa'); setRole(m.role as Role);
    const [cr,pr,qr] = await Promise.all([
      supabase.from('customers').select('id,name,phone').eq('company_id',m.company_id).order('name'),
      supabase.from('products').select('id,name,daily_price,event_price,item_type').eq('company_id',m.company_id).eq('active',true).order('name'),
      supabase.from('rental_quotes').select('id,quote_number,customer_id,status,issue_date,valid_until,event_date,total_amount,notes').eq('company_id',m.company_id).order('created_at',{ascending:false}).limit(200)
    ]);
    if (cr.error || pr.error || qr.error) setError('Não foi possível carregar os dados de orçamento.');
    else {
      setCustomers(cr.data ?? []); setProducts(pr.data ?? []); setQuotes((qr.data ?? []) as Quote[]);
      setNames(Object.fromEntries((cr.data ?? []).map(x=>[x.id,x.name])));
    }
    setLoading(false);
  }, [router]);
  // This effect starts an asynchronous data request; state updates occur after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ void load(); },[load]);

  const subtotal = useMemo(()=>items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0),[items]);
  const total = Math.max(0,subtotal+(Number(deliveryFee)||0)-(Number(discount)||0));
  function addItem() {
    const product=products.find(p=>p.id===productId);
    const qty=Number(quantity), price=Number(unitPrice);
    if (!product || !Number.isInteger(qty) || qty<1 || !Number.isFinite(price) || price<0) { setError('Confira o item, a quantidade e o preço.'); return; }
    setItems(current=>[...current,{product_id:product.id,quantity:qty,unit_price:price}]);
    setProductId(''); setQuantity('1'); setUnitPrice(''); setError('');
  }
  async function saveQuote(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !companyId || busy) return;
    if (!customerId || items.length===0) { setError('Selecione o cliente e adicione pelo menos um item.'); return; }
    if (deliveryMethod==='delivery' && !address.trim()) { setError('Informe o endereço de entrega.'); return; }
    setBusy(true); setError('');
    const {data,error:saveError}=await supabase.rpc('create_rental_quote_with_items',{
      p_company_id:companyId,p_customer_id:customerId,p_valid_until:validUntil||null,
      p_event_date:eventDate||null,p_start_time:startTime||null,p_end_time:endTime||null,
      p_delivery_method:deliveryMethod,p_delivery_address:address,
      p_delivery_fee:Number(deliveryFee)||0,p_discount:Number(discount)||0,p_notes:notes,
      p_items:items
    });
    if (saveError) setError(saveError.message || 'Não foi possível salvar o orçamento.');
    else { setNotice('Orçamento criado com sucesso.'); setShowForm(false); setCustomerId('');setItems([]);setAddress('');setNotes('');await load(); }
    setBusy(false);
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

  if(loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p>Carregando orçamentos...</p></main>;
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
          <label className="text-sm font-semibold text-gray-700">Data do evento<input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Válido até<input type="date" min={today()} value={validUntil} onChange={e=>setValidUntil(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Horário<input type="text" value={startTime} onChange={e=>setStartTime(e.target.value)} placeholder="09:00" className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Término<input type="text" value={endTime} onChange={e=>setEndTime(e.target.value)} placeholder="18:00" className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
          <label className="text-sm font-semibold text-gray-700">Entrega ou retirada<select value={deliveryMethod} onChange={e=>setDeliveryMethod(e.target.value as 'delivery'|'customer_pickup')} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"><option value="delivery">Entrega</option><option value="customer_pickup">Retirada pelo cliente</option></select></label>
          {deliveryMethod==='delivery' && <label className="text-sm font-semibold text-gray-700 sm:col-span-2">Endereço de entrega<input required value={address} onChange={e=>setAddress(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>}
        </div>
        <div className="rounded-xl border border-gray-100 p-4"><h3 className="font-bold">Itens do orçamento</h3><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_100px_140px_auto]">
          <select value={productId} onChange={e=>{setProductId(e.target.value);const p=products.find(x=>x.id===e.target.value);setUnitPrice(String(p?(p.item_type==='toy'?p.daily_price:p.event_price??0):''));}} className="rounded-xl border border-gray-200 p-3 text-sm"><option value="">Selecione um brinquedo ou serviço</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input aria-label="Quantidade" type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} className="rounded-xl border border-gray-200 p-3 text-sm"/>
          <input aria-label="Preço unitário" type="number" min="0" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} placeholder="Valor unitário" className="rounded-xl border border-gray-200 p-3 text-sm"/>
          <button type="button" onClick={addItem} className="rounded-xl border border-purple-200 px-4 py-3 text-sm font-semibold text-[#6840bd]">Adicionar</button></div>
          <div className="mt-3 divide-y divide-gray-100">{items.map((item,index)=>{const p=products.find(x=>x.id===item.product_id);return <div key={index} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{p?.name} × {item.quantity}</span><span className="font-semibold">{money(item.quantity*item.unit_price)} <button type="button" onClick={()=>setItems(v=>v.filter((_,i)=>i!==index))} className="ml-2 text-red-600">Remover</button></span></div>;})}{!items.length&&<p className="py-3 text-sm text-gray-400">Nenhum item adicionado.</p>}</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Taxa de entrega<input type="number" min="0" step="0.01" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label><label className="text-sm font-semibold">Desconto<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label><div className="rounded-xl bg-purple-50 p-3"><p className="text-xs text-purple-700">Total do orçamento</p><p className="mt-1 text-2xl font-bold text-gray-900">{money(total)}</p></div></div>
        <label className="block text-sm font-semibold">Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-normal"/></label>
        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={()=>setShowForm(false)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold">Cancelar</button><button disabled={busy} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Salvando...':'Salvar orçamento'}</button></div>
      </form>}
      <div className="space-y-3">{quotes.map(q=><article key={q.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-purple-700">ORÇAMENTO #{q.quote_number}</p><h2 className="mt-1 text-lg font-bold">{names[q.customer_id??'']??'Cliente'}</h2><p className="mt-1 text-xs text-gray-500">Criado em {new Date(q.issue_date+'T00:00:00').toLocaleDateString('pt-BR')} {q.event_date?'· Evento '+new Date(q.event_date+'T00:00:00').toLocaleDateString('pt-BR'):''}</p></div><div className="text-right"><p className="text-xl font-bold">{money(q.total_amount)}</p><span className="text-xs font-semibold text-gray-500">{statusLabel[q.status]??q.status}</span></div></div>
        <div className="mt-3 flex flex-wrap gap-2">{q.status==='draft'&&<button onClick={()=>void updateStatus(q.id,'sent')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">Marcar como enviado</button>}{q.status==='sent'&&<><button onClick={()=>void updateStatus(q.id,'accepted')} className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">Aprovar</button><button onClick={()=>void updateStatus(q.id,'rejected')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">Recusar</button></>}{q.status==='accepted'&&<button onClick={()=>void convertQuote(q.id)} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white">Converter em locação</button>}</div>
      </article>)}{!quotes.length&&<div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">Nenhum orçamento cadastrado ainda.</div>}</div>
    </section>
  </AppShell>;
}
