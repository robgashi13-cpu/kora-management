import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, Search } from 'lucide-react';
import { createSupabaseClient } from '@/services/supabaseService';
import { CarSale } from '@/src/types';

interface Props {
    sales: CarSale[];
    supabaseUrl: string;
    supabaseKey: string;
}

type KoreaRow = { id: string; total_amount: number; car_ids: string[] };
type BankRow = { id: string; amount: number; source_sale_id: string | null; car_name: string | null };

const MissingCashTab: React.FC<Props> = ({ sales, supabaseUrl, supabaseKey }) => {
    const [korea, setKorea] = useState<KoreaRow[]>([]);
    const [bank, setBank] = useState<BankRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [onlyMissing, setOnlyMissing] = useState(true);

    const client = useMemo(() => {
        if (!supabaseUrl || !supabaseKey) return null;
        try { return createSupabaseClient(supabaseUrl, supabaseKey); } catch { return null; }
    }, [supabaseUrl, supabaseKey]);

    useEffect(() => {
        const load = async () => {
            if (!client) return;
            setLoading(true); setError('');
            try {
                const [kRes, bRes] = await Promise.all([
                    client.from('korea_payments').select('id,total_amount,car_ids'),
                    client.from('bank_transactions').select('id,amount,source_sale_id,car_name'),
                ]);
                if (kRes.error) throw kRes.error;
                if (bRes.error) throw bRes.error;
                setKorea((kRes.data || []).map((r: any) => ({
                    id: r.id,
                    total_amount: Number(r.total_amount || 0),
                    car_ids: Array.isArray(r.car_ids) ? r.car_ids : (r.car_ids ? JSON.parse(r.car_ids) : []),
                })));
                setBank((bRes.data || []) as BankRow[]);
            } catch (e: any) {
                setError(e?.message || 'Failed to load.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [client]);

    const rows = useMemo(() => {
        const koreaPerCar = new Map<string, number>();
        korea.forEach(k => {
            const n = k.car_ids?.length || 0;
            if (!n) return;
            const share = k.total_amount / n;
            k.car_ids.forEach(id => koreaPerCar.set(id, (koreaPerCar.get(id) || 0) + share));
        });
        const bankPerCar = new Map<string, number>();
        bank.forEach(b => {
            if (b.source_sale_id) {
                bankPerCar.set(b.source_sale_id, (bankPerCar.get(b.source_sale_id) || 0) + Number(b.amount || 0));
            }
        });

        const q = search.trim().toLowerCase();
        const active = sales.filter(s => s.status !== 'Archived' && s.status !== 'Cancelled');
        return active
            .filter(s => {
                if (!q) return true;
                const blob = `${s.brand} ${s.model} ${s.year || ''} ${s.vin || ''} ${s.plateNumber || ''} ${s.buyerName || ''}`.toLowerCase();
                return blob.includes(q);
            })
            .map(s => {
                const total = Number(s.soldPrice || 0);
                const paidKorea = koreaPerCar.get(s.id) || 0;
                const paidCash = Number(s.amountPaidCash || 0);
                const paidBankSale = Number(s.amountPaidBank || 0);
                const paidBankLogs = bankPerCar.get(s.id) || 0;
                const paidBank = paidBankSale + paidBankLogs;
                const deposit = Number(s.deposit || 0);
                const totalPaid = paidCash + paidBank + deposit;
                const missing = Math.max(0, total - totalPaid);
                return { s, total, paidKorea, paidCash, paidBank, deposit, totalPaid, missing };
            })
            .filter(r => (onlyMissing ? r.missing > 0.01 : true))
            .sort((a, b) => b.missing - a.missing);
    }, [sales, korea, bank, search, onlyMissing]);

    const grand = useMemo(() => rows.reduce((acc, r) => ({
        total: acc.total + r.total,
        paidKorea: acc.paidKorea + r.paidKorea,
        totalPaid: acc.totalPaid + r.totalPaid,
        missing: acc.missing + r.missing,
    }), { total: 0, paidKorea: 0, totalPaid: 0, missing: 0 }), [rows]);

    const fmt = (n: number) => `€ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-rose-700 mb-2">
                    <AlertCircle className="w-4 h-4" /> Missing Cash Per Car
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Total Price</div>
                        <div className="text-sm font-black text-slate-900">{fmt(grand.total)}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Paid Korea</div>
                        <div className="text-sm font-black text-indigo-700">{fmt(grand.paidKorea)}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Total Paid</div>
                        <div className="text-sm font-black text-emerald-700">{fmt(grand.totalPaid)}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-rose-300 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase text-rose-600">Missing Cash</div>
                        <div className="text-sm font-black text-rose-700">{fmt(grand.missing)}</div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search car / VIN / buyer…" className="flex-1 text-xs text-slate-900 outline-none bg-transparent" />
                </div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 px-2">
                    <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
                    Only show cars with missing cash
                </label>
            </div>

            {error && <div className="text-[11px] font-semibold text-red-600">{error}</div>}

            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                <div className="hidden md:grid grid-cols-[1.6fr_110px_110px_110px_110px_110px_120px] gap-2 px-3 py-2 bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 border-b border-slate-200">
                    <div>Car / VIN</div>
                    <div className="text-right">Total Price</div>
                    <div className="text-right">Paid Korea</div>
                    <div className="text-right">Paid Cash</div>
                    <div className="text-right">Paid Bank</div>
                    <div className="text-right">Total Paid</div>
                    <div className="text-right">Missing Cash</div>
                </div>
                {loading ? (
                    <div className="text-center text-slate-500 py-10 text-xs flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                ) : rows.length === 0 ? (
                    <div className="text-center text-slate-400 py-12 text-xs">No cars match.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {rows.map(r => (
                            <div key={r.s.id} className="grid grid-cols-2 md:grid-cols-[1.6fr_110px_110px_110px_110px_110px_120px] gap-1.5 md:gap-2 px-3 py-2.5 text-xs items-center">
                                <div className="min-w-0 col-span-2 md:col-span-1">
                                    <div className="font-bold text-slate-900 truncate">{r.s.brand} {r.s.model} {r.s.year || ''}</div>
                                    <div className="text-[10px] text-slate-500 truncate">VIN: {r.s.vin || '—'} • {r.s.status}{r.s.buyerName ? ` • ${r.s.buyerName}` : ''}</div>
                                </div>
                                <div className="text-right font-bold text-slate-800">{fmt(r.total)}</div>
                                <div className="text-right font-bold text-indigo-700">{fmt(r.paidKorea)}</div>
                                <div className="text-right font-bold text-emerald-700">{fmt(r.paidCash + r.deposit)}</div>
                                <div className="text-right font-bold text-blue-700">{fmt(r.paidBank)}</div>
                                <div className="text-right font-black text-slate-900">{fmt(r.totalPaid)}</div>
                                <div className={`text-right font-black ${r.missing > 0.01 ? 'text-rose-700' : 'text-emerald-600'}`}>{fmt(r.missing)}</div>
                            </div>
                        ))}
                    </div>
                )}
                {rows.length > 0 && (
                    <div className="hidden md:grid grid-cols-[1.6fr_110px_110px_110px_110px_110px_120px] gap-2 px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs font-black">
                        <div className="text-slate-700 uppercase tracking-wider">Grand Total</div>
                        <div className="text-right text-slate-900">{fmt(grand.total)}</div>
                        <div className="text-right text-indigo-700">{fmt(grand.paidKorea)}</div>
                        <div className="text-right text-emerald-700">—</div>
                        <div className="text-right text-blue-700">—</div>
                        <div className="text-right text-slate-900">{fmt(grand.totalPaid)}</div>
                        <div className="text-right text-rose-700">{fmt(grand.missing)}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MissingCashTab;
