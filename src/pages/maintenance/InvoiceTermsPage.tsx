import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { InvoiceTerm } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function InvoiceTermsPage() {
  const { invoiceTerms, saveInvoiceTerm, deleteInvoiceTerm } = useApp();
  const [editItem, setEditItem] = useState<InvoiceTerm | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<InvoiceTerm>>({});
  const [deleteTarget, setDeleteTarget] = useState<InvoiceTerm | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openNew = () => { setForm({ activo: true }); setEditItem(null); setShowForm(true); };
  const openEdit = (t: InvoiceTerm) => { setForm({ ...t }); setEditItem(t); setShowForm(true); };

  const handleSave = async () => {
    if (!form.nombre) { toast.error('Nombre requerido'); return; }
    const term = editItem
      ? { ...editItem, ...form } as InvoiceTerm
      : { ...form, id: crypto.randomUUID() } as InvoiceTerm;
    const ok = await saveInvoiceTerm(term, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Término actualizado' : 'Término creado');
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const ok = await deleteInvoiceTerm(deleteTarget.id);
      if (ok) {
        toast.success('Término eliminado');
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Términos de Factura</h1>
        <Button onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> Nuevo Término</Button>
      </div>
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Días Vencimiento</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Activo</th>
              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoiceTerms.map(t => (
              <tr key={t.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{t.nombre}</td>
                <td className="px-4 py-3 text-right">{t.dias_vencimiento}</td>
                <td className="px-4 py-3 text-center">{t.activo ? '✓' : '✗'}</td>
                <td className="px-4 py-3 text-center">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>{editItem ? 'Editar Término' : 'Nuevo Término'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nombre *</Label><Input value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div><Label>Días Vencimiento</Label><Input type="number" value={form.dias_vencimiento || 0} onChange={e => setForm(f => ({ ...f, dias_vencimiento: Number(e.target.value) }))} /></div>
            <div className="flex items-center gap-3"><Switch checked={form.activo ?? true} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} /><Label>Activo</Label></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar término de factura?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Esta acción eliminará el término <strong>{deleteTarget?.nombre}</strong> del mantenimiento.
              </span>
              <span className="block text-amber-700">
                Si está siendo usado por facturas existentes, la base de datos puede impedir el borrado.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
