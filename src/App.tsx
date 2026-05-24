import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CasesPage from "./pages/CasesPage";
import ClientsPage from "./pages/maintenance/ClientsPage";
import SocietiesPage from "./pages/maintenance/SocietiesPage";
import ServicesPage from "./pages/maintenance/ServicesPage";
import InvoiceTermsPage from "./pages/maintenance/InvoiceTermsPage";
import QBItemsPage from "./pages/maintenance/QBItemsPage";
import DirectoresPage from "./pages/maintenance/DirectoresPage";
import CategoriesPage from "./pages/utilities/CategoriesPage";
import UtilServicesPage from "./pages/utilities/ServicesPage";
import ServiceItemsPage from "./pages/utilities/ServiceItemsPage";
import EtapasPage from "./pages/utilities/EtapasPage";
import FacturasPage from "./pages/FacturasPage";
import ConciliacionPage from "./pages/ConciliacionPage";
import CumplimientoPage from "./pages/CumplimientoPage";
import ReportesPage from "./pages/ReportesPage";
import InstructivosPage from "./pages/InstructivosPage";
import ConfigPage from "./pages/ConfigPage";
import UsersPage from "./pages/UsersPage";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import type { AppModule } from "@/data/mockData";
import { ReactNode } from "react";

const queryClient = new QueryClient();

/** Redirige a la primera ruta accesible si el usuario no tiene permiso. */
function Guard({ module, children }: { module: AppModule; children: ReactNode }) {
  const { can, firstAccessibleRoute } = usePermissions();
  if (!can(module)) return <Navigate to={firstAccessibleRoute()} replace />;
  return <>{children}</>;
}

/** Rutas protegidas: si no hay sesión → redirige a /login */
function ProtectedApp() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppProvider>
      <AppLayout>
        <Routes>
          <Route path="/"        element={<Guard module="dashboard"><DashboardPage /></Guard>} />
          <Route path="/inicio"  element={<Guard module="dashboard"><DashboardPage /></Guard>} />
          <Route path="/casos"   element={<Guard module="casos"><CasesPage /></Guard>} />
          <Route path="/facturas" element={<Guard module="facturas"><FacturasPage /></Guard>} />
          <Route path="/conciliacion" element={<Guard module="conciliacion"><ConciliacionPage /></Guard>} />
          <Route path="/cumplimiento" element={<Guard module="cumplimiento"><CumplimientoPage /></Guard>} />
          <Route path="/reportes"    element={<Guard module="reportes"><ReportesPage /></Guard>} />
          <Route path="/instructivos" element={<Guard module="instructivos"><InstructivosPage /></Guard>} />
          <Route path="/mantenimiento/clientes"  element={<Guard module="mantenimiento"><ClientsPage /></Guard>} />
          <Route path="/mantenimiento/directores" element={<Guard module="mantenimiento"><DirectoresPage /></Guard>} />
          <Route path="/mantenimiento/sociedades" element={<Guard module="mantenimiento"><SocietiesPage /></Guard>} />
          <Route path="/mantenimiento/servicios"  element={<Guard module="mantenimiento"><ServicesPage /></Guard>} />
          <Route path="/mantenimiento/terminos"   element={<Guard module="mantenimiento"><InvoiceTermsPage /></Guard>} />
          <Route path="/mantenimiento/qb-items"   element={<Guard module="mantenimiento"><QBItemsPage /></Guard>} />
          <Route path="/utilidades/categorias"     element={<Guard module="utilidades"><CategoriesPage /></Guard>} />
          <Route path="/utilidades/servicios"      element={<Guard module="utilidades"><UtilServicesPage /></Guard>} />
          <Route path="/utilidades/items-servicio" element={<Guard module="utilidades"><ServiceItemsPage /></Guard>} />
          <Route path="/utilidades/etapas"         element={<Guard module="utilidades"><EtapasPage /></Guard>} />
          <Route path="/configuracion" element={<ConfigPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </AppProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

/** Si ya hay sesión y va a /login → redirige al inicio */
function LoginRoute() {
  const { session, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default App;
