
-- Rentals: allow the creator to retain access to their own rental.
drop policy if exists rentals_scope_select on public.rentals;
create policy rentals_scope_select on public.rentals
as restrictive for select to authenticated
using (
  is_platform_owner()
  or exists (
    select 1
    from public.company_members cm
    where cm.company_id = rentals.company_id
      and cm.user_id = (select auth.uid())
      and (
        cm.role = any (array['owner'::text, 'admin'::text])
        or rentals.created_by = (select auth.uid())
        or exists (
          select 1 from public.rental_responsibles rr
          where rr.company_id = rentals.company_id
            and rr.rental_id = rentals.id
            and rr.user_id = (select auth.uid())
        )
      )
  )
);
create policy rentals_select_creator_or_assigned
on public.rentals for select to authenticated
using (
  is_company_member(company_id)
  and (
    created_by = (select auth.uid())
    or has_company_role(company_id, array['owner'::text, 'admin'::text])
    or exists (
      select 1 from public.rental_responsibles rr
      where rr.company_id = rentals.company_id
        and rr.rental_id = rentals.id
        and rr.user_id = (select auth.uid())
    )
  )
);

-- Rental items: creator, assigned staff and company admins can read.
create policy rental_items_select_creator_or_assigned
on public.rental_items for select to authenticated
using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_items.rental_id
      and r.company_id = rental_items.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

-- Individual units attached to rental items follow the same access.
create policy rental_item_units_select_creator_or_assigned
on public.rental_item_units for select to authenticated
using (
  exists (
    select 1
    from public.rental_items ri
    join public.rentals r
      on r.id = ri.rental_id and r.company_id = ri.company_id
    where ri.id = rental_item_units.rental_item_id
      and ri.company_id = rental_item_units.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

-- Responsible assignments: visible to the rental creator, assigned staff and admins.
drop policy if exists rental_responsibles_scope_select on public.rental_responsibles;
create policy rental_responsibles_scope_select on public.rental_responsibles
as restrictive for select to authenticated
using (
  is_platform_owner()
  or user_id = (select auth.uid())
  or exists (
    select 1 from public.company_members cm
    where cm.company_id = rental_responsibles.company_id
      and cm.user_id = (select auth.uid())
      and cm.role = any (array['owner'::text, 'admin'::text])
  )
  or exists (
    select 1 from public.rentals r
    where r.id = rental_responsibles.rental_id
      and r.company_id = rental_responsibles.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);
create policy rental_responsibles_select_creator_or_assigned
on public.rental_responsibles for select to authenticated
using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_responsibles.rental_id
      and r.company_id = rental_responsibles.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

-- Rental history/events: make the intended scoped readers actually eligible.
create policy rental_events_select_creator_or_assigned
on public.rental_events for select to authenticated
using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_events.rental_id
      and r.company_id = rental_events.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

-- Read-only visibility of payments and contracts for the rental creator.
create policy payments_select_rental_creator
on public.payments for select to authenticated
using (
  exists (
    select 1 from public.rentals r
    where r.id = payments.rental_id
      and r.company_id = payments.company_id
      and r.created_by = (select auth.uid())
  )
);

create policy rental_contracts_select_rental_creator
on public.rental_contracts for select to authenticated
using (
  rental_id is not null
  and exists (
    select 1 from public.rentals r
    where r.id = rental_contracts.rental_id
      and r.company_id = rental_contracts.company_id
      and r.created_by = (select auth.uid())
  )
);
