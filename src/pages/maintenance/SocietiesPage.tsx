import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Society } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function SocietiesPage() {
  const { societies, setSocieties, clients, getClientName } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Society | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Society>>({});

  const openNew = () => { setForm({ activo: true }); setEditItem(null); setShowForm(true); };
  const openEdit = (s: Society) => { setForm({ ...s }); setEditItem(s); setShowForm(true); };

  const handleSave = () => {
    if (!form.nombre || !form.client_id) { toast.error('Nombre y cliente requeridos'); return; }
    if (editItem) {
      setSocieties(prev => prev.map(s => s.id === editItem.id ? { ...editItem, ...form } as Society : s));
      toast.success('Sociedad actualizada');
    } else {
      setSocieties(prev => [...prev, { ...form, id: crypto.randomUUID(), created_at: new Date().toISOString() } as Society]);
      toast.success('Sociedad creada');
    }
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar esta sociedad?')) {
      setSocieties(prev => prev.filter(s => s.id !== id));
      toast.success('Sociedad eliminada');
    }
  };

  const filtered = societies.filter(s => !search || s.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sociedades</h1>
        <Button onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> Nueva Sociedad</Button>
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
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Cliente</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tipo</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Correo</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Activo</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{s.nombre}</td>
                <td className="px-4 py-3">{getClientName(s.client_id)}</td>
                <td className="px-4 py-3">{s.tipo_sociedad}</td>
                <td className="px-4 py-3">{s.correo}</td>
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
          <DialogHeader><DialogTitle>{editItem ? 'Editar Sociedad' : 'Nueva Sociedad'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nombre Sociedad *</Label><Input value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div>
              <Label>Cliente *</Label>
              <Select value={form.client_id || ''} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tipo Sociedad</Label><Input value={form.tipo_sociedad || ''} onChange={e => setForm(f => ({ ...f, tipo_sociedad: e.target.value }))} /></div>
              <div><Label>Correo</Label><Input value={form.correo || ''} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Teléfono</Label><Input value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
              <div><Label>QB Customer ID</Label><Input value={form.quickbooks_customer_id || ''} onChange={e => setForm(f => ({ ...f, quickbooks_customer_id: e.target.value }))} /></div>
            </div>
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
