import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Service } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function ServicesPage() {
  const { services, saveService, deleteService } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Service>>({});

  const openNew = () => { setForm({ activo: true }); setEditItem(null); setShowForm(true); };
  const openEdit = (s: Service) => { setForm({ ...s }); setEditItem(s); setShowForm(true); };

  const handleSave = async () => {
    if (!form.nombre) { toast.error('Nombre requerido'); return; }
    const service = editItem
      ? { ...editItem, ...form } as Service
      : { ...form, id: crypto.randomUUID() } as Service;
    const ok = await saveService(service, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Servicio actualizado' : 'Servicio creado');
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    const ok = await deleteService(id);
    if (ok) toast.success('Servicio eliminado');
  };

  const filtered = services.filter(s => !search || s.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Procesos / Servicios</h1>
        <Button onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> Nuevo Servicio</Button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card" />
      </div>
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Categoría</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Código</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Tarifa Base</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Activo</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{s.nombre}</td>
                <td className="px-4 py-3">{s.categoria}</td>
                <td className="px-4 py-3">{s.codigo || '-'}</td>
                <td className="px-4 py-3 text-right">{s.tarifa_base ? `$${s.tarifa_base}` : '-'}</td>
                <td className="px-4 py-3 text-center">{s.activo ? '✓' : '✗'}</td>
                <td className="px-4 py-3 text-center">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editItem ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nombre *</Label><Input value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Categoría</Label><Input value={form.categoria || ''} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} /></div>
              <div><Label>Código</Label><Input value={form.codigo || ''} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} /></div>
            </div>
            <div><Label>Descripción</Label><Textarea value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={3} /></div>
            <div><Label>Tarifa Base</Label><Input type="number" step="0.01" value={form.tarifa_base || ''} onChange={e => setForm(f => ({ ...f, tarifa_base: Number(e.target.value) }))} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activo ?? true} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
              <Label>Activo</Label>
            </div>
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
