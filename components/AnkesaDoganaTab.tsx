'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Loader2, Search, X, Paperclip, Upload, Trash2, FileText, ChevronDown, ChevronRight, Package, Archive, EyeOff, RotateCcw, Download } from 'lucide-react';
import JSZip from 'jszip';
import { CarSale } from '@/src/types';
import { createSupabaseClient } from '@/services/supabaseService';

export type CustomsStatus = 'not_started' | 'started' | 'klienti' | 'dogana' | 'gjykata' | 'nuk_ka_rritje' | 'refunded' | 'rejected';

const STATUS_OPTIONS: { value: CustomsStatus; label: string; tone: string }[] = [
  { value: 'not_started',   label: 'Not Started',    tone: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'started',       label: 'Started',        tone: 'bg-sky-100 text-sky-800 border-sky-300' },
  { value: 'klienti',       label: 'Klienti',        tone: 'bg-violet-100 text-violet-800 border-violet-300' },
  { value: 'dogana',        label: 'Dogana',         tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  { value: 'gjykata',       label: 'Gjykata',        tone: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'nuk_ka_rritje', label: 'Nuk ka rritje',  tone: 'bg-teal-100 text-teal-800 border-teal-300' },
  { value: 'refunded',      label: 'Refunded',       tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'rejected',      label: 'Rejected',       tone: 'bg-rose-100 text-rose-800 border-rose-300' },
];

type FileCategory = 'dokumentat' | 'dudat' | 'dudat_me_rritje' | 'faturat' | 'transferi_bankar';

const CATEGORY_LABELS: Record<FileCategory, string> = {
  dokumentat: 'Dokumentat e kerrit',
  dudat: 'Dudi pa rritje',
  dudat_me_rritje: 'Dudi me rritje',
  faturat: 'Faturat',
  transferi_bankar: 'Transferi bankar',
};

interface StoredFile {
  name: string;
  path: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
}

type FilesByCategory = Partial<Record<FileCategory, StoredFile[]>>;

interface ComplaintRow {
  car_id: string;
  car_source: string;
  status: CustomsStatus;
  refund_amount: number | null;
  notes: string | null;
  files?: FilesByCategory;
}

interface Props {
  sales: CarSale[];
  userProfile: string | null;
}

const currentYear = new Date().getFullYear();

const isThisYear = (s: CarSale): boolean => {
  const d = s.shippingDate || s.createdAt;
  if (!d) return false;
  return new Date(d).getFullYear() === currentYear;
};

const UNGROUPED = '__ungrouped__';

export default function AnkesaDoganaTab({ sales, userProfile }: Props) {
  const [complaints, setComplaints] = useState<Record<string, ComplaintRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'sale' | 'shipped' | 'autosalloni'>('all');
  const [refundFor, setRefundFor] = useState<{ id: string; current: number } | null>(null);
  const [refundInput, setRefundInput] = useState('');
  const [filesFor, setFilesFor] = useState<CarSale | null>(null);
  const [infoFor, setInfoFor] = useState<CarSale | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [archivedGroups, setArchivedGroups] = useState<Set<string>>(() => {
    try { const s = typeof window !== 'undefined' ? localStorage.getItem('ankesa_dogana_archived_groups') : null; return new Set(s ? JSON.parse(s) : []); } catch { return new Set(); }
  });
  const [removedGroups, setRemovedGroups] = useState<Set<string>>(() => {
    try { const s = typeof window !== 'undefined' ? localStorage.getItem('ankesa_dogana_removed_groups') : null; return new Set(s ? JSON.parse(s) : []); } catch { return new Set(); }
  });
  const [showArchived, setShowArchived] = useState(false);
  const [groupMenu, setGroupMenu] = useState<{ key: string; label: string; x: number; y: number; sales: CarSale[] } | null>(null);
  const [groupZipping, setGroupZipping] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistArchived = (next: Set<string>) => {
    setArchivedGroups(next);
    try { localStorage.setItem('ankesa_dogana_archived_groups', JSON.stringify(Array.from(next))); } catch {}
  };
  const persistRemoved = (next: Set<string>) => {
    setRemovedGroups(next);
    try { localStorage.setItem('ankesa_dogana_removed_groups', JSON.stringify(Array.from(next))); } catch {}
  };

  const archiveGroup = (key: string) => {
    const next = new Set(archivedGroups); next.add(key); persistArchived(next);
    setGroupMenu(null);
  };
  const removeGroup = (key: string) => {
    const next = new Set(removedGroups); next.add(key); persistRemoved(next);
    const a = new Set(archivedGroups); a.delete(key); persistArchived(a);
    setGroupMenu(null);
  };
  const restoreGroup = (key: string) => {
    const a = new Set(archivedGroups); a.delete(key); persistArchived(a);
    const r = new Set(removedGroups); r.delete(key); persistRemoved(r);
  };

  const openGroupMenu = (key: string, label: string, x: number, y: number) => {
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 200 : x;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 140 : y;
    setGroupMenu({ key, label, x: Math.min(x, maxX), y: Math.min(y, maxY) });
  };

  const startLongPress = (key: string, label: string, e: React.TouchEvent) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const t = e.touches[0];
    const x = t?.clientX ?? 0, y = t?.clientY ?? 0;
    longPressTimer.current = setTimeout(() => openGroupMenu(key, label, x, y), 3000);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const client = useMemo(() => {
    const FALLBACK_URL = 'https://tbjihsqkbmjiblpxzojo.supabase.co';
    const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiamloc3FrYm1qaWJscHh6b2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MjQ2OTQsImV4cCI6MjA4MTEwMDY5NH0.JHus2d1aZ252FvhlT4nVAsPPJediXq-c8uhI-3wpGdE';
    let url = '', key = '';
    try { url = (import.meta as any).env?.VITE_SUPABASE_URL || ''; key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || ''; } catch {}
    if (!url) { try { url = (process as any)?.env?.NEXT_PUBLIC_SUPABASE_URL || ''; } catch {} }
    if (!key) { try { key = (process as any)?.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''; } catch {} }
    if (!url) url = FALLBACK_URL;
    if (!key) key = FALLBACK_KEY;
    try { return createSupabaseClient(url, key); } catch (e) { console.error('[AnkesaDogana] client init failed', e); return null; }
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
              status: (r.status as CustomsStatus) || 'not_started',
              refund_amount: r.refund_amount,
              notes: r.notes,
              files: (r.files as FilesByCategory) || {},
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
    const isBesi = (userProfile || '').toLowerCase() === 'besi';
    return list.filter(({ sale, bucket }) => {
      if (isBesi && bucket === 'sale') return false;
      if (filter !== 'all' && filter !== bucket) return false;
      if (!q) return true;
      const hay = `${sale.brand} ${sale.model} ${sale.plateNumber} ${sale.vin} ${sale.buyerName} ${sale.group || ''} ${sale.shippingName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sales, search, filter, userProfile]);

  const grouped = useMemo(() => {
    const buckets: Record<'sale' | 'shipped' | 'autosalloni', typeof rows> = { sale: [], shipped: [], autosalloni: [] };
    for (const r of rows) buckets[r.bucket].push(r);
    return buckets;
  }, [rows]);

  const upsert = useCallback(async (carId: string, source: string, patch: Partial<ComplaintRow>) => {
    setComplaints((prev) => {
      const existing = prev[carId];
      const merged: ComplaintRow = {
        car_id: carId,
        car_source: source,
        status: existing?.status || 'not_started',
        refund_amount: existing?.refund_amount ?? null,
        notes: existing?.notes ?? null,
        files: existing?.files ?? {},
        ...patch,
      };
      return { ...prev, [carId]: merged };
    });
    if (!client) return;
    try {
      const cur = complaints[carId];
      await client.from('customs_complaints').upsert({
        car_id: carId,
        car_source: source,
        status: patch.status ?? cur?.status ?? 'not_started',
        refund_amount: patch.refund_amount ?? cur?.refund_amount ?? 0,
        notes: patch.notes ?? cur?.notes ?? null,
        files: patch.files ?? cur?.files ?? {},
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

  // Group rows by sale.group
  const groupRowsByGroup = useCallback((items: typeof rows) => {
    const map = new Map<string, typeof rows>();
    for (const r of items) {
      const key = r.sale.group?.trim() || UNGROUPED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNGROUPED) return 1;
      if (b[0] === UNGROUPED) return -1;
      return a[0].localeCompare(b[0]);
    });
  }, []);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((p) => ({ ...p, [key]: !(p[key] ?? true) }));
  };

  const renderCarRow = (sale: CarSale, bucket: 'sale' | 'shipped' | 'autosalloni') => {
    const c = complaints[sale.id];
    const status: CustomsStatus = c?.status || 'not_started';
    const tone = STATUS_OPTIONS.find((o) => o.value === status)?.tone || '';
    const fileCount = Object.values(c?.files || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
    return (
      <li key={sale.id} className="px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 hover:bg-slate-50/60 transition-colors">
        <button
          type="button"
          onClick={() => setInfoFor(sale)}
          className="flex-1 min-w-[120px] basis-full sm:basis-0 pr-1 order-1 text-left hover:bg-slate-100/60 -mx-1 px-1 rounded transition-colors"
          title="View car info"
        >
          <div className="text-sm font-semibold text-slate-900 truncate">
            {sale.brand} {sale.model}
            {sale.year ? <span className="text-slate-400 font-normal"> · {sale.year}</span> : null}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {sale.plateNumber || sale.vin || sale.buyerName || '—'}
          </div>
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto order-2">
          <button
            type="button"
            onClick={() => setFilesFor(sale)}
            className="relative inline-flex items-center justify-center gap-1 text-[11px] font-semibold w-9 h-8 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors flex-shrink-0"
            title="Manage files"
          >
            <Paperclip className="w-3.5 h-3.5" />
            {fileCount > 0 && <span className="text-slate-900">{fileCount}</span>}
          </button>

          {status === 'refunded' && (
            <button
              type="button"
              onClick={() => {
                setRefundFor({ id: sale.id, current: c?.refund_amount ?? 0 });
                setRefundInput(String(c?.refund_amount ?? ''));
              }}
              className="text-[11px] font-semibold h-8 px-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors whitespace-nowrap max-w-[90px] truncate flex-shrink-0"
              title="Edit refund amount"
            >
              € {Number(c?.refund_amount ?? 0).toLocaleString()}
            </button>
          )}

          <select
            value={status}
            onChange={(e) => handleStatusChange(sale.id, bucket === 'shipped' ? 'shipped' : 'sale', e.target.value as CustomsStatus)}
            className={`ui-control text-xs font-semibold rounded-lg border pl-2 pr-6 h-8 w-[118px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400/30 appearance-none flex-shrink-0 ${tone}`}
            style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3e%3cpath fill='none' stroke='%23475569' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </li>
    );
  };

  const renderSection = (title: string, items: typeof rows, emptyHint: string, sectionKey: string) => {
    const groups = groupRowsByGroup(items);
    return (
      <section className="bg-white border border-slate-200 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col animate-fade-in">
        <header className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h3>
          <span className="text-xs text-slate-500">{items.length}</span>
        </header>
        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-400">{emptyHint}</div>
        ) : (
          <div>
            {groups.map(([groupName, groupItems]) => {
              const key = `${sectionKey}:${groupName}`;
              const isRemoved = removedGroups.has(key);
              const isArchived = archivedGroups.has(key);
              if (isRemoved) return null;
              if (isArchived && !showArchived) return null;
              const collapsed = collapsedGroups[key] ?? true;
              const label = groupName === UNGROUPED ? 'Ungrouped' : groupName;
              return (
                <div key={key} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    onContextMenu={(e) => { e.preventDefault(); openGroupMenu(key, label, e.clientX, e.clientY); }}
                    onTouchStart={(e) => startLongPress(key, label, e)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                    className={`w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors ${isArchived ? 'bg-amber-50/60 hover:bg-amber-100/60' : 'bg-slate-50/70 hover:bg-slate-100/80'}`}
                  >
                    {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">{label}</span>
                    {isArchived && <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Archived</span>}
                    <span className="text-[10px] text-slate-400 ml-auto">{groupItems.length}</span>
                  </button>
                  {!collapsed && (
                    <ul className="divide-y divide-slate-100">
                      {groupItems.map(({ sale, bucket }) => renderCarRow(sale, bucket))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 sm:p-4 md:p-0 animate-fade-in overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 flex-shrink-0">
        <div className="relative flex-1 min-w-0 sm:min-w-[180px] w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search car, plate, VIN, buyer, group…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/30 focus:border-slate-400 transition-shadow"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm overflow-x-auto">
            {(['all', 'sale', 'shipped', 'autosalloni'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize transition-all whitespace-nowrap ${filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all border whitespace-nowrap ${showArchived ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            title="Toggle archived groups"
          >
            {showArchived ? 'Hide archived' : `Archived${archivedGroups.size ? ` (${archivedGroups.size})` : ''}`}
          </button>
          <span className="text-[11px] text-slate-500 ml-auto hidden sm:inline">Showing {currentYear}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 flex-1 min-h-0 overflow-y-auto pb-24 md:pb-32 items-start">
          {(filter === 'all' || filter === 'sale') && renderSection('On Sale', grouped.sale, 'No on-sale cars this year.', 'sale')}
          {(filter === 'all' || filter === 'shipped') && renderSection('Shipped', grouped.shipped, 'No shipped cars this year.', 'shipped')}
          {(filter === 'all' || filter === 'autosalloni') && renderSection('Autosalloni', grouped.autosalloni, 'No autosalloni cars this year.', 'autosalloni')}
        </div>
      )}

      {refundFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={() => setRefundFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[92vw] max-w-sm p-5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold text-slate-900">Refund amount</h4>
              <button type="button" onClick={() => setRefundFor(null)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors" aria-label="Close">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount (€)</label>
            <input
              type="number" step="any" autoFocus
              value={refundInput}
              onChange={(e) => setRefundInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmRefund(); }}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/30 focus:border-slate-400"
              placeholder="0"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setRefundFor(null)} className="px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button type="button" onClick={confirmRefund} className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors">Save refund</button>
            </div>
          </div>
        </div>
      )}

      {filesFor && (
        <FilesModal
          sale={filesFor}
          complaint={complaints[filesFor.id]}
          client={client}
          onClose={() => setFilesFor(null)}
          onChange={(files) => {
            const bucket = filesFor.status === 'Shipped' ? 'shipped' : 'sale';
            void upsert(filesFor.id, bucket, { files });
          }}
        />
      )}

      {infoFor && (
        <CarInfoModal sale={infoFor} onClose={() => setInfoFor(null)} />
      )}

      {groupMenu && (
        <div className="fixed inset-0 z-[70]" onClick={() => setGroupMenu(null)} onContextMenu={(e) => { e.preventDefault(); setGroupMenu(null); }}>
          <div
            className="absolute bg-white border border-slate-200 rounded-xl shadow-2xl py-1 min-w-[180px] animate-scale-in"
            style={{ left: groupMenu.x, top: groupMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 truncate">{groupMenu.label}</div>
            {archivedGroups.has(groupMenu.key) || removedGroups.has(groupMenu.key) ? (
              <button type="button" onClick={() => { restoreGroup(groupMenu.key); setGroupMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </button>
            ) : (
              <button type="button" onClick={() => archiveGroup(groupMenu.key)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Archive className="w-3.5 h-3.5" /> Archive group
              </button>
            )}
            <button type="button" onClick={() => { if (confirm(`Remove group "${groupMenu.label}" from this view?`)) removeGroup(groupMenu.key); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
              <Trash2 className="w-3.5 h-3.5" /> Remove from view
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Files Modal
// ─────────────────────────────────────────────────────────────────

interface FilesModalProps {
  sale: CarSale;
  complaint?: ComplaintRow;
  client: any;
  onClose: () => void;
  onChange: (files: FilesByCategory) => void;
}

function FilesModal({ sale, complaint, client, onClose, onChange }: FilesModalProps) {
  const [files, setFiles] = useState<FilesByCategory>(complaint?.files || {});
  const [uploading, setUploading] = useState<FileCategory | null>(null);
  const [zipping, setZipping] = useState(false);
  const inputRefs = useRef<Record<FileCategory, HTMLInputElement | null>>({
    dokumentat: null, dudat: null, dudat_me_rritje: null, faturat: null, transferi_bankar: null,
  });

  const carLabel = useMemo(() => {
    const parts = [sale.brand, sale.model, sale.plateNumber || sale.vin].filter(Boolean).join(' ');
    return (parts || `car-${sale.id.slice(0, 6)}`).replace(/[^a-zA-Z0-9._-]+/g, '_');
  }, [sale]);

  const handleCreateZip = async () => {
    const orderedCats: FileCategory[] = ['dokumentat', 'dudat', 'dudat_me_rritje', 'faturat', 'transferi_bankar'];
    if (orderedCats.every((c) => !files[c] || files[c]!.length === 0)) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const cat of orderedCats) {
        const arr = files[cat];
        const folder = zip.folder(CATEGORY_LABELS[cat]) || zip;
        if (!arr || arr.length === 0) continue;
        for (const f of arr) {
          try {
            const res = await fetch(f.url);
            if (!res.ok) continue;
            const blob = await res.blob();
            folder.file(f.name, blob);
          } catch (err) {
            console.error('Failed to fetch', f.name, err);
          }
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${carLabel}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Zip failed', e);
      alert('Failed to create ZIP');
    } finally {
      setZipping(false);
    }
  };

  useEffect(() => { setFiles(complaint?.files || {}); }, [complaint]);

  const persist = (next: FilesByCategory) => {
    setFiles(next);
    onChange(next);
  };

  const handleUpload = async (cat: FileCategory, list: FileList | null) => {
    if (!list || list.length === 0) return;
    if (!client) {
      alert('Storage not available');
      return;
    }
    setUploading(cat);
    try {
      const uploaded: StoredFile[] = [];
      for (const file of Array.from(list)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${sale.id}/${cat}/${Date.now()}_${safeName}`;
        const { error } = await client.storage.from('customs-files').upload(path, file, {
          cacheControl: '3600', upsert: false, contentType: file.type,
        });
        if (error) { console.error('Upload error', error); alert(`Upload failed: ${error.message || 'unknown error'}`); continue; }
        const { data: pub } = client.storage.from('customs-files').getPublicUrl(path);
        uploaded.push({
          name: file.name,
          path,
          url: pub?.publicUrl || '',
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString(),
        });
      }
      const next: FilesByCategory = { ...files, [cat]: [...(files[cat] || []), ...uploaded] };
      persist(next);
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(null);
      const ref = inputRefs.current[cat];
      if (ref) ref.value = '';
    }
  };

  const handleDelete = async (cat: FileCategory, idx: number) => {
    const item = files[cat]?.[idx];
    if (!item) return;
    if (!confirm(`Remove "${item.name}"?`)) return;
    try {
      if (client && item.path) {
        await client.storage.from('customs-files').remove([item.path]);
      }
    } catch (e) {
      console.error('Delete failed', e);
    }
    const next: FilesByCategory = { ...files, [cat]: (files[cat] || []).filter((_, i) => i !== idx) };
    persist(next);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-900 truncate">
              {sale.brand} {sale.model}
              {sale.year ? <span className="text-slate-400 font-normal"> · {sale.year}</span> : null}
            </h4>
            <div className="text-xs text-slate-500 truncate">
              {sale.plateNumber || sale.vin || '—'}{sale.group ? ` · ${sale.group}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {(Object.keys(CATEGORY_LABELS) as FileCategory[]).map((cat) => {
            const list = files[cat] || [];
            return (
              <div key={cat} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">{CATEGORY_LABELS[cat]}</h5>
                  <div>
                    <input
                      ref={(el) => { inputRefs.current[cat] = el; }}
                      type="file" multiple className="hidden"
                      onChange={(e) => handleUpload(cat, e.target.files)}
                    />
                    <button
                      type="button"
                      disabled={uploading === cat}
                      onClick={() => inputRefs.current[cat]?.click()}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {uploading === cat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Upload
                    </button>
                  </div>
                </div>
                {list.length === 0 ? (
                  <div className="px-4 py-4 text-center text-xs text-slate-400">No files yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {list.map((f, i) => (
                      <li key={`${f.path}_${i}`} className="px-4 py-2 flex items-center gap-2.5 hover:bg-slate-50/60 transition-colors">
                        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-slate-800 hover:text-slate-900 truncate">
                          {f.name}
                        </a>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" onClick={() => handleDelete(cat, i)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors" title="Remove">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 flex justify-between items-center gap-2">
          <button
            type="button"
            disabled={zipping || Object.values(files).every((a) => !a || a.length === 0)}
            onClick={handleCreateZip}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Create ZIP
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors">Done</button>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Car Info Modal — shows car details only (no prices/profits)
// ─────────────────────────────────────────────────────────────────

function CarInfoModal({ sale, onClose }: { sale: CarSale; onClose: () => void }) {
  const fmtDate = (d?: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString(); } catch { return d; }
  };
  const rows: Array<[string, React.ReactNode]> = [
    ['Brand', sale.brand || '—'],
    ['Model', sale.model || '—'],
    ['Year', sale.year || '—'],
    ['KM', sale.km ? sale.km.toLocaleString() : '—'],
    ['Color', sale.color || '—'],
    ['Plate Number', sale.plateNumber || '—'],
    ['VIN', sale.vin || '—'],
    ['Buyer', sale.buyerName || '—'],
    ['Buyer Personal ID', sale.buyerPersonalId || '—'],
    ['Seller', sale.sellerName || '—'],
    ['Shipping Name', sale.shippingName || '—'],
    ['Shipping Date', fmtDate(sale.shippingDate)],
    ['Status', sale.status || '—'],
    ['Group', sale.group || '—'],
    ['Sold By', sale.soldBy || '—'],
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-900 truncate">
              {sale.brand} {sale.model}
              {sale.year ? <span className="text-slate-400 font-normal"> · {sale.year}</span> : null}
            </h4>
            <div className="text-xs text-slate-500 truncate">Car Information</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-col border-b border-slate-100 pb-1.5">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
                <dd className="text-sm text-slate-900 truncate">{value}</dd>
              </div>
            ))}
          </dl>
          {sale.notes && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Notes</div>
              <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap">{sale.notes}</div>
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors">Close</button>
        </footer>
      </div>
    </div>
  );
}
