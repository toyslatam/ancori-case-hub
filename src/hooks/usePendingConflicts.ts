/**
 * Hook deshabilitado temporalmente: la tabla `sync_conflicts` no existe aún en la DB.
 * Activar cuando se cree la tabla para evitar el 404 en consola.
 * Retorna siempre 0 sin hacer ningún request a Supabase.
 */
export function usePendingConflicts(): number {
  return 0;
}
