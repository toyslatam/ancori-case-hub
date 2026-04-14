import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/context/AppContext";
import { AppLayout } from "@/components/layout/AppLayout";
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
import ConfigPage from "./pages/ConfigPage";
import NotFound from "./pages/NotFound";
import ComingSoonPage from "./pages/ComingSoonPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<CasesPage />} />
              <Route path="/casos" element={<CasesPage />} />
              <Route path="/facturas" element={<ComingSoonPage title="Facturas" />} />
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
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
