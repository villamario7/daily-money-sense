-- Las funciones internas no deben ser llamables por la API
REVOKE ALL ON FUNCTION public.compute_daily_status(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_daily_status_all() FROM PUBLIC, anon, authenticated;
-- get_daily_status sigue accesible para usuarios autenticados
GRANT EXECUTE ON FUNCTION public.get_daily_status() TO authenticated;