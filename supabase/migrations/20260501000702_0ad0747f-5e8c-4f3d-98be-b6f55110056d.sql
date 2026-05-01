-- 1) Versión interna que computa el status para un user_id concreto (para uso desde jobs)
CREATE OR REPLACE FUNCTION public.compute_daily_status(u_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ingresos NUMERIC := 0;
  fijos_pendientes NUMERIC := 0;
  fijos_pagados NUMERIC := 0;
  ahorro_mes NUMERIC := 0;
  ahorro_diario NUMERIC := 0;
  gastado_real NUMERIC := 0;
  balance_disponible NUMERIC := 0;
  balance_proyectado NUMERIC := 0;
  fecha DATE := CURRENT_DATE;
  fin_mes DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  peso_total NUMERIC := 0;
  peso_hoy NUMERIC := 1;
  presupuesto_hoy NUMERIC := 0;
  burnout DATE := fin_mes;
  daily_avg NUMERIC := 0;
  days_passed INT := EXTRACT(DAY FROM CURRENT_DATE)::INT;
  days_left INT := (fin_mes - CURRENT_DATE)::INT + 1;
  w NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO ingresos
    FROM recurring_items WHERE user_id = u_id AND type='income' AND is_active;

  SELECT COALESCE(SUM(amount),0) INTO fijos_pendientes
    FROM recurring_items WHERE user_id = u_id AND type='expense' AND is_active
      AND day_of_month >= EXTRACT(DAY FROM CURRENT_DATE);

  SELECT COALESCE(SUM(amount),0) INTO fijos_pagados
    FROM recurring_items WHERE user_id = u_id AND type='expense' AND is_active
      AND day_of_month < EXTRACT(DAY FROM CURRENT_DATE);

  SELECT COALESCE(SUM(monthly_contribution),0) INTO ahorro_mes
    FROM goals WHERE user_id = u_id AND status='active';

  ahorro_diario := CASE WHEN EXTRACT(DAY FROM fin_mes) > 0
    THEN ahorro_mes / EXTRACT(DAY FROM fin_mes) ELSE 0 END;

  SELECT COALESCE(SUM(amount),0) INTO gastado_real
    FROM transactions
    WHERE user_id = u_id AND created_at >= date_trunc('month', CURRENT_DATE);

  balance_disponible := ingresos + fijos_pagados + gastado_real
                      + fijos_pendientes
                      - (ahorro_diario * days_left);

  balance_proyectado := ingresos + fijos_pagados + fijos_pendientes + gastado_real - ahorro_mes;

  WHILE fecha <= fin_mes LOOP
    w := CASE EXTRACT(DOW FROM fecha)
      WHEN 0 THEN 1.3 WHEN 5 THEN 1.2 WHEN 6 THEN 1.5 ELSE 1.0 END;
    peso_total := peso_total + w;
    IF fecha = CURRENT_DATE THEN peso_hoy := w; END IF;
    fecha := fecha + 1;
  END LOOP;

  IF peso_total > 0 AND balance_disponible > 0 THEN
    presupuesto_hoy := (balance_disponible / peso_total) * peso_hoy;
  END IF;

  IF days_passed > 0 AND gastado_real < 0 THEN
    daily_avg := ABS(gastado_real) / days_passed;
    IF daily_avg > 0 AND balance_disponible > 0 THEN
      burnout := CURRENT_DATE + GREATEST(0, FLOOR(balance_disponible / daily_avg))::INT;
    END IF;
  END IF;

  RETURN json_build_object(
    'projected_balance', ROUND(balance_proyectado,2),
    'available_today', ROUND(balance_disponible,2),
    'budget_today', ROUND(presupuesto_hoy,2),
    'burnout_date', burnout,
    'score', ROUND(CASE WHEN ingresos > 0 THEN balance_disponible / ingresos ELSE 0 END, 2),
    'income_total', ROUND(ingresos,2),
    'spent_month', ROUND(ABS(gastado_real),2),
    'savings_month', ROUND(ahorro_mes,2),
    'fixed_paid', ROUND(ABS(fijos_pagados),2),
    'fixed_pending', ROUND(ABS(fijos_pendientes),2),
    'days_remaining', days_left
  );
END; $$;

-- 2) get_daily_status() ahora delega en compute_daily_status(auth.uid())
CREATE OR REPLACE FUNCTION public.get_daily_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u_id UUID := auth.uid();
BEGIN
  IF u_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN public.compute_daily_status(u_id);
END; $$;

-- 3) Job: snapshot diario por cada usuario con perfil
CREATE OR REPLACE FUNCTION public.snapshot_daily_status_all()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  s JSON;
  count INT := 0;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE onboarding_completed = true LOOP
    s := public.compute_daily_status(r.id);
    INSERT INTO daily_snapshots (user_id, date, projected_balance, budget_today, burnout_date)
    VALUES (
      r.id,
      CURRENT_DATE,
      (s->>'projected_balance')::NUMERIC,
      (s->>'budget_today')::NUMERIC,
      (s->>'burnout_date')::DATE
    )
    ON CONFLICT DO NOTHING;
    count := count + 1;
  END LOOP;
  RETURN count;
END; $$;

-- Índice para evitar duplicados por día
CREATE UNIQUE INDEX IF NOT EXISTS daily_snapshots_user_date_uniq
  ON public.daily_snapshots (user_id, date);

-- 4) pg_cron: 23:55 cada día
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('snapshot-daily-status');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'snapshot-daily-status',
  '55 23 * * *',
  $$ SELECT public.snapshot_daily_status_all(); $$
);