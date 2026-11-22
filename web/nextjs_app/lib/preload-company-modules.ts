'use client';

/* Supabase query results are dynamically typed across generated schema revisions. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from './supabase';
import { setModuleData } from './module-data-cache';

type Role = 'admin' | 'staff';

async function fetchAll<T>(query: any): Promise<T[]> {
  const rows: T[] = [];
  const size = 1000;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query.range(offset, offset + size - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < size) return rows;
  }
}

/**
 * Each module warms independently. A slow or failed query in one module must
 * never hold up the cache for another module. The signed-in client keeps RLS
 * enforcement intact; cache keys remain isolated by user + company.
 */
async function preloadCoreData(client: typeof supabase, companyId: string, scope: string, role: Role): Promise<void> {
const core = await Promise.all([
    client.from('customers')
      .select('id,company_id,name,phone,email,address,notes,created_at,updated_at,cpf,rg,zip,neighborhood,city_state', { count: 'exact' })
      .eq('company_id', companyId).order('name', { ascending: true }).limit(1000),
    client.from('products')
      .select('id,company_id,name,description,item_type,inventory_mode,total_quantity,daily_price,event_price,active,notes,image_path,created_at,updated_at', { count: 'exact' })
      .eq('company_id', companyId).order('name', { ascending: true }).limit(1000),
  ]);
  if (!core[0].error) {
    setModuleData('customers', 'records', scope, core[0].data ?? []);
    setModuleData('customers', 'totalCount', scope, core[0].count ?? (core[0].data ?? []).length);
  }
  if (!core[1].error) {
    setModuleData('products', 'records', scope, core[1].data ?? []);
    setModuleData('products', 'totalCount', scope, core[1].count ?? (core[1].data ?? []).length);
  }
}

