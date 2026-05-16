'use client';

import React, { useRef, useState } from 'react';
import { X, Download, Printer, Loader2 } from 'lucide-react';
import { CarSale } from '@/src/types';
import { generatePdf, downloadPdfBlob } from './pdfUtils';

interface Props {
  sale: CarSale;
  onClose: () => void;
}

const fmtEur = (n: number) =>
  ` € ${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `;
const fmtEurDash = (n: number) => (n > 0 ? fmtEur(n) : ' € -   ');

const formatDate = (d: Date) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} . ${String(d.getDate()).padStart(2, '0')} . ${String(d.getFullYear()).slice(-2)}`;
};

export default function ProformInvoiceModal({ sale, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const vin = (sale.vin || '').toUpperCase();
  const invoiceNo = `BH${vin.slice(-6) || '000000'}`;
  const carPrice = Number(sale.amountPaidBank || 0);
  const shippingCost = Number(sale.transportCost || 0);
  const subTotal = carPrice + shippingCost;
  const balance = subTotal;

  const handleDownload = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const safe = `${sale.brand || 'CAR'}_${sale.model || ''}_${invoiceNo}`.replace(/[^a-zA-Z0-9._-]+/g, '_');
      const { blob, filename } = await generatePdf({
        element: ref.current,
        filename: `${safe}.pdf`,
        singlePage: true,
        editableText: false,
      });
      await downloadPdfBlob(blob, filename);
    } catch (e) {
      console.error('Invoice PDF failed', e);
      alert('Failed to generate PDF');
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    if (!ref.current) return;
    const html = ref.current.outerHTML;
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${invoiceNo}</title>
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: Arial, sans-serif; }
</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  // Cell style helpers
  const c: React.CSSProperties = {
    border: '1px solid #000',
    padding: '4px 6px',
    fontSize: '11px',
    verticalAlign: 'middle',
    fontFamily: 'Arial, sans-serif',
    color: '#000',
  };
  const bold: React.CSSProperties = { ...c, fontWeight: 700 };
  const right: React.CSSProperties = { ...c, textAlign: 'right' };
  const rightBold: React.CSSProperties = { ...c, textAlign: 'right', fontWeight: 700 };
  const center: React.CSSProperties = { ...c, textAlign: 'center' };
  const noBorder: React.CSSProperties = { ...c, border: 'none' };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-2 sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[900px] max-h-[95vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200">
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-900 truncate">Proform Invoice — {invoiceNo}</h4>
            <div className="text-xs text-slate-500 truncate">{sale.brand} {sale.model} · {sale.vin || '—'}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-slate-100 p-3 sm:p-5 flex justify-center">
          <div
            ref={ref}
            id="invoice-content"
            data-invoice-document
            style={{
              width: '210mm',
              minHeight: '297mm',
              background: '#fff',
              padding: '14mm 12mm',
              fontFamily: 'Arial, sans-serif',
              color: '#000',
              boxSizing: 'border-box',
              fontSize: '11px',
            }}
          >
            {/* HEADER BLOCK — exact layout of template */}
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <colgroup>
                <col style={{ width: '38%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td style={{ ...c, padding: '10px' }} rowSpan={2}>
                    <div style={{ fontSize: '10.5px', lineHeight: 1.45 }}>
                      Ssancar LTD. Cho Tae Shin. 499, Aam-dero,<br />
                      Yeonsu-gu, Incheon, Korea<br />
                      Phone: +82-505-366-9977<br />
                      Email: ssancar9977@gmail.com
                    </div>
                  </td>
                  <td style={{ ...center, fontSize: '20px', fontWeight: 800, letterSpacing: 1, padding: '10px' }} colSpan={3}>
                    PROFORM INVOICE
                  </td>
                </tr>
                <tr>
                  <td style={bold}>Date</td>
                  <td style={c} colSpan={2}>{formatDate(new Date())}</td>
                </tr>
                <tr>
                  <td style={noBorder}></td>
                  <td style={bold}>Invoice No.</td>
                  <td style={c} colSpan={2}>{invoiceNo}</td>
                </tr>
                <tr>
                  <td style={noBorder}></td>
                  <td style={bold}>Name</td>
                  <td style={c} colSpan={2}>RG SH.P.K.</td>
                </tr>
                <tr>
                  <td style={noBorder}></td>
                  <td style={bold}>BISINESS No.</td>
                  <td style={c} colSpan={2}>810062092</td>
                </tr>
                <tr>
                  <td style={noBorder}></td>
                  <td style={bold}>Adress</td>
                  <td style={c} colSpan={2}>DURRES PORT</td>
                </tr>
                <tr>
                  <td style={noBorder}></td>
                  <td style={bold}>Phone</td>
                  <td style={c} colSpan={2}>+38348181116</td>
                </tr>
                <tr><td style={noBorder} colSpan={4} >&nbsp;</td></tr>
                <tr>
                  <td style={noBorder}></td>
                  <td style={bold}>Dollar Rate</td>
                  <td style={center}>€ 1</td>
                  <td style={center}>$1</td>
                </tr>
              </tbody>
            </table>

            {/* BANK INFO */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6 }}>
              <tbody>
                <tr>
                  <td style={{ ...center, fontWeight: 700, background: '#f1f5f9' }} colSpan={4}>BANK ACCOUNT INFORMATION</td>
                </tr>
                <tr>
                  <td style={{ ...bold, width: '22%' }}>Beneficiary</td>
                  <td style={{ ...c, width: '28%' }}>SSANCAR LTD.</td>
                  <td style={{ ...bold, width: '22%' }}>Bank Name</td>
                  <td style={{ ...c, width: '28%' }}>SHINHAN BANK</td>
                </tr>
                <tr>
                  <td style={bold}>Swift Cose</td>
                  <td style={c}>SHBKKRSE</td>
                  <td style={bold}>Bank Adress</td>
                  <td style={c} rowSpan={2}>20,Sejong-Daero9-Gil,Jung-Gu Seoul South Korea</td>
                </tr>
                <tr>
                  <td style={bold}>Bank Account Number</td>
                  <td style={c}>180-008-400167</td>
                  <td style={bold}>Beneficiary Adress</td>
                </tr>
              </tbody>
            </table>

            {/* ITEMS TABLE — dual currency columns */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6 }}>
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={center}>Code</th>
                  <th style={center}>Brand</th>
                  <th style={center}>Model</th>
                  <th style={center}>Chassis No.</th>
                  <th style={center}>PRICE/ EUR</th>
                  <th style={center}>PRICE/ Eur</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={c}>{invoiceNo}</td>
                  <td style={c}>{(sale.brand || '').toUpperCase()}</td>
                  <td style={c}>{(sale.model || '').toUpperCase()}</td>
                  <td style={c}>{vin || '—'}</td>
                  <td style={right}></td>
                  <td style={right}>{fmtEurDash(carPrice)}</td>
                </tr>
                <tr>
                  <td style={c}>&nbsp;</td>
                  <td style={c}></td>
                  <td style={c}></td>
                  <td style={c}></td>
                  <td style={right}></td>
                  <td style={right}>{' € -   '}</td>
                </tr>
                <tr>
                  <td style={c} colSpan={3}></td>
                  <td style={bold}>SHIPPING COST</td>
                  <td style={right}></td>
                  <td style={right}>{fmtEurDash(shippingCost)}</td>
                </tr>
                <tr>
                  <td style={c} colSpan={3}></td>
                  <td style={bold}>AUTO LODING</td>
                  <td style={right}></td>
                  <td style={right}>{' € -   '}</td>
                </tr>
                <tr>
                  <td style={c} colSpan={3}></td>
                  <td style={bold}>TAX D/C</td>
                  <td style={right}></td>
                  <td style={right}>{' € -   '}</td>
                </tr>
                <tr>
                  <td style={c} colSpan={3}></td>
                  <td style={bold}>DEPOSIT</td>
                  <td style={right}></td>
                  <td style={right}>{' € -   '}</td>
                </tr>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td style={c} colSpan={3}></td>
                    <td style={c}></td>
                    <td style={right}></td>
                    <td style={right}></td>
                  </tr>
                ))}
                <tr>
                  <td style={c} colSpan={3}></td>
                  <td style={rightBold}>SUB TOTAL</td>
                  <td style={rightBold}>€ 0</td>
                  <td style={rightBold}>{fmtEur(subTotal)}</td>
                </tr>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td style={c} colSpan={3}></td>
                    <td style={c}></td>
                    <td style={right}></td>
                    <td style={right}></td>
                  </tr>
                ))}
                <tr>
                  <td style={c} colSpan={3}></td>
                  <td style={rightBold}>BALANCE MONEY</td>
                  <td style={rightBold}>€ 0</td>
                  <td style={rightBold}>{fmtEur(balance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <footer className="px-4 sm:px-5 py-3 border-t border-slate-200 flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={handlePrint} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button type="button" onClick={handleDownload} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download PDF
          </button>
        </footer>
      </div>
    </div>
  );
}
