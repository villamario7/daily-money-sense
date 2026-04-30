import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground font-display">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Lo que buscas no existe o se movió.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0f172a" },
      { title: "Financial Copilot — Decide hoy, no mañana" },
      { name: "description", content: "Tu copiloto financiero predictivo: presupuesto diario ponderado, fecha de quiebre y decisiones inteligentes." },
      { property: "og:title", content: "Financial Copilot — Decide hoy, no mañana" },
      { name: "twitter:title", content: "Financial Copilot — Decide hoy, no mañana" },
      { property: "og:description", content: "Tu copiloto financiero predictivo: presupuesto diario ponderado, fecha de quiebre y decisiones inteligentes." },
      { name: "twitter:description", content: "Tu copiloto financiero predictivo: presupuesto diario ponderado, fecha de quiebre y decisiones inteligentes." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1d27e356-d538-40d3-8055-f089d33a3a1f/id-preview-7259e277--268a89c0-fe34-4731-b787-fa35ec58d276.lovable.app-1777592176172.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1d27e356-d538-40d3-8055-f089d33a3a1f/id-preview-7259e277--268a89c0-fe34-4731-b787-fa35ec58d276.lovable.app-1777592176172.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
