import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, ArrowLeft, ArrowRight, X, GitCompare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchPendingConflicts,
  resolveConflict,
  dismissConflict,
  getFieldLabel,
  type SyncConflict,
} from '@/lib/conciliacionApi';

// Roles autorizados para resolver conflictos
const ALLOWED_ROLES = ['abogada', 'contabilidad', 'socio', 'admin', 'administrador'];

function canResolve(rol?: string): boolean {
  if (!rol) return false;
  return ALLOWED_ROLES.includes(rol.toLowerCase());
}

export default function ConciliacionPage() {
  const { societies } = useApp();
  const { user } = useAuth();

  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    conflictId: string;
    resolution: 'supabase' | 'quickbooks' | 'dismiss';
    fieldLabel: string;
  } | null>(null);

  const userCanResolve = canResolve(user?.rol);

  // Helper: nombre de sociedad por ID
  const getSocietyName = (id: string) => {
    const s = societies.find((soc) => soc.id === id);
    return s?.nombre ?? s?.razon_social ?? id.slice(0, 8);
  };

  // Carga inicial
  useEffect(() => {
    loadConflicts();
  }, []);

  async function loadConflicts() {
    setLoading(true);
    const data = await fetchPendingConflicts();
    setConflicts(data);
    setLoading(false);
  }

  // Filtrar por búsqueda
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return conflicts;
    return conflicts.filter((c) => {
      const socName = getSocietyName(c.society_id).toLowerCase();
      const fieldLabel = getFieldLabel(c.field_name).toLowerCase();
      const sbVal = (c.supabase_value ?? '').toLowerCase();
      const qbVal = (c.quickbooks_value ?? '').toLowerCase();
      return socName.includes(q) || fieldLabel.includes(q) || sbVal.includes(q) || qbVal.includes(q);
    });
  }, [conflicts, search, societies]);

  // Ejecutar acción
  async function handleAction() {
    if (!confirmAction || !user) return;
    setResolving(confirmAction.conflictId);

    if (confirmAction.resolution === 'dismiss') {
      const ok = await dismissConflict(confirmAction.conflictId);
      if (ok) {
        toast.success('Conflicto descartado');
        setConflicts((prev) => prev.filter((c) => c.id !== confirmAction.conflictId));
      } else {
        toast.error('Error al descartar');
      }
    } else {
      const result = await resolveConflict(
        confirmAction.conflictId,
        confirmAction.resolution,
        user.id,
      );
      if (result.ok) {
        const label = confirmAction.resolution === 'supabase' ? 'Ancori' : 'QuickBooks';
        toast.success(`Resuelto: prevalece ${label}`);
        setConflicts((prev) => prev.filter((c) => c.id !== confirmAction.conflictId));
      } else {
        toast.error(result.error ?? 'Error al resolver');
      }
    }

    setResolving(null);
    setConfirmAction(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitCompare className="h-6 w-6 text-orange-500" />
            Conciliacion
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Diferencias detectadas entre Plataforma Ancori y QuickBooks.
            {conflicts.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {conflicts.length} pendiente{conflicts.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadConflicts} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Actualizar
        </Button>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por sociedad, campo o valor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Aviso de rol */}
      {!userCanResolve && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Solo los roles autorizados (Abogada, Contabilidad, Socio) pueden resolver conflictos.
          Tu rol actual: <strong>{user?.rol ?? 'no asignado'}</strong>.
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GitCompare className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Sin conflictos pendientes</p>
          <p className="text-sm mt-1">Los datos entre Ancori y QuickBooks estan sincronizados.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-3 font-medium">Sociedad</th>
                <th className="text-left px-4 py-3 font-medium">Campo</th>
                <th className="text-left px-4 py-3 font-medium">
                  <span className="text-orange-600">Valor Ancori</span>
                </th>
                <th className="text-left px-4 py-3 font-medium">
                  <span className="text-blue-600">Valor QuickBooks</span>
                </th>
                {userCanResolve && (
                  <th className="text-center px-4 py-3 font-medium">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{getSocietyName(c.society_id)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{getFieldLabel(c.field_name)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-orange-700 bg-orange-50 px-2 py-0.5 rounded text-xs font-mono">
                      {c.supabase_value || '(vacio)'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs font-mono">
                      {c.quickbooks_value || '(vacio)'}
                    </span>
                  </td>
                  {userCanResolve && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-orange-600 border-orange-200 hover:bg-orange-50 text-xs"
                          disabled={resolving === c.id}
                          onClick={() =>
                            setConfirmAction({
                              conflictId: c.id,
                              resolution: 'supabase',
                              fieldLabel: getFieldLabel(c.field_name),
                            })
                          }
                          title="Usar valor de Ancori"
                        >
                          <ArrowRight className="h-3 w-3 mr-1" />
                          Ancori
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
                          disabled={resolving === c.id}
                          onClick={() =>
                            setConfirmAction({
                              conflictId: c.id,
                              resolution: 'quickbooks',
                              fieldLabel: getFieldLabel(c.field_name),
                            })
                          }
                          title="Usar valor de QuickBooks"
                        >
                          <ArrowLeft className="h-3 w-3 mr-1" />
                          QB
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground text-xs"
                          disabled={resolving === c.id}
                          onClick={() =>
                            setConfirmAction({
                              conflictId: c.id,
                              resolution: 'dismiss',
                              fieldLabel: getFieldLabel(c.field_name),
                            })
                          }
                          title="Descartar"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Diálogo de confirmación */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.resolution === 'dismiss'
                ? 'Descartar conflicto'
                : `Resolver: ${confirmAction?.fieldLabel}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.resolution === 'dismiss' ? (
                'Este conflicto se marcara como descartado. Puede volver a aparecer en la proxima sincronizacion si los valores siguen siendo diferentes.'
              ) : confirmAction?.resolution === 'supabase' ? (
                'El valor de Plataforma Ancori se enviara a QuickBooks, reemplazando el valor actual en QB.'
              ) : (
                'El valor de QuickBooks se escribira en Plataforma Ancori, reemplazando el valor actual en la base de datos.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              onClick={handleAction}
              disabled={resolving !== null}
              variant={confirmAction?.resolution === 'dismiss' ? 'outline' : 'default'}
            >
              {resolving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {confirmAction?.resolution === 'dismiss'
                ? 'Descartar'
                : confirmAction?.resolution === 'supabase'
                  ? 'Usar Ancori'
                  : 'Usar QuickBooks'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
