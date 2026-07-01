-- Revoke direct EXECUTE from PUBLIC/anon/authenticated on SECURITY DEFINER helpers.
-- These are trigger functions or RLS helpers; nothing legitimate calls them via the Data API.

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_order_price() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- has_role is invoked from RLS policies as the executing role. Because it is
-- SECURITY DEFINER it runs with the owner's rights regardless, so RLS policies
-- keep working. We only need to prevent direct PostgREST invocation.
