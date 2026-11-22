'use client';
import { useCompanyRealtimeRefresh } from '../../../lib/use-company-realtime';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';
import { Pagination } from '../../../components/pagination';
import { contractClauses, contractDate, contractTime } from '../../../lib/contract-template';

type Role='admin'|'staff';
type Rental={id:string;rental_number:number;customer_id:string|null;start_date:string;end_date:string;start_time:string|null;end_time:string|null;status:string;delivery_method:string;delivery_address:string|null;total_amount:number|string;discount:number|string;delivery_fee:number|string};
type ContractSnapshot={template_version?:number;company?:{name?:string;legal_name?:string;document?:string;phone?:string;email?:string;address?:string;zip?:string};customer?:Customer;rental?:Rental;items?:Item[];terms?:string};
type Contract={id:string;contract_number:number;rental_id:string|null;status:string;created_at:string;contract_snapshot:ContractSnapshot;token_expires_at:string|null;signed_at:string|null;signer_name:string|null;signer_document?:string|null;signature_svg?:string|null};
type Customer={id:string;name:string;phone:string|null;email:string|null;address:string|null;cpf?:string|null;rg?:string|null;zip?:string|null;neighborhood?:string|null;city_state?:string|null};
type Item={product_id:string;quantity:number;unit_price:number|string;subtotal:number|string;name:string};
const money=(v:number|string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
async function makeHash(token:string){const bytes=new TextEncoder().encode(token);const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function makeToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');}
function contractStatus(c:Contract){const expiry=c.token_expires_at?new Date(c.token_expires_at).getTime():0;return ['sent','viewed'].includes(c.status)&&expiry>0&&expiry<Date.now()?'expired':c.status;}
function esc(v:unknown){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));}

