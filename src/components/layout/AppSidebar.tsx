/**
 * Menú lateral principal de la app (expandible / colapsable a iconos).
 * Ubicación: src/components/layout/AppSidebar.tsx
 * Logo: public/Logo Ancori.jpg → URL /Logo%20Ancori.jpg
 * El ancho y el estado abierto/cerrado los controla SidebarProvider + useSidebar (toggle y cookie).
 */
import {
  Home,
  Users,
  Building2,
  FileText,
  CreditCard,
  Package,
  ChevronDown,
  Menu,
  Briefcase,
  Receipt,
  BarChart3,
  PlaySquare,
  UserCog,
  Wrench,
  Tags,
  Layers,
  ListTree,
  GitBranch,
  GitCompare,
  Shield,
  LogOut,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/context/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePendingConflicts } from '@/hooks/usePendingConflicts';

const LOGO_SRC = '/Logo%20Ancori.jpg';

const maintItems = [
  { title: 'Clientes', url: '/mantenimiento/clientes', icon: Users },
  { title: 'Directores', url: '/mantenimiento/directores', icon: UserCog },
  { title: 'Sociedades', url: '/mantenimiento/sociedades', icon: Building2 },
  { title: 'Términos de Factura', url: '/mantenimiento/terminos', icon: FileText },
  { title: 'Productos/Servicios QB', url: '/mantenimiento/qb-items', icon: CreditCard },
];

const utilItems = [
  { title: 'Categorías', url: '/utilidades/categorias', icon: Tags },
  { title: 'Servicios', url: '/utilidades/servicios', icon: Layers },
  { title: 'Items de Servicio', url: '/utilidades/items-servicio', icon: ListTree },
  { title: 'Etapas', url: '/utilidades/etapas', icon: GitBranch },
];

const navLinkActive =
  'bg-[hsl(220_14%_96%)] text-[hsl(17_78%_55%)] font-medium [&>svg]:text-[hsl(17_78%_55%)]';

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isMaintActive = maintItems.some(i => location.pathname === i.url);
  const isUtilActive = utilItems.some(i => location.pathname === i.url);
  const { user, session, signOut } = useAuth();
  const pendingConflicts = usePendingConflicts();
  const fallbackName = session?.user?.email?.split('@')[0] ?? 'Usuario';
  const displayName = user?.nombre?.trim() || fallbackName;
  const displayInitials = user?.initials || displayName.slice(0, 1).toUpperCase() || 'U';

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="gap-2 border-b border-sidebar-border/60 pb-3 pt-2">
        <div className="flex flex-col gap-2 px-2">
          <div className={cn('flex', collapsed ? 'justify-center' : 'justify-start')}>
            <img
              src={LOGO_SRC}
              alt="Ancori"
              className={cn(
                'object-contain object-left',
                collapsed ? 'h-9 w-9 rounded-md' : 'h-10 max-h-11 w-auto max-w-[220px]',
              )}
            />
          </div>
          <div className={cn('flex', collapsed ? 'justify-center' : 'justify-start')}>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-9 w-9 rounded-md border border-sidebar-border/80 bg-muted/60 text-muted-foreground shadow-none hover:bg-muted"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Abrir menú' : 'Cerrar menú'}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Inicio" isActive={location.pathname === '/'}>
                  <NavLink to="/" end className="text-sidebar-foreground/80 hover:text-sidebar-foreground" activeClassName={navLinkActive}>
                    <Home className="shrink-0" />
                    <span>Inicio</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {!collapsed ? (
                <Collapsible defaultOpen={isMaintActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="text-sidebar-foreground/80 hover:text-sidebar-foreground">
                        <Users className="shrink-0" />
                        <span className="flex-1 text-left">Mantenimiento</span>
                        <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {maintItems.map(item => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton asChild isActive={location.pathname === item.url}>
                              <NavLink to={item.url} className="text-sidebar-foreground/75" activeClassName={navLinkActive}>
                                <item.icon className="shrink-0" />
                                <span>{item.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : null}

              {!collapsed ? (
                <Collapsible defaultOpen={isUtilActive} className="group/collapsible-util">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="text-sidebar-foreground/80 hover:text-sidebar-foreground">
                        <Wrench className="shrink-0" />
                        <span className="flex-1 text-left">Utilidades</span>
                        <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible-util:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {utilItems.map(item => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton asChild isActive={location.pathname === item.url}>
                              <NavLink to={item.url} className="text-sidebar-foreground/75" activeClassName={navLinkActive}>
                                <item.icon className="shrink-0" />
                                <span>{item.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : null}

              {collapsed ? (
                <>
                  {maintItems.map(item => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild tooltip={item.title} isActive={location.pathname === item.url}>
                        <NavLink to={item.url} className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                          <item.icon className="shrink-0" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {utilItems.map(item => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild tooltip={item.title} isActive={location.pathname === item.url}>
                        <NavLink to={item.url} className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                          <item.icon className="shrink-0" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </>
              ) : null}

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Casos" isActive={location.pathname === '/casos'}>
                  <NavLink to="/casos" className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                    <Briefcase className="shrink-0" />
                    <span>Casos</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Facturas" isActive={location.pathname === '/facturas'}>
                  <NavLink to="/facturas" className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                    <Receipt className="shrink-0" />
                    <span>Facturas</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Conciliacion" isActive={location.pathname === '/conciliacion'}>
                  <NavLink to="/conciliacion" className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                    <GitCompare className="shrink-0" />
                    <span>Conciliacion</span>
                    {pendingConflicts > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1 text-[10px] leading-none">
                        {pendingConflicts}
                      </Badge>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Cumplimiento" isActive={location.pathname === '/cumplimiento'}>
                  <NavLink to="/cumplimiento" className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                    <Shield className="shrink-0" />
                    <span>Cumplimiento</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Reportes" isActive={location.pathname === '/reportes'}>
                  <NavLink to="/reportes" className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                    <BarChart3 className="shrink-0" />
                    <span>Reportes</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Instructivos" isActive={location.pathname === '/instructivos'}>
                  <NavLink to="/instructivos" className="text-sidebar-foreground/80" activeClassName={navLinkActive}>
                    <PlaySquare className="shrink-0" />
                    <span>Instructivos</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60">
        <div className={cn(
          'flex items-center gap-2 px-2 py-2',
          collapsed ? 'flex-col justify-center' : 'justify-between',
        )}>
          {/* Avatar + nombre usuario */}
          <div className={cn('flex items-center gap-2 min-w-0', collapsed && 'flex-col')}>
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold ring-1 ring-orange-200">
              {displayInitials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                  {displayName.split(' ')[0]}
                </p>
                {user.puesto && (
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">{user.puesto}</p>
                )}
              </div>
            )}
          </div>

          {/* Cerrar sesión */}
          <button
            onClick={() => signOut()}
            title="Cerrar sesión"
            className={cn(
              'flex-shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground',
              'hover:bg-red-50 hover:text-red-500 transition-colors',
              collapsed ? 'h-8 w-8' : 'h-8 w-8',
            )}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
