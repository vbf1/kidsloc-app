-- Simplify inventory: no physical-unit registration is required.
-- Toys and machines use the catalog's total quantity; services never consume stock.
drop trigger if exists enforce_product_catalog_rules on public.products;
update public.products
set inventory_mode = 'quantity',
    total_quantity = case when item_type = 'service' then 0 else greatest(total_quantity, 1) end,
    daily_price = case when item_type = 'service' then 0 else daily_price end
where item_type in ('toy', 'machine', 'service');

create or replace function public.enforce_product_catalog_rules()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.item_type is distinct from new.item_type then
    if exists (select 1 from public.product_units u where u.product_id = old.id)
      or exists (select 1 from public.rental_items r where r.product_id = old.id)
      or exists (select 1 from public.maintenance_records m where m.product_id = old.id)
      or exists (select 1 from public.stock_movements s where s.product_id = old.id) then
      raise exception 'Não é possível alterar o tipo de um item que já possui histórico ou unidades.' using errcode = '23514';
    end if;
  end if;
  if new.item_type = 'service' then
    if new.event_price is null or new.event_price < 0 then
      raise exception 'Informe um preço por evento válido para o serviço.' using errcode = '23514';
    end if;
    new.inventory_mode := 'quantity'; new.total_quantity := 0; new.daily_price := 0;
  else
    new.inventory_mode := 'quantity';
    if new.total_quantity < 1 then new.total_quantity := 1; end if;
    if new.item_type = 'toy' and new.event_price is not null then
      raise exception 'Brinquedos utilizam preço diário, não preço por evento.' using errcode = '23514';
    end if;
    if new.item_type = 'machine' and new.event_price is not null and new.daily_price <> 0 then
      raise exception 'Máquinas devem utilizar preço por diária ou por evento, não ambos.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;
create trigger enforce_product_catalog_rules before insert or update on public.products
for each row execute function public.enforce_product_catalog_rules();

create or replace function public.create_rental_with_items(
  p_company_id uuid,
  p_customer_id uuid,
  p_start_date date,
  p_end_date date,
  p_status text,
  p_delivery_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_delivery_address text,
  p_responsible_user_ids uuid[],
  p_start_time time without time zone,
  p_end_time time without time zone
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_rental_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_item_id uuid;
  v_quantity integer;
  v_used integer;
  v_unit_ids uuid[];
  v_unit_id uuid;
  v_unit_price numeric;
  v_item_count integer;
  v_distinct_products integer;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'Acesso negado à empresa.'; end if;
  if p_customer_id is null or not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = p_company_id
  ) then raise exception 'Cliente não encontrado nesta empresa.'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Período da locação inválido.';
  end if;
  if p_start_time is null or p_end_time is null
     or (p_start_date = p_end_date and p_end_time <= p_start_time) then
    raise exception 'Horário da locação inválido.';
  end if;
  if p_status not in ('pending','confirmed','ongoing') then
    raise exception 'Status inválido para uma nova locação.';
  end if;
  if p_delivery_method not in ('delivery','customer_pickup') then
    raise exception 'Modalidade de entrega inválida.';
  end if;
  if p_total_amount is null or p_total_amount < 0 then
    raise exception 'Valor total da locação inválido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A locação precisa ter pelo menos um brinquedo.';
  end if;

  select count(*), count(distinct (e.value->>'product_id')::uuid)
    into v_item_count, v_distinct_products
  from jsonb_array_elements(p_items) as e(value);
  if v_item_count <> v_distinct_products then
    raise exception 'Não selecione o mesmo brinquedo mais de uma vez.';
  end if;

  insert into public.rentals(
    company_id, customer_id, start_date, end_date, start_time, end_time,
    status, delivery_method, delivery_address, total_amount, created_by
  ) values (
    p_company_id, p_customer_id, p_start_date, p_end_date, p_start_time, p_end_time,
    p_status, p_delivery_method,
    case when p_delivery_method = 'delivery' then nullif(btrim(p_delivery_address), '') else null end,
    p_total_amount, v_user_id
  ) returning id into v_rental_id;

  for v_item in
    select e.value from jsonb_array_elements(p_items) as e(value)
    order by (e.value->>'product_id')::uuid
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then raise exception 'Quantidade inválida.'; end if;

    select p.* into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.company_id = p_company_id and p.active = true
    for update;
    if not found then raise exception 'Brinquedo não encontrado ou inativo.'; end if;

    v_unit_price := coalesce((v_item->>'unit_price')::numeric, v_product.daily_price);
    if v_unit_price is null or v_unit_price < 0 then raise exception 'Preço unitário inválido.'; end if;

    -- Services never consume stock; physical items use a simple quantity count.
    if v_product.item_type <> 'service' then
      select coalesce(sum(ri.quantity), 0)::integer into v_used
      from public.rental_items ri join public.rentals r on r.id = ri.rental_id
      where ri.product_id = v_product.id and r.status in ('pending','confirmed','ongoing')
        and (r.start_date + coalesce(r.start_time, time '00:00')) < (p_end_date + p_end_time)
        and (r.end_date + coalesce(r.end_time, time '24:00')) > (p_start_date + p_start_time);
      if v_used + v_quantity > v_product.total_quantity then
        raise exception 'Estoque insuficiente para o brinquedo: %.', v_product.name;
      end if;
    end if;

    insert into public.rental_items(
      company_id, rental_id, product_id, quantity, unit_price, subtotal
    ) values (
      p_company_id, v_rental_id, v_product.id, v_quantity, v_unit_price, v_quantity * v_unit_price
    ) returning id into v_item_id;

  end loop;

  perform public.save_rental_responsibles(p_company_id, v_rental_id, p_responsible_user_ids);
  insert into public.rental_events(company_id, rental_id, event_type, description, created_by)
  values (p_company_id, v_rental_id, 'created',
    'Locação criada pela nova operação transacional, com estoque e responsáveis validados.', v_user_id);

  return v_rental_id;
