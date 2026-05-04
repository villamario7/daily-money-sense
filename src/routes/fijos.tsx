import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateFinance } from "@/hooks/use-daily-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Plus, Trash2, Repeat, TrendingUp, TrendingDown, Pencil, Calendar, Sparkles } from "lucide-react";

export const Route = createFileRoute("/fijos")({
  head: () => ({ meta: [{ title: "Gastos fijos — Financial Copilot" }] }),
  component: FijosPage,
});

type Frequency = "monthly" | "yearly" | "one_time";
type Item = {
  id: string; name: string; amount: number; day_of_month: number;
  type: "income" | "expense"; is_active: boolean; category: string | null;
  frequency: Frequency; month_of_year: number | null; one_time_date: string | null;
};
type SpecialDay = { id: string; date: string; label: string; multiplier: number };

const empty = {
  id: "", name: "", amount: "", day_of_month: "1",
  type: "expense" as "expense" | "income", is_active: true, category: "",
  frequency: "monthly" as Frequency, month_of_year: "1", one_time_date: "",
};

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function FijosPage() {
  const navigate = useNavigate();
  const invalidateFinance = useInvalidateFinance();
  const [items, setItems] = useState<Item[]>([]);
  const [days, setDays] = useState<SpecialDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [dayOpen, setDayOpen] = useState(false);
  const [dayForm, setDayForm] = useState({ id: "", date: "", label: "", multiplier: "2" });

  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from("recurring_items").select("*").order("day_of_month"),
      supabase.from("special_days").select("*").order("date"),
    ]);
    if (a.data) setItems(a.data as Item[]);
    if (b.data) setDays(b.data as SpecialDay[]);
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
    if (form.frequency === "one_time" && !form.one_time_date) { toast.error("Indica la fecha"); return; }
    const day = Math.min(31, Math.max(1, Number(form.day_of_month) || 1));
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      amount: form.type === "income" ? Math.abs(amt) : -Math.abs(amt),
      day_of_month: form.frequency === "one_time" && form.one_time_date
        ? Number(form.one_time_date.slice(8, 10)) : day,
      type: form.type,
      is_active: form.is_active,
      category: form.category || null,
      frequency: form.frequency,
      month_of_year: form.frequency === "yearly" ? Math.min(12, Math.max(1, Number(form.month_of_year) || 1)) : null,
      one_time_date: form.frequency === "one_time" ? form.one_time_date : null,
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
      frequency: (it.frequency ?? "monthly") as Frequency,
      month_of_year: String(it.month_of_year ?? 1),
      one_time_date: it.one_time_date ?? "",
    });
    setOpen(true);
  };

  const saveDay = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!dayForm.date || !dayForm.label.trim()) { toast.error("Fecha y nombre"); return; }
    const mult = Math.max(0.1, Math.min(5, Number(dayForm.multiplier) || 1.5));
    const payload = { user_id: user.id, date: dayForm.date, label: dayForm.label.trim(), multiplier: mult };
    const { error } = dayForm.id
      ? await supabase.from("special_days").update(payload).eq("id", dayForm.id)
      : await supabase.from("special_days").insert(payload);
    if (error) { toast.error("Error"); return; }
    toast.success("Guardado");
    setDayOpen(false); setDayForm({ id: "", date: "", label: "", multiplier: "2" });
    load(); invalidateFinance();
  };

  const removeDay = async (id: string) => {
    setDays((p) => p.filter((x) => x.id !== id));
    await supabase.from("special_days").delete().eq("id", id);
    invalidateFinance();
  };

  const incomes = items.filter((i) => i.type === "income");
  const expenses = items.filter((i) => i.type === "expense");
  const totalIn = incomes.filter((i) => i.is_active && i.frequency === "monthly").reduce((s, i) => s + Number(i.amount), 0);
  const totalOut = expenses.filter((i) => i.is_active && i.frequency === "monthly").reduce((s, i) => s + Math.abs(Number(i.amount)), 0);

  return (
    <main className="min-h-screen bg-background px-4 sm:px-6 py-6 max-w-md md:max-w-3xl lg:max-w-4xl mx-auto w-full pb-24">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-display">Fijos</h1>
          <p className="text-sm text-muted-foreground mt-1">Mensual, anual o un día concreto</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
          <DialogTrigger asChild>
            <Button size="icon" className="bg-gradient-money text-primary-foreground shadow-glow"><Plus /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{form.id ? "Editar" : "Nuevo movimiento fijo"}</DialogTitle>
              <DialogDescription>Elige cada cuánto se carga.</DialogDescription>
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
                <Input placeholder={form.type === "income" ? "Ej: Nómina, Bonus" : "Ej: Netflix, Seguro coche"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Importe (€)</Label>
                  <Input type="number" inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Frecuencia</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as Frequency })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensual</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                      <SelectItem value="one_time">Solo una vez</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.frequency === "monthly" && (
                <div className="space-y-2">
                  <Label>Día del mes</Label>
                  <Input type="number" min="1" max="31" value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Cada mes el día <span className="font-semibold text-foreground">{form.day_of_month || "?"}</span>.</p>
                </div>
              )}

              {form.frequency === "yearly" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Mes</Label>
                    <Select value={form.month_of_year} onValueChange={(v) => setForm({ ...form, month_of_year: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Día</Label>
                    <Input type="number" min="1" max="31" value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: e.target.value })} />
                  </div>
                </div>
              )}

              {form.frequency === "one_time" && (
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <Input type="date" value={form.one_time_date} onChange={(e) => setForm({ ...form, one_time_date: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Solo afectará a ese mes.</p>
                </div>
              )}

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

      <section className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-4 rounded-2xl bg-card border">
          <p className="text-xs text-muted-foreground">Ingresos mensuales</p>
          <p className="text-xl font-bold font-display text-primary mt-1">{totalIn.toFixed(0)}€</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border">
          <p className="text-xs text-muted-foreground">Gastos mensuales</p>
          <p className="text-xl font-bold font-display text-destructive mt-1">{totalOut.toFixed(0)}€</p>
        </div>
      </section>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 space-y-3">
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

      {/* Días especiales */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold font-display flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Días especiales</h2>
            <p className="text-xs text-muted-foreground">Cumpleaños, eventos… ese día puedes gastar más.</p>
          </div>
          <Dialog open={dayOpen} onOpenChange={(o) => { setDayOpen(o); if (!o) setDayForm({ id: "", date: "", label: "", multiplier: "2" }); }}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline"><Plus className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Día especial</DialogTitle>
                <DialogDescription>Aumenta el presupuesto de ese día.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input placeholder="Cumpleaños, cena…" value={dayForm.label} onChange={(e) => setDayForm({ ...dayForm, label: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input type="date" value={dayForm.date} onChange={(e) => setDayForm({ ...dayForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>×Multiplicador</Label>
                    <Select value={dayForm.multiplier} onValueChange={(v) => setDayForm({ ...dayForm, multiplier: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1.5">×1.5 (un poco)</SelectItem>
                        <SelectItem value="2">×2 (doble)</SelectItem>
                        <SelectItem value="3">×3 (mucho)</SelectItem>
                        <SelectItem value="5">×5 (todo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDayOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={saveDay} className="flex-1 bg-gradient-money text-primary-foreground">Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {days.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Sin días especiales</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {days.map((d) => (
              <div key={d.id} className="p-3 rounded-xl bg-card border flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent/15 grid place-items-center shrink-0">
                  <Sparkles className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{new Date(d.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ×{d.multiplier}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-9 w-9 hover:bg-destructive/10" onClick={() => removeDay(d.id)} aria-label="Eliminar">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 font-semibold">{title}</h2>
      <div className="grid sm:grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function freqLabel(it: Item) {
  if (it.frequency === "yearly") return `Anual · ${MESES[(it.month_of_year ?? 1) - 1]} ${it.day_of_month}`;
  if (it.frequency === "one_time") return it.one_time_date
    ? `Único · ${new Date(it.one_time_date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
    : "Único";
  const today = new Date().getDate();
  return `Día ${it.day_of_month} · ${it.day_of_month < today ? "ya cargado" : "pendiente"}`;
}

function Row({ it, onEdit, onDelete, onToggle }: {
  it: Item;
  onEdit: (i: Item) => void;
  onDelete: (id: string) => void;
  onToggle: (i: Item) => void;
}) {
  return (
    <div className={`p-3 rounded-xl bg-card border flex items-center gap-3 ${!it.is_active ? "opacity-50" : ""}`}>
      <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${it.type === "income" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
        {it.type === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{it.name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {freqLabel(it)}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-bold font-display tabular-nums ${it.type === "income" ? "text-primary" : ""}`}>
          {it.type === "income" ? "+" : "-"}{Math.abs(Number(it.amount)).toFixed(0)}€
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-9 w-9 hover:bg-secondary" onClick={() => onEdit(it)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-9 w-9 hover:bg-destructive/10" onClick={() => onDelete(it.id)} aria-label="Eliminar"><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    </div>
  );
}

