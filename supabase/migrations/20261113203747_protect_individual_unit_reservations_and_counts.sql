-- Protect the physical-unit inventory count and preserve units already assigned to active rentals.
create or replace function public.enforce_product_catalog_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_registered_units integer;
begin
  if tg_op = 'UPDATE' and old.inventory_mode = 'individual' and new.inventory_mode <> 'individual'
    and exists (select 1 from public.product_units u where u.product_id = old.id) then
    raise exception 'Não é possível alterar o controle de estoque enquanto existirem unidades cadastradas.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.item_type is distinct from new.item_type then
    if exists (select 1 from public.product_units u where u.product_id = old.id)
      or exists (select 1 from public.rental_items r where r.product_id = old.id)
      or exists (select 1 from public.maintenance_records m where m.product_id = old.id)
      or exists (select 1 from public.stock_movements s where s.product_id = old.id) then
      raise exception 'Não é possível alterar o tipo de um item que já possui histórico ou unidades.' using errcode = '23514';
    end if;
  end if;
  if new.inventory_mode = 'individual' and new.item_type in ('toy', 'machine') then
    select count(*)::integer into v_registered_units from public.product_units u
    where u.product_id = new.id and u.company_id = new.company_id;
    if new.total_quantity < v_registered_units then
      raise exception 'A quantidade total não pode ser menor que o número de unidades físicas já cadastradas (%).', v_registered_units using errcode = '23514';
    end if;
  end if;
  if new.item_type = 'service' then
    if new.event_price is null or new.event_price < 0 then raise exception 'Informe um preço por evento válido para o serviço.' using errcode = '23514'; end if;
    if new.inventory_mode <> 'quantity' or new.total_quantity <> 0 or new.daily_price <> 0 then raise exception 'Serviços não podem possuir estoque físico nem preço diário.' using errcode = '23514'; end if;
  elsif new.item_type = 'toy' then
    if new.event_price is not null then raise exception 'Brinquedos utilizam preço diário, não preço por evento.' using errcode = '23514'; end if;
  elsif new.item_type = 'machine' then
    if new.event_price is not null and new.daily_price <> 0 then raise exception 'Máquinas devem utilizar preço por diária ou por evento, não ambos.' using errcode = '23514'; end if;
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_service_product_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item_type text; v_company_id uuid; v_inventory_mode text; v_total_quantity integer; v_registered_units integer;
begin
  select p.item_type, p.company_id, p.inventory_mode, p.total_quantity
    into v_item_type, v_company_id, v_inventory_mode, v_total_quantity
  from public.products p where p.id = new.product_id for update;
  if not found then raise exception 'Produto não encontrado.' using errcode = '23503'; end if;
  if v_item_type not in ('toy', 'machine') then raise exception 'Serviços não podem possuir unidades físicas.' using errcode = '23514'; end if;
  if v_inventory_mode <> 'individual' then raise exception 'Unidades físicas exigem controle individual de estoque.' using errcode = '23514'; end if;
  if new.company_id <> v_company_id then raise exception 'A unidade e o item devem pertencer à mesma empresa.' using errcode = '23514'; end if;
  if tg_op = 'INSERT' or old.product_id is distinct from new.product_id then
    select count(*)::integer into v_registered_units from public.product_units u
    where u.product_id = new.product_id and u.company_id = new.company_id
      and (tg_op = 'INSERT' or u.id <> old.id);
    if v_registered_units >= v_total_quantity then
      raise exception 'Todas as unidades físicas previstas já foram cadastradas (%).', v_total_quantity using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_reserved_product_unit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (new.status is distinct from old.status or new.product_id is distinct from old.product_id or new.company_id is distinct from old.company_id)
    and exists (
      select 1 from public.rental_item_units riu
      join public.rental_items ri on ri.id = riu.rental_item_id
      join public.rentals r on r.id = ri.rental_id and r.company_id = ri.company_id
      where riu.product_unit_id = old.id and riu.company_id = old.company_id
        and r.status in ('pending', 'confirmed', 'ongoing')
    ) then
    raise exception 'Não é possível alterar a situação ou o vínculo desta unidade enquanto ela estiver reservada em uma locação ativa.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_reserved_product_unit_changes on public.product_units;
create trigger prevent_reserved_product_unit_changes before update of status, product_id, company_id on public.product_units
for each row execute function public.prevent_reserved_product_unit_changes();
create index if not exists idx_product_units_company_product_status on public.product_units(company_id, product_id, status);
create index if not exists idx_rental_item_units_product_unit_id on public.rental_item_units(product_unit_id);
revoke all on function public.enforce_product_catalog_rules() from public, anon, authenticated;
revoke all on function public.prevent_service_product_units() from public, anon, authenticated;
revoke all on function public.prevent_reserved_product_unit_changes() from public, anon, authenticated;
