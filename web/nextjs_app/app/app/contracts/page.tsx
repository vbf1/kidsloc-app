'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';

type Role='owner'|'admin'|'manager'|'staff';
type Rental={id:string;rental_number:number;customer_id:string|null;start_date:string;end_date:string;start_time:string|null;end_time:string|null;status:string;delivery_method:string;delivery_address:string|null;total_amount:number|string;discount:number|string;delivery_fee:number|string};
type ContractSnapshot={company?:{name?:string};customer?:Customer;rental?:Rental;items?:Item[];terms?:string};
type Contract={id:string;contract_number:number;rental_id:string;status:string;created_at:string;contract_snapshot:ContractSnapshot;token_expires_at:string|null;signed_at:string|null;signer_name:string|null};
type Customer={id:string;name:string;phone:string|null;email:string|null;address:string|null;cpf?:string|null;rg?:string|null;zip?:string|null;neighborhood?:string|null;city_state?:string|null};
type Item={product_id:string;quantity:number;unit_price:number|string;subtotal:number|string;name:string};
const money=(v:number|string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
async function makeHash(token:string){const bytes=new TextEncoder().encode(token);const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function makeToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');}
function esc(v:unknown){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));}

export default function ContractsPage(){
 const router=useRouter();const [companyId,setCompanyId]=useState('');const [companyName,setCompanyName]=useState('');const [email,setEmail]=useState('');const [role,setRole]=useState<Role>();const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [rentals,setRentals]=useState<Rental[]>([]);const [customers,setCustomers]=useState<Record<string,Customer>>({});const [contracts,setContracts]=useState<Contract[]>([]);const [itemsByRental,setItemsByRental]=useState<Record<string,Item[]>>({});const [links,setLinks]=useState<Record<string,string>>({});const [selectedRental,setSelectedRental]=useState('');
 const load=useCallback(async()=>{
  await Promise.resolve();
  if(!supabase){setError('Banco não configurado.');setLoading(false);return;}
  const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/login/');return;}setEmail(user.email??'');
  const {data:m,error:e}=await supabase.from('company_members').select('company_id,role,companies(name)').eq('user_id',user.id).limit(1).maybeSingle();
  if(e||!m){setError('Não foi possível identificar a empresa.');setLoading(false);return;}
  const c=Array.isArray(m.companies)?m.companies[0]:m.companies;setCompanyId(m.company_id);setCompanyName(c?.name??'Empresa');setRole(m.role as Role);
  const [rr,cr,co]=await Promise.all([
   supabase.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,delivery_method,delivery_address,total_amount,discount,delivery_fee').eq('company_id',m.company_id).neq('status','cancelled').order('start_date',{ascending:false}).limit(300),
   supabase.from('customers').select('id,name,phone,email,address,cpf,rg,zip,neighborhood,city_state').eq('company_id',m.company_id),
   supabase.from('rental_contracts').select('id,contract_number,rental_id,status,created_at,contract_snapshot,token_expires_at,signed_at,signer_name').eq('company_id',m.company_id).order('created_at',{ascending:false}).limit(300)
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
 // This effect starts an asynchronous data request; state updates occur after the request resolves.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load();},[load]);
 async function createDraft(){
  if(!supabase||!selectedRental)return;const rental=rentals.find(r=>r.id===selectedRental);if(!rental)return;
  const customer=rental.customer_id?customers[rental.customer_id]:null;if(!customer){setError('A locação precisa estar vinculada a um cliente.');return;}
  const snapshot={company:{name:companyName},customer,rental,items:itemsByRental[rental.id]??[],generated_at:new Date().toISOString(),terms:'O LOCATÁRIO compromete-se a zelar pelos equipamentos, utilizá-los de forma adequada e devolvê-los nas condições recebidas. O LOCADOR compromete-se a disponibilizar os itens descritos na data e período acordados. Danos decorrentes de mau uso poderão ser cobrados do LOCATÁRIO. O cancelamento e demais condições devem ser ajustados entre as partes antes da assinatura.'};
  const {error:e}=await supabase.from('rental_contracts').insert({company_id:companyId,rental_id:rental.id,status:'draft',signature_method:'external',contract_snapshot:snapshot});
  if(e)setError(e.message);else{setNotice('Contrato criado. Gere o link para enviar ao cliente.');setSelectedRental('');await load();}
 }
 async function generateLink(c:Contract){
  if(!supabase||c.status==='signed')return;
  const token=makeToken();const hash=await makeHash(token);const expiry=new Date(Date.now()+7*86400000).toISOString();
  const {error:e}=await supabase.from('rental_contracts').update({token_hash:hash,token_expires_at:expiry,status:'sent',sent_at:new Date().toISOString()}).eq('id',c.id).eq('company_id',companyId);
  if(e){setError('Não foi possível gerar o link de assinatura.');return;}
  const base=process.env.NEXT_PUBLIC_BASE_PATH??'';const url=window.location.origin+base+'/assinar/?token='+encodeURIComponent(token);
  setLinks(v=>({...v,[c.id]:url}));setNotice('Link de assinatura gerado. Ele ficará disponível nesta tela enquanto ela estiver aberta.');await load();
 }
 function printContract(c:Contract){
  const s=c.contract_snapshot;const customer=s.customer??({} as Customer);const rental=s.rental??({} as Rental);const items=s.items??[];
  const rows=items.map((i)=>'<tr><td>'+esc(i.name)+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(money(i.unit_price))+'</td><td>'+esc(money(i.subtotal))+'</td></tr>').join('');
  const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Contrato #'+esc(c.contract_number)+'</title><style>body{font:14px Arial,sans-serif;color:#222;max-width:800px;margin:40px auto;line-height:1.6}h1{text-align:center}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:70px;gap:30px}.sign div{width:45%;border-top:1px solid #333;text-align:center;padding-top:8px}@media print{button{display:none}}</style><h1>CONTRATO DE LOCAÇÃO</h1><p><b>Contrato nº:</b> '+esc(c.contract_number)+'</p><h3>LOCADOR</h3><p>'+esc(companyName)+'</p><h3>LOCATÁRIO</h3><p><b>Nome:</b> '+esc(customer.name)+'<br><b>CPF:</b> '+esc(customer.cpf)+'<br><b>RG:</b> '+esc(customer.rg)+'<br><b>Telefone:</b> '+esc(customer.phone)+'<br><b>Endereço:</b> '+esc(customer.address)+' '+esc(customer.city_state)+'</p><h3>OBJETO E PERÍODO</h3><p>Locação dos equipamentos abaixo para o período de '+esc(rental.start_date)+' a '+esc(rental.end_date)+', das '+esc(rental.start_time)+' às '+esc(rental.end_time)+'. Entrega: '+esc(rental.delivery_method==='delivery'?'No endereço '+rental.delivery_address:'Retirada pelo cliente')+'.</p><table><thead><tr><th>Item</th><th>Qtd.</th><th>Unitário</th><th>Subtotal</th></tr></thead><tbody>'+rows+'</tbody></table><p><b>Taxa de entrega:</b> '+esc(money(rental.delivery_fee))+' · <b>Desconto:</b> '+esc(money(rental.discount))+' · <b>Total:</b> '+esc(money(rental.total_amount))+'</p><h3>CONDIÇÕES</h3><p>'+esc(s.terms)+'</p><p>As partes declaram que leram e concordam com as condições deste contrato.</p><div class="sign"><div>LOCADOR · '+esc(companyName)+'</div><div>LOCATÁRIO · '+esc(customer.name)+'</div></div><script>window.onload=()=>window.print()</script></html>';
  const w=window.open('','_blank');if(!w){setError('Permita a abertura de pop-ups para imprimir o contrato.');return;}w.document.write(html);w.document.close();
 }
 async function signOut(){if(supabase){await supabase.auth.signOut();router.push('/login/');}}
 if(loading)return <main className="grid min-h-screen place-items-center">Carregando contratos...</main>;
 return <AppShell companyName={companyName} email={email} role={role} companyId={companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH??''} signingOut={false} onSignOut={signOut}><section>
 <div className="mb-6"><p className="text-xs font-bold uppercase tracking-widest text-[#8054d8]">Documentos da empresa</p><h1 className="mt-2 text-3xl font-bold">Contratos</h1><p className="mt-2 text-sm text-gray-500">Gere contratos vinculados às locações, imprima ou envie um link seguro para assinatura eletrônica.</p></div>
 {error&&<p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="mb-3 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
 <div className="mb-6 rounded-2xl border border-purple-100 bg-white p-4"><h2 className="font-bold">Criar contrato a partir de uma locação</h2><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={selectedRental} onChange={e=>setSelectedRental(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-200 p-3 text-sm"><option value="">Selecione uma locação</option>{rentals.map(r=><option key={r.id} value={r.id}>#{r.rental_number} · {customers[r.customer_id??'']?.name??'Cliente'} · {new Date(r.start_date+'T00:00:00').toLocaleDateString('pt-BR')} · {money(r.total_amount)}</option>)}</select><button disabled={!selectedRental} onClick={()=>void createDraft()} className="rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Criar contrato</button></div></div>
 <div className="space-y-3">{contracts.map(c=><article key={c.id} className="rounded-2xl border border-purple-100 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-purple-700">CONTRATO #{c.contract_number}</p><h3 className="mt-1 font-bold">{String((c.contract_snapshot.customer as Customer|undefined)?.name??'Cliente')}</h3><p className="mt-1 text-xs text-gray-500">Criado em {new Date(c.created_at).toLocaleDateString('pt-BR')} · {({draft:'Rascunho',sent:'Enviado',viewed:'Visualizado',signed:'Assinado',cancelled:'Cancelado',expired:'Expirado'} as Record<string,string>)[c.status]??c.status}</p></div><span className="text-sm font-bold">{money((c.contract_snapshot.rental as Rental|undefined)?.total_amount??0)}</span></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>printContract(c)} className="rounded-lg border px-3 py-2 text-xs font-semibold">Imprimir / salvar PDF</button>{c.status!=='signed'&&c.status!=='cancelled'&&<button onClick={()=>void generateLink(c)} className="rounded-lg bg-[#8054d8] px-3 py-2 text-xs font-semibold text-white">{c.status==='draft'?'Gerar link de assinatura':'Gerar novo link'}</button>}{links[c.id]&&<><button onClick={()=>void navigator.clipboard.writeText(links[c.id])} className="rounded-lg border px-3 py-2 text-xs font-semibold">Copiar link</button><a target="_blank" rel="noreferrer" href={'https://wa.me/?text='+encodeURIComponent('Olá! Segue o contrato de locação para leitura e assinatura: '+links[c.id])} className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">Enviar pelo WhatsApp</a></>}</div>{c.status==='signed'&&<p className="mt-3 text-xs text-green-700">Assinado por {c.signer_name??'cliente'} em {c.signed_at?new Date(c.signed_at).toLocaleString('pt-BR'):'data registrada'}.</p>}</article>)}{!contracts.length&&<div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">Nenhum contrato criado.</div>}</div>
 <p className="mt-5 text-xs leading-5 text-gray-500">A assinatura eletrônica registra identidade declarada, desenho da assinatura, consentimento e data/hora. Ela não é uma assinatura ICP-Brasil ou certificado digital qualificado.</p>
 </section></AppShell>;
}
