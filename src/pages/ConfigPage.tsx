import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import {
  fetchQboStatus,
  getQboOAuthStartUrl,
  readQboConnectedHint,
  setQboConnectedHint,
  type QboStatus,
} from '@/lib/qboIntegration';

export default function ConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<QboStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qb = searchParams.get('qb');
    const msg = searchParams.get('msg');
    if (!qb) return;

    const next = new URLSearchParams(searchParams);
    next.delete('qb');
    next.delete('msg');
    setSearchParams(next, { replace: true });

    if (qb === 'connected') {
      toast.success('QuickBooks conectado correctamente.');
      setQboConnectedHint(true);
      void fetchQboStatus()
        .then(setStatus)
        .catch(() => setStatus(null));
    } else {
      let text = msg?.trim() ? msg : `QuickBooks: ${qb}`;
      try {
        text = decodeURIComponent(text);
      } catch {
        /* mantener texto original */
      }
      toast.error(text);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancel = false;
    async function load() {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }
      try {
        const s = await fetchQboStatus();
        if (!cancel) setStatus(s);
      } catch {
        if (!cancel) setStatus(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    void load();
    return () => {
      cancel = true;
    };
  }, []);

  const startUrl = getQboOAuthStartUrl();
  const serverConnected = Boolean(status?.connected);
  const hint = readQboConnectedHint();
  const connected = serverConnected || hint;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Integraciones</h2>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between p-4 border border-border rounded-lg">
            <div className="space-y-1">
              <h3 className="font-medium">QuickBooks Online</h3>
              <p className="text-sm text-muted-foreground">
                Conecta la compañía de QuickBooks para sincronizar datos. Necesitas Supabase configurado y
                las Edge Functions desplegadas con los secretos QBO.
              </p>
              {connected && status?.realm_id && (
                <p className="text-xs text-muted-foreground font-mono">Realm ID: {status.realm_id}</p>
              )}
              {connected && status?.access_expires_at && (
                <p className="text-xs text-muted-foreground">
                  Access token (aprox.) hasta:{' '}
                  {new Date(status.access_expires_at).toLocaleString(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end shrink-0">
              {loading ? (
                <span className="text-sm text-muted-foreground">Comprobando…</span>
              ) : (
                <span
                  className={
                    connected
                      ? 'text-sm bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-center'
                      : 'text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full text-center'
                  }
                >
                  {connected ? 'Conectado' : 'No conectado'}
                </span>
              )}
              {!isSupabaseConfigured() ? (
                <span className="text-xs text-muted-foreground max-w-[220px] text-right">
                  Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
                </span>
              ) : !startUrl ? (
                <span className="text-xs text-muted-foreground max-w-[220px] text-right">
                  No se pudo armar la URL de OAuth.
                </span>
              ) : (
                <Button asChild variant="default" className="gap-2">
                  <a href={startUrl} rel="noopener noreferrer">
                    Conectar QuickBooks
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {hint && !serverConnected && !loading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    setQboConnectedHint(false);
                    toast.message('Indicador local borrado; el servidor sigue sin tokens hasta conectar.');
                  }}
                >
                  Quitar aviso local
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Roles y Usuarios</h2>
        <p className="text-sm text-muted-foreground">
          Módulo preparado para administración de usuarios con roles: Admin, Operador, Consulta.
        </p>
      </div>
    </div>
  );
}
