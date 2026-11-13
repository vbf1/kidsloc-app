-- Unified catalog: toys use daily pricing and physical inventory; services use event pricing and no inventory.
alter table public.products
  add column if not exists item_type text not null default 'toy',
  add column if not exists event_price numeric(12,2);

alter table public.products
  drop constraint if exists products_item_type_check,
  add constraint products_item_type_check
    check (item_type in ('toy', 'service')),
  drop constraint if exists products_catalog_pricing_inventory_check,
  add constraint products_catalog_pricing_inventory_check
    check (
      (item_type = 'toy' and event_price is null)
      or
      (item_type = 'service' and event_price is not null and event_price >= 0
        and inventory_mode = 'quantity' and total_quantity = 0 and daily_price = 0)
    );

create index if not exists idx_products_company_type_active_name
  on public.products (company_id, item_type, active, name);

create or replace function public.enforce_product_catalog_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.inventory_mode = 'individual' and new.inventory_mode <> 'individual'
    and exists (select 1 from public.product_units u where u.product_id = old.id) then
    raise exception 'Não é possível alterar o controle de estoque enquanto existirem unidades cadastradas.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.item_type is distinct from new.item_type then
    if exists (select 1 from public.product_units u where u.product_id = old.id)
      or exists (select 1 from public.rental_items r where r.product_id = old.id)
      or exists (select 1 from public.maintenance_records m where m.product_id = old.id)
      or exists (select 1 from public.stock_movements s where s.product_id = old.id) then
      raise exception 'Não é possível alterar o tipo de um item que já possui histórico ou unidades.'
        using errcode = '23514';
    end if;
  end if;

  if new.item_type = 'service' then
    if new.event_price is null or new.event_price < 0 then
      raise exception 'Informe um preço por evento válido para o serviço.'
        using errcode = '23514';
    end if;
    if new.inventory_mode <> 'quantity' or new.total_quantity <> 0 or new.daily_price <> 0 then
      raise exception 'Serviços não podem possuir estoque físico nem preço diário.'
        using errcode = '23514';
    end if;
  elsif new.item_type = 'toy' and new.event_price is not null then
    raise exception 'Brinquedos utilizam preço diário, não preço por evento.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_product_catalog_rules on public.products;
create trigger enforce_product_catalog_rules
before insert or update on public.products
for each row execute function public.enforce_product_catalog_rules();

create or replace function public.prevent_service_product_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_type text;
  v_company_id uuid;
  v_inventory_mode text;
begin
  select p.item_type, p.company_id, p.inventory_mode into v_item_type, v_company_id, v_inventory_mode
  from public.products p where p.id = new.product_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = '23503';
  end if;
  if v_item_type <> 'toy' then
    raise exception 'Serviços não podem possuir unidades físicas.' using errcode = '23514';
  end if;
  if v_inventory_mode <> 'individual' then
    raise exception 'Unidades físicas exigem controle individual de estoque.' using errcode = '23514';
  end if;
  if new.company_id <> v_company_id then
    raise exception 'A unidade e o brinquedo devem pertencer à mesma empresa.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_service_product_units on public.product_units;
create trigger prevent_service_product_units
before insert or update of product_id, company_id on public.product_units
for each row execute function public.prevent_service_product_units();

revoke all on function public.enforce_product_catalog_rules() from public, anon, authenticated;
revoke all on function public.prevent_service_product_units() from public, anon, authenticated;
