import { useEffect, useState, useMemo, MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Plus, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { useApp } from '@/context/AppContext';
import { Usuario, ROLES_USUARIO } from '@/data/mockData';
import { cn } from '@/lib/utils';
import {
  fetchQboStatus,
  getQboOAuthStartUrl,
  readQboConnectedHint,
  setQboConnectedHint,
  type QboStatus,
} from '@/lib/qboIntegration';

const ROL_COLORS: Record<string, string> = {
  'Socio':                    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'Abogada':                  'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'Asistente Legal':          'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Asistente Administrativo': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'Contabilidad':             'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Soporte':                  'bg-muted text-muted-foreground',
};

export default function ConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<QboStatus | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Usuarios ─────────────────────────────────────────────────── */
  const { usuarios, saveUsuario, deleteUsuario } = useApp();
  const [userSearch, setUserSearch] = useState('');
  const [editUser, setEditUser] = useState<Usuario | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState<Partial<Usuario>>({});
  const [deleteUserTarget, setDeleteUserTarget] = useState<Usuario | null>(null);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(u =>
      u.nombre.toLowerCase().includes(q) ||
      u.correo.toLowerCase().includes(q) ||
      (u.rol ?? '').toLowerCase().includes(q),
    );
  }, [usuarios, userSearch]);

  const sortedUsers = useMemo(
    () => [...filteredUsers].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filteredUsers],
  );

  const openNewUser = () => {
    setUserForm({ activo: true, nombre: '', correo: '', rol: undefined });
    setEditUser(null);
    setShowUserForm(true);
  };

  const openEditUser = (u: Usuario) => { setUserForm({ ...u }); setEditUser(u); setShowUserForm(true); };

  const handleUserRowClick = (u: Usuario, e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openEditUser(u);
  };

  const handleUserSave = async () => {
    if (!userForm.nombre?.trim()) { toast.error('Nombre es obligatorio'); return; }
    if (!userForm.correo?.trim()) { toast.error('Correo es obligatorio'); return; }
    const row: Usuario = editUser
      ? { ...editUser, nombre: userForm.nombre.trim(), correo: userForm.correo.trim(), rol: userForm.rol || undefined, puesto: userForm.puesto?.trim() || undefined, correo_microsoft: userForm.correo_microsoft?.trim() || undefined, activo: userForm.activo ?? true }
      : { id: crypto.randomUUID(), nombre: userForm.nombre.trim(), correo: userForm.correo.trim(), rol: userForm.rol || undefined, puesto: userForm.puesto?.trim() || undefined, correo_microsoft: userForm.correo_microsoft?.trim() || undefined, activo: userForm.activo ?? true };
    const ok = await saveUsuario(row, !!editUser);
    if (!ok) return;
    toast.success(editUser ? 'Usuario actualizado' : 'Usuario creado');
    setShowUserForm(false);
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    const id = deleteUserTarget.id;
    setDeleteUserTarget(null);
    const ok = await deleteUsuario(id);
    if (ok) toast.success('Usuario eliminado');
  };

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
      {/* ── Usuarios ────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Usuarios</h2>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuario…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="pl-9 h-9 w-52 rounded-lg bg-background border-border"
              />
            </div>
            <Button size="sm" onClick={openNewUser} className="gap-1">
              <Plus className="h-4 w-4" />
              Agregar usuario
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre Usuario</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Correo</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[160px]">Rol</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Correo Microsoft</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[88px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedUsers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Sin usuarios</td></tr>
              )}
              {sortedUsers.map(u => (
                <tr key={u.id} className="hover:bg-muted/30 cursor-pointer" onClick={e => handleUserRowClick(u, e)}>
                  <td className="w-1 p-0 bg-muted-foreground/20" aria-hidden />
                  <td className="px-4 py-3 font-medium text-foreground">{u.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{u.correo}</td>
                  <td className="px-4 py-3">
                    {u.rol ? (
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', ROL_COLORS[u.rol] ?? 'bg-muted text-muted-foreground')}>
                        {u.rol}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono truncate max-w-[220px]" title={u.correo_microsoft}>{u.correo_microsoft ?? '—'}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteUserTarget(u)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Formulario Usuario ───────────────────────────────────────── */}
      <Dialog open={showUserForm} onOpenChange={setShowUserForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editUser ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nombre *</Label>
                <Input value={userForm.nombre ?? ''} onChange={e => setUserForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. María Isabel Palma" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Correo *</Label>
                <Input type="email" value={userForm.correo ?? ''} onChange={e => setUserForm(f => ({ ...f, correo: e.target.value }))} placeholder="usuario@ancori.com" className="mt-1.5" />
              </div>
              <div>
                <Label>Rol</Label>
                <select
                  value={userForm.rol ?? ''}
                  onChange={e => setUserForm(f => ({ ...f, rol: e.target.value || undefined }))}
                  className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Sin rol</option>
                  {ROLES_USUARIO.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <Label>Puesto</Label>
                <Input value={userForm.puesto ?? ''} onChange={e => setUserForm(f => ({ ...f, puesto: e.target.value }))} placeholder="Opcional" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Correo Microsoft</Label>
                <Input type="email" value={userForm.correo_microsoft ?? ''} onChange={e => setUserForm(f => ({ ...f, correo_microsoft: e.target.value }))} placeholder="usuario@Ancoriyasociados.onmicrosoft.com" className="mt-1.5" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={userForm.activo ?? true} onCheckedChange={v => setUserForm(f => ({ ...f, activo: v }))} />
              <Label>Activo</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowUserForm(false)}>Cancelar</Button>
            <Button type="button" onClick={handleUserSave}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUserTarget} onOpenChange={open => !open && setDeleteUserTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará «{deleteUserTarget?.nombre}». Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDeleteUser}>Eliminar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
