
CREATE OR REPLACE FUNCTION public.can_manage_rental(p_company_id uuid, p_rental_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.is_company_member(p_company_id)
    AND EXISTS (
      SELECT 1
      FROM public.rentals r
      WHERE r.id = p_rental_id
        AND r.company_id = p_company_id
        AND (
          r.created_by = (SELECT auth.uid())
          OR public.has_company_role(p_company_id, ARRAY['owner','admin'])
          OR EXISTS (
            SELECT 1
            FROM public.rental_responsibles rr
            WHERE rr.company_id = r.company_id
              AND rr.rental_id = r.id
              AND rr.user_id = (SELECT auth.uid())
          )
        )
    );
$function$;

-- A creator is not entitled to retain access after losing company membership.
DROP POLICY IF EXISTS payments_select_rental_creator ON public.payments;
DROP POLICY IF EXISTS rental_contracts_select_rental_creator ON public.rental_contracts;

DROP POLICY IF EXISTS rental_events_insert_creator_or_assigned ON public.rental_events;
CREATE POLICY rental_events_insert_creator_or_assigned
ON public.rental_events FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.id = rental_events.rental_id
      AND r.company_id = rental_events.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_events_select_creator_or_assigned ON public.rental_events;
CREATE POLICY rental_events_select_creator_or_assigned
ON public.rental_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.id = rental_events.rental_id
      AND r.company_id = rental_events.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_item_units_insert_creator_or_assigned ON public.rental_item_units;
CREATE POLICY rental_item_units_insert_creator_or_assigned
ON public.rental_item_units FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.rental_items ri
    JOIN public.rentals r ON r.id = ri.rental_id AND r.company_id = ri.company_id
    WHERE ri.id = rental_item_units.rental_item_id
      AND ri.company_id = rental_item_units.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_item_units_select_creator_or_assigned ON public.rental_item_units;
CREATE POLICY rental_item_units_select_creator_or_assigned
ON public.rental_item_units FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rental_items ri
    JOIN public.rentals r ON r.id = ri.rental_id AND r.company_id = ri.company_id
    WHERE ri.id = rental_item_units.rental_item_id
      AND ri.company_id = rental_item_units.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_items_insert_creator_or_assigned ON public.rental_items;
CREATE POLICY rental_items_insert_creator_or_assigned
ON public.rental_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.id = rental_items.rental_id
      AND r.company_id = rental_items.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_items_select_creator_or_assigned ON public.rental_items;
CREATE POLICY rental_items_select_creator_or_assigned
ON public.rental_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.id = rental_items.rental_id
      AND r.company_id = rental_items.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_responsibles_insert_creator_or_assigned ON public.rental_responsibles;
CREATE POLICY rental_responsibles_insert_creator_or_assigned
ON public.rental_responsibles FOR INSERT TO authenticated
WITH CHECK (
  assigned_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.id = rental_responsibles.rental_id
      AND r.company_id = rental_responsibles.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_responsibles_select_creator_or_assigned ON public.rental_responsibles;
CREATE POLICY rental_responsibles_select_creator_or_assigned
ON public.rental_responsibles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.id = rental_responsibles.rental_id
      AND r.company_id = rental_responsibles.company_id
      AND public.is_company_member(r.company_id)
      AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
  )
);

DROP POLICY IF EXISTS rental_responsibles_scope_select ON public.rental_responsibles;
CREATE POLICY rental_responsibles_scope_select
ON public.rental_responsibles FOR SELECT TO authenticated
USING (
  is_platform_owner()
  OR (
    public.is_company_member(company_id)
    AND (
      user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = rental_responsibles.company_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.role IN ('owner','admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.rentals r
        WHERE r.id = rental_responsibles.rental_id
          AND r.company_id = rental_responsibles.company_id
          AND (r.created_by = (SELECT auth.uid()) OR public.can_manage_rental(r.company_id, r.id))
      )
    )
  )
);
