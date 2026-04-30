import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Brain, Flame, Target, TrendingUp, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Financial Copilot — Decide hoy, no mañana" },
      { name: "description", content: "Tu copiloto financiero: presupuesto diario ponderado, fecha de quiebre y decisiones inteligentes en cada gasto." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      {/* Hero */}
      <section className="relative px-6 pt-12 pb-24 max-w-md mx-auto">
        <div className="absolute inset-0 -z-10 opacity-30">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary blur-[120px]" />
        </div>

        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-money grid place-items-center shadow-glow">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg">Copilot</span>
          </div>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Entrar</Link>
        </header>

        <div className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Predictivo, no histórico
          </div>
          <h1 className="text-5xl font-bold font-display leading-[1.05]">
            Sabe cuánto<br />puedes gastar<br /><span className="text-money">hoy.</span>
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed px-4">
            Tu copiloto calcula tu presupuesto diario ponderado y predice cuándo te quedarás sin dinero. Cada decisión, con contexto real.
          </p>
          <div className="flex flex-col gap-3 pt-4">
            <Button asChild className="h-14 text-base font-semibold bg-gradient-money text-primary-foreground hover:opacity-90 shadow-glow">
              <Link to="/auth">
                Empezar gratis <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">30 segundos. Sin tarjeta.</p>
          </div>
        </div>
      </section>

      {/* Demo card */}
      <section className="px-6 pb-20 max-w-md mx-auto">
        <div className="rounded-3xl bg-card border shadow-card p-8 space-y-4">
          <p className="text-sm text-muted-foreground">Hoy, viernes</p>
          <div className="text-6xl font-bold font-display tracking-tight">
            14,80<span className="text-2xl text-muted-foreground">€</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Flame className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">A este ritmo, llegas al día <span className="text-foreground font-semibold">28</span></span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-24 max-w-md mx-auto space-y-4">
        {[
          { icon: Brain, title: "Cerebro predictivo", desc: "Calcula balance proyectado, gastos fijos, ahorros y fecha de quiebre en tiempo real." },
          { icon: Zap, title: "Quick Add real", desc: "Toca categoría, escribe importe, listo. Sin fricción, sin esperar respuestas." },
          { icon: Target, title: "Modo decisión", desc: "Antes de cada gasto grande, te muestra cuántos días retrasa tu meta." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-4 p-5 rounded-2xl bg-card border">
            <div className="h-10 w-10 rounded-xl bg-secondary grid place-items-center shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      <footer className="px-6 py-10 text-center text-xs text-muted-foreground">
        Built with care · {new Date().getFullYear()}
      </footer>
    </main>
  );
}
