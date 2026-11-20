
DROP POLICY IF EXISTS company_members_delete_authorized_admins ON public.company_members;
CREATE POLICY company_members_delete_authorized_admins
ON public.company_members
FOR DELETE
TO authenticated
USING (
  role <> 'owner'
  AND (
    public.has_company_role(company_id, ARRAY['owner'])
    OR (
      role = 'staff'
      AND public.has_company_role(company_id, ARRAY['admin'])
    )
  )
);
