import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceder — Financial Copilot" },
      { name: "description", content: "Inicia sesión para activar tu copiloto financiero." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) throw error;
        toast.success("¡Cuenta creada! Vamos a configurar tu copiloto.");
        navigate({ to: "/onboarding" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenido de vuelta");
        navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background px-6 py-10">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Volver</Link>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-money shadow-glow">
              <TrendingUp className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold font-display">
              {mode === "signup" ? "Activa tu copiloto" : "Bienvenido de vuelta"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signup" ? "30 segundos. Después sabrás cuánto puedes gastar hoy." : "Inicia sesión y revisa tu día."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold bg-gradient-money text-primary-foreground hover:opacity-90 shadow-glow">
              <Sparkles className="mr-2 h-4 w-4" />
              {loading ? "..." : mode === "signup" ? "Crear cuenta" : "Entrar"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? "¿Ya tienes cuenta?" : "¿Nuevo aquí?"}{" "}
            <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="text-primary font-medium hover:underline">
              {mode === "signup" ? "Inicia sesión" : "Crea una cuenta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
