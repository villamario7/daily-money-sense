
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_items ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tx_goal ON public.transactions(goal_id);
CREATE INDEX IF NOT EXISTS idx_recurring_goal ON public.recurring_items(goal_id);

CREATE OR REPLACE FUNCTION public.compute_daily_status(u_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ingresos NUMERIC := 0;
  fijos_total NUMERIC := 0;
  fijos_pendientes NUMERIC := 0;
  fijos_pagados NUMERIC := 0;
  ahorro_mes NUMERIC := 0;
  ahorrado_mes NUMERIC := 0;
  ahorro_pendiente NUMERIC := 0;
  gastado_real NUMERIC := 0;
  ingresos_extra NUMERIC := 0;
  patrimonio_metas NUMERIC := 0;
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

  SELECT COALESCE(SUM(amount),0) INTO fijos_total
    FROM recurring_items WHERE user_id = u_id AND type='expense' AND is_active;

  SELECT COALESCE(SUM(amount),0) INTO fijos_pendientes
    FROM recurring_items WHERE user_id = u_id AND type='expense' AND is_active
      AND day_of_month >= EXTRACT(DAY FROM CURRENT_DATE);

  fijos_pagados := fijos_total - fijos_pendientes;

  SELECT COALESCE(SUM(monthly_contribution),0) INTO ahorro_mes
    FROM goals WHERE user_id = u_id AND status='active';

  SELECT COALESCE(SUM(ABS(amount)),0) INTO ahorrado_mes
    FROM transactions
    WHERE user_id = u_id
      AND (category = 'Ahorro' OR goal_id IS NOT NULL)
      AND created_at >= date_trunc('month', CURRENT_DATE)
      AND amount < 0;

  ahorro_pendiente := GREATEST(0, ahorro_mes - ahorrado_mes);

  SELECT COALESCE(SUM(amount),0) INTO gastado_real
    FROM transactions
    WHERE user_id = u_id
      AND created_at >= date_trunc('month', CURRENT_DATE)
      AND amount < 0
      AND COALESCE(category,'') <> 'Ahorro'
      AND goal_id IS NULL;

  SELECT COALESCE(SUM(amount),0) INTO ingresos_extra
    FROM transactions
    WHERE user_id = u_id
      AND created_at >= date_trunc('month', CURRENT_DATE)
      AND amount > 0;

  SELECT COALESCE(SUM(current_amount),0) INTO patrimonio_metas
    FROM goals WHERE user_id = u_id AND status='active';

  -- disponible: ingresos + extras - fijos del mes (todos) - gastos reales - ahorro pendiente
  balance_disponible := ingresos + ingresos_extra - fijos_total - ABS(gastado_real) - ahorro_pendiente;
  balance_proyectado := balance_disponible;

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
    'score', ROUND(CASE WHEN (ingresos + ingresos_extra) > 0 THEN balance_disponible / (ingresos + ingresos_extra) ELSE 0 END, 2),
    'income_total', ROUND(ingresos + ingresos_extra, 2),
    'income_extra', ROUND(ingresos_extra, 2),
    'spent_month', ROUND(ABS(gastado_real),2),
    'savings_month', ROUND(ahorro_mes,2),
    'saved_month', ROUND(ahorrado_mes,2),
    'savings_pending', ROUND(ahorro_pendiente,2),
    'fixed_total', ROUND(ABS(fijos_total),2),
    'fixed_paid', ROUND(ABS(fijos_pagados),2),
    'fixed_pending', ROUND(ABS(fijos_pendientes),2),
    'patrimony', ROUND(patrimonio_metas + balance_disponible, 2),
    'patrimony_goals', ROUND(patrimonio_metas, 2),
    'days_remaining', days_left
  );
END; $function$;
