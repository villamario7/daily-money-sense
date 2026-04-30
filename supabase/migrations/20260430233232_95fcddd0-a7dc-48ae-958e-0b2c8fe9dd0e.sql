-- Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Tag',
  color TEXT NOT NULL DEFAULT 'primary',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own categories all" ON public.categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add category to recurring_items
ALTER TABLE public.recurring_items ADD COLUMN IF NOT EXISTS category TEXT;

-- Seed default categories on signup
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, icon, color, is_default) VALUES
    (NEW.id, 'Café', 'Coffee', 'accent', true),
    (NEW.id, 'Comida', 'Utensils', 'primary', true),
    (NEW.id, 'Súper', 'ShoppingCart', 'primary', true),
    (NEW.id, 'Transporte', 'Bus', 'accent', true),
    (NEW.id, 'Ocio', 'ShoppingBag', 'warning', true),
    (NEW.id, 'Hogar', 'Home', 'primary', true),
    (NEW.id, 'Salud', 'Heart', 'destructive', true),
    (NEW.id, 'Otros', 'Tag', 'muted', true);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_categories ON auth.users;
CREATE TRIGGER on_auth_user_created_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();

-- Backfill defaults for existing users without categories
INSERT INTO public.categories (user_id, name, icon, color, is_default)
SELECT p.id, c.name, c.icon, c.color, true
FROM public.profiles p
CROSS JOIN (VALUES
  ('Café','Coffee','accent'),
  ('Comida','Utensils','primary'),
  ('Súper','ShoppingCart','primary'),
  ('Transporte','Bus','accent'),
  ('Ocio','ShoppingBag','warning'),
  ('Hogar','Home','primary'),
  ('Salud','Heart','destructive'),
  ('Otros','Tag','muted')
) AS c(name, icon, color)
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = p.id);

-- Updated daily status RPC: hybrid fixed expenses model
CREATE OR REPLACE FUNCTION public.get_daily_status()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u_id UUID := auth.uid();
  ingresos NUMERIC := 0;
  fijos_pendientes NUMERIC := 0;   -- gastos fijos que aún no se han cargado este mes
  fijos_pagados NUMERIC := 0;       -- gastos fijos cuya fecha ya pasó
  ahorro_mes NUMERIC := 0;
  ahorro_diario NUMERIC := 0;
  gastado_real NUMERIC := 0;
  balance_disponible NUMERIC := 0;  -- disponible REAL después de reservar fijos pendientes
  balance_proyectado NUMERIC := 0;  -- balance final estimado fin de mes
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
  IF u_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO ingresos
  FROM recurring_items WHERE user_id = u_id AND type='income' AND is_active;

  -- Fijos pendientes (a partir de hoy): amount es negativo
  SELECT COALESCE(SUM(amount),0) INTO fijos_pendientes
  FROM recurring_items
  WHERE user_id = u_id AND type='expense' AND is_active
    AND day_of_month >= EXTRACT(DAY FROM CURRENT_DATE);

  -- Fijos ya pasados este mes
  SELECT COALESCE(SUM(amount),0) INTO fijos_pagados
  FROM recurring_items
  WHERE user_id = u_id AND type='expense' AND is_active
    AND day_of_month < EXTRACT(DAY FROM CURRENT_DATE);

  SELECT COALESCE(SUM(monthly_contribution),0) INTO ahorro_mes
  FROM goals WHERE user_id = u_id AND status='active';

  -- Ahorro restante proporcional a los días que quedan
  ahorro_diario := CASE WHEN EXTRACT(DAY FROM fin_mes) > 0
    THEN ahorro_mes / EXTRACT(DAY FROM fin_mes) ELSE 0 END;

  SELECT COALESCE(SUM(amount),0) INTO gastado_real
  FROM transactions
  WHERE user_id = u_id AND created_at >= date_trunc('month', CURRENT_DATE);

  -- Disponible REAL hoy = ingresos + fijos_pasados (negativos) + gastado_real (negativo)
  --                       - reserva fijos_pendientes - reserva ahorro restante
  balance_disponible := ingresos + fijos_pagados + gastado_real
                      + fijos_pendientes  -- restamos la reserva (es negativo)
                      - (ahorro_diario * days_left);

  balance_proyectado := ingresos + fijos_pagados + fijos_pendientes + gastado_real - ahorro_mes;

  -- Pesos (Fri 1.2, Sat 1.5, Sun 1.3)
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