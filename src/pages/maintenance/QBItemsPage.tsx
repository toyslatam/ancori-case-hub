import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { QBItem } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function QBItemsPage() {
  const { qbItems, setQbItems } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<QBItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<QBItem>>({});

  const openNew = () => { setForm({ activo: true }); setEditItem(null); setShowForm(true); };
  const openEdit = (q: QBItem) => { setForm({ ...q }); setEditItem(q); setShowForm(true); };

  const handleSave = () => {
    if (!form.nombre_interno || !form.nombre_qb) { toast.error('Nombres requeridos'); return; }
    if (editItem) {
      setQbItems(prev => prev.map(q => q.id === editItem.id ? { ...editItem, ...form } as QBItem : q));
      toast.success('Item QB actualizado');
    } else {
      setQbItems(prev => [...prev, { ...form, id: crypto.randomUUID() } as QBItem]);
      toast.success('Item QB creado');
    }
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar?')) { setQbItems(prev => prev.filter(q => q.id !== id)); toast.success('Eliminado'); }
  };

  const filtered = qbItems.filter(q => !search || q.nombre_interno.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos/Servicios QuickBooks</h1>
        <Button onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> Nuevo Item QB</Button>
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
