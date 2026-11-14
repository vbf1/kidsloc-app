alter table public.products
  drop constraint if exists products_item_type_check,
  drop constraint if exists products_catalog_pricing_inventory_check;

alter table public.products
  add constraint products_item_type_check
    check (item_type = any (array['toy'::text, 'machine'::text, 'service'::text])),
  add constraint products_catalog_pricing_inventory_check
    check (
      (item_type = 'toy' and event_price is null)
      or (
        item_type = 'service'
        and event_price is not null and event_price >= 0
        and inventory_mode = 'quantity' and total_quantity = 0 and daily_price = 0
      )
      or (
        item_type = 'machine'
        and (
          (event_price is null and daily_price >= 0)
          or (event_price is not null and event_price >= 0 and daily_price = 0)
        )
      )
    );

create or replace function public.enforce_product_catalog_rules()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
  elsif new.item_type = 'toy' then
    if new.event_price is not null then
      raise exception 'Brinquedos utilizam preço diário, não preço por evento.'
        using errcode = '23514';
    end if;
  elsif new.item_type = 'machine' then
    if new.event_price is not null and new.daily_price <> 0 then
      raise exception 'Máquinas devem utilizar preço por diária ou por evento, não ambos.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;
