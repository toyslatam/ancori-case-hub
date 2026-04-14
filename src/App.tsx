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
import ConfigPage from "./pages/ConfigPage";
import NotFound from "./pages/NotFound";
import ComingSoonPage from "./pages/ComingSoonPage";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inicio" element={<DashboardPage />} />
          <Route path="/casos" element={<CasesPage />} />
          <Route path="/facturas" element={<FacturasPage />} />
          <Route path="/conciliacion" element={<ConciliacionPage />} />
          <Route path="/reportes" element={<ComingSoonPage title="Reportes" />} />
          <Route path="/instructivos" element={<ComingSoonPage title="Instructivos" />} />
          <Route path="/mantenimiento/clientes" element={<ClientsPage />} />
          <Route path="/mantenimiento/directores" element={<DirectoresPage />} />
          <Route path="/mantenimiento/sociedades" element={<SocietiesPage />} />
          <Route path="/mantenimiento/servicios" element={<ServicesPage />} />
          <Route path="/mantenimiento/terminos" element={<InvoiceTermsPage />} />
          <Route path="/mantenimiento/qb-items" element={<QBItemsPage />} />
          <Route path="/utilidades/categorias" element={<CategoriesPage />} />
          <Route path="/utilidades/servicios" element={<UtilServicesPage />} />
          <Route path="/utilidades/items-servicio" element={<ServiceItemsPage />} />
          <Route path="/utilidades/etapas" element={<EtapasPage />} />
          <Route path="/configuracion" element={<ConfigPage />} />
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
