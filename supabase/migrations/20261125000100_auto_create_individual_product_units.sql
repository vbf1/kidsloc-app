-- Keep individual physical-unit records aligned with the product's declared stock.
-- Only missing records are generated; existing reserved, maintenance, and inactive units
-- count toward the declared quantity and are never bypassed by creating extra units.

create or replace function public.ensure_individual_product_units()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_existing_count integer;
  v_missing_count integer;
begin
  if new.inventory_mode <> 'individual'
     or new.item_type not in ('toy', 'machine')
     or new.total_quantity <= 0 then
    return new;
  end if;

  select count(*)::integer
    into v_existing_count
  from public.product_units pu
  where pu.company_id = new.company_id
    and pu.product_id = new.id;

  v_missing_count := greatest(new.total_quantity - v_existing_count, 0);

  if v_missing_count > 0 then
    insert into public.product_units (
      company_id,
      product_id,
      asset_code,
      description,
      status
    )
    select
      new.company_id,
      new.id,
      'AUTO-' || upper(replace(gen_random_uuid()::text, '-', '')),
      'Unidade criada automaticamente para completar o estoque individual.',
      'available'
    from generate_series(1, v_missing_count);
  end if;

  return new;
end;
$function$;

revoke all on function public.ensure_individual_product_units() from public, anon, authenticated;

drop trigger if exists ensure_individual_product_units on public.products;
create trigger ensure_individual_product_units
after insert or update of inventory_mode, total_quantity
on public.products
for each row
execute function public.ensure_individual_product_units();

-- Reconcile products already configured for individual inventory. Count every
-- existing unit, regardless of status, so this never creates stock beyond the
-- quantity registered in the catalog.
with product_unit_counts as (
  select
    p.id,
    p.company_id,
    p.total_quantity,
    count(pu.id)::integer as existing_count
  from public.products p
  left join public.product_units pu
    on pu.company_id = p.company_id
   and pu.product_id = p.id
  where p.inventory_mode = 'individual'
    and p.item_type in ('toy', 'machine')
    and p.total_quantity > 0
  group by p.id, p.company_id, p.total_quantity
)
insert into public.product_units (
  company_id,
  product_id,
  asset_code,
  description,
  status
)
select
  p.company_id,
  p.id,
  'AUTO-' || upper(replace(gen_random_uuid()::text, '-', '')),
  'Unidade criada automaticamente para completar o estoque individual.',
  'available'
from product_unit_counts p
cross join lateral generate_series(
  1,
  greatest(p.total_quantity - p.existing_count, 0)
) as missing_unit;
