import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Client } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function ClientsPage() {
  const { clients, setClients } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<Partial<Client>>({});

  const openNew = () => { setForm({ activo: true }); setEditItem(null); setShowForm(true); };
  const openEdit = (c: Client) => { setForm({ ...c }); setEditItem(c); setShowForm(true); };

  const handleSave = () => {
    if (!form.nombre) { toast.error('Nombre requerido'); return; }
    if (editItem) {
      setClients(prev => prev.map(c => c.id === editItem.id ? { ...editItem, ...form } as Client : c));
      toast.success('Cliente actualizado');
    } else {
      setClients(prev => [...prev, { ...form, id: crypto.randomUUID(), created_at: new Date().toISOString() } as Client]);
      toast.success('Cliente creado');
    }
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este cliente?')) {
      setClients(prev => prev.filter(c => c.id !== id));
      toast.success('Cliente eliminado');
    }
  };

  const filtered = clients.filter(c => !search || c.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> Nuevo Cliente</Button>
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
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Teléfono</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Identificación</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Activo</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.nombre}</td>
                <td className="px-4 py-3">{c.email}</td>
                <td className="px-4 py-3">{c.telefono}</td>
                <td className="px-4 py-3">{c.identificacion}</td>
                <td className="px-4 py-3 text-center">{c.activo ? '✓' : '✗'}</td>
                <td className="px-4 py-3 text-center">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{editItem ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nombre *</Label><Input value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email</Label><Input value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Teléfono</Label><Input value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Identificación</Label><Input value={form.identificacion || ''} onChange={e => setForm(f => ({ ...f, identificacion: e.target.value }))} /></div>
              <div><Label>QB Customer ID</Label><Input value={form.quickbooks_customer_id || ''} onChange={e => setForm(f => ({ ...f, quickbooks_customer_id: e.target.value }))} /></div>
            </div>
            <div><Label>Dirección</Label><Input value={form.direccion || ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} /></div>
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
