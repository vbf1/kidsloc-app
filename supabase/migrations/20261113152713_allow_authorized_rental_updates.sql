CREATE POLICY rentals_update_creator_assigned_admin
ON public.rentals
FOR UPDATE
TO authenticated
USING (
  public.is_company_member(company_id)
  AND public.can_manage_rental(company_id, id)
)
WITH CHECK (
  public.is_company_member(company_id)
  AND public.can_manage_rental(company_id, id)
);

CREATE POLICY rental_items_delete_creator_assigned_admin
ON public.rental_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rentals r
    WHERE r.id = rental_items.rental_id
      AND r.company_id = rental_items.company_id
      AND public.can_manage_rental(r.company_id, r.id)
  )
);

CREATE POLICY rental_responsibles_delete_creator_assigned_admin
ON public.rental_responsibles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rentals r
    WHERE r.id = rental_responsibles.rental_id
      AND r.company_id = rental_responsibles.company_id
      AND public.can_manage_rental(r.company_id, r.id)
  )
);
