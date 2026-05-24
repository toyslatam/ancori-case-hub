import { useState, useMemo, MouseEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApp } from '@/context/AppContext';
import { Usuario, ROLES_USUARIO, APP_MODULES, MODULE_LABELS, type AppModule } from '@/data/mockData';
import { usePermissions } from '@/hooks/usePermissions';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const ROL_COLORS: Record<string, string> = {
  'Socio':                    'bg-rose-100 text-rose-700',
  'Abogada':                  'bg-pink-100 text-pink-700',
  'Asistente Legal':          'bg-blue-100 text-blue-700',
  'Asistente Administrativo': 'bg-violet-100 text-violet-700',
  'Contabilidad':             'bg-emerald-100 text-emerald-700',
  'Soporte':                  'bg-muted text-muted-foreground',
};

export default function UsersPage() {
  const { usuarios, saveUsuario, deleteUsuario } = useApp();
  const { isSuperAdmin } = usePermissions();

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

  const isModuleChecked = (mod: AppModule): boolean => {
    const p = userForm.permisos ?? null;
    return p === null ? true : p.includes(mod);
  };

  const handleToggleModule = (mod: AppModule) => {
    setUserForm(f => {
      const current = f.permisos ?? null;
      const effectiveList: AppModule[] = current === null ? [...APP_MODULES] : [...current];
      const next = effectiveList.includes(mod)
        ? effectiveList.filter(m => m !== mod)
        : [...effectiveList, mod];
      return { ...f, permisos: next.length === APP_MODULES.length ? null : (next as AppModule[]) };
    });
  };

  const openNewUser = () => {
    setUserForm({ activo: true, nombre: '', correo: '', rol: undefined, permisos: null });
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
    const permisos = userForm.permisos ?? null;
    const row: Usuario = editUser
      ? { ...editUser, nombre: userForm.nombre.trim(), correo: userForm.correo.trim(), rol: userForm.rol || undefined, puesto: userForm.puesto?.trim() || undefined, correo_microsoft: userForm.correo_microsoft?.trim() || undefined, activo: userForm.activo ?? true, permisos }
      : { id: crypto.randomUUID(), nombre: userForm.nombre.trim(), correo: userForm.correo.trim(), rol: userForm.rol || undefined, puesto: userForm.puesto?.trim() || undefined, correo_microsoft: userForm.correo_microsoft?.trim() || undefined, activo: userForm.activo ?? true, permisos };
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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Usuarios</h1>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Gestiona los usuarios y sus permisos de acceso.</p>
          </div>
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
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Correo</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[160px]">Rol</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Correo Microsoft</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Módulos</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[88px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedUsers.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Sin usuarios</td></tr>
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
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.permisos === null || u.permisos === undefined
                      ? <span className="text-emerald-600 font-medium">Acceso completo</span>
                      : u.permisos.length === 0
                        ? <span className="text-destructive">Sin acceso</span>
                        : <span>{u.permisos.map(m => MODULE_LABELS[m]).join(', ')}</span>
                    }
                  </td>
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
        <DialogContent className="sm:max-w-[540px]">
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
            {isSuperAdmin && (
              <div>
                <Label className="mb-2 block">Acceso a módulos</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 bg-muted/30">
                  {APP_MODULES.map(mod => (
                    <label key={mod} className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={isModuleChecked(mod)}
                        onCheckedChange={() => handleToggleModule(mod)}
                      />
                      <span className="text-sm">{MODULE_LABELS[mod]}</span>
                    </label>
                  ))}
                </div>
                {(userForm.permisos === null || userForm.permisos === undefined) && (
                  <p className="text-xs text-muted-foreground mt-1">Acceso completo a todos los módulos.</p>
                )}
              </div>
            )}
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
