import { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';

/** Layout principal: barra lateral (`AppSidebar`) + área de contenido (`SidebarInset`). */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="min-h-svh min-w-0 overflow-auto bg-background">
        <div className="w-full min-w-0">
          <div className="mx-auto w-full max-w-7xl min-w-0">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
