-- The workspace router calls this RPC after authentication to identify platform owners.
-- Keep the check unavailable to anonymous users and grant it only to signed-in users.
revoke all on function public.is_platform_owner_for_company() from public, anon;
grant execute on function public.is_platform_owner_for_company() to authenticated;
