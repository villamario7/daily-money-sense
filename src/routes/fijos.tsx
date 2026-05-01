import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateFinance } from "@/hooks/use-daily-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Plus, Trash2, Repeat, TrendingUp, TrendingDown, Pencil, Calendar } from "lucide-react";

export const Route = createFileRoute("/fijos")({
  head: () => ({ meta: [{ title: "Gastos fijos — Financial Copilot" }] }),
  component: FijosPage,
});

type Item = {
  id: string; name: string; amount: number; day_of_month: number;
  type: "income" | "expense"; is_active: boolean; category: string | null;
};

const empty = { id: "", name: "", amount: "", day_of_month: "1", type: "expense" as "expense" | "income", is_active: true, category: "" };

function FijosPage() {
  const navigate = useNavigate();
  const invalidateFinance = useInvalidateFinance();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => {
    const { data } = await supabase.from("recurring_items").select("*").order("day_of_month");
    if (data) setItems(data as Item[]);
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
    const amt = Number(form.amount);
    if (!form.name.trim() || !amt || amt <= 0) { toast.error("Completa nombre e importe"); return; }
    const day = Math.min(31, Math.max(1, Number(form.day_of_month) || 1));
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      amount: form.type === "income" ? Math.abs(amt) : -Math.abs(amt),
      day_of_month: day,
      type: form.type,
      is_active: form.is_active,
      category: form.category || null,
    };
    const { error } = form.id
      ? await supabase.from("recurring_items").update(payload).eq("id", form.id)
      : await supabase.from("recurring_items").insert(payload);
    if (error) { toast.error("Error al guardar"); return; }
    toast.success(form.id ? "Actualizado" : "Añadido");
    setOpen(false); setForm(empty); load(); invalidateFinance();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Borrar este movimiento fijo?")) return;
    setItems((p) => p.filter((x) => x.id !== id));
    await supabase.from("recurring_items").delete().eq("id", id);
    toast.success("Borrado"); invalidateFinance();
  };

  const toggleActive = async (it: Item) => {
    setItems((p) => p.map((x) => x.id === it.id ? { ...x, is_active: !x.is_active } : x));
    await supabase.from("recurring_items").update({ is_active: !it.is_active }).eq("id", it.id);
    invalidateFinance();
  };

  const startEdit = (it: Item) => {
    setForm({
      id: it.id, name: it.name, amount: String(Math.abs(Number(it.amount))),
      day_of_month: String(it.day_of_month), type: it.type, is_active: it.is_active,
      category: it.category ?? "",
    });
    setOpen(true);
  };

  const incomes = items.filter((i) => i.type === "income");
  const expenses = items.filter((i) => i.type === "expense");
  const totalIn = incomes.filter((i) => i.is_active).reduce((s, i) => s + Number(i.amount), 0);
  const totalOut = expenses.filter((i) => i.is_active).reduce((s, i) => s + Math.abs(Number(i.amount)), 0);

  return (
    <main className="min-h-screen bg-background px-6 py-6 max-w-md mx-auto w-full pb-24">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display">Fijos</h1>
          <p className="text-sm text-muted-foreground mt-1">Lo que entra y sale cada mes</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
          <DialogTrigger asChild>
            <Button size="icon" className="bg-gradient-money text-primary-foreground shadow-glow"><Plus /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{form.id ? "Editar" : "Nuevo movimiento fijo"}</DialogTitle>
              <DialogDescription>Se cargará automáticamente cada mes el día que indiques.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ ...form, type: "expense" })}
                  className={`p-3 rounded-xl border-2 transition-all ${form.type === "expense" ? "border-destructive bg-destructive/10" : "border-border bg-card"}`}>
                  <TrendingDown className="h-5 w-5 mx-auto mb-1 text-destructive" />
                  <p className="text-sm font-semibold">Gasto</p>
                </button>
                <button onClick={() => setForm({ ...form, type: "income" })}
                  className={`p-3 rounded-xl border-2 transition-all ${form.type === "income" ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                  <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-sm font-semibold">Ingreso</p>
                </button>
              </div>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input placeholder={form.type === "income" ? "Ej: Nómina" : "Ej: Netflix, Alquiler..."} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Importe (€)</Label>
                  <Input type="number" inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Día del mes</Label>
                  <Input type="number" min="1" max="31" placeholder="1-31" value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">📅 El día <span className="font-semibold text-foreground">{form.day_of_month || "?"}</span> se descontará/ingresará automáticamente cada mes.</p>
              {form.id && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <Label htmlFor="active">Activo</Label>
                  <Switch id="active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={save} className="flex-1 bg-gradient-money text-primary-foreground">Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {/* Resumen */}
      <section className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-4 rounded-2xl bg-card border">
          <p className="text-xs text-muted-foreground">Ingresos/mes</p>
          <p className="text-xl font-bold font-display text-primary mt-1">{totalIn.toFixed(0)}€</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border">
          <p className="text-xs text-muted-foreground">Gastos fijos/mes</p>
          <p className="text-xl font-bold font-display text-destructive mt-1">{totalOut.toFixed(0)}€</p>
        </div>
      </section>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-secondary grid place-items-center">
            <Repeat className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Sin movimientos fijos</p>
        </div>
      ) : (
        <div className="space-y-6">
          {incomes.length > 0 && (
            <Section title="Ingresos">
              {incomes.map((it) => <Row key={it.id} it={it} onEdit={startEdit} onDelete={remove} onToggle={toggleActive} />)}
            </Section>
          )}
          {expenses.length > 0 && (
            <Section title="Gastos">
              {expenses.map((it) => <Row key={it.id} it={it} onEdit={startEdit} onDelete={remove} onToggle={toggleActive} />)}
            </Section>
          )}
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 font-semibold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ it, onEdit, onDelete, onToggle }: {
  it: Item;
  onEdit: (i: Item) => void;
  onDelete: (id: string) => void;
  onToggle: (i: Item) => void;
}) {
  const today = new Date().getDate();
  const passed = it.day_of_month < today;
  return (
    <div className={`p-3 rounded-xl bg-card border flex items-center gap-3 ${!it.is_active ? "opacity-50" : ""}`}>
      <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${it.type === "income" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
        {it.type === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{it.name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Día {it.day_of_month} · {passed ? "ya cargado" : "pendiente"}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-bold font-display tabular-nums ${it.type === "income" ? "text-primary" : ""}`}>
          {it.type === "income" ? "+" : "-"}{Math.abs(Number(it.amount)).toFixed(0)}€
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(it.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
      </div>
    </div>
  );
}
