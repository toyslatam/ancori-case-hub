import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApp } from '@/context/AppContext';
import { Case, CaseExpense } from '@/data/mockData';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExpensesModalProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
}

export function ExpensesModal({ caseData, open, onClose }: ExpensesModalProps) {
  const { updateExpenses, getClientName, getSocietyName, getServiceName } = useApp();
  const [expenses, setExpenses] = useState<CaseExpense[]>([]);

  useEffect(() => {
    if (caseData) setExpenses([...caseData.expenses]);
  }, [caseData]);

  if (!caseData) return null;

  const gastosActuales = expenses.reduce((sum, e) => sum + e.total, 0);
  const gastoRestante = caseData.gastos_cotizados - gastosActuales;

  const addLine = () => {
    setExpenses(prev => [...prev, {
      id: crypto.randomUUID(), case_id: caseData.id,
      descripcion: '', cantidad: 1, importe: 0, total: 0,
      fecha: new Date().toISOString().split('T')[0],
    }]);
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setExpenses(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, [field]: value };
      if (field === 'cantidad' || field === 'importe') {
        updated.total = Number(updated.cantidad) * Number(updated.importe);
      }
      return updated;
    }));
  };

  const removeLine = (idx: number) => setExpenses(prev => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    updateExpenses(caseData.id, expenses);
    toast.success('Gastos actualizados');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gastos — Caso #{caseData.numero_caso}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-4 space-y-1">
          <p>Cliente: {getClientName(caseData.client_id)} | Sociedad: {getSocietyName(caseData.society_id)} | Servicio: {getServiceName(caseData.service_id)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium">Descripción</th>
                <th className="text-right py-2 px-2 font-medium w-20">Cantidad</th>
                <th className="text-right py-2 px-2 font-medium w-24">Importe</th>
                <th className="text-right py-2 px-2 font-medium w-24">Total</th>
                <th className="text-left py-2 px-2 font-medium w-28">Fecha</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, i) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="py-1 px-2"><Input value={e.descripcion} onChange={ev => updateLine(i, 'descripcion', ev.target.value)} className="h-8" /></td>
                  <td className="py-1 px-2"><Input type="number" value={e.cantidad} onChange={ev => updateLine(i, 'cantidad', Number(ev.target.value))} className="h-8 text-right" /></td>
                  <td className="py-1 px-2"><Input type="number" step="0.01" value={e.importe} onChange={ev => updateLine(i, 'importe', Number(ev.target.value))} className="h-8 text-right" /></td>
                  <td className="py-1 px-2 text-right font-medium">${e.total.toFixed(2)}</td>
                  <td className="py-1 px-2"><Input type="date" value={e.fecha} onChange={ev => updateLine(i, 'fecha', ev.target.value)} className="h-8" /></td>
                  <td className="py-1 px-2">
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" onClick={addLine} className="mt-2 gap-1"><Plus className="h-3 w-3" /> Agregar línea</Button>
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
          <div className="space-y-1 text-sm">
            <p>Gastos Actuales: <span className="font-bold">${gastosActuales.toFixed(2)}</span></p>
            <p>Gastos Cotizados: <span className="font-bold">${caseData.gastos_cotizados.toFixed(2)}</span></p>
            <p>Saldo Restante: <span className={cn("font-bold", gastoRestante >= 0 ? "text-success" : "text-destructive")}>${gastoRestante.toFixed(2)}</span></p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Salir</Button>
            <Button onClick={handleSave}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
