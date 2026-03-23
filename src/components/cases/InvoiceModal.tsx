import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/context/AppContext';
import { Case, InvoiceLine } from '@/data/mockData';
import { Plus, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';

interface InvoiceModalProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
}

export function InvoiceModal({ caseData, open, onClose }: InvoiceModalProps) {
  const { clients, societies, services, invoiceTerms, qbItems, getClientName, getSocietyName } = useApp();
  const [billToSociety, setBillToSociety] = useState(false);
  const [termId, setTermId] = useState('');
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().split('T')[0]);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  useEffect(() => {
    if (caseData) {
      setBillToSociety(!!caseData.society_id);
      setLines([{
        id: crypto.randomUUID(),
        servicio_id: caseData.service_id,
        descripcion: services.find(s => s.id === caseData.service_id)?.nombre || '',
        cantidad: 1,
        tarifa: services.find(s => s.id === caseData.service_id)?.tarifa_base || 0,
        importe: 0,
        itbms: 7,
      }]);
    }
  }, [caseData]);

  useEffect(() => {
    if (termId && fechaFactura) {
      const term = invoiceTerms.find(t => t.id === termId);
      if (term) {
        const d = new Date(fechaFactura);
        d.setDate(d.getDate() + term.dias_vencimiento);
        setFechaVencimiento(d.toISOString().split('T')[0]);
      }
    }
  }, [termId, fechaFactura]);

  if (!caseData) return null;

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      updated.importe = Number(updated.cantidad) * Number(updated.tarifa);
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, { id: crypto.randomUUID(), descripcion: '', cantidad: 1, tarifa: 0, importe: 0, itbms: 7 }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.importe, 0);
  const totalItbms = lines.reduce((s, l) => s + (l.importe * l.itbms / 100), 0);
  const total = subtotal + totalItbms;

  const handleSend = () => {
    toast.success('Factura preparada. Integración con QuickBooks pendiente de configuración.');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[950px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Factura — Caso #{caseData.numero_caso}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-2">
          <div>
            <Label>Cliente</Label>
            <Input value={getClientName(caseData.client_id)} readOnly className="bg-muted" />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={billToSociety} onCheckedChange={setBillToSociety} />
              <Label className="text-xs">Facturar a Sociedad</Label>
            </div>
          </div>
          <div>
            <Label>Facturar A</Label>
            <Input value={billToSociety ? getSocietyName(caseData.society_id) : getClientName(caseData.client_id)} readOnly className="bg-muted" />
          </div>
          <div>
            <Label>Términos</Label>
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {invoiceTerms.filter(t => t.activo).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fecha Factura</Label>
            <Input type="date" value={fechaFactura} onChange={e => setFechaFactura(e.target.value)} />
          </div>
          <div>
            <Label>Fecha Vencimiento</Label>
            <Input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium">Producto/Servicio</th>
                <th className="text-left py-2 px-2 font-medium">Prod/Serv QB</th>
                <th className="text-left py-2 px-2 font-medium">Descripción</th>
                <th className="text-right py-2 px-2 font-medium w-20">Cant.</th>
                <th className="text-right py-2 px-2 font-medium w-24">Tarifa</th>
                <th className="text-right py-2 px-2 font-medium w-24">Importe</th>
                <th className="text-right py-2 px-2 font-medium w-20">ITBMS %</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-1 px-2">
                    <Select value={l.servicio_id || ''} onValueChange={v => updateLine(i, 'servicio_id', v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Servicio" /></SelectTrigger>
                      <SelectContent>
                        {services.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 px-2">
                    <Select value={l.qb_item_id || ''} onValueChange={v => updateLine(i, 'qb_item_id', v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="QB Item" /></SelectTrigger>
                      <SelectContent>
                        {qbItems.filter(q => q.activo).map(q => <SelectItem key={q.id} value={q.id}>{q.nombre_qb}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 px-2"><Input value={l.descripcion} onChange={e => updateLine(i, 'descripcion', e.target.value)} className="h-8" /></td>
                  <td className="py-1 px-2"><Input type="number" value={l.cantidad} onChange={e => updateLine(i, 'cantidad', Number(e.target.value))} className="h-8 text-right" /></td>
                  <td className="py-1 px-2"><Input type="number" step="0.01" value={l.tarifa} onChange={e => updateLine(i, 'tarifa', Number(e.target.value))} className="h-8 text-right" /></td>
                  <td className="py-1 px-2 text-right font-medium">${l.importe.toFixed(2)}</td>
                  <td className="py-1 px-2"><Input type="number" value={l.itbms} onChange={e => updateLine(i, 'itbms', Number(e.target.value))} className="h-8 text-right" /></td>
                  <td className="py-1 px-2"><Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" onClick={addLine} className="mt-2 gap-1"><Plus className="h-3 w-3" /> Agregar línea</Button>

        <div className="flex justify-between items-end mt-4 pt-4 border-t border-border">
          <div className="space-y-1 text-sm text-right ml-auto mr-8">
            <p>Subtotal: <span className="font-bold">${subtotal.toFixed(2)}</span></p>
            <p>ITBMS: <span className="font-bold">${totalItbms.toFixed(2)}</span></p>
            <p className="text-base">Total: <span className="font-bold">${total.toFixed(2)}</span></p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Salir</Button>
            <Button onClick={handleSend} className="gap-1"><Send className="h-4 w-4" /> Enviar a QB</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
