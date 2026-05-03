import { Link, useLocation } from "@tanstack/react-router";
import { Home, Receipt, Repeat, Target } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Hoy", Icon: Home },
  { to: "/historial", label: "Historial", Icon: Receipt },
  { to: "/fijos", label: "Fijos", Icon: Repeat },
  { to: "/metas", label: "Metas", Icon: Target },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t">
      <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto grid grid-cols-4">
        {items.map(({ to, label, Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
