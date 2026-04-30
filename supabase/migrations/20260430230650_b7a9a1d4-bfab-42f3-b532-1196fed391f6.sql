
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RECURRING ITEMS
CREATE TABLE public.recurring_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  day_of_month INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recurring_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recurring all" ON public.recurring_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx all" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_tx_user_date ON public.transactions(user_id, created_at DESC);

-- GOALS
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(12,2) NOT NULL,
  current_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_contribution NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals all" ON public.goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DAILY SNAPSHOTS
CREATE TABLE public.daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  projected_balance NUMERIC(12,2),
  budget_today NUMERIC(12,2),
  burnout_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own snap all" ON public.daily_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- BRAIN FUNCTION
CREATE OR REPLACE FUNCTION public.get_daily_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_id UUID := auth.uid();
  ingresos NUMERIC := 0;
  gastos_futuros NUMERIC := 0;
  ahorro NUMERIC := 0;
  gastado_real NUMERIC := 0;
  balance NUMERIC := 0;
  fecha DATE := CURRENT_DATE;
  fin_mes DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  peso_total NUMERIC := 0;
  peso_hoy NUMERIC := 1;
  peso_acumulado_hoy NUMERIC := 0;
  presupuesto_hoy NUMERIC := 0;
  burnout DATE := fin_mes;
  daily_avg NUMERIC := 0;
  days_passed INT := EXTRACT(DAY FROM CURRENT_DATE)::INT;
  primer_loop BOOLEAN := TRUE;
  w NUMERIC;
BEGIN
  IF u_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO ingresos
  FROM recurring_items
  WHERE user_id = u_id AND type='income' AND is_active;

  SELECT COALESCE(SUM(amount),0) INTO gastos_futuros
  FROM recurring_items
  WHERE user_id = u_id AND type='expense' AND is_active
    AND day_of_month >= EXTRACT(DAY FROM CURRENT_DATE);

  SELECT COALESCE(SUM(monthly_contribution),0) INTO ahorro
  FROM goals WHERE user_id = u_id AND status='active';

  SELECT COALESCE(SUM(amount),0) INTO gastado_real
  FROM transactions
  WHERE user_id = u_id
    AND created_at >= date_trunc('month', CURRENT_DATE);

  -- gastos_futuros are negative (expense), gastado_real is negative
  balance := ingresos + gastos_futuros + gastado_real - ahorro;

  WHILE fecha <= fin_mes LOOP
    w := CASE EXTRACT(DOW FROM fecha)
      WHEN 0 THEN 1.3  -- sunday
      WHEN 5 THEN 1.2  -- friday
      WHEN 6 THEN 1.5  -- saturday
      ELSE 1.0
    END;
    peso_total := peso_total + w;
    IF fecha = CURRENT_DATE THEN
      peso_hoy := w;
    END IF;
    fecha := fecha + 1;
  END LOOP;

  IF peso_total > 0 AND balance > 0 THEN
    presupuesto_hoy := (balance / peso_total) * peso_hoy;
  END IF;

  -- burnout date based on current daily avg of real spending
  IF days_passed > 0 AND gastado_real < 0 THEN
    daily_avg := ABS(gastado_real) / days_passed;
    IF daily_avg > 0 THEN
      burnout := CURRENT_DATE + GREATEST(0, FLOOR(balance / daily_avg))::INT;
    END IF;
  END IF;

  RETURN json_build_object(
    'projected_balance', ROUND(balance,2),
    'budget_today', ROUND(presupuesto_hoy,2),
    'burnout_date', burnout,
    'score', ROUND(CASE WHEN ingresos > 0 THEN balance / ingresos ELSE 0 END, 2),
    'income_total', ROUND(ingresos,2),
    'spent_month', ROUND(ABS(gastado_real),2),
    'savings_month', ROUND(ahorro,2),
    'fixed_remaining', ROUND(ABS(gastos_futuros),2),
    'days_remaining', (fin_mes - CURRENT_DATE)
  );
END;
$$;
