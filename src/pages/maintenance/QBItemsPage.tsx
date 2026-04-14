import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { QBItem } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Search, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const QBO_CRON_SECRET = import.meta.env.VITE_QBO_CRON_SECRET as string;

export default function QBItemsPage() {
  const { qbItems, saveQBItem, deleteQBItem } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<QBItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<QBItem>>({});
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!QBO_CRON_SECRET) { toast.error('VITE_QBO_CRON_SECRET no configurado'); return; }
    setSyncing(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/qbo-sync-qbitems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-qbo-cron-secret': QBO_CRON_SECRET },
      });
      const data = await res.json() as { ok?: boolean; inserted?: number; updated?: number; skipped?: number; total_qbo?: number; error?: string; detail?: string };
      if (!res.ok || !data.ok) {
        toast.error(`Error: ${data.error ?? 'desconocido'} — ${data.detail ?? ''}`);
        return;
      }
      toast.success(`Sincronizado: ${data.inserted} nuevos, ${data.updated} actualizados de ${data.total_qbo} items QB`);
      // Reload after short delay so AppContext re-fetches
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(`Error de red: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const openNew = () => { setForm({ activo: true }); setEditItem(null); setShowForm(true); };
  const openEdit = (q: QBItem) => { setForm({ ...q }); setEditItem(q); setShowForm(true); };

  const handleSave = async () => {
    if (!form.nombre_interno || !form.nombre_qb) { toast.error('Nombres requeridos'); return; }
    const item = editItem
      ? { ...editItem, ...form } as QBItem
      : { ...form, id: crypto.randomUUID(), tipo: form.tipo || 'Servicio', activo: form.activo ?? true } as QBItem;
    const ok = await saveQBItem(item, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Item QB actualizado' : 'Item QB creado');
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar?')) return;
    const ok = await deleteQBItem(id);
    if (ok) toast.success('Eliminado');
  };

  const filtered = qbItems.filter(q => !search || q.nombre_interno.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos/Servicios QuickBooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{qbItems.length} items cargados</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
            className="gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
          >
            {syncing
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <CheckCircle2 className="h-4 w-4" />}
            {syncing ? 'Sincronizando...' : 'Sincronizar desde QB'}
          </Button>
          <Button onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> Nuevo Item QB</Button>
        </div>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card" />
      </div>
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre Interno</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre QB</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">QB Item ID</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tipo</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Impuesto %</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Activo</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(q => (
              <tr key={q.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{q.nombre_interno}</td>
                <td className="px-4 py-3">{q.nombre_qb}</td>
                <td className="px-4 py-3">{q.qb_item_id || '-'}</td>
                <td className="px-4 py-3">{q.tipo}</td>
                <td className="px-4 py-3 text-right">{q.impuesto_default ?? '-'}%</td>
                <td className="px-4 py-3 text-center">{q.activo ? '✓' : '✗'}</td>
                <td className="px-4 py-3 text-center">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(q)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editItem ? 'Editar Item QB' : 'Nuevo Item QB'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Nombre Interno *</Label><Input value={form.nombre_interno || ''} onChange={e => setForm(f => ({ ...f, nombre_interno: e.target.value }))} /></div>
              <div><Label>Nombre QB *</Label><Input value={form.nombre_qb || ''} onChange={e => setForm(f => ({ ...f, nombre_qb: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>QB Item ID</Label><Input value={form.qb_item_id || ''} onChange={e => setForm(f => ({ ...f, qb_item_id: e.target.value }))} /></div>
              <div><Label>Tipo</Label><Input value={form.tipo || ''} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} /></div>
            </div>
            <div><Label>Impuesto Default %</Label><Input type="number" value={form.impuesto_default || 0} onChange={e => setForm(f => ({ ...f, impuesto_default: Number(e.target.value) }))} /></div>
            <div className="flex items-center gap-3"><Switch checked={form.activo ?? true} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} /><Label>Activo</Label></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
