import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Wallet, ArrowUpRight, ArrowDownRight, Coins } from 'lucide-react';
import { createSupabaseClient } from '@/services/supabaseService';
import { CarSale } from '@/src/types';

interface Props {
    sales: CarSale[];
    supabaseUrl: string;
    supabaseKey: string;
}

const CurrentCashTab: React.FC<Props> = ({ sales, supabaseUrl, supabaseKey }) => {
    const [deposits, setDeposits] = useState<Array<{ id: string; amount: number; deposit_date: string | null; source_sale_id: string | null; note: string | null }>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    const client = useMemo(() => {
        if (!supabaseUrl || !supabaseKey) return null;
        try { return createSupabaseClient(supabaseUrl, supabaseKey); } catch { return null; }
    }, [supabaseUrl, supabaseKey]);

    useEffect(() => {
        if (!client) return;
        (async () => {
            setLoading(true); setError('');
            try {
                const { data, error } = await client.from('cash_deposits').select('*').order('deposit_date', { ascending: false });
                if (error) throw error;
                setDeposits((data || []) as any);
            } catch (e: any) {
                setError(e?.message || 'Failed to load deposits');
            } finally {
                setLoading(false);
            }
        })();
    }, [client]);

    const activeSales = useMemo(() => sales.filter(s => s.status !== 'Archived' && s.status !== 'Cancelled'), [sales]);

    const totalCashCollected = useMemo(() => activeSales.reduce((sum, s) => sum + (Number(s.amountPaidCash) || 0), 0), [activeSales]);
    const totalCashDeposited = useMemo(() => deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0), [deposits]);
    const currentCashAvailable = totalCashCollected - totalCashDeposited;

    const depositsBySale = useMemo(() => {
        const m = new Map<string, number>();
        deposits.forEach(d => {
            if (d.source_sale_id) m.set(d.source_sale_id, (m.get(d.source_sale_id) || 0) + (Number(d.amount) || 0));
        });
        return m;
    }, [deposits]);

    const unlinkedDepositTotal = useMemo(() => deposits.filter(d => !d.source_sale_id).reduce((s, d) => s + (Number(d.amount) || 0), 0), [deposits]);

    const cashRows = useMemo(() => {
        const rows = activeSales
            .filter(s => (Number(s.amountPaidCash) || 0) > 0)
            .map(s => {
                const cashIn = Number(s.amountPaidCash) || 0;
                const deposited = depositsBySale.get(s.id) || 0;
                const remaining = cashIn - deposited;
                return { sale: s, cashIn, deposited, remaining };
            });
        const q = search.trim().toLowerCase();
        const filtered = q
            ? rows.filter(r => [r.sale.brand, r.sale.model, r.sale.vin, r.sale.plateNumber, r.sale.buyerName].join(' ').toLowerCase().includes(q))
            : rows;
        return filtered.sort((a, b) => b.remaining - a.remaining);
    }, [activeSales, depositsBySale, search]);

    const fmt = (n: number) => `€${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    return (
        <>
            {error && <div className="mb-3 text-xs font-semibold text-red-600">{error}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">Cash Collected</div>
                        <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-xl font-black text-emerald-800">{fmt(totalCashCollected)}</div>
                    <div className="text-xs text-emerald-700/80">From {activeSales.filter(s => (Number(s.amountPaidCash) || 0) > 0).length} cars</div>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Deposited to Bank</div>
                        <ArrowDownRight className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-xl font-black text-blue-800">{fmt(totalCashDeposited)}</div>
                    <div className="text-xs text-blue-700/80">{deposits.length} cash deposits</div>
                </div>
                <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Cash Available</div>
                        <Wallet className="w-4 h-4 text-amber-700" />
                    </div>
                    <div className={`text-2xl font-black ${currentCashAvailable < 0 ? 'text-red-600' : 'text-amber-900'}`}>{fmt(currentCashAvailable)}</div>
                    <div className="text-xs text-amber-800/80">In hand right now</div>
                </div>
            </div>

            {unlinkedDepositTotal > 0 && (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    <span className="font-bold text-slate-700">Note:</span> {fmt(unlinkedDepositTotal)} of cash deposits are not linked to any specific car.
                </div>
            )}

            <div className="mb-3">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by car, plate, VIN, buyer…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>

            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="hidden md:grid grid-cols-[1.4fr_1fr_130px_130px_130px] gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 bg-slate-50 border-b border-slate-200">
                    <div>Car</div><div>Buyer / VIN</div><div className="text-right">Cash In</div><div className="text-right">Deposited</div><div className="text-right">Still in Hand</div>
                </div>
                {loading ? (
                    <div className="py-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                ) : cashRows.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2"><Coins className="w-6 h-6 opacity-40" /> No cash received yet.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {cashRows.map(({ sale, cashIn, deposited, remaining }) => (
                            <div key={sale.id} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_130px_130px_130px] gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm items-center">
                                <div className="font-semibold text-slate-900 truncate">{sale.brand} {sale.model} {sale.year || ''}</div>
                                <div className="text-slate-600 truncate">
                                    <span className="font-semibold text-slate-800">{sale.buyerName || '-'}</span>
                                    <span className="text-[10px] text-slate-500 ml-1">• {(sale.vin || '-').slice(-8)}</span>
                                </div>
                                <div className="md:text-right font-bold text-emerald-700">{fmt(cashIn)}</div>
                                <div className="md:text-right font-semibold text-blue-700">{fmt(deposited)}</div>
                                <div className={`md:text-right font-black ${remaining > 0 ? 'text-amber-700' : remaining < 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(remaining)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

export default CurrentCashTab;
