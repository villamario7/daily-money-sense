import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Wallet, Receipt, Target, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Configura tu copiloto — Financial Copilot" },
      { name: "description", content: "3 pasos para activar tu presupuesto diario inteligente." },
    ],
  }),
  component: Onboarding,
});

type Fixed = { name: string; amount: string; day: string };

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState("");
  const [incomeDay, setIncomeDay] = useState("1");
  const [fixed, setFixed] = useState<Fixed[]>([
    { name: "Alquiler", amount: "", day: "1" },
    { name: "Suscripciones", amount: "", day: "5" },
  ]);
  const [goal, setGoal] = useState({ name: "", target: "", monthly: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate({ to: "/auth" });
    });
  }, [navigate]);

  const addFixed = () => setFixed([...fixed, { name: "", amount: "", day: "1" }]);
  const updateFixed = (i: number, k: keyof Fixed, v: string) => {
    const copy = [...fixed]; copy[i] = { ...copy[i], [k]: v }; setFixed(copy);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const inserts: any[] = [];
      if (income && Number(income) > 0) {
        inserts.push({ user_id: user.id, name: "Ingreso mensual", amount: Number(income), day_of_month: Number(incomeDay), type: "income" });
      }
      for (const f of fixed) {
        if (f.amount && Number(f.amount) > 0) {
          inserts.push({ user_id: user.id, name: f.name || "Gasto fijo", amount: -Math.abs(Number(f.amount)), day_of_month: Number(f.day), type: "expense" });
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
      toast.success("¡Listo! Calculando tu día...");
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { icon: Wallet, title: "Tus ingresos", subtitle: "¿Cuánto entra cada mes?" },
    { icon: Receipt, title: "Gastos fijos", subtitle: "Lo que ya está comprometido" },
    { icon: Target, title: "Tu meta", subtitle: "Dinero que 'desaparece' del disponible" },
  ];

  const Current = steps[step];

  return (
    <div className="min-h-screen bg-background px-6 py-8 flex flex-col max-w-md mx-auto w-full">
      {/* Progress */}
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
              <Label>Ingreso mensual (€)</Label>
              <Input type="number" inputMode="decimal" placeholder="2000" value={income} onChange={(e) => setIncome(e.target.value)} className="h-14 text-2xl font-semibold font-display" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Día del mes que entra</Label>
              <Input type="number" min="1" max="31" value={incomeDay} onChange={(e) => setIncomeDay(e.target.value)} className="h-12" />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {fixed.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_72px] gap-2">
                <Input placeholder="Nombre" value={f.name} onChange={(e) => updateFixed(i, "name", e.target.value)} />
                <Input type="number" inputMode="decimal" placeholder="€" value={f.amount} onChange={(e) => updateFixed(i, "amount", e.target.value)} />
                <Input type="number" min="1" max="31" placeholder="Día" value={f.day} onChange={(e) => updateFixed(i, "day", e.target.value)} />
              </div>
            ))}
            <Button variant="outline" onClick={addFixed} className="w-full">+ Añadir otro</Button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2">
              <Label>Nombre de la meta</Label>
              <Input placeholder="Viaje a Japón" value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Objetivo (€)</Label>
                <Input type="number" inputMode="decimal" placeholder="3000" value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Al mes (€)</Label>
                <Input type="number" inputMode="decimal" placeholder="200" value={goal.monthly} onChange={(e) => setGoal({ ...goal, monthly: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">Puedes saltarte este paso si no tienes una meta clara aún.</p>
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
            <Check className="mr-2 h-4 w-4" /> {saving ? "Guardando..." : "Activar copiloto"}
          </Button>
        )}
      </div>
    </div>
  );
}
