import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Coffee, ShoppingBag, ShoppingCart, Bus, Utensils, Plus, LogOut, Flame, AlertTriangle, Smile, TrendingUp, Target } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Tu día — Financial Copilot" },
      { name: "description", content: "Cuánto puedes gastar hoy según tu balance proyectado." },
    ],
  }),
  component: Dashboard,
});

type Status = {
  projected_balance: number;
  budget_today: number;
  burnout_date: string;
  score: number;
  income_total: number;
  spent_month: number;
  savings_month: number;
  fixed_remaining: number;
  days_remaining: number;
};

type Goal = { id: string; name: string; monthly_contribution: number };

const CATEGORIES = [
  { key: "Café", icon: Coffee },
  { key: "Comida", icon: Utensils },
  { key: "Súper", icon: ShoppingCart },
  { key: "Transporte", icon: Bus },
  { key: "Ocio", icon: ShoppingBag },
];

function Dashboard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Café");
  const [loading, setLoading] = useState(true);
  const [pendingExpense, setPendingExpense] = useState<{ amount: number; category: string } | null>(null);

  const refresh = useCallback(async () => {
    const [{ data: s }, { data: g }] = await Promise.all([
      supabase.rpc("get_daily_status"),
      supabase.from("goals").select("id,name,monthly_contribution").eq("status", "active"),
    ]);
    if (s) setStatus(s as unknown as Status);
    if (g) setGoals(g as Goal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }
      // check onboarding
      const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", session.user.id).maybeSingle();
      if (!prof?.onboarding_completed) {
        navigate({ to: "/onboarding" });
        return;
      }
      refresh();
    });
  }, [navigate, refresh]);

  const submit = async () => {
    const num = Number(amount);
    if (!num || num <= 0) return;
    if (num > 50 && goals.length > 0) {
      setPendingExpense({ amount: num, category });
      return;
    }
    await registerExpense(num, category);
  };

  const registerExpense = async (num: number, cat: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setAmount(""); // optimistic clear
    // optimistic budget update
    setStatus((prev) => prev ? { ...prev, budget_today: Math.max(0, prev.budget_today - num), spent_month: prev.spent_month + num } : prev);
    const { error } = await supabase.from("transactions").insert({ user_id: user.id, amount: -Math.abs(num), category: cat });
    if (error) {
      toast.error("Error al guardar");
      refresh();
    } else {
      toast.success(`-${num.toFixed(2)}€ · ${cat}`);
      refresh();
    }
  };

  const confirmBig = async () => {
    if (pendingExpense) {
      const { amount, category } = pendingExpense;
      setPendingExpense(null);
      await registerExpense(amount, category);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const mood = useMemo(() => {
    if (!status) return null;
    const s = status.score;
    if (s > 0.4) return { Icon: Flame, label: "Adelantado", color: "text-primary", bg: "bg-primary/10" };
    if (s > 0.15) return { Icon: Smile, label: "Estable", color: "text-accent", bg: "bg-accent/10" };
    return { Icon: AlertTriangle, label: "En riesgo", color: "text-destructive", bg: "bg-destructive/10" };
  }, [status]);

  const burnoutText = useMemo(() => {
    if (!status?.burnout_date) return null;
    const d = new Date(status.burnout_date);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  }, [status]);

  const impactDays = useMemo(() => {
    if (!pendingExpense || !goals[0]) return 0;
    const monthly = goals[0].monthly_contribution;
    if (monthly <= 0) return 0;
    return Math.round((pendingExpense.amount / (monthly / 30)) * 10) / 10;
  }, [pendingExpense, goals]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando tu día…</div>;
  }

  return (
    <main className="min-h-screen bg-background px-6 py-6 max-w-md mx-auto w-full pb-32">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-money grid place-items-center shadow-glow">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Hoy, {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout}><LogOut className="h-4 w-4" /></Button>
      </header>

      {/* Big budget circle */}
      <section className="text-center space-y-4 py-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className="text-sm text-muted-foreground">Puedes gastar hoy</p>
        <div className="relative inline-block">
          <div className="absolute inset-0 -z-10 bg-primary blur-3xl opacity-20 rounded-full" />
          <h1 className="text-7xl font-bold font-display tracking-tight">
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
          <p className="text-sm text-muted-foreground">
            A este ritmo, llegas hasta el <span className="text-foreground font-semibold">{burnoutText}</span>
          </p>
        )}
      </section>

      {/* Stats grid */}
      <section className="grid grid-cols-3 gap-2 mt-6">
        <StatCard label="Disponible" value={`${(status?.projected_balance ?? 0).toFixed(0)}€`} />
        <StatCard label="Gastado" value={`${(status?.spent_month ?? 0).toFixed(0)}€`} />
        <StatCard label="Ahorro" value={`${(status?.savings_month ?? 0).toFixed(0)}€`} />
      </section>

      {/* Goals */}
      {goals.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Metas activas</h2>
          {goals.map((g) => (
            <div key={g.id} className="flex items-center justify-between p-4 rounded-2xl bg-card border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-secondary grid place-items-center"><Target className="h-4 w-4 text-primary" /></div>
                <div>
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{g.monthly_contribution}€/mes</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Quick add bottom bar */}
      <section className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t px-6 py-4">
        <div className="max-w-md mx-auto space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {CATEGORIES.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  category === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {key}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="number" inputMode="decimal" placeholder="0,00 €"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="h-14 text-2xl font-bold font-display text-center"
              autoFocus
            />
            <Button onClick={submit} className="h-14 w-14 bg-gradient-money text-primary-foreground hover:opacity-90 shadow-glow">
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </section>

      {/* Decision modal */}
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
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-2xl bg-card border text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="font-bold font-display">{value}</p>
    </div>
  );
}
