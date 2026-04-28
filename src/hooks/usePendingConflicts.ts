import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

/**
 * Hook que devuelve el conteo de conflictos de sync pendientes.
 * Tolerante a fallos: si la tabla no existe aún, devuelve 0.
 */
export function usePendingConflicts(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    // Carga inicial (tolerante a tabla inexistente — 404 se ignora silenciosamente).
    sb.from('sync_conflicts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count: c, error }) => {
        // Ignorar 404 (tabla aún no creada) y cualquier error de permisos.
        if (!error) setCount(c ?? 0);
      })
      .catch(() => { /* tabla inexistente: no loguear */ });

    // Suscripción Realtime (silenciosa si falla)
    let channel: ReturnType<typeof sb.channel> | null = null;
    try {
      channel = sb
        .channel('sync_conflicts_count')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sync_conflicts' },
          () => {
            sb.from('sync_conflicts')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
              .then(({ count: c, error }) => {
                if (!error) setCount(c ?? 0);
              });
          },
        )
        .subscribe();
    } catch {
      // tabla no existe aún — ignorar
    }

    return () => {
      if (channel) sb.removeChannel(channel);
    };
  }, []);

  return count;
}