end;
$function$;


create or replace function public.update_rental_with_items(
  p_company_id uuid,
  p_rental_id uuid,
  p_customer_id uuid,
  p_start_date date,
  p_end_date date,
  p_status text,
  p_delivery_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_delivery_address text,
  p_responsible_user_ids uuid[],
  p_start_time time without time zone,
  p_end_time time without time zone
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_rental public.rentals%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_item_id uuid;
  v_quantity integer;
  v_used integer;
  v_unit_ids uuid[];
  v_unit_id uuid;
  v_unit_price numeric;
  v_item_count integer;
  v_distinct_products integer;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'Acesso negado à empresa.'; end if;

  select r.* into v_rental
  from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;
  if not public.can_manage_rental(p_company_id, p_rental_id) then
    raise exception 'Você não tem permissão para editar esta locação.';
  end if;

  if p_customer_id is null or not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = p_company_id
  ) then raise exception 'Cliente não encontrado nesta empresa.'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Período da locação inválido.';
  end if;
  if p_start_time is null or p_end_time is null
     or (p_start_date = p_end_date and p_end_time <= p_start_time) then
    raise exception 'Horário da locação inválido.';
  end if;
  if p_status not in ('pending','confirmed','ongoing','completed','cancelled') then
    raise exception 'Status de locação inválido.';
  end if;
  if p_delivery_method not in ('delivery','customer_pickup') then
    raise exception 'Modalidade de entrega inválida.';
  end if;
  if p_total_amount is null or p_total_amount < 0 then
    raise exception 'Valor total da locação inválido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A locação precisa ter pelo menos um brinquedo.';
  end if;

  select count(*), count(distinct (e.value->>'product_id')::uuid)
    into v_item_count, v_distinct_products
  from jsonb_array_elements(p_items) as e(value);
  if v_item_count <> v_distinct_products then
    raise exception 'Não selecione o mesmo brinquedo mais de uma vez.';
  end if;

  update public.rentals set
    customer_id = p_customer_id,
    start_date = p_start_date,
    end_date = p_end_date,
    start_time = p_start_time,
    end_time = p_end_time,
    status = p_status,
    delivery_method = p_delivery_method,
    delivery_address = case when p_delivery_method = 'delivery' then nullif(btrim(p_delivery_address), '') else null end,
    total_amount = p_total_amount
  where id = p_rental_id and company_id = p_company_id;

  delete from public.rental_items
  where rental_id = p_rental_id and company_id = p_company_id;

  for v_item in
    select e.value from jsonb_array_elements(p_items) as e(value)
    order by (e.value->>'product_id')::uuid
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then raise exception 'Quantidade inválida.'; end if;

    select p.* into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.company_id = p_company_id and p.active = true
    for update;
    if not found then raise exception 'Brinquedo não encontrado ou inativo.'; end if;

    v_unit_price := coalesce((v_item->>'unit_price')::numeric, v_product.daily_price);
    if v_unit_price is null or v_unit_price < 0 then raise exception 'Preço unitário inválido.'; end if;

    -- Services never consume stock; physical items use a simple quantity count.
    if v_product.item_type <> 'service' and p_status in ('pending','confirmed','ongoing') then
      select coalesce(sum(ri.quantity), 0)::integer into v_used
      from public.rental_items ri join public.rentals r on r.id = ri.rental_id
      where ri.product_id = v_product.id and r.id <> p_rental_id
        and r.status in ('pending','confirmed','ongoing')
        and (r.start_date + coalesce(r.start_time, time '00:00')) < (p_end_date + p_end_time)
        and (r.end_date + coalesce(r.end_time, time '24:00')) > (p_start_date + p_start_time);
      if v_used + v_quantity > v_product.total_quantity then
        raise exception 'Estoque insuficiente para o brinquedo: %.', v_product.name;
      end if;
    elsif v_product.item_type <> 'service' and v_quantity > v_product.total_quantity then
      raise exception 'A quantidade informada excede o total cadastrado para: %.', v_product.name;
    end if;

    insert into public.rental_items(
      company_id, rental_id, product_id, quantity, unit_price, subtotal
    ) values (
      p_company_id, p_rental_id, v_product.id, v_quantity, v_unit_price, v_quantity * v_unit_price
    ) returning id into v_item_id;

  end loop;

  perform public.save_rental_responsibles(p_company_id, p_rental_id, p_responsible_user_ids);
  insert into public.rental_events(company_id, rental_id, event_type, description, created_by)
  values (p_company_id, p_rental_id, 'updated',
    'Locação editada pela nova operação transacional, com estoque e responsáveis validados.', v_user_id);
end;
$function$;

revoke all on function public.enforce_product_catalog_rules() from public, anon, authenticated;
