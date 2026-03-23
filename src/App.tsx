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
import ConfigPage from "./pages/ConfigPage";
import NotFound from "./pages/NotFound";

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
              <Route path="/mantenimiento/clientes" element={<ClientsPage />} />
              <Route path="/mantenimiento/sociedades" element={<SocietiesPage />} />
              <Route path="/mantenimiento/servicios" element={<ServicesPage />} />
              <Route path="/mantenimiento/terminos" element={<InvoiceTermsPage />} />
              <Route path="/mantenimiento/qb-items" element={<QBItemsPage />} />
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
