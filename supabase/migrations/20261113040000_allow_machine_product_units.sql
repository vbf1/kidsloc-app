create or replace function public.prevent_service_product_units()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item_type text;
  v_company_id uuid;
  v_inventory_mode text;
begin
  select p.item_type, p.company_id, p.inventory_mode
    into v_item_type, v_company_id, v_inventory_mode
  from public.products p
  where p.id = new.product_id;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = '23503';
  end if;

  if v_item_type not in ('toy', 'machine') then
    raise exception 'Serviços não podem possuir unidades físicas.' using errcode = '23514';
  end if;

  if v_inventory_mode <> 'individual' then
    raise exception 'Unidades físicas exigem controle individual de estoque.' using errcode = '23514';
  end if;

  if new.company_id <> v_company_id then
    raise exception 'A unidade e o item devem pertencer à mesma empresa.' using errcode = '23514';
  end if;

  return new;
end;
$function$;