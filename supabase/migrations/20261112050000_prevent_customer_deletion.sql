-- Prevent authenticated API clients from deleting customer records.
-- The restrictive policy is combined with existing permissive company and
-- platform-owner policies, so it blocks DELETE for every authenticated user.
-- service_role retains its administrative bypass-RLS behavior.

create policy customers_prevent_delete_authenticated
on public.customers
as restrictive
for delete
to authenticated
using (false);
