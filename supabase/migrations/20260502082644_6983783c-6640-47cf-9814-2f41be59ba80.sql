CREATE OR REPLACE FUNCTION public.compute_daily_status(u_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ingresos NUMERIC := 0;
  fijos_pendientes NUMERIC := 0;
  fijos_pagados NUMERIC := 0;
  ahorro_mes NUMERIC := 0;
  ahorrado_mes NUMERIC := 0;
  ahorro_pendiente NUMERIC := 0;
  ahorro_diario NUMERIC := 0;
  gastado_real NUMERIC := 0;
  ingresos_extra NUMERIC := 0;
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

  -- Cuanto ya se ha movido a metas este mes (categoría 'Ahorro' como aportación manual)
  SELECT COALESCE(SUM(ABS(amount)),0) INTO ahorrado_mes
    FROM transactions
    WHERE user_id = u_id
      AND category = 'Ahorro'
      AND created_at >= date_trunc('month', CURRENT_DATE);

  ahorro_pendiente := GREATEST(0, ahorro_mes - ahorrado_mes);

  ahorro_diario := CASE WHEN days_left > 0
    THEN ahorro_pendiente / days_left ELSE 0 END;

  -- Gastos reales del mes (negativos) y excluimos las aportaciones a meta para no doble-contar
  SELECT COALESCE(SUM(amount),0) INTO gastado_real
    FROM transactions
    WHERE user_id = u_id
      AND created_at >= date_trunc('month', CURRENT_DATE)
      AND amount < 0
      AND COALESCE(category,'') <> 'Ahorro';

  -- Ingresos extra del mes (transacciones positivas)
  SELECT COALESCE(SUM(amount),0) INTO ingresos_extra
    FROM transactions
    WHERE user_id = u_id
      AND created_at >= date_trunc('month', CURRENT_DATE)
      AND amount > 0;

  balance_disponible := ingresos + ingresos_extra + fijos_pagados + gastado_real
                      + fijos_pendientes
                      - ahorro_pendiente;

  balance_proyectado := ingresos + ingresos_extra + fijos_pagados + fijos_pendientes + gastado_real - ahorro_pendiente;

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
    'fixed_paid', ROUND(ABS(fijos_pagados),2),
    'fixed_pending', ROUND(ABS(fijos_pendientes),2),
    'days_remaining', days_left
  );
END; $function$;