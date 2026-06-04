import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer, Mail } from 'lucide-react';

export type EstadoRow = {
  fecha: string;
  proforma: string;
  sociedad: string;
  detalle: string;
  monto: number;
  abono: number;
};

interface EstadoCuentaDocProps {
  clientName: string;
  tramite?: string;
  rows: EstadoRow[];
  period?: string;
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getSemester(dateStr: string): string {
  const month = parseInt(dateStr.slice(5, 7), 10);
  return month >= 1 && month <= 6 ? '1' : '2';
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}

function buildRows(rows: EstadoRow[]) {
  let saldo = 0;
  return rows.map(r => {
    saldo = saldo + r.monto - r.abono;
    return { ...r, saldo };
  });
}

function getPeriod(rows: EstadoRow[]): string {
  if (rows.length === 0) return '';
  const latest = rows.reduce((a, b) => a.fecha > b.fecha ? a : b);
  const d = new Date(latest.fecha);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

export function EstadoCuentaDoc({ clientName, tramite, rows, period }: EstadoCuentaDocProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');

  const computed = buildRows(rows);
  const total = computed.length > 0 ? computed[computed.length - 1].saldo : 0;
  const displayPeriod = period ?? getPeriod(rows);

  function handlePrint() {
    const content = printRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"/>
<title>Estado de Cuenta - ${clientName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .logo { font-size: 22px; font-weight: bold; color: #e07b00; letter-spacing: 1px; }
  .firm-right { text-align: center; font-size: 9px; color: #555; line-height: 1.7; }
  .title { text-align: center; font-size: 13px; font-weight: bold; text-transform: uppercase; border: 1px solid #333; padding: 4px; margin-bottom: 10px; letter-spacing: 1px; }
  .meta-row { display: flex; gap: 0; margin-bottom: 0; }
  .meta-cell { border: 1px solid #333; padding: 4px 8px; font-size: 10px; }
  .meta-cell strong { font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 2px; }
  thead tr { background: #2d4a6e; color: white; }
  th { padding: 5px 6px; text-align: left; font-size: 9px; font-weight: bold; text-transform: uppercase; border: 1px solid #1e3550; }
  td { padding: 5px 6px; font-size: 10px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fdf3e8; }
  td.num { text-align: right; tabular-nums; white-space: nowrap; }
  .total-row td { background: #2d4a6e !important; color: white; font-weight: bold; font-size: 11px; }
  .footer-row { margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  .prepared { font-size: 10px; }
  .prepared-name { font-weight: bold; color: #c0392b; }
  @media print { body { padding: 12px; } }
</style></head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" /> Imprimir / Descargar PDF
        </Button>
      </div>

      <div ref={printRef} className="bg-white p-5 rounded-lg border border-border text-sm font-sans">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-2xl font-bold text-orange-600 tracking-wide">ANCORI</div>
            <div className="text-xs text-gray-500">ANGEL, COHEN, RICHA & ASOCIADOS</div>
          </div>
          <div className="text-center text-xs text-gray-500 leading-relaxed">
            <div>R.U.C. 98406-1-16360- D.V. 74</div>
            <div>Avenida Samuel Lewis, Torre Optima, Piso 18</div>
            <div>administracion@ancori.com · 264-5074 / 223-1057</div>
            <div className="italic font-semibold mt-0.5">Abogados - Attorneys at Law</div>
          </div>
        </div>

        <div className="text-center font-bold uppercase border border-gray-800 py-1 mb-2 text-xs tracking-widest">
          ESTADO DE CUENTA / STATEMENT OF ACCOUNT
        </div>

        {/* Meta row */}
        <div className="flex text-xs mb-0.5">
          <div className="border border-gray-700 px-2 py-1 flex-1">
            <span className="font-bold">Cliente: </span>{clientName}
          </div>
          <div className="border border-gray-700 px-2 py-1 w-24 text-right font-bold">
            {displayPeriod}
          </div>
        </div>
        <div className="border border-gray-700 px-2 py-1 text-xs mb-3">
          <span className="font-bold">Trámite: </span>{tramite ?? 'Anualidades'}
        </div>

        {/* Table */}
        <table>
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Fecha</th>
              <th style={{ width: '90px' }}>Proforma</th>
              <th>Sociedad</th>
              <th style={{ width: '24px' }}>S</th>
              <th>Detalle</th>
              <th style={{ width: '75px', textAlign: 'right' }}>Monto</th>
              <th style={{ width: '65px', textAlign: 'right' }}>Abono</th>
              <th style={{ width: '75px', textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.fecha)}</td>
                <td>{r.proforma}</td>
                <td>{r.sociedad}</td>
                <td className="text-center">{getSemester(r.fecha)}</td>
                <td>{r.detalle}</td>
                <td className="num">{fmtMoney(r.monto)}</td>
                <td className="num">{r.abono > 0 ? fmtMoney(r.abono) : ''}</td>
                <td className="num">{fmtMoney(r.saldo)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={5} className="text-right font-bold text-xs pr-2" style={{ background: '#2d4a6e', color: 'white' }}>
                Monto Total a Cancelar
              </td>
              <td colSpan={3} className="num font-bold" style={{ background: '#2d4a6e', color: 'white' }}>
                B/.{fmtMoney(total)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Preparado por */}
        <div className="flex justify-between items-end mt-4">
          <div className="text-xs">
            <span className="font-bold">Preparado: </span>
            <span className="font-bold text-red-700">Vanessa Suarez</span>
            <br />
            <span className="italic">Secretaria Administrativa</span>
          </div>
        </div>
      </div>

      {/* Email box */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Mail className="h-4 w-4 text-orange-500" />
          Enviar estado de cuenta al cliente
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground mb-1 block">Correo electrónico</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="cliente@ejemplo.com"
              className="h-9 text-sm"
            />
          </div>
          <Button
            size="sm"
            className="self-end gap-1.5 h-9"
            disabled={!email.trim()}
            title="Próximamente"
          >
            <Mail className="h-3.5 w-3.5" />
            Enviar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">El envío por correo estará disponible próximamente.</p>
      </div>
    </div>
  );
}
