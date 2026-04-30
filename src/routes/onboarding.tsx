import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Wallet, Receipt, Target, ArrowRight, Trash2, Plus, Calendar, Home, Wifi, Smartphone, Tv, Dumbbell, MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Configura tu copiloto — Financial Copilot" },
      { name: "description", content: "3 pasos para activar tu presupuesto diario inteligente." },
    ],
  }),
  component: Onboarding,
});

type Fixed = { name: string; amount: string; day: string; icon: string };

const SUGERIDOS = [
  { name: "Alquiler/Hipoteca", icon: "Home", day: "1" },
  { name: "Internet", icon: "Wifi", day: "5" },
  { name: "Móvil", icon: "Smartphone", day: "10" },
  { name: "Netflix/Streaming", icon: "Tv", day: "15" },
  { name: "Gimnasio", icon: "Dumbbell", day: "1" },
];

const ICONS: Record<string, typeof Home> = { Home, Wifi, Smartphone, Tv, Dumbbell, MoreHorizontal };

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState("");
  const [incomeDay, setIncomeDay] = useState("1");
  const [fixed, setFixed] = useState<Fixed[]>([]);
  const [goal, setGoal] = useState({ name: "", target: "", monthly: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate({ to: "/auth" });
    });
  }, [navigate]);

  const addSuggested = (s: typeof SUGERIDOS[0]) => {
    if (fixed.find((f) => f.name === s.name)) return;
    setFixed([...fixed, { name: s.name, amount: "", day: s.day, icon: s.icon }]);
  };

  const addCustom = () => setFixed([...fixed, { name: "", amount: "", day: "1", icon: "MoreHorizontal" }]);
  const updateFixed = (i: number, k: keyof Fixed, v: string) => {
    const copy = [...fixed]; copy[i] = { ...copy[i], [k]: v }; setFixed(copy);
  };
  const removeFixed = (i: number) => setFixed(fixed.filter((_, idx) => idx !== i));

  const finish = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const inserts: any[] = [];
      if (income && Number(income) > 0) {
        inserts.push({ user_id: user.id, name: "Nómina", amount: Number(income), day_of_month: Number(incomeDay), type: "income" });
      }
      for (const f of fixed) {
        if (f.amount && Number(f.amount) > 0 && f.name.trim()) {
          inserts.push({ user_id: user.id, name: f.name.trim(), amount: -Math.abs(Number(f.amount)), day_of_month: Number(f.day) || 1, type: "expense" });
        }
      }
      if (inserts.length) {
        const { error } = await supabase.from("recurring_items").insert(inserts);
        if (error) throw error;
      }
      if (goal.name && Number(goal.monthly) > 0) {
        const { error } = await supabase.from("goals").insert({
          user_id: user.id, name: goal.name, target_amount: Number(goal.target || 0),
          monthly_contribution: Number(goal.monthly),
        });
        if (error) throw error;
      }
      await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
      toast.success("¡Listo! Calculando tu día…");
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { icon: Wallet, title: "Tus ingresos", subtitle: "¿Cuánto entra al mes y qué día?" },
    { icon: Receipt, title: "Gastos fijos", subtitle: "Lo que pagas cada mes sin falta" },
    { icon: Target, title: "Tu meta (opcional)", subtitle: "Dinero apartado para lo importante" },
  ];

  const Current = steps[step];

  return (
    <div className="min-h-screen bg-background px-6 py-8 flex flex-col max-w-md mx-auto w-full">
      <div className="flex gap-2 mb-10">
        {steps.map((_, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= step ? "bg-primary" : "bg-secondary"}`} />
        ))}
      </div>

      <div className="space-y-2 mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary mb-2">
          <Current.icon className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold font-display">{Current.title}</h1>
        <p className="text-muted-foreground">{Current.subtitle}</p>
      </div>

      <div className="flex-1 space-y-5">
        {step === 0 && (
          <>
            <div className="space-y-2">
              <Label>¿Cuánto ganas al mes?</Label>
              <div className="relative">
                <Input type="number" inputMode="decimal" placeholder="2000" value={income}
                  onChange={(e) => setIncome(e.target.value)} className="h-16 text-3xl font-bold font-display pr-10" autoFocus />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground font-display">€</span>
              </div>
              <p className="text-xs text-muted-foreground">Suma todo lo que entra (nómina, freelance, etc.)</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> ¿Qué día del mes te lo ingresan?</Label>
              <Input type="number" min="1" max="31" value={incomeDay} onChange={(e) => setIncomeDay(e.target.value)} className="h-12 text-lg font-display" />
              <p className="text-xs text-muted-foreground">Ej: si cobras el 25, escribe "25"</p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">Toca para añadir los que pagas:</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGERIDOS.map((s) => {
                const Icon = ICONS[s.icon] ?? MoreHorizontal;
                const added = fixed.find((f) => f.name === s.name);
                return (
                  <button key={s.name} onClick={() => addSuggested(s)} disabled={!!added}
                    className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${added ? "border-primary bg-primary/10 opacity-60" : "border-border bg-card hover:border-primary/50"}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>

            {fixed.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <p className="text-xs uppercase font-semibold tracking-wide text-muted-foreground">Tus gastos fijos</p>
                {fixed.map((f, i) => {
                  const Icon = ICONS[f.icon] ?? MoreHorizontal;
                  return (
                    <div key={i} className="space-y-2 p-3 rounded-xl bg-card border">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <Input placeholder="Nombre" value={f.name} onChange={(e) => updateFixed(i, "name", e.target.value)} className="h-9 flex-1" />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeFixed(i)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Importe (€)</Label>
                          <Input type="number" inputMode="decimal" placeholder="50" value={f.amount} onChange={(e) => updateFixed(i, "amount", e.target.value)} className="h-10" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Día del mes</Label>
                          <Input type="number" min="1" max="31" placeholder="1-31" value={f.day} onChange={(e) => updateFixed(i, "day", e.target.value)} className="h-10" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Button variant="outline" onClick={addCustom} className="w-full"><Plus className="h-4 w-4 mr-1" /> Añadir otro</Button>
            {fixed.length === 0 && <p className="text-xs text-muted-foreground text-center">Puedes saltarte este paso y añadirlos después.</p>}
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2">
              <Label>¿Para qué quieres ahorrar?</Label>
              <Input placeholder="Viaje a Japón" value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cuánto cuesta (€)</Label>
                <Input type="number" inputMode="decimal" placeholder="3000" value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Aporte/mes (€)</Label>
                <Input type="number" inputMode="decimal" placeholder="200" value={goal.monthly} onChange={(e) => setGoal({ ...goal, monthly: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">Puedes saltarte este paso si aún no tienes meta clara.</p>
          </>
        )}
      </div>

      <div className="flex gap-3 pt-6">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">Atrás</Button>
        )}
        {step < steps.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} className="flex-1 h-12 bg-gradient-money text-primary-foreground hover:opacity-90 shadow-glow">
            Siguiente <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={saving} className="flex-1 h-12 bg-gradient-money text-primary-foreground hover:opacity-90 shadow-glow">
            <Check className="mr-2 h-4 w-4" /> {saving ? "Guardando…" : "Activar copiloto"}
          </Button>
        )}
      </div>
    </div>
  );
}
