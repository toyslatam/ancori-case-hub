import { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';

/** Layout principal: barra lateral (`AppSidebar`) + área de contenido (`SidebarInset`). */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="min-h-svh overflow-auto bg-background">{children}</SidebarInset>
    </SidebarProvider>
  );
}
