import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

/**
 * Hook que devuelve el conteo de conflictos de sync pendientes.
 * Usa Supabase Realtime para actualizaciones instantáneas.
 */
export function usePendingConflicts(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    // Carga inicial
    sb.from('sync_conflicts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count: c }) => {
        setCount(c ?? 0);
      });

    // Suscripción Realtime para cambios en la tabla
    const channel = sb
      .channel('sync_conflicts_count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sync_conflicts' },
        () => {
          // Re-fetch count on any change
          sb.from('sync_conflicts')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .then(({ count: c }) => {
              setCount(c ?? 0);
            });
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  return count;
}
