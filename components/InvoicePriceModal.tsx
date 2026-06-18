'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { CarSale } from '@/src/types';
import { InvoicePriceSource, resolveInvoicePriceValue } from './invoicePricing';

export interface InvoiceExtraCharge {
  id: string;
  label: string;
  amount: number;
}

export interface InvoicePriceOptions {
  customTax?: number;
  hideTvshLabel?: boolean;
  extraSales?: CarSale[];
  extraCharges?: InvoiceExtraCharge[];
}

interface InvoicePriceModalProps {
  isOpen: boolean;
  sale: Partial<CarSale> | null;
  availableSales?: CarSale[];
  onSelect: (source: InvoicePriceSource, options: InvoicePriceOptions) => void;
  onCancel: () => void;
}

const DEFAULT_TAX = 30.51;
const MAX_EXTRAS = 4;

const formatCurrency = (value: number) =>
  `€${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoicePriceModal({ isOpen, sale, availableSales = [], onSelect, onCancel }: InvoicePriceModalProps) {
  const [customTax, setCustomTax] = useState<number>(DEFAULT_TAX);
  const [hideTvshLabel, setHideTvshLabel] = useState<boolean>(false);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [extraCharges, setExtraCharges] = useState<InvoiceExtraCharge[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCustomTax(DEFAULT_TAX);
      setHideTvshLabel(false);
      setExtraIds([]);
      setShowPicker(false);
      setQuery('');
      setExtraCharges([]);
    }
  }, [isOpen]);

  const otherSales = useMemo(
    () => (availableSales || []).filter(s => s && s.id && s.id !== (sale as any)?.id),
    [availableSales, sale]
  );

  const filteredOthers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return otherSales;
    return otherSales.filter(s =>
      [s.brand, s.model, s.vin, s.plateNumber, s.buyerName]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  }, [otherSales, query]);

  const extraSales = useMemo(
    () => extraIds.map(id => otherSales.find(s => s.id === id)).filter(Boolean) as CarSale[],
    [extraIds, otherSales]
  );

  if (!isOpen || !sale) return null;

  const sanitizedCharges = extraCharges
    .map(c => ({ ...c, label: (c.label || '').trim(), amount: Number(c.amount) || 0 }))
    .filter(c => c.label.length > 0 || c.amount !== 0);

  const chargesTotal = sanitizedCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

  const buildOptions = (source: InvoicePriceSource): InvoicePriceOptions => ({
    customTax: Number.isFinite(customTax) ? customTax : DEFAULT_TAX,
    hideTvshLabel,
    extraSales,
    extraCharges: sanitizedCharges,
  });

  const previewTotal = (source: InvoicePriceSource) => {
    const base = resolveInvoicePriceValue(sale, source);
    const extras = extraSales.reduce((acc, s) => acc + resolveInvoicePriceValue(s, source), 0);
    return base + extras + chargesTotal;
  };

  const soldPrice = resolveInvoicePriceValue(sale, 'sold');
  const bankPrice = resolveInvoicePriceValue(sale, 'paid_bank');
  const soldMissing = soldPrice <= 0;
  const bankMissing = bankPrice <= 0;

  const toggleExtra = (id: string) => {
    setExtraIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_EXTRAS) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-slate-800">Choose invoice price</h3>
          <button onClick={onCancel} className="p-2 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <button
            onClick={() => onSelect('sold', buildOptions('sold'))}
            className="w-full text-left border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Sold price</div>
            <div className="text-lg font-bold text-slate-900">{formatCurrency(previewTotal('sold'))}</div>
            {extraSales.length > 0 && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                Base {formatCurrency(soldPrice)} + {extraSales.length} extra
              </div>
            )}
            {soldMissing && extraSales.length === 0 && (
              <div className="text-xs text-amber-600 mt-1">Sold price is missing. The invoice will use €0.00.</div>
            )}
          </button>
          <button
            onClick={() => onSelect('paid_bank', buildOptions('paid_bank'))}
            className="w-full text-left border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Paid in bank price</div>
            <div className="text-lg font-bold text-slate-900">{formatCurrency(previewTotal('paid_bank'))}</div>
            {extraSales.length > 0 && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                Base {formatCurrency(bankPrice)} + {extraSales.length} extra
              </div>
            )}
            {bankMissing && extraSales.length === 0 && (
              <div className="text-xs text-amber-600 mt-1">Bank amount is missing. The invoice will use €0.00.</div>
            )}
          </button>

          {/* Add other sales to invoice */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Combine with other sales</div>
              <button
                type="button"
                onClick={() => setShowPicker(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                <Plus className="w-3.5 h-3.5" />
                {showPicker ? 'Hide' : 'Add sale'}
              </button>
            </div>

            {extraSales.length > 0 && (
              <div className="space-y-1">
                {extraSales.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">
                        {[s.brand, s.model].filter(Boolean).join(' ') || 'Untitled'}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        VIN {s.vin || '—'} · {formatCurrency(resolveInvoicePriceValue(s, 'sold'))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExtra(s.id)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-500"
                      aria-label="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showPicker && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search brand, VIN, plate, buyer..."
                    className="w-full h-8 pl-7 pr-2 text-xs border border-slate-200 rounded-md bg-white outline-none focus:border-slate-400"
                  />
                </div>
                <div className="max-h-48 overflow-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
                  {filteredOthers.length === 0 && (
                    <div className="px-3 py-4 text-center text-[11px] text-slate-400">No other sales found.</div>
                  )}
                  {filteredOthers.slice(0, 60).map(s => {
                    const checked = extraIds.includes(s.id);
                    const disabled = !checked && extraIds.length >= MAX_EXTRAS;
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-slate-50 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleExtra(s.id)}
                          className="h-3.5 w-3.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {[s.brand, s.model].filter(Boolean).join(' ') || 'Untitled'}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            VIN {s.vin || '—'} · Plate {s.plateNumber || '—'}
                          </div>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-700 tabular-nums">
                          {formatCurrency(Number(s.soldPrice) || 0)}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="text-[10px] text-slate-400">
                  Up to {MAX_EXTRAS} extra sales. All sales use the price source you pick above.
                </div>
              </div>
            )}
          </div>

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
