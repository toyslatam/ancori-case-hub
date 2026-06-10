import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { APP_MODULES, type AppModule } from '@/data/mockData';

const SUPER_ADMINS = [
  'auditoria@ctauditores.com',
  'ygordon@ancori.com',
];

/** Ruta por defecto para cada módulo (la primera sub-ruta accesible). */
const MODULE_DEFAULT_ROUTE: Record<AppModule, string> = {
  dashboard:     '/',
  casos:         '/casos',
  facturas:      '/facturas',
  conciliacion:  '/conciliacion',
  cumplimiento:  '/cumplimiento/clientes',
  reportes:      '/reportes',
  instructivos:  '/instructivos',
  mantenimiento: '/mantenimiento/clientes',
  utilidades:    '/utilidades/categorias',
};

export function usePermissions() {
  const { session } = useAuth();
  const { usuarios } = useApp();

  const email = session?.user?.email?.toLowerCase() ?? '';
  const isSuperAdmin = SUPER_ADMINS.includes(email);

  const permisos = useMemo<AppModule[] | null>(() => {
    if (isSuperAdmin) return null;
    const u = usuarios.find(
      u => u.correo?.toLowerCase() === email ||
           u.correo_microsoft?.toLowerCase() === email,
    );
    // null o undefined → acceso completo (retrocompatible)
    return u?.permisos ?? null;
  }, [isSuperAdmin, email, usuarios]);

  /** true si el usuario tiene acceso al módulo dado */
  const can = (module: AppModule): boolean => {
    if (isSuperAdmin) return true;
    if (permisos === null) return true;       // sin restricción
    return permisos.includes(module);
  };

  /** Primera ruta a la que el usuario tiene acceso */
  const firstAccessibleRoute = (): string => {
    for (const m of APP_MODULES) {
      if (can(m)) return MODULE_DEFAULT_ROUTE[m];
    }
    return '/';
  };

  return { can, isSuperAdmin, permisos, firstAccessibleRoute };
}
