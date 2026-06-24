import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Send, Search, Check } from 'lucide-react';
import { createSupabaseClient } from '@/services/supabaseService';
import { CarSale } from '@/src/types';

type KoreaPaymentRow = {
    id: string;
    payment_date: string;
    total_amount: number;
    car_ids: string[];
    note: string | null;
    created_by: string | null;
    created_at?: string;
};

interface Props {
    sales: CarSale[];
    supabaseUrl: string;
    supabaseKey: string;
    userProfile: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const PaymentsKoreaTab: React.FC<Props> = ({ sales, supabaseUrl, supabaseKey, userProfile }) => {
    const [rows, setRows] = useState<KoreaPaymentRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [date, setDate] = useState(todayISO());
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');

    const client = useMemo(() => {
        if (!supabaseUrl || !supabaseKey) return null;
        try { return createSupabaseClient(supabaseUrl, supabaseKey); } catch { return null; }
    }, [supabaseUrl, supabaseKey]);

    const eligibleCars = useMemo(() => sales, [sales]);

    const paidVins = useMemo(() => {
        const vinSet = new Set<string>();
        const idSet = new Set<string>();
        rows.forEach(r => (r.car_ids || []).forEach(id => idSet.add(id)));
        idSet.forEach(id => {
            const s = sales.find(x => x.id === id);
            const v = (s?.vin || '').trim().toLowerCase();
            if (v) vinSet.add(v);
        });
        return vinSet;
    }, [rows, sales]);

    const isCarPaid = (s: CarSale) => {
        const v = (s.vin || '').trim().toLowerCase();
        return v ? paidVins.has(v) : false;
    };

    const filteredCars = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return eligibleCars;
        return eligibleCars.filter(s => {
            const blob = `${s.brand} ${s.model} ${s.year || ''} ${s.vin || ''} ${s.plateNumber || ''} ${s.buyerName || ''}`.toLowerCase();
            return blob.includes(q);
        });
    }, [eligibleCars, search]);

    const carById = useMemo(() => {
        const m = new Map<string, CarSale>();
        sales.forEach(s => m.set(s.id, s));
        return m;
    }, [sales]);

    const carLabel = (s?: CarSale) =>
        s ? `${s.brand} ${s.model} ${s.year || ''} • ${(s.vin || '').slice(-8) || s.plateNumber || 'no vin'}`.trim() : 'Unknown car';

    const loadRows = async () => {
        if (!client) return;
        setLoading(true); setError('');
        try {
            const { data, error } = await client.from('korea_payments').select('*').order('payment_date', { ascending: false });
            if (error) throw error;
            const normalized: KoreaPaymentRow[] = (data || []).map((r: any) => ({
                ...r,
                car_ids: Array.isArray(r.car_ids) ? r.car_ids : (r.car_ids ? JSON.parse(r.car_ids) : []),
            }));
            setRows(normalized);
        } catch (e: any) {
            setError(e?.message || 'Failed to load.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [client]);

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        if (!client) { setError('Backend not ready.'); return; }
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0) { setError('Enter a valid amount.'); return; }
        if (selected.size === 0) { setError('Select at least one car.'); return; }
        if (!date) { setError('Pick a date.'); return; }
        setSaving(true); setError('');
        try {
            const row = {
                id: crypto.randomUUID(),
                payment_date: date,
                total_amount: amt,
                car_ids: Array.from(selected),
                note: note || null,
                created_by: userProfile || null,
            };
            const { error } = await client.from('korea_payments').insert(row);
            if (error) throw error;
            setDate(todayISO()); setAmount(''); setNote(''); setSelected(new Set());
            await loadRows();
        } catch (e: any) {
            setError(e?.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!client) return;
        if (!confirm('Delete this payment?')) return;
        try {
            const { error } = await client.from('korea_payments').delete().eq('id', id);
            if (error) throw error;
            setRows(prev => prev.filter(r => r.id !== id));
        } catch (e: any) {
            setError(e?.message || 'Failed to delete.');
        }
    };

    const totalPaid = useMemo(() => rows.reduce((s, r) => s + Number(r.total_amount || 0), 0), [rows]);

    return (
        <div className="space-y-3">
            {/* Form */}
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-indigo-700 mb-2">
                    <Send className="w-4 h-4" /> New Payment to Korea
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Payment Date
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Amount Paid (€)
                        <input type="number" inputMode="decimal" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Note (optional)
                        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reference / memo" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                    </label>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-2 mb-2">
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all cars…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 bg-white" />
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-1 whitespace-nowrap">
                            {selected.size} selected
                        </span>
                    </div>
                    <div className="max-h-64 overflow-auto divide-y divide-slate-100 rounded-lg border border-slate-100">
                        {filteredCars.length === 0 ? (
                            <div className="text-center text-slate-400 py-6 text-xs">No cars found.</div>
                        ) : filteredCars.map(s => {
                            const checked = selected.has(s.id);
                            const paid = isCarPaid(s);
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => toggle(s.id)}
                                    className={`w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors ${checked ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                        {checked && <Check className="w-3 h-3" />}
                                    </span>
                                    {paid && (
                                        <span title="Paid to Korea" className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 flex-shrink-0" />
                                    )}
                                    <span className="flex-1 min-w-0">
                                        <span className="block font-bold text-slate-900 truncate">{carLabel(s)}</span>
                                        <span className="block text-[10px] text-slate-500 truncate">
                                            {s.status}{s.buyerName ? ` • ${s.buyerName}` : ''}{paid ? ' • Paid Korea' : ''}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {error && <div className="text-[11px] font-semibold text-red-600 mt-2">{error}</div>}
                <div className="flex items-center justify-end mt-3">
                    <button type="button" disabled={saving} onClick={handleSave} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Save Payment
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-end">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">
                    {rows.length} payments • € {totalPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
            </div>

            {/* List */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                <div className="hidden md:grid grid-cols-[110px_1fr_140px_60px] gap-3 px-3 py-2 bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 border-b border-slate-200">
                    <div>Date</div>
                    <div>Cars / Note</div>
                    <div className="text-right">Amount (€)</div>
                    <div></div>
                </div>
                {loading ? (
                    <div className="text-center text-slate-500 py-10 text-xs flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                ) : rows.length === 0 ? (
                    <div className="text-center text-slate-400 py-12 text-xs">No payments yet.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {rows.map(r => (
                            <div key={r.id} className="grid grid-cols-1 md:grid-cols-[110px_1fr_140px_60px] gap-2 md:gap-3 px-3 py-2.5 text-xs items-start">
                                <div className="text-slate-700 font-semibold pt-0.5">{r.payment_date ? new Date(r.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap gap-1 mb-1">
                                        {r.car_ids.map(cid => {
                                            const s = carById.get(cid);
                                            return (
                                                <span key={cid} className="inline-block bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-slate-200">
                                                    {carLabel(s)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    {r.note && <div className="text-[11px] text-slate-500 italic">{r.note}</div>}
                                    {r.created_by && <div className="text-[10px] text-slate-400">by {r.created_by}</div>}
                                </div>
                                <div className="text-right font-black text-indigo-700 pt-0.5">€ {Number(r.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                <div className="flex md:justify-end">
                                    <button type="button" onClick={() => handleDelete(r.id)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentsKoreaTab;
