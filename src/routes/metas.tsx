import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Plus, Target, Trash2, Pencil, PiggyBank } from "lucide-react";

export const Route = createFileRoute("/metas")({
  head: () => ({ meta: [{ title: "Metas — Financial Copilot" }] }),
  component: MetasPage,
});

type Goal = {
  id: string; name: string; target_amount: number;
  current_amount: number; monthly_contribution: number; status: string;
};

const empty = { id: "", name: "", target_amount: "", current_amount: "0", monthly_contribution: "" };

function MetasPage() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => {
    const { data } = await supabase.from("goals").select("*").eq("status", "active").order("created_at");
    if (data) setGoals(data as Goal[]);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate({ to: "/auth" }); return; }
      load();
    });
  }, [navigate]);

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!form.name.trim() || !Number(form.monthly_contribution)) { toast.error("Completa nombre y aporte"); return; }
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      target_amount: Number(form.target_amount) || 0,
      current_amount: Number(form.current_amount) || 0,
      monthly_contribution: Number(form.monthly_contribution),
    };
    const { error } = form.id
      ? await supabase.from("goals").update(payload).eq("id", form.id)
      : await supabase.from("goals").insert(payload);
    if (error) { toast.error("Error"); return; }
    toast.success(form.id ? "Actualizado" : "Meta creada");
    setOpen(false); setForm(empty); load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Borrar esta meta?")) return;
    await supabase.from("goals").delete().eq("id", id);
    setGoals((p) => p.filter((g) => g.id !== id));
  };

  const addContribution = async (g: Goal, amount: number) => {
    const newAmount = Number(g.current_amount) + amount;
    await supabase.from("goals").update({ current_amount: newAmount }).eq("id", g.id);
    setGoals((p) => p.map((x) => x.id === g.id ? { ...x, current_amount: newAmount } : x));
    toast.success(`+${amount}€ a ${g.name}`);
  };

  const startEdit = (g: Goal) => {
    setForm({
      id: g.id, name: g.name, target_amount: String(g.target_amount),
      current_amount: String(g.current_amount), monthly_contribution: String(g.monthly_contribution),
    });
    setOpen(true);
  };

  return (
    <main className="min-h-screen bg-background px-6 py-6 max-w-md mx-auto w-full pb-24">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display">Metas</h1>
          <p className="text-sm text-muted-foreground mt-1">Lo que apartas para tus sueños</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
          <DialogTrigger asChild>
            <Button size="icon" className="bg-gradient-money text-primary-foreground shadow-glow"><Plus /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{form.id ? "Editar meta" : "Nueva meta"}</DialogTitle>
              <DialogDescription>Este dinero se reservará automáticamente cada mes.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input placeholder="Viaje a Japón" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Objetivo (€)</Label>
                  <Input type="number" placeholder="3000" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Aporte/mes (€)</Label>
                  <Input type="number" placeholder="200" value={form.monthly_contribution} onChange={(e) => setForm({ ...form, monthly_contribution: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ya tengo ahorrado (€)</Label>
                <Input type="number" placeholder="0" value={form.current_amount} onChange={(e) => setForm({ ...form, current_amount: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={save} className="flex-1 bg-gradient-money text-primary-foreground">Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Cargando…</p>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-secondary grid place-items-center">
            <Target className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Sin metas todavía</p>
          <Button onClick={() => setOpen(true)}>Crear mi primera meta</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((g) => {
            const target = Number(g.target_amount) || 1;
            const current = Number(g.current_amount);
            const pct = Math.min(100, Math.round((current / target) * 100));
            const monthsLeft = g.monthly_contribution > 0 ? Math.ceil((target - current) / Number(g.monthly_contribution)) : 0;
            return (
              <div key={g.id} className="p-5 rounded-2xl bg-card border space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-gradient-money grid place-items-center shrink-0 shadow-glow">
                      <Target className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold font-display truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{Number(g.monthly_contribution)}€/mes · {monthsLeft > 0 ? `${monthsLeft} meses restantes` : "completado"}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(g.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-end justify-between font-display">
                    <span className="text-2xl font-bold tabular-nums">{current.toFixed(0)}€</span>
                    <span className="text-sm text-muted-foreground">de {target.toFixed(0)}€</span>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                  <p className="text-xs text-primary font-semibold">{pct}% completado 🎯</p>
                </div>

                <div className="flex gap-2 pt-1">
                  {[10, 50, 100].map((v) => (
                    <Button key={v} variant="outline" size="sm" className="flex-1" onClick={() => addContribution(g, v)}>
                      <PiggyBank className="h-3.5 w-3.5 mr-1" /> +{v}€
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
