'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CarSale } from '@/src/types';
import { InvoicePriceSource, resolveInvoicePriceValue } from './invoicePricing';

export interface InvoicePriceOptions {
  customTax?: number;
  hideTvshLabel?: boolean;
}

interface InvoicePriceModalProps {
  isOpen: boolean;
  sale: Partial<CarSale> | null;
  onSelect: (source: InvoicePriceSource, options: InvoicePriceOptions) => void;
  onCancel: () => void;
}

const DEFAULT_TAX = 30.51;

const formatCurrency = (value: number) =>
  `€${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoicePriceModal({ isOpen, sale, onSelect, onCancel }: InvoicePriceModalProps) {
  const [customTax, setCustomTax] = useState<number>(DEFAULT_TAX);
  const [hideTvshLabel, setHideTvshLabel] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setCustomTax(DEFAULT_TAX);
      setHideTvshLabel(false);
    }
  }, [isOpen]);

  if (!isOpen || !sale) return null;

  const soldPrice = resolveInvoicePriceValue(sale, 'sold');
  const bankPrice = resolveInvoicePriceValue(sale, 'paid_bank');
  const soldMissing = soldPrice <= 0;
  const bankMissing = bankPrice <= 0;

  const options: InvoicePriceOptions = {
    customTax: Number.isFinite(customTax) ? customTax : DEFAULT_TAX,
    hideTvshLabel,
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Choose invoice price</h3>
          <button onClick={onCancel} className="p-2 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <button
            onClick={() => onSelect('sold', options)}
            className="w-full text-left border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Sold price</div>
            <div className="text-lg font-bold text-slate-900">{formatCurrency(soldPrice)}</div>
            {soldMissing && (
              <div className="text-xs text-amber-600 mt-1">Sold price is missing. The invoice will use €0.00.</div>
            )}
          </button>
          <button
            onClick={() => onSelect('paid_bank', options)}
            className="w-full text-left border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Paid in bank price</div>
            <div className="text-lg font-bold text-slate-900">{formatCurrency(bankPrice)}</div>
            {bankMissing && (
              <div className="text-xs text-amber-600 mt-1">Bank amount is missing. The invoice will use €0.00.</div>
            )}
          </button>

          {/* Tax customization */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Tax</div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">Tax amount (€)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={Number.isFinite(customTax) ? customTax : ''}
                onChange={(e) => setCustomTax(e.target.value === '' ? 0 : Number(e.target.value))}
                className="w-28 h-9 px-2 text-sm text-right border border-slate-300 rounded-md outline-none focus:border-slate-500 bg-white"
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideTvshLabel}
                onChange={(e) => setHideTvshLabel(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Hide “TVSH 18%” label (show only “Tax”)</span>
            </label>
            <div className="text-[11px] text-slate-400">
              Defaults to €{DEFAULT_TAX.toFixed(2)}. Applies only when invoicing without Doganë.
            </div>
          </div>

          <div className="text-xs text-slate-400">
            The invoice totals and displayed values will use the selected price.
          </div>
        </div>
        <div className="p-4 pt-0">
          <button
            onClick={onCancel}
            className="w-full py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
