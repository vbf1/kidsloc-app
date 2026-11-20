CREATE OR REPLACE FUNCTION public.can_manage_rental(p_company_id uuid, p_rental_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
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
