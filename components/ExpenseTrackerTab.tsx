import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Plus, Trash2, Search, Pencil, Check, X } from 'lucide-react';

type Expense = {
    id: string;
    expense_date: string;
    category: string;
    description: string | null;
    amount: number;
};

type Props = {
    supabaseUrl: string;
    supabaseKey: string;
};

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Fuel', 'Office', 'Marketing', 'Transport', 'Maintenance', 'Taxes', 'Other'];

const fmt = (n: number) => `€ ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

const ExpenseTrackerTab: React.FC<Props> = ({ supabaseUrl, supabaseKey }) => {
    const client = useMemo(() => (supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null), [supabaseUrl, supabaseKey]);
    const [rows, setRows] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState<string>('all');

    const [form, setForm] = useState({ expense_date: todayISO(), category: 'Other', description: '', amount: '' });
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ expense_date: todayISO(), category: 'Other', description: '', amount: '' });

    const load = async () => {
        if (!client) return;
        setLoading(true);
        const { data, error } = await client.from('invoice_expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
        if (!error && data) setRows(data as any);
        setLoading(false);
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [client]);

    const addExpense = async () => {
        if (!client) return;
        const amt = parseFloat(form.amount);
        if (!isFinite(amt) || amt <= 0) { alert('Enter a valid amount'); return; }
        const { error } = await client.from('invoice_expenses').insert({
            expense_date: form.expense_date || todayISO(),
            category: form.category || 'Other',
            description: form.description || null,
            amount: amt,
        });
        if (error) { alert(error.message); return; }
        setForm({ expense_date: todayISO(), category: 'Other', description: '', amount: '' });
        load();
    };

    const removeExpense = async (id: string) => {
        if (!client) return;
        if (!confirm('Delete this expense?')) return;
        await client.from('invoice_expenses').delete().eq('id', id);
        load();
    };

    const startEdit = (e: Expense) => {
        setEditId(e.id);
        setEditForm({ expense_date: e.expense_date, category: e.category, description: e.description || '', amount: String(e.amount) });
    };
    const saveEdit = async () => {
        if (!client || !editId) return;
        const amt = parseFloat(editForm.amount);
        if (!isFinite(amt) || amt <= 0) { alert('Enter a valid amount'); return; }
        await client.from('invoice_expenses').update({
            expense_date: editForm.expense_date,
            category: editForm.category,
            description: editForm.description || null,
            amount: amt,
        }).eq('id', editId);
        setEditId(null);
        load();
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (filterCat !== 'all' && r.category !== filterCat) return false;
            if (q && !`${r.category} ${r.description || ''} ${r.expense_date}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [rows, search, filterCat]);

    const totals = useMemo(() => {
        const total = filtered.reduce((a, r) => a + Number(r.amount || 0), 0);
        const byCat = new Map<string, number>();
        filtered.forEach(r => byCat.set(r.category, (byCat.get(r.category) || 0) + Number(r.amount || 0)));
        const now = new Date();
        const month = filtered.filter(r => {
            const d = new Date(r.expense_date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).reduce((a, r) => a + Number(r.amount || 0), 0);
        return { total, byCat: Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]), month };
    }, [filtered]);

    return (
        <div className="flex flex-col gap-3">
            {/* Add form */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] uppercase font-black tracking-wider text-slate-600 mb-2">Add Expense</div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="h-10 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900" />
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-10 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="h-10 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 col-span-2" />
                    <div className="flex gap-2">
                        <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Amount (€)" className="h-10 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 flex-1" />
                        <button type="button" onClick={addExpense} className="h-10 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1 hover:bg-slate-800"><Plus className="w-3.5 h-3.5" />Add</button>
                    </div>
                </div>
            </div>

            {/* Filters & totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total ({filtered.length})</div>
                    <div className="text-2xl font-black text-slate-900 mt-1">{fmt(totals.total)}</div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
                    <div className="text-[10px] uppercase font-bold text-rose-700 tracking-wider">This Month</div>
                    <div className="text-2xl font-black text-rose-700 mt-1">{fmt(totals.month)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">By Category</div>
                    <div className="flex flex-wrap gap-1.5 max-h-16 overflow-auto">
                        {totals.byCat.length === 0 ? <span className="text-[11px] text-slate-400">—</span> : totals.byCat.map(([c, v]) => (
                            <span key={c} className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">{c}: {fmt(v)}</span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses…" className="w-full h-10 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-white text-slate-900" />
                </div>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="h-10 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900">
                    <option value="all">All categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                        <tr className="text-[10px] uppercase font-black tracking-wider text-slate-500">
                            <th className="text-left px-3 py-2">Date</th>
                            <th className="text-left px-3 py-2">Category</th>
                            <th className="text-left px-3 py-2">Description</th>
                            <th className="text-right px-3 py-2">Amount</th>
                            <th className="px-3 py-2 w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={5} className="text-center text-slate-400 py-6">Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={5} className="text-center text-slate-400 py-6">No expenses yet.</td></tr>
                        ) : filtered.map(r => editId === r.id ? (
                            <tr key={r.id} className="bg-amber-50">
                                <td className="px-3 py-2"><input type="date" value={editForm.expense_date} onChange={e => setEditForm({ ...editForm, expense_date: e.target.value })} className="h-8 px-1.5 text-xs rounded border border-slate-200 bg-white w-full" /></td>
                                <td className="px-3 py-2">
                                    <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} className="h-8 px-1.5 text-xs rounded border border-slate-200 bg-white w-full">
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </td>
                                <td className="px-3 py-2"><input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="h-8 px-1.5 text-xs rounded border border-slate-200 bg-white w-full" /></td>
                                <td className="px-3 py-2 text-right"><input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} className="h-8 px-1.5 text-xs rounded border border-slate-200 bg-white w-28 text-right" /></td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-1 justify-end">
                                        <button type="button" onClick={saveEdit} className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700" title="Save"><Check className="w-3 h-3" /></button>
                                        <button type="button" onClick={() => setEditId(null)} className="p-1.5 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300" title="Cancel"><X className="w-3 h-3" /></button>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            <tr key={r.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.expense_date}</td>
                                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">{r.category}</span></td>
                                <td className="px-3 py-2 text-slate-700">{r.description || '—'}</td>
                                <td className="px-3 py-2 text-right font-black text-rose-700">{fmt(r.amount)}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-1 justify-end">
                                        <button type="button" onClick={() => startEdit(r)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600" title="Edit"><Pencil className="w-3 h-3" /></button>
                                        <button type="button" onClick={() => removeExpense(r.id)} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-600" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {filtered.length > 0 && (
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                            <tr>
                                <td colSpan={3} className="px-3 py-2 text-right text-[10px] uppercase font-black tracking-wider text-slate-600">Total</td>
                                <td className="px-3 py-2 text-right text-sm font-black text-rose-700">{fmt(totals.total)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
};

export default ExpenseTrackerTab;
