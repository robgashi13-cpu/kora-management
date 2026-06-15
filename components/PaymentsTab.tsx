'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Banknote, Sparkles, Trash2, Loader2, CalendarDays, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { CarSale } from '@/src/types';
import { createSupabaseClient } from '@/services/supabaseService';

interface CashDeposit {
    id: string;
    amount: number;
    deposit_date: string | null;
    depositor_name: string | null;
    receiver_name: string | null;
    source_sale_id: string | null;
    note: string | null;
    source: string;
    created_by: string | null;
    created_at: string;
}

interface Props {
    sales: CarSale[];
    userProfile: string | null;
}

const fmt = (n: number) => `€${(n || 0).toLocaleString()}`;

const PaymentsTab: React.FC<Props> = ({ sales, userProfile }) => {
    const [deposits, setDeposits] = useState<CashDeposit[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [form, setForm] = useState({
        amount: '',
        deposit_date: new Date().toISOString().slice(0, 10),
        depositor_name: '',
        receiver_name: '',
        note: '',
    });

    const supabase = useMemo(() => {
        try { return createSupabaseClient(); } catch { return null; }
    }, []);

    const load = async () => {
        if (!supabase) { setLoading(false); return; }
        setLoading(true);
        const { data, error } = await supabase
            .from('cash_deposits')
            .select('*')
            .order('deposit_date', { ascending: false })
            .order('created_at', { ascending: false });
        if (!error && data) setDeposits(data as CashDeposit[]);
        setLoading(false);
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const totals = useMemo(() => {
        const totalCashDeposits = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
        const totalCashFromSales = sales.reduce((s, c) => s + (c.amountPaidCash || 0), 0);
        const totalBankFromSales = sales.reduce((s, c) => s + (c.amountPaidBank || 0), 0);
        return { totalCashDeposits, totalCashFromSales, totalBankFromSales };
    }, [deposits, sales]);

    const addDeposit = async () => {
        if (!supabase) return;
        const amount = Number(form.amount);
        if (!amount || isNaN(amount)) { alert('Enter a valid amount'); return; }
        setAdding(true);
        const { error } = await supabase.from('cash_deposits').insert({
            amount,
            deposit_date: form.deposit_date || null,
            depositor_name: form.depositor_name || null,
            receiver_name: form.receiver_name || null,
            note: form.note || null,
            source: 'manual',
            created_by: userProfile || 'unknown',
        });
        setAdding(false);
        if (error) { alert('Failed to save: ' + error.message); return; }
        setForm({ amount: '', deposit_date: new Date().toISOString().slice(0, 10), depositor_name: '', receiver_name: '', note: '' });
        load();
    };

    const removeDeposit = async (id: string) => {
        if (!supabase) return;
        if (!confirm('Delete this deposit?')) return;
        await supabase.from('cash_deposits').delete().eq('id', id);
        load();
    };

    const scanWithAI = async () => {
        // Stub: edge function exists but Gemini call is commented out.
        setScanning(true);
        try {
            const { data, error } = await supabase!.functions.invoke('scan-payments', { body: { sales: sales.slice(0, 5) } });
            if (error) throw error;
            alert(data?.message || 'AI scan is not active yet. The endpoint is scaffolded — enable Gemini in supabase/functions/scan-payments/index.ts when ready.');
        } catch (e: any) {
            alert('AI scan coming soon. ' + (e?.message || ''));
        } finally {
            setScanning(false);
        }
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 md:p-0">
            {/* Totals */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-bold">Cash Deposits (logged)</div>
                    <div className="text-2xl font-mono font-bold text-slate-900 mt-1">{fmt(totals.totalCashDeposits)}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{deposits.length} record{deposits.length === 1 ? '' : 's'}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-bold flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-emerald-500" /> Cash from Sales</div>
                    <div className="text-2xl font-mono font-bold text-emerald-600 mt-1">{fmt(totals.totalCashFromSales)}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-bold flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-slate-500" /> Bank from Sales</div>
                    <div className="text-2xl font-mono font-bold text-slate-700 mt-1">{fmt(totals.totalBankFromSales)}</div>
                </div>
            </div>

            {/* Add form + AI scan */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Banknote className="w-4 h-4" /> Log Cash Deposit</h3>
                    <button
                        type="button"
                        onClick={scanWithAI}
                        disabled={scanning}
                        title="Scan all bank receipts, Korea paid invoices and deposit invoices with AI to extract amounts, senders and receivers."
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                    >
                        {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Scan with AI
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    <input
                        type="number"
                        placeholder="Amount €"
                        value={form.amount}
                        onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
                        className="h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-slate-500"
                    />
                    <input
                        type="date"
                        value={form.deposit_date}
                        onChange={(e) => setForm(p => ({ ...p, deposit_date: e.target.value }))}
                        className="h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-slate-500"
                    />
                    <input
                        type="text"
                        placeholder="Depositor (sender)"
                        value={form.depositor_name}
                        onChange={(e) => setForm(p => ({ ...p, depositor_name: e.target.value }))}
                        className="h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-slate-500"
                    />
                    <input
                        type="text"
                        placeholder="Receiver"
                        value={form.receiver_name}
                        onChange={(e) => setForm(p => ({ ...p, receiver_name: e.target.value }))}
                        className="h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-slate-500"
                    />
                    <input
                        type="text"
                        placeholder="Note"
                        value={form.note}
                        onChange={(e) => setForm(p => ({ ...p, note: e.target.value }))}
                        className="h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-slate-500"
                    />
                </div>
                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={addDeposit}
                        disabled={adding}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
                    >
                        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Add Deposit
                    </button>
                </div>
            </div>

            {/* History */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-800">History Log</h3>
                </div>
                <div className="overflow-auto scroll-container flex-1">
                    {loading ? (
                        <div className="p-8 text-center text-sm text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                    ) : deposits.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-400">No cash deposits logged yet.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left">Date</th>
                                    <th className="px-4 py-2 text-right">Amount</th>
                                    <th className="px-4 py-2 text-left">Depositor</th>
                                    <th className="px-4 py-2 text-left">Receiver</th>
                                    <th className="px-4 py-2 text-left">Note</th>
                                    <th className="px-4 py-2 text-left">By</th>
                                    <th className="px-4 py-2 text-left">Source</th>
                                    <th className="px-4 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {deposits.map(d => (
                                    <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                                        <td className="px-4 py-2 text-slate-700">{d.deposit_date || '-'}</td>
                                        <td className="px-4 py-2 text-right font-mono font-bold text-emerald-600">{fmt(Number(d.amount))}</td>
                                        <td className="px-4 py-2 text-slate-700">{d.depositor_name || '-'}</td>
                                        <td className="px-4 py-2 text-slate-700">{d.receiver_name || '-'}</td>
                                        <td className="px-4 py-2 text-slate-500">{d.note || '-'}</td>
                                        <td className="px-4 py-2 text-slate-500">{d.created_by || '-'}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${d.source === 'ai_scan' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {d.source}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <button onClick={() => removeDeposit(d.id)} className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PaymentsTab;