export default function ContractsPage(){
 const router=useRouter();const [companyId,setCompanyId]=useState('');const [companyName,setCompanyName]=useState('');const [email,setEmail]=useState('');const [role,setRole]=useState<Role>();const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [rentals,setRentals]=useState<Rental[]>([]);const [customers,setCustomers]=useState<Record<string,Customer>>({});const [contracts,setContracts]=useState<Contract[]>([]);const [itemsByRental,setItemsByRental]=useState<Record<string,Item[]>>({});const [links,setLinks]=useState<Record<string,string>>({});const [selectedRental,setSelectedRental]=useState('');const [terms,setTerms]=useState('');const [search,setSearch]=useState('');const [statusFilter,setStatusFilter]=useState('all');const [previewHtml,setPreviewHtml]=useState('');const [editing,setEditing]=useState<Contract|null>(null);const [editName,setEditName]=useState('');const [editCpf,setEditCpf]=useState('');const [editPhone,setEditPhone]=useState('');const [editEmail,setEditEmail]=useState('');const [editDate,setEditDate]=useState('');const [editEndDate,setEditEndDate]=useState('');const [editItemsText,setEditItemsText]=useState('');const [editDeliveryFee,setEditDeliveryFee]=useState('0');const [editDiscount,setEditDiscount]=useState('0');const [editStartTime,setEditStartTime]=useState('');const [editEndTime,setEditEndTime]=useState('');const [editAddress,setEditAddress]=useState('');const [editTerms,setEditTerms]=useState('');const [companySettings,setCompanySettings]=useState<Record<string,string>>({});const [companyForm,setCompanyForm]=useState({name:'',legal_name:'',document:'',phone:'',email:'',address:'',zip:''});const [companyFormOpen,setCompanyFormOpen]=useState(false);const [deleteTarget,setDeleteTarget]=useState<Contract|null>(null);const [savingEdit,setSavingEdit]=useState(false);const [page,setPage]=useState(0);const pageSize=useResponsivePageSize();
 const load=useCallback(async()=>{
  await Promise.resolve();
  if(!supabase){setError('Banco não configurado.');setLoading(false);return;}
  const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/login/');return;}setEmail(user.email??'');
  const {data:m,error:e}=await supabase.from('company_members').select('company_id,role,companies(name,contract_settings)').eq('user_id',user.id).limit(1).maybeSingle();
  if(e||!m){setError('Não foi possível identificar a empresa.');setLoading(false);return;}
  const c=Array.isArray(m.companies)?m.companies[0]:m.companies;const settings=(c?.contract_settings??{}) as Record<string,string>;setCompanyId(m.company_id);setCompanyName(c?.name??'Empresa');setRole(m.role as Role);setCompanySettings(settings);setCompanyForm({name:c?.name??'',legal_name:settings.legal_name??'',document:settings.document??'',phone:settings.phone??'',email:settings.email??'',address:settings.address??'',zip:settings.zip??''});
  const [rr,cr,co]=await Promise.all([
   supabase.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,delivery_method,delivery_address,total_amount,discount,delivery_fee').eq('company_id',m.company_id).neq('status','cancelled').order('start_date',{ascending:false}).limit(300),
   supabase.from('customers').select('id,name,phone,email,address,cpf,rg,zip,neighborhood,city_state').eq('company_id',m.company_id),
   supabase.from('rental_contracts').select('id,contract_number,rental_id,status,created_at,contract_snapshot,token_expires_at,signed_at,signer_name,signer_document,signature_svg').eq('company_id',m.company_id).order('created_at',{ascending:false}).limit(300)
  ]);
  if(rr.error||cr.error||co.error){setError('Não foi possível carregar locações, clientes ou contratos.');setLoading(false);return;}
  const rlist=(rr.data??[]) as Rental[];const rids=rlist.map(x=>x.id);
  const [ir,pr]=rids.length?await Promise.all([
   supabase.from('rental_items').select('rental_id,product_id,quantity,unit_price,subtotal').eq('company_id',m.company_id).in('rental_id',rids),
   supabase.from('products').select('id,name').eq('company_id',m.company_id)
  ]):[{data:[],error:null},{data:[],error:null}];
  if(ir.error||pr.error){setError('Não foi possível carregar os itens das locações.');setLoading(false);return;}
  const pnames=Object.fromEntries((pr.data??[]).map(p=>[p.id,p.name]));
  const by:Record<string,Item[]>={};for(const i of ir.data??[]){(by[i.rental_id]??=[]).push({...i,name:pnames[i.product_id]??'Item'});}
  setRentals(rlist);setCustomers(Object.fromEntries((cr.data??[]).map(c=>[c.id,c])));setContracts((co.data??[]) as Contract[]);setItemsByRental(by);setLoading(false);
 },[router]);
 useCompanyRealtimeRefresh(companyId, ['rental_contracts', 'rentals', 'rental_items', 'customers', 'products'], () => { void load(); });
 const filteredContracts=contracts.filter(c=>{const name=String((c.contract_snapshot.customer as Customer|undefined)?.name??'').toLocaleLowerCase('pt-BR');const q=search.trim().toLocaleLowerCase('pt-BR');return (!q||name.includes(q)||String(c.contract_number).includes(q))&&(statusFilter==='all'||contractStatus(c)===statusFilter);});
 const paginatedContracts=filteredContracts.slice(page*pageSize,(page+1)*pageSize);
 // This effect starts an asynchronous data request; state updates occur after the request resolves.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load();},[load]);
 async function createDraft(){
  if(!supabase||!selectedRental)return;const rental=rentals.find(r=>r.id===selectedRental);if(!rental)return;
  const customer=rental.customer_id?customers[rental.customer_id]:null;if(!customer){setError('A locação precisa estar vinculada a um cliente.');return;}
  const items=itemsByRental[rental.id]??[];if(!items.length){setError('Inclua ao menos um item na locação antes de gerar o contrato.');return;}
  const snapshot={template_version:2,company:{name:companyName,...companySettings},customer,rental,items,generated_at:new Date().toISOString(),terms:terms.trim()};
  const {error:e}=await supabase.from('rental_contracts').insert({company_id:companyId,rental_id:rental.id,status:'draft',signature_method:'external',contract_snapshot:snapshot});
  if(e)setError(e.message);else{setNotice('Contrato criado. Gere o link para enviar ao cliente.');setSelectedRental('');await load();}
 }
 async function generateLink(c:Contract){
  if(!supabase||c.status==='signed'||c.status==='cancelled')return;
  const token=makeToken();const hash=await makeHash(token);const expiry=new Date(Date.now()+7*86400000).toISOString();
  const {error:e}=await supabase.from('rental_contracts').update({token_hash:hash,token_expires_at:expiry,status:'sent',sent_at:new Date().toISOString()}).eq('id',c.id).eq('company_id',companyId);
  if(e){setError('Não foi possível gerar o link de assinatura.');return;}
  const base=process.env.NEXT_PUBLIC_BASE_PATH??'';const url=window.location.origin+base+'/assinar/?token='+encodeURIComponent(token);
  setLinks(v=>({...v,[c.id]:url}));setNotice('Link de assinatura gerado. Ele ficará disponível nesta tela enquanto ela estiver aberta.');await load();
 }
 function printContract(c:Contract){
  const s=c.contract_snapshot;const customer=s.customer??({} as Customer);const rental=s.rental??({} as Rental);const items=s.items??[];const companyInfo=s.company??{};
  const rows=items.map(i=>'<tr><td>'+esc(i.name)+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(money(i.unit_price))+'</td><td>'+esc(money(i.subtotal))+'</td></tr>').join('');
  const address=[customer.address,customer.neighborhood,customer.city_state,customer.zip?'CEP '+customer.zip:''].filter(Boolean).join(' · ');
  const eventAddress=rental.delivery_method==='delivery'?(rental.delivery_address??'Endereço não informado'):'Retirada pelo LOCATÁRIO';
  const clauses=s.template_version===2?contractClauses.map(cl=>'<section class="clause"><h2>'+esc(cl.title)+'</h2><p>'+esc(cl.body)+'</p></section>').join(''):'<section class="clause"><h2>CONDIÇÕES</h2><p>'+esc(s.terms||'Condições não informadas.')+'</p></section>';
  const extra=s.template_version===2&&s.terms?.trim()?'<section class="clause"><h2>CONDIÇÕES ADICIONAIS ACORDADAS</h2><p>'+esc(s.terms).replace(/\n/g,'<br>')+'</p></section>':'';
  const css='*{box-sizing:border-box}body{font:13px/1.6 Arial,sans-serif;color:#263044;max-width:850px;margin:28px auto;padding:0 28px}.top{border-bottom:4px solid #7650c8;padding-bottom:18px;margin-bottom:22px}.brand{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#7650c8}.top h1{font-size:23px;line-height:1.25;margin:8px 0 4px}.sub,.muted{color:#687386;font-size:12px}.number{display:inline-block;margin-top:10px;padding:5px 10px;background:#f3effb;border-radius:6px;color:#5c3ca1;font-weight:700}h2{font-size:13px;color:#553b91;margin:0 0 7px;text-transform:uppercase}.panel{border:1px solid #e3e0eb;border-radius:8px;padding:13px 15px;margin:12px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{margin:3px 0}.label{font-size:10px;text-transform:uppercase;color:#788195;font-weight:700}.value{font-weight:600;overflow-wrap:anywhere}.clause{margin:15px 0;break-inside:avoid}.clause p{text-align:justify;margin:0}.items{width:100%;border-collapse:collapse;margin:10px 0 14px;font-size:12px}.items th{background:#f3f0f8;color:#49347a}.items td,.items th{border:1px solid #e2dfeb;padding:8px}.totals{margin-left:auto;width:340px;border:1px solid #e2dfeb;border-radius:8px;padding:12px}.totalrow{display:flex;justify-content:space-between;padding:3px 0}.grand{border-top:1px solid #ddd6eb;margin-top:7px;padding-top:9px;font-size:16px;font-weight:700;color:#51358f}.signatures,.witness{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px;break-inside:avoid}.sig{text-align:center;border-top:1px solid #495064;padding-top:8px}.witness div{border-top:1px solid #9aa1ad;padding-top:7px}.footer{border-top:1px solid #e5e7eb;margin-top:35px;padding-top:8px;text-align:center;color:#8a91a0;font-size:10px}@page{size:A4;margin:16mm 15mm}@media print{body{margin:0;padding:0;max-width:none}.panel,.clause,.items{break-inside:avoid}}@media(max-width:600px){body{padding:0 14px}.grid{grid-template-columns:1fr}}';
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato #'+esc(c.contract_number)+'</title><style>'+css+'</style></head><body>'+
  '<header class="top"><div class="brand">'+esc(companyName)+'</div><h1>CONTRATO DE LOCAÇÃO DE BRINQUEDOS E EQUIPAMENTOS</h1><div class="sub">Instrumento particular de locação · Leia todas as cláusulas antes de assinar</div><div class="number">CONTRATO Nº '+esc(c.contract_number)+'</div></header>'+
  '<div class="grid"><section class="panel"><h2>LOCADORA</h2><div class="value">'+esc(companyInfo.legal_name||companyName)+'</div><div>CNPJ / CPF: '+esc(companyInfo.document||'Não informado')+'</div><div>Telefone: '+esc(companyInfo.phone||'Não informado')+'</div><div>E-mail: '+esc(companyInfo.email||'Não informado')+'</div><div>Endereço: '+esc(companyInfo.address||'Não informado')+' · CEP '+esc(companyInfo.zip||'Não informado')+'</div></section><section class="panel"><h2>LOCATÁRIO (CLIENTE)</h2><div class="value">'+esc(customer.name)+'</div><div>CPF: '+esc(customer.cpf||'Não informado')+' · RG: '+esc(customer.rg||'Não informado')+'</div><div>Telefone: '+esc(customer.phone||'Não informado')+'</div><div>E-mail: '+esc(customer.email||'Não informado')+'</div><div>Endereço: '+esc(address||'Não informado')+'</div></section></div>'+
  '<section class="panel"><h2>DATA E LOCAL DO EVENTO</h2><div class="grid"><div><span class="label">Data</span><div class="value">'+esc(contractDate(rental.start_date))+(rental.end_date&&rental.end_date!==rental.start_date?' a '+esc(contractDate(rental.end_date)):'')+'</div></div><div><span class="label">Horário</span><div class="value">'+esc(contractTime(rental.start_time))+' às '+esc(contractTime(rental.end_time))+'</div></div><div><span class="label">Endereço do evento</span><div class="value">'+esc(eventAddress)+'</div></div><div><span class="label">Entrega</span><div class="value">'+esc(rental.delivery_method==='delivery'?'Entrega pela LOCADORA':'Retirada pelo LOCATÁRIO')+'</div></div></div></section>'+
  '<section class="clause"><h2>ITENS E EQUIPAMENTOS CONTRATADOS</h2><table class="items"><thead><tr><th>Descrição</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>'+rows+'</tbody></table><div class="totals"><div class="totalrow"><span>Taxa de entrega</span><b>'+esc(money(rental.delivery_fee))+'</b></div><div class="totalrow"><span>Desconto</span><b>'+esc(money(rental.discount))+'</b></div><div class="totalrow grand"><span>VALOR TOTAL</span><span>'+esc(money(rental.total_amount))+'</span></div></div></section>'+
  clauses+extra+'<p style="margin-top:24px;text-align:justify">As partes declaram que tiveram acesso ao conteúdo deste instrumento, compreenderam suas condições e manifestam concordância com os termos aqui registrados.</p><p style="margin-top:22px">Local e data: ________________________________________________</p>'+
  '<div class="signatures"><div class="sig"><b>LOCADORA</b><br>'+esc(companyName)+'<br>Assinatura</div><div class="sig"><b>LOCATÁRIO</b><br>'+esc(customer.name)+'<br>'+(c.status==='signed'&&c.signature_svg?'<svg viewBox="0 0 600 180" style="width:100%;height:90px"><path d="'+esc((c.signature_svg.match(/<path[^>]*d=["\']([^"\']*)["\']/i)?.[1]??'').replace(/[^0-9ML .-]/g,''))+'" fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>':'Assinatura')+'<br>'+(c.status==='signed'?'Assinado por '+esc(c.signer_name)+' em '+esc(c.signed_at?new Date(c.signed_at).toLocaleString('pt-BR'):''):'')+'</div></div>'+
  '<div class="witness"><div>TESTEMUNHA 1<br>Nome: __________________________<br>CPF: ___________________________</div><div>TESTEMUNHA 2<br>Nome: __________________________<br>CPF: ___________________________</div></div><footer class="footer">'+esc(companyName)+' · Contrato nº '+esc(c.contract_number)+'</footer><script>window.onload=()=>window.print()</script></body></html>';
  setPreviewHtml(html.replace(/<script>[\s\S]*?<\/script>/,''));
 }
 function beginEdit(c:Contract){const s=c.contract_snapshot;const customer=s.customer??({} as Customer);const rental=s.rental??({} as Rental);setEditing(c);setEditName(customer.name??'');setEditCpf(customer.cpf??'');setEditPhone(customer.phone??'');setEditEmail(customer.email??'');setEditDate(rental.start_date??'');setEditEndDate(rental.end_date??rental.start_date??'');setEditItemsText((s.items??[]).map(i=>[i.name,i.quantity,i.unit_price].join(' | ')).join('\n'));setEditDeliveryFee(String(rental.delivery_fee??0));setEditDiscount(String(rental.discount??0));setEditStartTime(rental.start_time??'');setEditEndTime(rental.end_time??'');setEditAddress(rental.delivery_address??'');setEditTerms(s.terms??'');}
 async function saveContractEdit(){if(!supabase||!editing)return;setSavingEdit(true);setError('');const old=editing.contract_snapshot;const customer={...(old.customer??{}),name:editName.trim(),cpf:editCpf.trim(),phone:editPhone.trim(),email:editEmail.trim()};const amount=(value:string)=>{const raw=value.trim();return Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw)||0;};const editedItems=editItemsText.split('\n').map((line,index)=>{const [itemName,qty,price]=line.split('|').map(part=>part.trim());if(!itemName)return null;const previous=old.items?.[index];const quantity=Math.max(1,Number(qty)||1);const unitPrice=amount(price??'0');return {...(previous??{}),product_id:previous?.product_id??'manual',name:itemName,quantity,unit_price:unitPrice,subtotal:quantity*unitPrice};}).filter(Boolean) as Item[];const fee=amount(editDeliveryFee);const discountValue=amount(editDiscount);const total=editedItems.reduce((sum,item)=>sum+Number(item.subtotal||0),0)+fee-discountValue;const rental={...(old.rental??{}),start_date:editDate,end_date:editEndDate||editDate,start_time:editStartTime||null,end_time:editEndTime||null,delivery_address:editAddress.trim()||null,delivery_fee:fee,discount:discountValue,total_amount:Math.max(0,total)};const snapshot={...old,company:{name:companyName,...companySettings},customer,rental,items:editedItems,terms:editTerms.trim()};const invalidate=['sent','viewed','expired'].includes(contractStatus(editing));const patch:Record<string,unknown>={contract_snapshot:snapshot};if(invalidate){patch.status='draft';patch.token_hash=null;patch.token_expires_at=null;}const {error:e}=await supabase.from('rental_contracts').update(patch).eq('id',editing.id).eq('company_id',companyId);setSavingEdit(false);if(e){setError('Não foi possível salvar as alterações: '+e.message);return;}setEditing(null);setNotice('Contrato atualizado. Se já havia um link enviado, gere um novo link para o cliente.');await load();}
 async function saveCompanyDetails(){if(!supabase)return;const settings={legal_name:companyForm.legal_name.trim(),document:companyForm.document.trim(),phone:companyForm.phone.trim(),email:companyForm.email.trim(),address:companyForm.address.trim(),zip:companyForm.zip.trim()};const {error:e}=await supabase.from('companies').update({name:companyForm.name.trim(),contract_settings:settings}).eq('id',companyId);if(e){setError('Não foi possível salvar os dados da empresa: '+e.message);return;}setCompanyName(companyForm.name.trim());setCompanySettings(settings);setCompanyFormOpen(false);setNotice('Dados da empresa atualizados.');}
 async function deleteContract(c:Contract){if(!supabase)return;const {error:e}=await supabase.from('rental_contracts').delete().eq('id',c.id).eq('company_id',companyId).neq('status','signed');if(e){setError('Não foi possível excluir o contrato: '+e.message);return;}setDeleteTarget(null);setNotice('Contrato excluído.');await load();}
 async function signOut(){if(supabase){await supabase.auth.signOut();router.push('/login/');}}
 if(loading)return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Carregando contratos...</main>;
 return <AppShell companyName={companyName} email={email} role={role} companyId={companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH??''} signingOut={false} onSignOut={signOut}>
  <section className="mx-auto w-full min-w-0 max-w-6xl space-y-6 pb-8">
   <header className="space-y-2">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8054d8]">Documentos da empresa</p>
    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
     <div className="min-w-0"><h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Contratos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Crie contratos vinculados às locações, acompanhe as assinaturas e mantenha os documentos organizados.</p></div>
     <div className="shrink-0 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-800">{contracts.length} {contracts.length===1?'contrato':'contratos'}</div>
    </div>
   </header>
   {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700">{error}</p>}
   {notice&&<p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm leading-5 text-green-800">{notice}</p>}

   <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Identificação</p><h2 className="mt-1 text-base font-bold text-slate-900">Dados da empresa</h2><p className="mt-1 text-xs leading-5 text-slate-500">Essas informações aparecem nos contratos emitidos.</p></div>
      {role==='admin'&&<button onClick={()=>setCompanyFormOpen(v=>!v)} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-purple-300 hover:bg-purple-50">{companyFormOpen?'Fechar edição':'Editar dados'}</button>}
     </div>
     {companyFormOpen&&<div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-xs font-semibold text-slate-700">Nome da empresa<input value={companyForm.name} onChange={e=>setCompanyForm(v=>({...v,name:e.target.value}))} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
      <label className="min-w-0 text-xs font-semibold text-slate-700">Razão social<input value={companyForm.legal_name} onChange={e=>setCompanyForm(v=>({...v,legal_name:e.target.value}))} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
      <label className="min-w-0 text-xs font-semibold text-slate-700">CNPJ / CPF<input value={companyForm.document} onChange={e=>setCompanyForm(v=>({...v,document:e.target.value}))} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
      <label className="min-w-0 text-xs font-semibold text-slate-700">Telefone<input value={companyForm.phone} onChange={e=>setCompanyForm(v=>({...v,phone:e.target.value}))} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
      <label className="min-w-0 text-xs font-semibold text-slate-700">E-mail<input value={companyForm.email} onChange={e=>setCompanyForm(v=>({...v,email:e.target.value}))} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
      <label className="min-w-0 text-xs font-semibold text-slate-700">CEP<input value={companyForm.zip} onChange={e=>setCompanyForm(v=>({...v,zip:e.target.value}))} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
      <label className="min-w-0 text-xs font-semibold text-slate-700 sm:col-span-2">Endereço<input value={companyForm.address} onChange={e=>setCompanyForm(v=>({...v,address:e.target.value}))} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
      <div className="flex justify-end sm:col-span-2"><button onClick={()=>void saveCompanyDetails()} className="w-full rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6840bd] sm:w-auto">Salvar dados da empresa</button></div>
     </div>}
     {!companyFormOpen&&<div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Nome</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{companyName||'Não informado'}</p></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Documento</p><p className="mt-1 break-words text-sm text-slate-700">{companySettings.document||'Não informado'}</p></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Telefone</p><p className="mt-1 break-words text-sm text-slate-700">{companySettings.phone||'Não informado'}</p></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">E-mail</p><p className="mt-1 break-words text-sm text-slate-700">{companySettings.email||'Não informado'}</p></div>
     </div>}
    </section>

    <section className="min-w-0 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-5">
     <div><p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Novo documento</p><h2 className="mt-1 text-base font-bold text-slate-900">Criar contrato a partir de uma locação</h2><p className="mt-1 text-xs leading-5 text-slate-500">Selecione uma locação para preencher os dados do contrato automaticamente.</p></div>
     <div className="mt-4 flex min-w-0 flex-col gap-3">
      <label className="block min-w-0 space-y-2">
       <span className="block text-xs font-semibold text-slate-700">Locação vinculada</span>
       <span className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-[#8054d8]">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h3M8 16.5h7"/></svg>
        </span>
        <select aria-label="Selecione uma locação" value={selectedRental} onChange={e=>setSelectedRental(e.target.value)} className="h-[54px] w-full min-w-0 appearance-none rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-11 text-sm font-medium text-slate-800 shadow-sm outline-none transition duration-200 hover:border-purple-200 hover:bg-white focus:border-[#8054d8] focus:bg-white focus:ring-4 focus:ring-purple-100">
         <option value="">Selecione uma locação</option>
         {rentals.map(r=><option key={r.id} value={r.id}>#{r.rental_number} · {customers[r.customer_id??'']?.name??'Cliente'} · {new Date(r.start_date+'T00:00:00').toLocaleDateString('pt-BR')} · {money(r.total_amount)}</option>)}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></span>
       </span>
       <span className="block text-[11px] leading-5 text-slate-500">Escolha a locação que será usada para preencher os dados e valores do contrato.</span>
      </label>
      <label className="block min-w-0 text-xs font-semibold text-slate-700">Condições adicionais <span className="font-normal text-slate-400">(opcional)</span><textarea value={terms} onChange={e=>setTerms(e.target.value)} rows={4} maxLength={5000} className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 p-3 text-sm font-normal" placeholder="Inclua alguma condição específica combinada com o cliente, se houver."/><span className="mt-1 block text-[11px] font-normal leading-5 text-slate-500">As cláusulas gerais já fazem parte do contrato. Use este campo apenas para condições específicas desta locação.</span></label>
      <div className="flex justify-end"><button disabled={!selectedRental} onClick={()=>void createDraft()} className="w-full rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6840bd] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">Criar contrato</button></div>
     </div>
    </section>
   </div>

   <section className="min-w-0 space-y-4">
    <div className="space-y-3">
     <div><h2 className="text-lg font-bold text-slate-900">Seus contratos</h2><p className="mt-1 text-xs text-slate-500">Pesquise pelo nome do cliente ou número do contrato e filtre por situação.</p></div>
     <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Buscar por cliente ou número do contrato" className="w-full min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-sm"/>
     <div className="flex flex-wrap gap-2">{[{id:'all',label:'Todos'},{id:'draft',label:'Rascunhos'},{id:'sent',label:'Enviados'},{id:'viewed',label:'Visualizados'},{id:'signed',label:'Assinados'},{id:'expired',label:'Expirados'},{id:'cancelled',label:'Cancelados'}].map(f=><button key={f.id} onClick={()=>{setStatusFilter(f.id);setPage(0);}} aria-pressed={statusFilter===f.id} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${statusFilter===f.id?'border-purple-300 bg-purple-50 text-purple-800':'border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50'}`}>{f.label}</button>)}</div>
    </div>
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
     {paginatedContracts.map(c=>{
      const customerName=String((c.contract_snapshot.customer as Customer|undefined)?.name??'Cliente');
      const status=contractStatus(c);
      const statusLabel=({draft:'Rascunho',sent:'Enviado',viewed:'Visualizado',signed:'Assinado',cancelled:'Cancelado',expired:'Link expirado'} as Record<string,string>)[status]??c.status;
      const statusStyle=({draft:'bg-slate-100 text-slate-700',sent:'bg-blue-50 text-blue-700',viewed:'bg-amber-50 text-amber-800',signed:'bg-green-50 text-green-700',cancelled:'bg-red-50 text-red-700',expired:'bg-orange-50 text-orange-700'} as Record<string,string>)[status]??'bg-slate-100 text-slate-700';
      return <article key={c.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-purple-200 hover:shadow-md sm:p-5">
       <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Contrato #{c.contract_number}</p><h3 className="mt-1 break-words text-base font-bold text-slate-900">{customerName}</h3><p className="mt-1 text-xs text-slate-500">Criado em {new Date(c.created_at).toLocaleDateString('pt-BR')}</p></div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle}`}>{statusLabel}</span>
       </div>
       <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Valor do contrato</p><p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">{money((c.contract_snapshot.rental as Rental|undefined)?.total_amount??0)}</p></div>{c.status==='signed'&&<p className="max-w-full text-right text-[11px] leading-5 text-green-700">Assinado por {c.signer_name??'cliente'}<br/>{c.signed_at?new Date(c.signed_at).toLocaleString('pt-BR'):'Data registrada'}</p>}</div>
       <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button onClick={()=>printContract(c)} className="min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-purple-300 hover:bg-purple-50">Visualizar contrato</button>
        {c.status!=='signed'&&<button onClick={()=>beginEdit(c)} className="min-h-10 rounded-xl border border-purple-200 px-3 py-2 text-xs font-semibold text-purple-800 transition hover:bg-purple-50">Editar</button>}
        {c.status!=='signed'&&<button onClick={()=>setDeleteTarget(c)} className="min-h-10 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50">Excluir</button>}
        {c.status!=='signed'&&c.status!=='cancelled'&&<button onClick={()=>void generateLink(c)} className="col-span-2 min-h-10 rounded-xl bg-[#8054d8] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#6840bd] sm:col-span-1">{c.status==='draft'?'Gerar link de assinatura':'Gerar novo link'}</button>}
        {links[c.id]&&<><button onClick={()=>void navigator.clipboard.writeText(links[c.id])} className="min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Copiar link</button><a target="_blank" rel="noreferrer" href={'https://wa.me/?text='+encodeURIComponent('Olá! Segue o contrato de locação para leitura e assinatura: '+links[c.id])} className="flex min-h-10 items-center justify-center rounded-xl bg-green-50 px-3 py-2 text-center text-xs font-semibold text-green-800 hover:bg-green-100">Enviar pelo WhatsApp</a></>}
       </div>
      </article>;
     })}
     {!contracts.length&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500 lg:col-span-2">Nenhum contrato criado.</div>}
     {contracts.length>0&&!contracts.some(c=>{const name=String((c.contract_snapshot.customer as Customer|undefined)?.name??'').toLocaleLowerCase('pt-BR');const q=search.trim().toLocaleLowerCase('pt-BR');return (!q||name.includes(q)||String(c.contract_number).includes(q))&&(statusFilter==='all'||contractStatus(c)===statusFilter);})&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500 lg:col-span-2">Nenhum contrato corresponde à busca ou ao filtro.</div>}
    </div>
   </section>
     <Pagination totalCount={filteredContracts.length} page={page} pageSize={pageSize} onPageChange={setPage}/>
   <p className="rounded-xl bg-slate-100/80 p-3 text-[11px] leading-5 text-slate-500">A assinatura eletrônica registra identidade declarada, desenho da assinatura, consentimento e data/hora. Ela não é uma assinatura ICP-Brasil ou certificado digital qualificado.</p>

   {previewHtml&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5"><section className="flex h-[96dvh] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[94dvh]">
    <header className="flex shrink-0 flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><h2 className="text-sm font-bold text-slate-900">Visualização do contrato</h2><div className="grid grid-cols-2 gap-2 sm:flex"><button onClick={()=>{const frame=document.getElementById('contract-preview-frame') as HTMLIFrameElement|null;frame?.contentWindow?.print();}} className="rounded-xl bg-[#8054d8] px-3 py-2.5 text-xs font-bold text-white">Imprimir / salvar PDF</button><button onClick={()=>setPreviewHtml('')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700">Fechar</button></div></header>
    <iframe id="contract-preview-frame" title="Prévia do contrato" srcDoc={previewHtml} className="min-h-0 w-full flex-1 bg-white"/>
   </section></div>}

   {editing&&<div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:items-center sm:p-5"><section className="flex max-h-[94dvh] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6"><div className="min-w-0"><h2 className="text-base font-bold text-slate-900">Editar contrato #{editing.contract_number}</h2><p className="mt-1 text-[11px] text-slate-500">Contratos assinados ficam bloqueados para preservar o registro de aceite.</p></div><button onClick={()=>setEditing(null)} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Fechar</button></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"><div className="grid min-w-0 gap-3 sm:grid-cols-2">
     <label className="min-w-0 text-xs font-semibold text-slate-700">Nome do cliente<input value={editName} onChange={e=>setEditName(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">CPF / documento<input value={editCpf} onChange={e=>setEditCpf(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">Telefone<input value={editPhone} onChange={e=>setEditPhone(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">E-mail<input value={editEmail} onChange={e=>setEditEmail(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">Data inicial<input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">Data final<input type="date" value={editEndDate} onChange={e=>setEditEndDate(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">Horário inicial<input type="time" value={editStartTime} onChange={e=>setEditStartTime(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">Horário final<input type="time" value={editEndTime} onChange={e=>setEditEndTime(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700 sm:col-span-2">Endereço do evento<input value={editAddress} onChange={e=>setEditAddress(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700 sm:col-span-2">Itens <span className="font-normal text-slate-400">(descrição | quantidade | valor unitário, um por linha)</span><textarea rows={4} value={editItemsText} onChange={e=>setEditItemsText(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/><span className="mt-1 block text-[11px] font-normal text-slate-500">O total será recalculado com os itens, entrega e desconto.</span></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">Taxa de entrega<input value={editDeliveryFee} onChange={e=>setEditDeliveryFee(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700">Desconto<input value={editDiscount} onChange={e=>setEditDiscount(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-700 sm:col-span-2">Condições adicionais<textarea rows={4} value={editTerms} onChange={e=>setEditTerms(e.target.value)} className="mt-1.5 w-full min-w-0 rounded-xl border p-3 text-sm font-normal"/></label>
    </div></div>
    <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6"><button onClick={()=>setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={savingEdit||!editName.trim()||!editDate} onClick={()=>void saveContractEdit()} className="rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{savingEdit?'Salvando...':'Salvar alterações'}</button></footer>
   </section></div>}

   {deleteTarget&&<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"><section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><h2 className="text-lg font-bold text-slate-900">Excluir contrato?</h2><p className="mt-2 text-sm leading-6 text-slate-600">O contrato #{deleteTarget.contract_number} será removido permanentemente. Contratos assinados não podem ser excluídos.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={()=>setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Cancelar</button><button onClick={()=>void deleteContract(deleteTarget)} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white">Confirmar exclusão</button></div></section></div>}
  </section>
 </AppShell>;
}
