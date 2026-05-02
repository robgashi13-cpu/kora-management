'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { CarSale } from '@/src/types';
import { createSupabaseClient } from '@/services/supabaseService';

export type CustomsStatus = 'started' | 'dogana' | 'gjykata' | 'refunded' | 'rejected';

const STATUS_OPTIONS: { value: CustomsStatus; label: string; tone: string }[] = [
  { value: 'started',  label: 'Started',  tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'dogana',   label: 'Dogana',   tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'gjykata',  label: 'Gjykata',  tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  { value: 'refunded', label: 'Refunded', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { value: 'rejected', label: 'Rejected', tone: 'bg-rose-50 text-rose-800 border-rose-200' },
];

interface ComplaintRow {
  car_id: string;
  car_source: string;
  status: CustomsStatus;
  refund_amount: number | null;
  notes: string | null;
}

interface Props {
  sales: CarSale[];
  userProfile: string | null;
}

const currentYear = new Date().getFullYear();

const isThisYear = (s: CarSale): boolean => {
  const d = s.shippingDate || s.createdAt;
  if (!d) return false;
  const yr = new Date(d).getFullYear();
  return yr === currentYear;
};

export default function AnkesaDoganaTab({ sales, userProfile }: Props) {
  const [complaints, setComplaints] = useState<Record<string, ComplaintRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'sale' | 'shipped' | 'autosalloni'>('all');
  const [refundFor, setRefundFor] = useState<{ id: string; current: number } | null>(null);
  const [refundInput, setRefundInput] = useState('');

  const client = useMemo(() => {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    if (!url || !key) return null;
    try { return createSupabaseClient(url, key); } catch { return null; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!client) { setLoading(false); return; }
      try {
        const { data, error } = await client.from('customs_complaints').select('*');
        if (!error && data && !cancelled) {
          const map: Record<string, ComplaintRow> = {};
          for (const r of data as any[]) {
            map[r.car_id] = {
              car_id: r.car_id,
              car_source: r.car_source,
              status: (r.status as CustomsStatus) || 'started',
              refund_amount: r.refund_amount,
              notes: r.notes,
            };
          }
          setComplaints(map);
        }
      } catch (e) {
        console.error('Failed to load customs_complaints', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [client]);

  const rows = useMemo(() => {
    const list = sales
      .filter(isThisYear)
      .filter((s) => ['Shipped', 'Autosallon', 'New', 'In Progress', 'Completed'].includes(s.status))
      .map((s) => {
        let bucket: 'sale' | 'shipped' | 'autosalloni';
        if (s.status === 'Shipped') bucket = 'shipped';
        else if (s.status === 'Autosallon') bucket = 'autosalloni';
        else bucket = 'sale';
        return { sale: s, bucket };
      });

    const q = search.trim().toLowerCase();
    return list.filter(({ sale, bucket }) => {
      if (filter !== 'all' && filter !== bucket) return false;
      if (!q) return true;
      const hay = `${sale.brand} ${sale.model} ${sale.plateNumber} ${sale.vin} ${sale.buyerName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sales, search, filter]);

  const grouped = useMemo(() => {
    const groups: Record<'sale' | 'shipped' | 'autosalloni', typeof rows> = { sale: [], shipped: [], autosalloni: [] };
    for (const r of rows) groups[r.bucket].push(r);
    return groups;
  }, [rows]);

  const upsert = useCallback(async (carId: string, source: string, patch: Partial<ComplaintRow>) => {
    setComplaints((prev) => {
      const existing = prev[carId];
      const merged: ComplaintRow = {
        car_id: carId,
        car_source: source,
        status: existing?.status || 'started',
        refund_amount: existing?.refund_amount ?? null,
        notes: existing?.notes ?? null,
        ...patch,
      };
      return { ...prev, [carId]: merged };
    });
    if (!client) return;
    try {
      await client.from('customs_complaints').upsert({
        car_id: carId,
        car_source: source,
        status: patch.status ?? complaints[carId]?.status ?? 'started',
        refund_amount: patch.refund_amount ?? complaints[carId]?.refund_amount ?? 0,
        notes: patch.notes ?? complaints[carId]?.notes ?? null,
        last_edited_by: userProfile || 'unknown',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'car_id' });
    } catch (e) {
      console.error('Failed to upsert customs_complaints', e);
    }
  }, [client, complaints, userProfile]);

  const handleStatusChange = (carId: string, source: string, status: CustomsStatus) => {
    if (status === 'refunded') {
      const current = complaints[carId]?.refund_amount ?? 0;
      setRefundInput(current ? String(current) : '');
      setRefundFor({ id: carId, current });
      // Also persist status even before refund amount is entered
      void upsert(carId, source, { status });
    } else {
      void upsert(carId, source, { status });
    }
  };

  const confirmRefund = () => {
    if (!refundFor) return;
    const amount = parseFloat(refundInput) || 0;
    const row = rows.find((r) => r.sale.id === refundFor.id);
    void upsert(refundFor.id, row?.bucket === 'shipped' ? 'shipped' : 'sale', { status: 'refunded', refund_amount: amount });
    setRefundFor(null);
    setRefundInput('');
  };

  const renderSection = (title: string, items: typeof rows, emptyHint: string) => (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden animate-fade-in">
      <header className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h3>
        <span className="text-xs text-slate-500">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-slate-400">{emptyHint}</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map(({ sale, bucket }) => {
            const c = complaints[sale.id];
            const status: CustomsStatus = c?.status || 'started';
            const tone = STATUS_OPTIONS.find((o) => o.value === status)?.tone || '';
            return (
              <li key={sale.id} className="px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50/60 transition-colors">
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {sale.brand} {sale.model}
                    {sale.year ? <span className="text-slate-400 font-normal"> · {sale.year}</span> : null}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {sale.plateNumber || sale.vin || sale.buyerName || '—'}
                  </div>
                </div>

                <select
                  value={status}
                  onChange={(e) => handleStatusChange(sale.id, bucket === 'shipped' ? 'shipped' : 'sale', e.target.value as CustomsStatus)}
                  className={`ui-control text-xs font-semibold rounded-lg border px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400/30 ${tone}`}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>

                {status === 'refunded' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRefundFor({ id: sale.id, current: c?.refund_amount ?? 0 });
                      setRefundInput(String(c?.refund_amount ?? ''));
                    }}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                    title="Edit refund amount"
                  >
                    € {Number(c?.refund_amount ?? 0).toLocaleString()}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 md:p-0 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search car, plate, VIN, buyer…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/30 focus:border-slate-400 transition-shadow"
          />
        </div>
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {(['all', 'sale', 'shipped', 'autosalloni'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-500 ml-auto">Showing cars from {currentYear}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 overflow-auto pb-4">
          {(filter === 'all' || filter === 'sale') && renderSection('On Sale', grouped.sale, 'No on-sale cars this year.')}
          {(filter === 'all' || filter === 'shipped') && renderSection('Shipped', grouped.shipped, 'No shipped cars this year.')}
          {(filter === 'all' || filter === 'autosalloni') && renderSection('Autosalloni', grouped.autosalloni, 'No autosalloni cars this year.')}
        </div>
      )}

      {refundFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setRefundFor(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[92vw] max-w-sm p-5 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold text-slate-900">Refund amount</h4>
              <button
                type="button"
                onClick={() => setRefundFor(null)}
                className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount (€)</label>
            <input
              type="number"
              step="any"
              autoFocus
              value={refundInput}
              onChange={(e) => setRefundInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmRefund(); }}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/30 focus:border-slate-400"
              placeholder="0"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRefundFor(null)}
                className="px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRefund}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                Save refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
