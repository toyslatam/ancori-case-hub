import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export type QboEstimate = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  CustomerRef?: { name?: string; value?: string };
  CustomerMemo?: { value?: string };
  Line?: Array<{
    Id?: string;
    Description?: string;
    Amount?: number;
    DetailType?: string;
    SalesItemLineDetail?: { ItemRef?: { name?: string }; UnitPrice?: number; Qty?: number };
  }>;
  TxnTaxDetail?: { TotalTax?: number };
  TotalAmt?: number;
  BillEmail?: { Address?: string };
  ShipAddr?: { Line1?: string };
  BillAddr?: { Line1?: string };
};

interface CotizacionDocProps {
  estimate: QboEstimate;
}

function fmtMoney(n?: number) {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y}-${m}-${d}`;
}

export function CotizacionDoc({ estimate }: CotizacionDocProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const lines = (estimate.Line ?? []).filter(
    l => l.DetailType === 'SalesItemLineDetail' && (l.Amount ?? 0) > 0,
  );
  const totalTax  = estimate.TxnTaxDetail?.TotalTax ?? 0;
  const totalAmt  = estimate.TotalAmt ?? 0;
  const subtotal  = totalAmt - totalTax;
  const clientName = estimate.CustomerRef?.name ?? '';
  const proformaNo = estimate.DocNumber ?? estimate.Id;
  const memo = estimate.CustomerMemo?.value ?? '';

  function handlePrint() {
    const content = printRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"/>
<title>Cotización ${proformaNo}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 30px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .logo { font-size: 22px; font-weight: bold; color: #e07b00; letter-spacing: 1px; }
  .firm-info { font-size: 10px; color: #555; text-align: right; line-height: 1.6; }
  .title-row { font-size: 9px; color: #888; text-align: right; }
  .boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .box { border: 1px solid #ccc; padding: 10px 14px; min-height: 70px; }
  .box-label { font-size: 9px; color: #888; margin-bottom: 4px; }
  .box-value { font-size: 11px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #555; color: white; }
  th { padding: 6px 10px; text-align: left; font-size: 10px; font-weight: bold; text-transform: uppercase; }
  td { padding: 5px 10px; font-size: 11px; border-bottom: 1px solid #eee; }
  td.amount { text-align: right; white-space: nowrap; }
  .totals { float: right; width: 220px; }
  .totals table { margin: 0; }
  .totals td { border: none; padding: 3px 8px; }
  .totals td:last-child { text-align: right; font-weight: bold; }
  .total-row td { border-top: 2px solid #333; font-size: 12px; font-weight: bold; }
  .footer { clear: both; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 9px; color: #555; line-height: 1.7; font-style: italic; font-weight: bold; }
  .memo { font-size: 10px; color: #333; margin-bottom: 8px; font-weight: bold; }
  @media print { body { padding: 15px; } }
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

      <div ref={printRef} className="bg-white p-6 rounded-lg border border-border text-sm font-sans">
        {/* Header */}
        <div className="header flex justify-between items-start mb-5">
          <div>
            <div className="logo text-2xl font-bold text-orange-600 tracking-wide">ANCORI</div>
            <div style={{ fontSize: '9px', color: '#555', lineHeight: '1.6' }}>
              ANGEL, COHEN, RICHA & ASOCIADOS<br />
              R.U.C.98406-1-16360 D.V.74<br />
              Av. Samuel Lewis, calle 55 Obarrio Edificio Torre<br />
              SL-55 Piso18 · 0816 06739
            </div>
          </div>
          <div className="text-right" style={{ fontSize: '9px', color: '#888' }}>
            <div>www.ancori.com · @Ancoriabogados</div>
            <div>☎ 264-5074 · ancori@ancori.com</div>
          </div>
        </div>

        <hr className="border-gray-300 mb-5" />

        {/* Info boxes */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="border border-gray-300 p-3">
            <div style={{ fontSize: '9px', color: '#888' }}>Cliente:</div>
            <div className="font-semibold">{clientName}</div>
            {memo && <div className="mt-1 text-xs text-gray-600">{memo}</div>}
          </div>
          <div className="border border-gray-300 p-3">
            <div style={{ fontSize: '9px', color: '#888' }}>Fecha:</div>
            <div className="font-semibold">{fmtDate(estimate.TxnDate)}</div>
            <div className="mt-2" style={{ fontSize: '9px', color: '#888' }}>Proforma No.:</div>
            <div className="font-semibold">{proformaNo}</div>
          </div>
        </div>

        {/* Lines table */}
        <table className="w-full text-sm mb-5" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#555', color: 'white' }}>
              <th className="text-left px-3 py-2" style={{ fontSize: '10px', textTransform: 'uppercase' }}>Descripción</th>
              <th className="text-right px-3 py-2" style={{ fontSize: '10px', textTransform: 'uppercase' }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td className="px-3 py-1.5">{l.Description || l.SalesItemLineDetail?.ItemRef?.name || '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(l.Amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-5">
          <table style={{ width: '220px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td className="px-3 py-1 text-xs text-gray-600">Subtotal</td>
                <td className="px-3 py-1 text-right tabular-nums font-medium">{fmtMoney(subtotal)}</td>
              </tr>
              <tr>
                <td className="px-3 py-1 text-xs text-gray-600">ITBMS</td>
                <td className="px-3 py-1 text-right tabular-nums font-medium">{fmtMoney(totalTax)}</td>
              </tr>
              <tr style={{ borderTop: '2px solid #333' }}>
                <td className="px-3 py-1.5 font-bold">TOTAL</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-orange-600">{fmtMoney(totalAmt)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer banking info */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: '10px', fontSize: '9px', color: '#555', fontStyle: 'italic', fontWeight: 'bold', lineHeight: '1.7' }}>
          <p>Transferencia bancaria Internacional A nombre de ANGEL COHEN RICHA & ASOCIADOS</p>
          <p>DATOS BANCARIOS: CITIBANK NEW YORK, N.Y. US$ /SWIFT CITIUS33 /ABA 021000089</p>
          <p>Banco Beneficiario: BANCO GENERAL, S.A. - PANAMA</p>
          <p>SWIFT BAGEPAPA /Beneficiario ANGEL COHEN RICHA & ASOCIADOS C.C.# 03-10-01-061946-7</p>
          <p className="mt-1">TRANSFERENCIAS NACIONALES:</p>
          <p>1-BANCO GENERAL, S.A. - PANAMA Beneficiario ANGEL COHEN RICHA & ASOCIADOS C.C.# 03-10-01-061946-7</p>
          <p>2-MERCANTIL BANCO - PANAMA /Beneficiario ANGEL COHEN RICHA & ASOCIADOS C.C.# 01-202018342</p>
          <p className="mt-2">Al efectuar su pago, indicarnos el número de proforma</p>
        </div>
      </div>
    </div>
  );
}