async function preloadRentals(client: typeof supabase, companyId: string, scope: string, role: Role): Promise<void> {
const rentalResult = await client.from('rentals')
    .select('id,company_id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,delivery_method,delivery_address,delivery_fee,discount,total_amount,deposit_amount,notes,created_by,created_at,updated_at')
    .eq('company_id', companyId).order('start_date', { ascending: false }).limit(1000);
  const [rentalCustomers, rentalProducts, members] = await Promise.all([
    client.from('customers').select('id,name,phone').eq('company_id', companyId).order('name').limit(1000),
    client.from('products').select('id,name,item_type,inventory_mode,total_quantity,daily_price,event_price').eq('company_id', companyId).eq('active', true).order('name').limit(1000),
    client.from('company_members').select('user_id,role').eq('company_id', companyId),
  ]);
  if (!rentalResult.error && !rentalCustomers.error && !rentalProducts.error && !members.error) {
    const rentalRows = rentalResult.data ?? [];
    const ids = rentalRows.map((r: any) => r.id);
    const [items, responsibles, profiles] = ids.length ? await Promise.all([
      client.from('rental_items').select('id,rental_id,product_id,quantity,unit_price,subtotal').eq('company_id', companyId).in('rental_id', ids),
      client.from('rental_responsibles').select('rental_id,user_id,employee_name_snapshot').eq('company_id', companyId).in('rental_id', ids),
      client.from('profiles').select('id,full_name').in('id', (members.data ?? []).map((m: any) => m.user_id)),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (!items.error && !responsibles.error && !profiles.error) {
      const customerMap = new Map((rentalCustomers.data ?? []).map((x: any) => [x.id, x]));
      const productMap = new Map((rentalProducts.data ?? []).map((x: any) => [x.id, x]));
      const profileMap = new Map((profiles.data ?? []).map((x: any) => [x.id, x.full_name]));
      const itemsByRental = new Map<string, any[]>();
      for (const item of items.data ?? []) {
        const product = productMap.get(item.product_id);
        const grouped = itemsByRental.get(item.rental_id) ?? [];
        grouped.push({ ...item, product_name: product?.name ?? 'Item do catálogo', item_type: product?.item_type ?? 'toy' });
        itemsByRental.set(item.rental_id, grouped);
      }
      const responsibleByRental = new Map<string, string[]>();
      for (const responsible of responsibles.data ?? []) {
        const grouped = responsibleByRental.get(responsible.rental_id) ?? [];
        grouped.push(responsible.employee_name_snapshot || (responsible.user_id ? profileMap.get(responsible.user_id) : undefined) || 'Funcionário');
        responsibleByRental.set(responsible.rental_id, grouped);
      }
      setModuleData('rentals', 'records', scope, rentalRows.map((r: any) => ({
        ...r, rental_number: Number(r.rental_number),
        customer_name: r.customer_id ? (customerMap.get(r.customer_id)?.name ?? 'Cliente não disponível') : 'Cliente não disponível',
        items: itemsByRental.get(r.id) ?? [],
        responsible_names: responsibleByRental.get(r.id) ?? [],
        responsible_user_ids: (responsibles.data ?? []).filter((x: any) => x.rental_id === r.id && x.user_id).map((x: any) => x.user_id),
      })));
      setModuleData('rentals', 'customers', scope, rentalCustomers.data ?? []);
      setModuleData('rentals', 'products', scope, rentalProducts.data ?? []);
      setModuleData('rentals', 'members', scope, members.data ?? []);
    }
  }
}

async function preloadCalendar(client: typeof supabase, companyId: string, scope: string, role: Role): Promise<void> {
const [calendarRentals, calendarCustomers, calendarProducts] = await Promise.all([
    client.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,total_amount').eq('company_id', companyId).neq('status', 'cancelled').order('start_date').limit(1000),
    client.from('customers').select('id,name').eq('company_id', companyId),
    client.from('products').select('id,name,total_quantity,inventory_mode').eq('company_id', companyId).eq('active', true).in('item_type', ['toy', 'machine']).order('name'),
  ]);
  if (!calendarRentals.error && !calendarCustomers.error && !calendarProducts.error) {
    const ids = (calendarRentals.data ?? []).map((r: any) => r.id);
    const individualIds = (calendarProducts.data ?? []).filter((p: any) => p.inventory_mode === 'individual').map((p: any) => p.id);
    const [items, units] = await Promise.all([
      ids.length ? client.from('rental_items').select('rental_id,product_id,quantity').eq('company_id', companyId).in('rental_id', ids) : Promise.resolve({ data: [], error: null }),
      individualIds.length ? client.from('product_units').select('product_id,status').eq('company_id', companyId).in('product_id', individualIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (!items.error && !units.error) {
      const counts: Record<string, number> = {};
      for (const unit of units.data ?? []) if (unit.status === 'available') counts[unit.product_id] = (counts[unit.product_id] ?? 0) + 1;
      setModuleData('calendar', 'rentals', scope, calendarRentals.data ?? []);
      setModuleData('calendar', 'customers', scope, Object.fromEntries((calendarCustomers.data ?? []).map((x: any) => [x.id, x.name])));
      setModuleData('calendar', 'products', scope, calendarProducts.data ?? []);
      setModuleData('calendar', 'rentalItems', scope, items.data ?? []);
      setModuleData('calendar', 'availableUnits', scope, counts);
    }
  }
}

async function preloadQuotes(client: typeof supabase, companyId: string, scope: string, role: Role): Promise<void> {
const [quoteCustomers, quoteProducts, quoteRows] = await Promise.all([
    client.from('customers').select('id,name,phone').eq('company_id', companyId).order('name'),
    client.from('products').select('id,name,daily_price,event_price,item_type').eq('company_id', companyId).eq('active', true).order('name'),
    client.from('rental_quotes').select('id,quote_number,customer_id,status,issue_date,valid_until,event_date,start_time,end_time,delivery_method,delivery_address,delivery_fee,discount,subtotal,total_amount,notes').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
  ]);
  if (!quoteCustomers.error && !quoteProducts.error && !quoteRows.error) {
    const ids = (quoteRows.data ?? []).map((q: any) => q.id);
    const lineResult = ids.length ? await client.from('rental_quote_items').select('quote_id,description,quantity,unit_price,subtotal').eq('company_id', companyId).in('quote_id', ids) : { data: [], error: null };
    const grouped: Record<string, any[]> = {};
    for (const line of lineResult.data ?? []) (grouped[line.quote_id] ??= []).push(line);
    setModuleData('quotes', 'customers', scope, quoteCustomers.data ?? []);
    setModuleData('quotes', 'products', scope, quoteProducts.data ?? []);
    setModuleData('quotes', 'quotes', scope, quoteRows.data ?? []);
    setModuleData('quotes', 'quoteLines', scope, grouped);
    setModuleData('quotes', 'names', scope, Object.fromEntries((quoteCustomers.data ?? []).map((x: any) => [x.id, x.name])));
  }
}

async function preloadFinance(client: typeof supabase, companyId: string, scope: string, role: Role): Promise<void> {
if (role === 'admin') {
    const [tx, payments] = await Promise.all([
      client.from('financial_transactions').select('id,transaction_type,category,description,amount,due_date,paid_at,status,rental_id').eq('company_id', companyId).order('due_date', { ascending: false }).limit(500),
      client.from('payments').select('id,transaction_id,rental_id,amount,paid_at,payment_method,notes').eq('company_id', companyId).order('paid_at', { ascending: false }).limit(500),
    ]);
    if (!tx.error && !payments.error) {
      const txRows = tx.data ?? [];
      const paymentRows = payments.data ?? [];
      const rentalIds = [...new Set([...txRows.map((x: any) => x.rental_id), ...paymentRows.map((x: any) => x.rental_id)].filter(Boolean))];
      let rentalInfo: Record<string, { rentalNumber: number; customerName: string }> = {};
      if (rentalIds.length) {
        const rentals = await client.from('rentals').select('id,rental_number,customer_id').eq('company_id', companyId).in('id', rentalIds);
        const customerIds = [...new Set((rentals.data ?? []).map((x: any) => x.customer_id).filter(Boolean))];
        const linkedCustomers = customerIds.length ? await client.from('customers').select('id,name').eq('company_id', companyId).in('id', customerIds) : { data: [] };
        const names = Object.fromEntries((linkedCustomers.data ?? []).map((x: any) => [x.id, x.name]));
        rentalInfo = Object.fromEntries((rentals.data ?? []).map((x: any) => [x.id, { rentalNumber: x.rental_number, customerName: names[x.customer_id] ?? 'Cliente não identificado' }]));
      }
      setModuleData('finance', 'transactions', scope, txRows);
      setModuleData('finance', 'payments', scope, paymentRows);
      setModuleData('finance', 'rentalInfo', scope, rentalInfo);
    }
  }
}

async function preloadContracts(client: typeof supabase, companyId: string, scope: string, role: Role): Promise<void> {
const [contractRentals, contractCustomers, contracts] = await Promise.all([
    client.from('rentals').select('id,rental_number,customer_id,start_date,end_date,start_time,end_time,status,delivery_method,delivery_address,total_amount,discount,delivery_fee').eq('company_id', companyId).neq('status', 'cancelled').order('start_date', { ascending: false }).limit(300),
    client.from('customers').select('id,name,phone,email,address,cpf,rg,zip,neighborhood,city_state').eq('company_id', companyId),
    client.from('rental_contracts').select('id,contract_number,rental_id,status,created_at,contract_snapshot,token_expires_at,signed_at,signer_name,signer_document,signature_svg').eq('company_id', companyId).order('created_at', { ascending: false }).limit(300),
  ]);
  if (!contractRentals.error && !contractCustomers.error && !contracts.error) {
    const ids = (contractRentals.data ?? []).map((r: any) => r.id);
    const [items, products] = ids.length ? await Promise.all([
      client.from('rental_items').select('rental_id,product_id,quantity,unit_price,subtotal').eq('company_id', companyId).in('rental_id', ids),
      client.from('products').select('id,name').eq('company_id', companyId),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (!items.error && !products.error) {
      const productNames = new Map((products.data ?? []).map((x: any) => [x.id, x.name]));
      const grouped: Record<string, any[]> = {};
      for (const item of items.data ?? []) (grouped[item.rental_id] ??= []).push({ ...item, name: productNames.get(item.product_id) ?? 'Item removido' });
      setModuleData('contracts', 'rentals', scope, contractRentals.data ?? []);
      setModuleData('contracts', 'customers', scope, Object.fromEntries((contractCustomers.data ?? []).map((x: any) => [x.id, x])));
      setModuleData('contracts', 'contracts', scope, contracts.data ?? []);
      setModuleData('contracts', 'itemsByRental', scope, grouped);
    }
  }
}

async function preloadReports(client: typeof supabase, companyId: string, scope: string, role: Role): Promise<void> {
if (role === 'admin') {
    const reportResults = await Promise.all([
      fetchAll<any>(client.from('financial_transactions').select('id,transaction_type,amount,status,due_date,paid_at,category').eq('company_id', companyId).order('id', { ascending: true }).neq('status', 'cancelled')),
      fetchAll<any>(client.from('payments').select('transaction_id,amount,paid_at').eq('company_id', companyId).order('id', { ascending: true })),
      fetchAll<any>(client.from('rentals').select('id,rental_number,start_date,end_date,status,total_amount').eq('company_id', companyId).order('id', { ascending: true }).neq('status', 'cancelled')),
      fetchAll<any>(client.from('products').select('id,name').eq('company_id', companyId).order('id', { ascending: true })),
      fetchAll<any>(client.from('rental_items').select('rental_id,product_id,quantity,subtotal').eq('company_id', companyId).order('id', { ascending: true })),
    ]);
    setModuleData('reports', 'transactions', scope, reportResults[0]);
    setModuleData('reports', 'payments', scope, reportResults[1]);
    setModuleData('reports', 'rentals', scope, reportResults[2]);
    setModuleData('reports', 'products', scope, reportResults[3]);
    setModuleData('reports', 'items', scope, reportResults[4]);
  }
}

export async function preloadCompanyModules(userId: string, companyId: string, role: Role): Promise<void> {
  if (!supabase || !userId || !companyId) return;
  const client = supabase;
  const scope = `${userId}:${companyId}`;

  const tasks = [
    preloadCoreData(client, companyId, scope, role),
    preloadRentals(client, companyId, scope, role),
    preloadCalendar(client, companyId, scope, role),
    preloadQuotes(client, companyId, scope, role),
    ...(role === 'admin' ? [
      preloadFinance(client, companyId, scope, role),
      preloadReports(client, companyId, scope, role),
    ] : []),
    preloadContracts(client, companyId, scope, role),
  ];

  // allSettled lets successful modules become usable even when another module
  // is unavailable or temporarily fails; destination pages retain their own
  // authenticated fallback requests.
  await Promise.allSettled(tasks);
}
