import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Wallet, Landmark, Search, Check, ShieldCheck } from 'lucide-react';
import { createSupabaseClient } from '@/services/supabaseService';
import { CarSale } from '@/src/types';

type Kind = 'cash' | 'bank' | 'customs';

type DepositRow = {
    id: string;
    amount: number;
    deposit_date: string | null;
    source_sale_id: string | null;
    car_name: string | null;
    note: string | null;
    depositor_name?: string | null;
    receiver_name?: string | null;
    description?: string | null;
    category?: string | null;
    created_at?: string;
};

interface Props {
    kind: Kind;
    sales: CarSale[];
    supabaseUrl: string;
    supabaseKey: string;
    userProfile: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const DepositsTab: React.FC<Props> = ({ kind, sales, supabaseUrl, supabaseKey, userProfile }) => {
    const [rows, setRows] = useState<DepositRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>('');
    const [form, setForm] = useState({
        date: todayISO(),
        carName: '',
        amount: '',
        note: '',
        depositor: '',
    });
    const [search, setSearch] = useState('');
    const [carSearch, setCarSearch] = useState('');
    const [selectedCars, setSelectedCars] = useState<Set<string>>(new Set());
    const [allocations, setAllocations] = useState<Record<string, string>>({});
    const [showAllocation, setShowAllocation] = useState(false);
    const [historyCar, setHistoryCar] = useState<{ id: string | null; name: string } | null>(null);

    const client = useMemo(() => {
        if (!supabaseUrl || !supabaseKey) return null;
        try { return createSupabaseClient(supabaseUrl, supabaseKey); } catch { return null; }
    }, [supabaseUrl, supabaseKey]);

    const tableName = kind === 'cash' ? 'cash_deposits' : kind === 'bank' ? 'bank_transactions' : 'customs_payments';
    const dateField = kind === 'cash' ? 'deposit_date' : kind === 'bank' ? 'date' : 'payment_date';

    const loadRows = async () => {
        if (!client) return;
        setLoading(true); setError('');
        try {
            const { data, error } = await client.from(tableName).select('*').order(dateField, { ascending: false });
            if (error) throw error;
            setRows((data || []) as DepositRow[]);
        } catch (e: any) {
            setError(e?.message || 'Failed to load.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [client, kind]);

    const carLabel = (s?: CarSale) => s ? `${s.brand} ${s.model} ${s.year || ''} • ${(s.vin || '').slice(-8) || s.plateNumber || 'no vin'}`.trim() : '— Unlinked —';

    const filteredCars = useMemo(() => {
        const q = carSearch.trim().toLowerCase();
        const sorted = [...sales].sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
        if (!q) return sorted;
        return sorted.filter(s => {
            const blob = `${s.brand} ${s.model} ${s.year || ''} ${s.vin || ''} ${s.plateNumber || ''} ${s.buyerName || ''}`.toLowerCase();
            return blob.includes(q);
        });
    }, [sales, carSearch]);

    const toggleCar = (id: string) => {
        setSelectedCars(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectedCarsLabel = useMemo(() => {
        const labels: string[] = [];
        selectedCars.forEach(id => {
            const s = sales.find(x => x.id === id);
            if (s) labels.push(`${s.brand} ${s.model} ${s.year || ''}`.trim());
        });
        return labels.join(' | ');
    }, [selectedCars, sales]);

    const carLabelById = (id: string) => {
        const s = sales.find(x => x.id === id);
        return s ? `${s.brand} ${s.model} ${s.year || ''}`.trim() : id;
    };

    const commitBankInserts = async (entries: { carId: string | null; carName: string | null; amount: number }[]) => {
        if (!client) throw new Error('Backend not ready.');
        const rows = entries.map(e => ({
            id: crypto.randomUUID(),
            amount: e.amount,
            date: form.date,
            description: form.note || (e.carName ? `Deposit for ${e.carName}` : 'Bank deposit'),
            category: 'deposit',
            car_name: e.carName,
            source_sale_id: e.carId,
            last_edited_by: userProfile || null,
        }));
        const { error } = await client.from('bank_transactions').insert(rows);
        if (error) throw error;
    };

    const handleSave = async () => {
        if (!client) { setError('Backend not ready.'); return; }
        const amt = parseFloat(form.amount);
        if (!Number.isFinite(amt) || amt <= 0) { setError('Enter a valid amount.'); return; }
        if (!form.date) { setError('Pick a date.'); return; }

        // Bank + 2+ cars => open allocation step
        if (kind === 'bank' && selectedCars.size >= 2) {
            const ids = Array.from(selectedCars);
            const equal = (amt / ids.length).toFixed(2);
            const init: Record<string, string> = {};
            ids.forEach(id => { init[id] = equal; });
            setAllocations(init);
            setShowAllocation(true);
            return;
        }

        setSaving(true); setError('');
        try {
            const id = crypto.randomUUID();
            if (kind === 'cash') {
                const row = {
                    id, amount: amt, deposit_date: form.date,
                    car_name: form.carName || null, note: form.note || null,
                    depositor_name: form.depositor || null, receiver_name: userProfile || null,
                    source: 'manual', created_by: userProfile || null,
                };
                const { error } = await client.from('cash_deposits').insert(row);
                if (error) throw error;
            } else if (kind === 'customs') {
                const row = {
                    id, amount: amt, payment_date: form.date,
                    car_name: form.carName || null, note: form.note || null,
                    depositor_name: form.depositor || null, receiver_name: userProfile || null,
                    source: 'manual', created_by: userProfile || null,
                };
                const { error } = await client.from('customs_payments').insert(row);
                if (error) throw error;
            } else {
                // Bank with 0 or 1 car
                const onlyId = selectedCars.size === 1 ? Array.from(selectedCars)[0] : null;
                const carName = onlyId ? carLabelById(onlyId) : (form.carName || null);
                await commitBankInserts([{ carId: onlyId, carName, amount: amt }]);
            }
            setForm(f => ({ date: f.date, carName: '', amount: '', note: '', depositor: '' }));
            setSelectedCars(new Set());
            setCarSearch('');
            await loadRows();
        } catch (e: any) {
            setError(e?.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    const confirmAllocation = async () => {
        const amt = parseFloat(form.amount);
        const ids = Array.from(selectedCars);
        const parsed = ids.map(id => ({ id, val: parseFloat(allocations[id] || '0') }));
        if (parsed.some(p => !Number.isFinite(p.val) || p.val < 0)) {
            setError('All allocations must be valid numbers ≥ 0.');
            return;
        }
        const sum = parsed.reduce((a, p) => a + p.val, 0);
        if (Math.abs(sum - amt) > 0.01) {
            setError(`Allocations sum to € ${sum.toFixed(2)} but total is € ${amt.toFixed(2)}.`);
            return;
        }
        setSaving(true); setError('');
        try {
            await commitBankInserts(parsed.filter(p => p.val > 0).map(p => ({
                carId: p.id,
                carName: carLabelById(p.id),
                amount: p.val,
            })));
            setShowAllocation(false);
            setForm(f => ({ date: f.date, carName: '', amount: '', note: '', depositor: '' }));
            setSelectedCars(new Set());
            setAllocations({});
            setCarSearch('');
            await loadRows();
        } catch (e: any) {
            setError(e?.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };


    const handleDelete = async (id: string) => {
        if (!client) return;
        if (!confirm('Delete this deposit?')) return;
        try {
            const { error } = await client.from(tableName).delete().eq('id', id);
            if (error) throw error;
            setRows(prev => prev.filter(r => r.id !== id));
        } catch (e: any) {
            setError(e?.message || 'Failed to delete.');
        }
    };

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => {
            const blob = [
                r.note, r.description, r.depositor_name, r.receiver_name, r.car_name,
                String(r.amount || ''),
            ].join(' ').toLowerCase();
            return blob.includes(q);
        });
    }, [rows, search]);

    const totalAmount = useMemo(() => filteredRows.reduce((sum, r) => sum + Number(r.amount || 0), 0), [filteredRows]);

    const accent = kind === 'cash'
        ? { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: <Wallet className="w-4 h-4" />, btn: 'bg-emerald-600 hover:bg-emerald-700', selBg: 'bg-emerald-50', selBtn: 'bg-emerald-600 border-emerald-600' }
        : kind === 'customs'
        ? { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: <ShieldCheck className="w-4 h-4" />, btn: 'bg-amber-600 hover:bg-amber-700', selBg: 'bg-amber-50', selBtn: 'bg-amber-600 border-amber-600' }
        : { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: <Landmark className="w-4 h-4" />, btn: 'bg-blue-600 hover:bg-blue-700', selBg: 'bg-blue-50', selBtn: 'bg-blue-600 border-blue-600' };

    const headingLabel = kind === 'cash' ? 'Cash Deposit' : kind === 'customs' ? 'Pagesa Dogane' : 'Bank Deposit';

    return (
        <div className="space-y-3">
            {/* Add form */}
            <div className={`rounded-2xl border ${accent.border} ${accent.bg} p-3`}>
                <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] ${accent.text} mb-2`}>
                    {accent.icon} Add {headingLabel}
                </div>

                {kind === 'bank' ? (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                Date
                                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                            </label>
                            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                Amount (€)
                                <input type="number" inputMode="decimal" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                            </label>
                            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                Note (optional)
                                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Reference / memo" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                            </label>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Search className="w-3.5 h-3.5 text-slate-400" />
                                <input value={carSearch} onChange={e => setCarSearch(e.target.value)} placeholder="Search all cars…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 bg-white" />
                                <span className={`text-[10px] font-bold ${accent.text} ${accent.bg} border ${accent.border} rounded-md px-2 py-1 whitespace-nowrap`}>
                                    {selectedCars.size} selected
                                </span>
                            </div>
                            <div className="max-h-64 overflow-auto divide-y divide-slate-100 rounded-lg border border-slate-100">
                                {filteredCars.length === 0 ? (
                                    <div className="text-center text-slate-400 py-6 text-xs">No cars found.</div>
                                ) : filteredCars.map(s => {
                                    const checked = selectedCars.has(s.id);
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => toggleCar(s.id)}
                                            className={`w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors ${checked ? accent.selBg : 'hover:bg-slate-50'}`}
                                        >
                                            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? `${accent.selBtn} text-white` : 'border-slate-300 bg-white'}`}>
                                                {checked && <Check className="w-3 h-3" />}
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block font-bold text-slate-900 truncate">{carLabel(s)}</span>
                                                <span className="block text-[10px] text-slate-500 truncate">
                                                    {s.status}{s.buyerName ? ` • ${s.buyerName}` : ''}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                Date
                                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                            </label>
                            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 lg:col-span-2">
                                Car Name
                                <input value={form.carName} onChange={e => setForm(f => ({ ...f, carName: e.target.value }))} placeholder="e.g. BMW X5 2020" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                            </label>
                            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                Amount (€)
                                <input type="number" inputMode="decimal" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                            </label>
                            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                Depositor
                                <input value={form.depositor} onChange={e => setForm(f => ({ ...f, depositor: e.target.value }))} placeholder="Name (optional)" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                            </label>
                        </div>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 mt-2">
                            Note
                            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                        </label>
                    </>
                )}

                {error && <div className="text-[11px] font-semibold text-red-600 mt-2">{error}</div>}
                <div className="flex items-center justify-end mt-3">
                    <button type="button" disabled={saving} onClick={handleSave} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-xs font-bold ${accent.btn} disabled:opacity-50 transition-all`}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Save Deposit
                    </button>
                </div>
            </div>

            {/* Filter + summary */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search car / VIN / buyer / note…" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white" />
                <div className={`rounded-lg border ${accent.border} ${accent.bg} px-3 py-2 text-xs font-bold ${accent.text} whitespace-nowrap`}>
                    {filteredRows.length} entries • € {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
            </div>

            {/* List */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                <div className="hidden md:grid grid-cols-[110px_1.4fr_1fr_120px_60px] gap-3 px-3 py-2 bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 border-b border-slate-200">
                    <div>Date</div>
                    <div>Car</div>
                    <div>Note / Depositor</div>
                    <div className="text-right">Amount (€)</div>
                    <div></div>
                </div>
                {loading ? (
                    <div className="text-center text-slate-500 py-10 text-xs flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                ) : filteredRows.length === 0 ? (
                    <div className="text-center text-slate-400 py-12 text-xs">No deposits yet.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {filteredRows.map(r => {
                            const dateVal = (r as any)[dateField] || r.created_at;
                            const note = kind === 'cash' ? (r.note || r.depositor_name || '') : (r.description || '');
                            return (
                                <div key={r.id} className="grid grid-cols-1 md:grid-cols-[110px_1.4fr_1fr_120px_60px] gap-2 md:gap-3 px-3 py-2.5 text-xs items-center">
                                    <div className="text-slate-700 font-semibold">{dateVal ? new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                                    <div className="min-w-0">
                                        {kind === 'bank' && r.car_name ? (
                                            <button
                                                type="button"
                                                onClick={() => setHistoryCar({ id: r.source_sale_id || null, name: r.car_name! })}
                                                className="font-bold text-blue-700 hover:text-blue-900 hover:underline truncate text-left w-full"
                                                title="View payment history for this car"
                                            >
                                                {r.car_name}
                                            </button>
                                        ) : (
                                            <div className="font-bold text-slate-900 truncate">{r.car_name || '—'}</div>
                                        )}
                                    </div>
                                    <div className="text-slate-600 truncate">{note || '—'}</div>
                                    <div className={`text-right font-black ${accent.text}`}>€ {Number(r.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div className="flex md:justify-end">
                                        <button type="button" onClick={() => handleDelete(r.id)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DepositsTab;
