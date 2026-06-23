import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Wallet, Landmark } from 'lucide-react';
import { createSupabaseClient } from '@/services/supabaseService';
import { CarSale } from '@/src/types';

type Kind = 'cash' | 'bank';

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

    const client = useMemo(() => {
        if (!supabaseUrl || !supabaseKey) return null;
        try { return createSupabaseClient(supabaseUrl, supabaseKey); } catch { return null; }
    }, [supabaseUrl, supabaseKey]);

    const tableName = kind === 'cash' ? 'cash_deposits' : 'bank_transactions';
    const dateField = kind === 'cash' ? 'deposit_date' : 'date';

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

    const carById = useMemo(() => {
        const m = new Map<string, CarSale>();
        sales.forEach(s => m.set(s.id, s));
        return m;
    }, [sales]);

    const carLabel = (s?: CarSale) => s ? `${s.brand} ${s.model} ${s.year || ''} • ${(s.vin || '').slice(-8) || s.plateNumber || 'no vin'}`.trim() : '— Unlinked —';

    const carOptions = useMemo(() => {
        const sorted = [...sales].sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
        return sorted;
    }, [sales]);

    const handleSave = async () => {
        if (!client) { setError('Backend not ready.'); return; }
        const amt = parseFloat(form.amount);
        if (!Number.isFinite(amt) || amt <= 0) { setError('Enter a valid amount.'); return; }
        if (!form.date) { setError('Pick a date.'); return; }
        setSaving(true); setError('');
        try {
            const id = crypto.randomUUID();
            if (kind === 'cash') {
                const row = {
                    id,
                    amount: amt,
                    deposit_date: form.date,
                    car_name: form.carName || null,
                    note: form.note || null,
                    depositor_name: form.depositor || null,
                    receiver_name: userProfile || null,
                    source: 'manual',
                    created_by: userProfile || null,
                };
                const { error } = await client.from('cash_deposits').insert(row);
                if (error) throw error;
            } else {
                const descBase = form.note || (form.carName ? `Deposit for ${form.carName}` : 'Bank deposit');
                const row = {
                    id,
                    amount: amt,
                    date: form.date,
                    description: descBase,
                    category: 'deposit',
                    car_name: form.carName || null,
                    last_edited_by: userProfile || null,
                };
                const { error } = await client.from('bank_transactions').insert(row);
                if (error) throw error;
            }
            setForm({ date: todayISO(), carName: '', amount: '', note: '', depositor: '' });
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
            const sale = r.source_sale_id ? carById.get(r.source_sale_id) : undefined;
            const blob = [
                r.note, r.description, r.depositor_name, r.receiver_name,
                sale?.brand, sale?.model, sale?.vin, sale?.plateNumber, sale?.buyerName,
                String(r.amount || ''),
            ].join(' ').toLowerCase();
            return blob.includes(q);
        });
    }, [rows, search, carById]);

    const totalAmount = useMemo(() => filteredRows.reduce((sum, r) => sum + Number(r.amount || 0), 0), [filteredRows]);

    const accent = kind === 'cash'
        ? { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: <Wallet className="w-4 h-4" />, btn: 'bg-emerald-600 hover:bg-emerald-700' }
        : { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: <Landmark className="w-4 h-4" />, btn: 'bg-blue-600 hover:bg-blue-700' };

    return (
        <div className="space-y-3">
            {/* Add form */}
            <div className={`rounded-2xl border ${accent.border} ${accent.bg} p-3`}>
                <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] ${accent.text} mb-2`}>
                    {accent.icon} Add {kind === 'cash' ? 'Cash' : 'Bank'} Deposit
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Date
                        <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 lg:col-span-2">
                        For Car
                        <select value={form.carId} onChange={e => setForm(f => ({ ...f, carId: e.target.value }))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white">
                            <option value="">— Unlinked —</option>
                            {carOptions.map(s => (
                                <option key={s.id} value={s.id}>{carLabel(s)} {s.buyerName ? `• ${s.buyerName}` : ''}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Amount (€)
                        <input type="number" inputMode="decimal" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        {kind === 'cash' ? 'Depositor' : 'Note'}
                        <input value={kind === 'cash' ? form.depositor : form.note} onChange={e => setForm(f => kind === 'cash' ? ({ ...f, depositor: e.target.value }) : ({ ...f, note: e.target.value }))} placeholder={kind === 'cash' ? 'Name (optional)' : 'Reference / memo'} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                    </label>
                </div>
                {kind === 'cash' && (
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 mt-2">
                        Note
                        <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 bg-white" />
                    </label>
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
                            const sale = r.source_sale_id ? carById.get(r.source_sale_id) : undefined;
                            const dateVal = (r as any)[dateField] || r.created_at;
                            const note = kind === 'cash' ? (r.note || r.depositor_name || '') : (r.description || '');
                            return (
                                <div key={r.id} className="grid grid-cols-1 md:grid-cols-[110px_1.4fr_1fr_120px_60px] gap-2 md:gap-3 px-3 py-2.5 text-xs items-center">
                                    <div className="text-slate-700 font-semibold">{dateVal ? new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-900 truncate">{carLabel(sale)}</div>
                                        {sale?.buyerName && <div className="text-[10px] text-slate-500 truncate">Buyer: {sale.buyerName}</div>}
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
