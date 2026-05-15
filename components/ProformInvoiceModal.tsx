'use client';

import React, { useRef, useState } from 'react';
import { X, Download, Printer, Loader2 } from 'lucide-react';
import { CarSale } from '@/src/types';
import { generatePdf, downloadPdfBlob } from './pdfUtils';

interface Props {
  sale: CarSale;
  onClose: () => void;
}

const fmtMoney = (n: number) => `€ ${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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
  // Subtotal & balance EXCLUDE transport per spec
  const subTotal = carPrice;
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
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 4px 6px; font-size: 11px; vertical-align: middle; }
  .no-border td, .no-border th { border: none; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .title { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
  .small { font-size: 10px; }
</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-2 sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[860px] max-h-[95vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
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
              padding: '12mm 10mm',
              fontFamily: 'Arial, sans-serif',
              color: '#000',
              boxSizing: 'border-box',
              fontSize: '11px',
            }}
          >
            {/* Header */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 0 }}>
              <tbody>
                <tr>
                  <td style={cellStyle(true)} rowSpan={2}>
                    <div style={{ fontSize: '10px', lineHeight: 1.4 }}>
                      Ssancar LTD. Cho Tae Shin. 499, Aam-dero,<br />
                      Yeonsu-gu, Incheon, Korea<br />
                      Phone: +82-505-366-9977<br />
                      Email: ssancar9977@gmail.com
                    </div>
                  </td>
                  <td style={{ ...cellStyle(true), textAlign: 'center', fontSize: '22px', fontWeight: 800, letterSpacing: 1 }} colSpan={2}>
                    PROFORM INVOICE
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), width: '28%', fontWeight: 700 }}>Date</td>
                  <td style={cellStyle(true)}>{formatDate(new Date())}</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700, width: '34%' }}>&nbsp;</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Invoice No.</td>
                  <td style={cellStyle(true)}>{invoiceNo}</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>&nbsp;</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Name</td>
                  <td style={cellStyle(true)}>RG SH.P.K.</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>&nbsp;</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>BISINESS No.</td>
                  <td style={cellStyle(true)}>810062092</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>&nbsp;</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Adress</td>
                  <td style={cellStyle(true)}>DURRES PORT</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>&nbsp;</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Phone</td>
                  <td style={cellStyle(true)}>+38348181116</td>
                </tr>
              </tbody>
            </table>

            {/* Bank info */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle(true), background: '#f1f5f9', textAlign: 'center', fontWeight: 700 }} colSpan={4}>BANK ACCOUNT INFORMATION</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700, width: '20%' }}>Beneficiary</td>
                  <td style={{ ...cellStyle(true), width: '30%' }}>SSANCAR LTD.</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700, width: '20%' }}>Bank Name</td>
                  <td style={{ ...cellStyle(true), width: '30%' }}>SHINHAN BANK</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Swift Code</td>
                  <td style={cellStyle(true)}>SHBKKRSE</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Bank Adress</td>
                  <td style={cellStyle(true)} rowSpan={2}>20, Sejong-Daero9-Gil, Jung-Gu Seoul South Korea</td>
                </tr>
                <tr>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Bank Account Number</td>
                  <td style={cellStyle(true)}>180-008-400167</td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>Beneficiary Adress</td>
                </tr>
              </tbody>
            </table>

            {/* Items */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ ...cellStyle(true), width: '14%' }}>Code</th>
                  <th style={{ ...cellStyle(true), width: '16%' }}>Brand</th>
                  <th style={{ ...cellStyle(true), width: '16%' }}>Model</th>
                  <th style={{ ...cellStyle(true), width: '34%' }}>Chassis No.</th>
                  <th style={{ ...cellStyle(true), width: '20%' }}>PRICE / EUR</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={cellStyle(true)}>{invoiceNo}</td>
                  <td style={cellStyle(true)}>{(sale.brand || '').toUpperCase()}</td>
                  <td style={cellStyle(true)}>{(sale.model || '').toUpperCase()}</td>
                  <td style={cellStyle(true)}>{vin || '—'}</td>
                  <td style={{ ...cellStyle(true), textAlign: 'right' }}>{fmtMoney(carPrice)}</td>
                </tr>
                {/* Empty rows to mirror template spacing */}
                {Array.from({ length: 1 }).map((_, i) => (
                  <tr key={i}><td style={cellStyle(true)}>&nbsp;</td><td style={cellStyle(true)}></td><td style={cellStyle(true)}></td><td style={cellStyle(true)}></td><td style={cellStyle(true)}></td></tr>
                ))}
                <tr>
                  <td style={cellStyle(true)} colSpan={3}></td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>SHIPPING COST</td>
                  <td style={{ ...cellStyle(true), textAlign: 'right' }}>{fmtMoney(shippingCost)}</td>
                </tr>
                <tr>
                  <td style={cellStyle(true)} colSpan={3}></td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>AUTO LODING</td>
                  <td style={{ ...cellStyle(true), textAlign: 'right' }}>{fmtMoney(0)}</td>
                </tr>
                <tr>
                  <td style={cellStyle(true)} colSpan={3}></td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>TAX D/C</td>
                  <td style={{ ...cellStyle(true), textAlign: 'right' }}>{fmtMoney(0)}</td>
                </tr>
                <tr>
                  <td style={cellStyle(true)} colSpan={3}></td>
                  <td style={{ ...cellStyle(true), fontWeight: 700 }}>DEPOSIT</td>
                  <td style={{ ...cellStyle(true), textAlign: 'right' }}>{fmtMoney(0)}</td>
                </tr>
                <tr>
                  <td style={cellStyle(true)} colSpan={3}></td>
                  <td style={{ ...cellStyle(true), background: '#f8fafc', fontWeight: 800 }}>SUB TOTAL</td>
                  <td style={{ ...cellStyle(true), background: '#f8fafc', textAlign: 'right', fontWeight: 800 }}>{fmtMoney(subTotal)}</td>
                </tr>
                <tr>
                  <td style={cellStyle(true)} colSpan={3}></td>
                  <td style={{ ...cellStyle(true), background: '#fef3c7', fontWeight: 800 }}>BALANCE MONEY</td>
                  <td style={{ ...cellStyle(true), background: '#fef3c7', textAlign: 'right', fontWeight: 800 }}>{fmtMoney(balance)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 12, fontSize: '10px', color: '#475569' }}>
              * Shipping cost is shown for reference and is not included in the total balance.
            </div>
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

function cellStyle(border: boolean): React.CSSProperties {
  return {
    border: border ? '1px solid #000' : 'none',
    padding: '4px 6px',
    fontSize: '11px',
    verticalAlign: 'middle',
  };
}
