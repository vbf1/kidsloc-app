-- Company-wide preferences and safe compatibility for rentals created before deposit tracking.
create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  default_deposit_percentage numeric(5,2) not null default 30
    check (default_deposit_percentage >= 0 and default_deposit_percentage <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;

drop policy if exists company_settings_select_members on public.company_settings;
create policy company_settings_select_members
on public.company_settings for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists company_settings_insert_admins on public.company_settings;
create policy company_settings_insert_admins
on public.company_settings for insert to authenticated
with check (public.has_company_role(company_id, array['owner','admin']));

drop policy if exists company_settings_update_admins on public.company_settings;
create policy company_settings_update_admins
on public.company_settings for update to authenticated
using (public.has_company_role(company_id, array['owner','admin']))
with check (public.has_company_role(company_id, array['owner','admin']));

create or replace function public.get_company_settings(p_company_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_percentage numeric(5,2);
begin
  if auth.uid() is null or not public.is_company_member(p_company_id) then
    raise exception 'Acesso negado às configurações desta empresa.';
  end if;
  select s.default_deposit_percentage into v_percentage
  from public.company_settings s where s.company_id = p_company_id;
  return jsonb_build_object(
    'default_deposit_percentage', coalesce(v_percentage, 30.00)
  );
end;
$function$;

create or replace function public.update_company_settings(
  p_company_id uuid,
  p_default_deposit_percentage numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_percentage numeric(5,2);
begin
  if auth.uid() is null or not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem alterar as configurações.';
  end if;
  if p_default_deposit_percentage is null
     or p_default_deposit_percentage < 0
     or p_default_deposit_percentage > 100 then
    raise exception 'O percentual do sinal deve estar entre 0 e 100.';
  end if;
  insert into public.company_settings(company_id, default_deposit_percentage, updated_at)
  values (p_company_id, round(p_default_deposit_percentage, 2), now())
  on conflict (company_id) do update
    set default_deposit_percentage = excluded.default_deposit_percentage,
        updated_at = now()
  returning default_deposit_percentage into v_percentage;
  return jsonb_build_object('default_deposit_percentage', v_percentage);
end;
$function$;

create or replace function public.get_rental_payment_summary(
  p_company_id uuid,
  p_rental_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_rental public.rentals%rowtype;
  v_transaction public.financial_transactions%rowtype;
  v_paid_total numeric(12,2) := 0;
  v_total_amount numeric(12,2);
  v_default_percentage numeric(5,2) := 30;
begin
  if auth.uid() is null or not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem consultar os pagamentos da locação.';
  end if;
  select r.* into v_rental from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;

  select coalesce(s.default_deposit_percentage, 30)
    into v_default_percentage
  from public.company_settings s where s.company_id = p_company_id;
  v_default_percentage := coalesce(v_default_percentage, 30);

  select f.* into v_transaction from public.financial_transactions f
  where f.rental_id = p_rental_id and f.company_id = p_company_id
    and f.transaction_type = 'income' and f.category = 'locacao'
  order by f.created_at limit 1;

  if found then
    v_total_amount := v_transaction.amount;
    select coalesce(sum(p.amount), 0) into v_paid_total
    from public.payments p
    where p.company_id = p_company_id
      and (p.transaction_id = v_transaction.id
        or (p.transaction_id is null and p.rental_id = p_rental_id));
    if v_paid_total = 0 and v_transaction.status = 'paid' then
      v_paid_total := v_transaction.amount;
    end if;
  else
    v_total_amount := v_rental.total_amount;
    select coalesce(sum(p.amount), 0) into v_paid_total
    from public.payments p
    where p.company_id = p_company_id and p.rental_id = p_rental_id;
  end if;

  return jsonb_build_object(
    'total_amount', v_total_amount,
    'deposit_amount', v_rental.deposit_amount,
    'paid_total', v_paid_total,
    'deposit_paid', least(v_rental.deposit_amount, v_paid_total),
    'deposit_remaining', greatest(0, v_rental.deposit_amount - v_paid_total),
    'balance_remaining', greatest(0, v_total_amount - v_paid_total),
    'legacy_deposit_missing', v_rental.deposit_amount = 0,
    'default_deposit_percentage', v_default_percentage,
    'has_financial_transaction', v_transaction.id is not null
  );
end;
$function$;

drop function if exists public.register_rental_payment_stage(uuid, uuid, text, text, date);
create or replace function public.register_rental_payment_stage(
  p_company_id uuid,
  p_rental_id uuid,
  p_stage text,
  p_payment_method text default null,
  p_paid_at date default current_date,
  p_apply_default_deposit boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_rental public.rentals%rowtype;
  v_transaction public.financial_transactions%rowtype;
  v_paid_total numeric(12,2) := 0;
  v_target numeric(12,2);
  v_amount numeric(12,2);
  v_payment_id uuid;
  v_notes text;
  v_default_percentage numeric(5,2) := 30;
begin
  if auth.uid() is null then raise exception 'É necessário estar autenticado.'; end if;
  if not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem registrar recebimentos.';
  end if;
  if p_stage is null or p_stage not in ('deposit','balance') then
    raise exception 'Etapa de pagamento inválida.';
  end if;

  select r.* into v_rental from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;
  if v_rental.status = 'cancelled' then
    raise exception 'Não é possível registrar pagamento de uma locação cancelada.';
  end if;
  if v_rental.total_amount <= 0 then
    raise exception 'O valor total da locação precisa ser maior que zero.';
  end if;

  if p_stage = 'deposit' and v_rental.deposit_amount = 0 then
    if not p_apply_default_deposit then
      raise exception 'Esta locação antiga ainda não tem sinal definido. Confirme a aplicação do percentual padrão nas configurações.';
    end if;
    select coalesce(s.default_deposit_percentage, 30)
      into v_default_percentage
    from public.company_settings s where s.company_id = p_company_id;
    v_default_percentage := coalesce(v_default_percentage, 30);
    update public.rentals
    set deposit_amount = round(v_rental.total_amount * v_default_percentage / 100, 2)
    where id = p_rental_id and company_id = p_company_id
    returning * into v_rental;
  end if;

  select f.* into v_transaction from public.financial_transactions f
  where f.rental_id = p_rental_id and f.company_id = p_company_id
    and f.transaction_type = 'income' and f.category = 'locacao'
  order by f.created_at limit 1 for update;

  if not found then
    insert into public.financial_transactions(
      company_id, rental_id, transaction_type, category, description,
      amount, due_date, status, created_by
    )
    values (
      p_company_id, p_rental_id, 'income', 'locacao',
      'Locação #' || v_rental.rental_number, v_rental.total_amount,
      v_rental.start_date, 'pending', auth.uid()
    )
    returning * into v_transaction;
  end if;

  -- Include any legacy payments still linked directly to the rental.

  if v_transaction.status = 'cancelled' then
    raise exception 'O lançamento financeiro desta locação está cancelado.';
  end if;

  select coalesce(sum(p.amount), 0) into v_paid_total
  from public.payments p
  where p.company_id = p_company_id
    and (p.transaction_id = v_transaction.id
      or (p.transaction_id is null and p.rental_id = p_rental_id));
  if v_paid_total = 0 and v_transaction.status = 'paid' then
    v_paid_total := v_transaction.amount;
  end if;

  if p_stage = 'deposit' then
    v_target := least(v_rental.deposit_amount, v_transaction.amount);
    v_amount := greatest(0, v_target - v_paid_total);
    v_notes := 'Sinal da locação';
    if v_target <= 0 then raise exception 'O percentual padrão está zerado. Não há sinal a registrar.'; end if;
    if v_amount <= 0 then raise exception 'O sinal desta locação já foi registrado.'; end if;
  else
    v_amount := greatest(0, v_transaction.amount - v_paid_total);
    v_notes := 'Quitação do saldo restante';
    if v_amount <= 0 then raise exception 'Esta locação já está totalmente quitada.'; end if;
  end if;

  v_payment_id := public.register_financial_payment(
    v_transaction.id, v_amount, p_payment_method, coalesce(p_paid_at, current_date), v_notes
  );
  return v_payment_id;
end;
$function$;

revoke all on function public.get_company_settings(uuid) from public, anon;
grant execute on function public.get_company_settings(uuid) to authenticated;
revoke all on function public.update_company_settings(uuid, numeric) from public, anon;
grant execute on function public.update_company_settings(uuid, numeric) to authenticated;
revoke all on function public.get_rental_payment_summary(uuid, uuid) from public, anon;
grant execute on function public.get_rental_payment_summary(uuid, uuid) to authenticated;
revoke all on function public.register_rental_payment_stage(uuid, uuid, text, text, date, boolean) from public, anon;
grant execute on function public.register_rental_payment_stage(uuid, uuid, text, text, date, boolean) to authenticated;


-- Apply the company's current default to every newly inserted rental, including
-- rentals created by converting an approved quote. Explicit client values can
-- still be adjusted immediately afterward through set_rental_deposit_amount.
create or replace function public.apply_default_rental_deposit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_percentage numeric(5,2) := 30;
begin
  if coalesce(new.deposit_amount, 0) = 0 and new.total_amount > 0 then
    select coalesce(s.default_deposit_percentage, 30)
      into v_percentage
    from public.company_settings s
    where s.company_id = new.company_id;
    v_percentage := coalesce(v_percentage, 30);
    new.deposit_amount := round(new.total_amount * v_percentage / 100, 2);
  end if;
  return new;
end;
$function$;

drop trigger if exists rentals_apply_default_deposit on public.rentals;
create trigger rentals_apply_default_deposit
before insert on public.rentals
for each row execute function public.apply_default_rental_deposit();

-- Idempotent compatibility pass: older rentals receive a finance income row
-- only when one does not already exist. Existing payment history is retained.
insert into public.financial_transactions(
  company_id, rental_id, transaction_type, category, description,
  amount, due_date, status, created_by
)
select r.company_id, r.id, 'income', 'locacao',
       'Locação #' || r.rental_number, r.total_amount, r.start_date,
       case when r.status = 'cancelled' then 'cancelled' else 'pending' end,
       r.created_by
from public.rentals r
where r.total_amount > 0
  and not exists (
    select 1 from public.financial_transactions f
    where f.company_id = r.company_id and f.rental_id = r.id
      and f.transaction_type = 'income' and f.category = 'locacao'
  );

with rental_transactions as (
  select distinct on (f.company_id, f.rental_id)
    f.company_id, f.rental_id, f.id
  from public.financial_transactions f
  where f.transaction_type = 'income' and f.category = 'locacao'
  order by f.company_id, f.rental_id, f.created_at, f.id
)
update public.payments p
set transaction_id = f.id
from rental_transactions f
where p.company_id = f.company_id
  and p.rental_id = f.rental_id
  and p.transaction_id is null;
