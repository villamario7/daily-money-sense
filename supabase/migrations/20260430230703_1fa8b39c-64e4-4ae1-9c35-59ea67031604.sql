
REVOKE EXECUTE ON FUNCTION public.get_daily_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_status() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
