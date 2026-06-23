import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Wallet, Save, History } from 'lucide-react';
import { createSupabaseClient } from '@/services/supabaseService';

interface Props {
    supabaseUrl: string;
    supabaseKey: string;
    userProfile: string;
}

type HistoryEntry = { amount: number; updated_at: string; updated_by: string | null; note?: string | null };

const CONFIG_KEY = 'current_cash_available';

const CurrentCashTab: React.FC<Props> = ({ supabaseUrl, supabaseKey, userProfile }) => {
    const [amount, setAmount] = useState<string>('');
    const [note, setNote] = useState<string>('');
    const [savedAmount, setSavedAmount] = useState<number | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [savedBy, setSavedBy] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const client = useMemo(() => {
        if (!supabaseUrl || !supabaseKey) return null;
        try { return createSupabaseClient(supabaseUrl, supabaseKey); } catch { return null; }
    }, [supabaseUrl, supabaseKey]);

    const load = async () => {
        if (!client) return;
        setLoading(true); setError('');
        try {
            const { data, error } = await client.from('app_config').select('*').eq('key', CONFIG_KEY).maybeSingle();
            if (error) throw error;
            const value = (data?.value as any) || {};
            setSavedAmount(typeof value.amount === 'number' ? value.amount : null);
            setSavedAt(data?.updated_at || null);
            setSavedBy(data?.updated_by || null);
            setHistory(Array.isArray(value.history) ? value.history.slice(0, 25) : []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [client]);

    const handleSave = async () => {
        if (!client) { setError('Backend not ready.'); return; }
        const n = parseFloat(amount);
        if (!Number.isFinite(n) || n < 0) { setError('Enter a valid amount.'); return; }
        setSaving(true); setError('');
        try {
            const now = new Date().toISOString();
            const entry: HistoryEntry = { amount: n, updated_at: now, updated_by: userProfile || null, note: note || null };
            const nextHistory = [entry, ...history].slice(0, 50);
            const payload = { key: CONFIG_KEY, value: { amount: n, history: nextHistory } as any, updated_by: userProfile || null, updated_at: now };
            const { error } = await client.from('app_config').upsert(payload, { onConflict: 'key' });
            if (error) throw error;
            setSavedAmount(n); setSavedAt(now); setSavedBy(userProfile || null);
            setHistory(nextHistory);
            setAmount(''); setNote('');
        } catch (e: any) {
            setError(e?.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    const fmt = (n: number | null) => n == null ? '—' : `€${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-3 mb-4">
                {/* Current value card */}
                <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 px-5 py-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">Current Cash Available</div>
                        <Wallet className="w-5 h-5 text-amber-700" />
                    </div>
                    {loading ? (
                        <div className="mt-2 flex items-center gap-2 text-amber-800 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                    ) : (
                        <>
                            <div className="text-4xl font-black text-amber-900 mt-1">{fmt(savedAmount)}</div>
                            <div className="text-[11px] text-amber-800/80 mt-1">
                                {savedAt ? `Last updated ${new Date(savedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'No value set yet'}
                                {savedBy ? ` • by ${savedBy}` : ''}
                            </div>
                        </>
                    )}
                </div>

                {/* Manual entry */}
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600 mb-2">Set new amount</div>
                    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2">
                        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Amount (€)
                            <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 bg-white" />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Note (optional)
                            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. counted at end of day" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white" />
                        </label>
                        <div className="flex items-end">
                            <button type="button" disabled={saving} onClick={handleSave} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50 transition-all">
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                            </button>
                        </div>
                    </div>
                    {error && <div className="text-[11px] font-semibold text-red-600 mt-2">{error}</div>}
                </div>
            </div>

            {/* History */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
                    <History className="w-3.5 h-3.5" /> Change History
                </div>
                {history.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400">No updates yet — enter the current cash on hand to start tracking.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {history.map((h, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-[140px_140px_1fr_120px] gap-2 px-4 py-2.5 text-xs items-center">
                                <div className="text-slate-700 font-semibold">{new Date(h.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                <div className="text-slate-500">{new Date(h.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} • {h.updated_by || '—'}</div>
                                <div className="text-slate-600 truncate">{h.note || ''}</div>
                                <div className="md:text-right font-black text-amber-700">€{Number(h.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

export default CurrentCashTab;
