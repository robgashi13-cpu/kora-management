'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Loader2, Search, X, Paperclip, Upload, Trash2, FileText, ChevronDown, ChevronRight, Package } from 'lucide-react';
import JSZip from 'jszip';
import { CarSale } from '@/src/types';
import { createSupabaseClient } from '@/services/supabaseService';

export type CustomsStatus = 'started' | 'klienti' | 'dogana' | 'gjykata' | 'refunded' | 'rejected';

const STATUS_OPTIONS: { value: CustomsStatus; label: string; tone: string }[] = [
  { value: 'started',  label: 'Started',  tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'klienti',  label: 'Klienti',  tone: 'bg-violet-50 text-violet-800 border-violet-200' },
  { value: 'dogana',   label: 'Dogana',   tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'gjykata',  label: 'Gjykata',  tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  { value: 'refunded', label: 'Refunded', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { value: 'rejected', label: 'Rejected', tone: 'bg-rose-50 text-rose-800 border-rose-200' },
];

type FileCategory = 'dokumentat' | 'dudat' | 'faturat';

const CATEGORY_LABELS: Record<FileCategory, string> = {
  dokumentat: 'Dokumentat e kerrit',
  dudat: 'Dudat',
  faturat: 'Faturat',
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const client = useMemo(() => {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
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
    return list.filter(({ sale, bucket }) => {
      if (filter !== 'all' && filter !== bucket) return false;
      if (!q) return true;
      const hay = `${sale.brand} ${sale.model} ${sale.plateNumber} ${sale.vin} ${sale.buyerName} ${sale.group || ''} ${sale.shippingName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sales, search, filter]);

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
        status: existing?.status || 'started',
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
        status: patch.status ?? cur?.status ?? 'started',
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
    setCollapsedGroups((p) => ({ ...p, [key]: !p[key] }));
  };

  const renderCarRow = (sale: CarSale, bucket: 'sale' | 'shipped' | 'autosalloni') => {
    const c = complaints[sale.id];
    const status: CustomsStatus = c?.status || 'started';
    const tone = STATUS_OPTIONS.find((o) => o.value === status)?.tone || '';
    const fileCount = Object.values(c?.files || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
    return (
      <li key={sale.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2.5 hover:bg-slate-50/60 transition-colors">
        <div className="flex-1 min-w-[160px]">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {sale.brand} {sale.model}
            {sale.year ? <span className="text-slate-400 font-normal"> · {sale.year}</span> : null}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {sale.plateNumber || sale.vin || sale.buyerName || '—'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFilesFor(sale)}
          className="relative inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          title="Manage files"
        >
          <Paperclip className="w-3.5 h-3.5" />
          {fileCount > 0 && <span className="text-slate-900">{fileCount}</span>}
        </button>

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
              const collapsed = collapsedGroups[key];
              const label = groupName === UNGROUPED ? 'Ungrouped' : groupName;
              return (
                <div key={key} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center gap-2 px-4 py-1.5 bg-slate-50/70 hover:bg-slate-100/80 text-left transition-colors"
                  >
                    {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 truncate">{label}</span>
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
    <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 md:p-0 animate-fade-in overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search car, plate, VIN, buyer, group…"
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 overflow-y-auto pb-4 items-start">
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
  const inputRefs = useRef<Record<FileCategory, HTMLInputElement | null>>({
    dokumentat: null, dudat: null, faturat: null,
  });

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
        if (error) { console.error(error); continue; }
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

        <footer className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors">Done</button>
        </footer>
      </div>
    </div>
  );
}
