import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateFinance } from "@/hooks/use-daily-status";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Trash2, Receipt } from "lucide-react";

export const Route = createFileRoute("/historial")({
  head: () => ({ meta: [{ title: "Historial — Financial Copilot" }] }),
  component: Historial,
});

type Tx = { id: string; amount: number; category: string | null; note: string | null; created_at: string };

function Historial() {
  const navigate = useNavigate();
  const invalidateFinance = useInvalidateFinance();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(200);
    if (data) setTxs(data as Tx[]);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate({ to: "/auth" }); return; }
      load();
    });
  }, [navigate]);

  const remove = async (id: string) => {
    setTxs((p) => p.filter((t) => t.id !== id));
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { toast.error("Error"); load(); } else { toast.success("Borrado"); invalidateFinance(); }
  };

  const grouped = txs.reduce<Record<string, Tx[]>>((acc, t) => {
    const key = new Date(t.created_at).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  const totalMonth = txs
    .filter((t) => new Date(t.created_at).getMonth() === new Date().getMonth())
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  return (
    <main className="min-h-screen bg-background px-4 sm:px-6 py-6 max-w-md md:max-w-3xl lg:max-w-4xl mx-auto w-full pb-24">
      <header className="mb-6">
        <h1 className="text-3xl font-bold font-display">Historial</h1>
        <p className="text-sm text-muted-foreground mt-1">{totalMonth.toFixed(2)}€ gastados este mes</p>
      </header>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Cargando…</p>
      ) : txs.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-secondary grid place-items-center">
            <Receipt className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Aún no has registrado gastos</p>
          <Button onClick={() => navigate({ to: "/dashboard" })}>Añadir el primero</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, items]) => (
            <section key={day}>
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 font-semibold">{day}</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {items.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-card border gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{t.category ?? "Sin categoría"}</p>
                      <p className="text-xs text-muted-foreground truncate">{new Date(t.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}{t.note ? ` · ${t.note}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`font-bold font-display tabular-nums ${Number(t.amount) < 0 ? "text-foreground" : "text-primary"}`}>
                        {Number(t.amount) > 0 ? "+" : ""}{Number(t.amount).toFixed(2)}€
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => remove(t.id)} className="h-9 w-9 hover:bg-destructive/10" aria-label="Eliminar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
