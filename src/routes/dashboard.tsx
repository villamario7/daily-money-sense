import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDailyStatus, useInvalidateFinance, dailyStatusKey, type DailyStatus } from "@/hooks/use-daily-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import { Plus, LogOut, Flame, AlertTriangle, Smile, TrendingUp, TrendingDown, Lock } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Tu día — Financial Copilot" },
      { name: "description", content: "Cuánto puedes gastar hoy según tu balance proyectado." },
    ],
  }),
  component: Dashboard,
});

type Goal = { id: string; name: string; monthly_contribution: number };
type Category = { id: string; name: string; icon: string; color: string };

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidateFinance = useInvalidateFinance();
  const [authReady, setAuthReady] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Café");
  const [txType, setTxType] = useState<"expense" | "income">("expense");
  const [pendingExpense, setPendingExpense] = useState<{ amount: number; category: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate({ to: "/auth" }); return; }
      const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", session.user.id).maybeSingle();
      if (!prof?.onboarding_completed) { navigate({ to: "/onboarding" }); return; }
      setAuthReady(true);
    });
  }, [navigate]);

  const { data: status, isLoading: statusLoading } = useDailyStatus(authReady);

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", "active"],
    enabled: authReady,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase.from("goals").select("id,name,monthly_contribution").eq("status", "active");
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["categories"],
    enabled: authReady,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories").select("id,name,icon,color").order("created_at");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  useEffect(() => {
    if (cats.length && !cats.find((x) => x.name === category)) setCategory(cats[0].name);
  }, [cats, category]);

  const submit = async () => {
    const num = Number(amount);
    if (!num || num <= 0) return;
    if (txType === "expense" && num > 50 && goals.length > 0) { setPendingExpense({ amount: num, category }); return; }
    await registerTx(num, category, txType);
  };

  const registerTx = async (num: number, cat: string, type: "expense" | "income") => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setAmount("");
    const signed = type === "income" ? Math.abs(num) : -Math.abs(num);
    qc.setQueryData<DailyStatus | undefined>(dailyStatusKey, (prev) =>
      prev ? {
        ...prev,
        budget_today: type === "income" ? prev.budget_today + num : Math.max(0, prev.budget_today - num),
        spent_month: type === "expense" ? prev.spent_month + num : prev.spent_month,
        available_today: prev.available_today + signed,
      } : prev
    );
    const finalCat = type === "income" ? (cat === "Ahorro" ? "Ingreso" : cat) : cat;
    const { error } = await supabase.from("transactions").insert({ user_id: user.id, amount: signed, category: type === "income" ? "Ingreso extra" : finalCat });
    if (error) toast.error("Error");
    else toast.success(`${type === "income" ? "+" : "-"}${num.toFixed(2)}€ · ${type === "income" ? "Ingreso" : cat}`);
    invalidateFinance();
  };

  const confirmBig = async () => {
    if (pendingExpense) {
      const { amount, category } = pendingExpense;
      setPendingExpense(null);
      await registerTx(amount, category, "expense");
    }
  };

  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/" }); };

  const loading = !authReady || statusLoading;

  const mood = useMemo(() => {
    if (!status) return null;
    const s = status.score;
    if (s > 0.4) return { Icon: Flame, label: "Adelantado", color: "text-primary", bg: "bg-primary/10" };
    if (s > 0.15) return { Icon: Smile, label: "Estable", color: "text-accent", bg: "bg-accent/10" };
    return { Icon: AlertTriangle, label: "En riesgo", color: "text-destructive", bg: "bg-destructive/10" };
  }, [status]);

  const burnoutText = useMemo(() => {
    if (!status?.burnout_date) return null;
    return new Date(status.burnout_date).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  }, [status]);

  const impactDays = useMemo(() => {
    if (!pendingExpense || !goals[0]) return 0;
    const monthly = goals[0].monthly_contribution;
    if (monthly <= 0) return 0;
    return Math.round((pendingExpense.amount / (monthly / 30)) * 10) / 10;
  }, [pendingExpense, goals]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando tu día…</div>;

  return (
    <main className="min-h-screen bg-background px-6 py-6 max-w-md mx-auto w-full pb-44">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-money grid place-items-center shadow-glow">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <p className="text-xs text-muted-foreground capitalize">{new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={logout}><LogOut className="h-4 w-4" /></Button>
      </header>

      <section className="text-center space-y-4 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className="text-sm text-muted-foreground">Puedes gastar hoy</p>
        <div className="relative inline-block">
          <div className="absolute inset-0 -z-10 bg-primary blur-3xl opacity-20 rounded-full" />
          <h1 className="text-7xl font-bold font-display tracking-tight tabular-nums">
            {(status?.budget_today ?? 0).toFixed(2).replace(".", ",")}
            <span className="text-3xl text-muted-foreground ml-1">€</span>
          </h1>
        </div>
        {mood && (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${mood.bg}`}>
            <mood.Icon className={`h-4 w-4 ${mood.color}`} />
            <span className={`text-sm font-medium ${mood.color}`}>{mood.label}</span>
          </div>
        )}
        {burnoutText && (
          <p className="text-sm text-muted-foreground">A este ritmo, llegas hasta el <span className="text-foreground font-semibold">{burnoutText}</span></p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2 mt-6">
        <StatCard label="Disponible" value={`${(status?.available_today ?? 0).toFixed(0)}€`} />
        <StatCard label="Gastado" value={`${(status?.spent_month ?? 0).toFixed(0)}€`} />
        <StatCard label="Reservado" value={`${(status?.fixed_pending ?? 0).toFixed(0)}€`} hint />
      </section>

      {(status?.fixed_pending ?? 0) > 0 && (
        <section className="mt-4 p-4 rounded-2xl bg-card border flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-warning/15 grid place-items-center shrink-0">
            <Lock className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{(status?.fixed_pending ?? 0).toFixed(0)}€ reservados</p>
            <p className="text-xs text-muted-foreground">Para gastos fijos pendientes este mes</p>
          </div>
        </section>
      )}

      {goals.length > 0 && (
        <section className="mt-6 space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Metas</h2>
          {goals.slice(0, 2).map((g) => (
            <button key={g.id} onClick={() => navigate({ to: "/metas" })} className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-secondary grid place-items-center"><Icons.Target className="h-4 w-4 text-primary" /></div>
                <div className="text-left">
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{g.monthly_contribution}€/mes</p>
                </div>
              </div>
              <Icons.ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </section>
      )}

      <section className="fixed bottom-16 left-0 right-0 bg-background/95 backdrop-blur border-t px-6 py-3 z-30">
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {cats.map((c) => {
              const Icon = (Icons[c.icon as keyof typeof Icons] as typeof Icons.Tag) ?? Icons.Tag;
              const active = category === c.name;
              return (
                <button key={c.id} onClick={() => setCategory(c.name)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  <Icon className="h-3.5 w-3.5" /> {c.name}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input type="number" inputMode="decimal" placeholder="0,00 €" value={amount}
              onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
              className="h-12 text-xl font-bold font-display text-center" />
            <Button onClick={submit} className="h-12 w-12 bg-gradient-money text-primary-foreground hover:opacity-90 shadow-glow">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={!!pendingExpense} onOpenChange={(o) => !o && setPendingExpense(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-warning/20 grid place-items-center mb-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <DialogTitle className="text-2xl font-display">¿Seguro?</DialogTitle>
            <DialogDescription className="text-base text-foreground/80 pt-2">
              Este gasto de <span className="font-bold">{pendingExpense?.amount.toFixed(2)}€</span> equivale a{" "}
              <span className="font-bold text-warning">{impactDays} días</span> de ahorro para <span className="font-bold">"{goals[0]?.name}"</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPendingExpense(null)} className="flex-1">Cancelar</Button>
            <Button onClick={confirmBig} className="flex-1 bg-warning text-warning-foreground hover:opacity-90">Sí, lo gasto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </main>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: boolean }) {
  return (
    <div className={`p-3 rounded-2xl border text-center ${hint ? "bg-warning/5 border-warning/30" : "bg-card"}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="font-bold font-display tabular-nums">{value}</p>
    </div>
  );
}
