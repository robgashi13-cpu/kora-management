import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CarSale } from '@/src/types';

type Props = {
    sales: CarSale[];
    koreaAmountByVin: Map<string, number>;
    bankPaidByVin: Map<string, { id: string; date: string | null; amount: number; description: string | null }[]>;
    koreaRegisteredSaleIds?: Set<string>;
    onOpenSale: (sale: CarSale) => void;
    onOpenKorea: (sale: CarSale) => void;
    onOpenBank: (sale: CarSale) => void;
};

const fmt = (n: number) => `€ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type Row = {
    sale: CarSale;
    vin: string;
    green: number;
    blue: number;
    sold: number;
    balance: number;
};

const AutosalloniListView: React.FC<Props> = ({ sales, koreaAmountByVin, bankPaidByVin, koreaRegisteredSaleIds, onOpenSale, onOpenKorea, onOpenBank }) => {
    const [search, setSearch] = useState('');

    const { registered, others, totalsReg, totalsOther } = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = sales.slice().sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
        const filtered = q ? list.filter(s => `${s.brand} ${s.model} ${s.year || ''} ${s.vin || ''} ${s.plateNumber || ''} ${s.buyerName || ''}`.toLowerCase().includes(q)) : list;

        const reg: Row[] = [];
        const oth: Row[] = [];
        filtered.forEach(s => {
            const vin = (s.vin || '').trim().toLowerCase();
            const green = vin ? (koreaAmountByVin.get(vin) || 0) : (koreaAmountByVin.get(`id:${s.id}`) || 0);
            const bankItems = (vin ? bankPaidByVin.get(vin) : undefined) || bankPaidByVin.get(`id:${s.id}`) || [];
            const blue = bankItems.reduce((a, r) => a + Number(r.amount || 0), 0);
            const sold = Number(s.soldPrice || 0);
            const row: Row = { sale: s, vin, green, blue, sold, balance: sold - (green + blue) };
            const isKoreaRegistered = koreaRegisteredSaleIds?.has(s.id) || false;
            if (green > 0 || blue > 0 || isKoreaRegistered) reg.push(row); else oth.push(row);
        });

        const sum = (arr: Row[]) => arr.reduce((acc, r) => ({
            green: acc.green + r.green,
            blue: acc.blue + r.blue,
            sold: acc.sold + r.sold,
        }), { green: 0, blue: 0, sold: 0 });

        return { registered: reg, others: oth, totalsReg: sum(reg), totalsOther: sum(oth) };
    }, [sales, search, koreaAmountByVin, bankPaidByVin]);

    const renderRow = (r: Row) => (
        <tr key={r.sale.id} className="hover:bg-slate-50">
            <td className="px-3 py-2 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                    {r.green > 0 ? (
                        <button type="button" title={`Korea: ${fmt(r.green)}`} onClick={() => onOpenKorea(r.sale)} className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 hover:scale-110 transition-transform" />
                    ) : <span className="w-2.5 h-2.5 rounded-full border border-slate-200" />}
                    {r.blue > 0 ? (
                        <button type="button" title={`Bank: ${fmt(r.blue)}`} onClick={() => onOpenBank(r.sale)} className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-200 hover:scale-110 transition-transform" />
                    ) : <span className="w-2.5 h-2.5 rounded-full border border-slate-200" />}
                </div>
            </td>
            <td className="px-3 py-2 font-bold text-slate-900">
                <button type="button" onClick={() => onOpenSale(r.sale)} className="hover:underline text-left">
                    {r.sale.brand} {r.sale.model}
                </button>
            </td>
            <td className="px-3 py-2 text-slate-700">{r.sale.year || '—'}</td>
            <td className="px-3 py-2 font-mono text-slate-700">
                <div className="truncate max-w-[180px]" title={`${r.sale.plateNumber || ''} • ${r.sale.vin || ''}`}>{r.sale.plateNumber || '—'} <span className="text-slate-400">•</span> {(r.sale.vin || '').slice(-8) || '—'}</div>
            </td>
            <td className="px-3 py-2 text-slate-700 truncate max-w-[160px]" title={r.sale.buyerName}>{r.sale.buyerName || '—'}</td>
            <td className="px-3 py-2 text-slate-600">{r.sale.status}</td>
            <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmt(r.sold)}</td>
            <td className="px-3 py-2 text-right font-bold text-emerald-700">{r.green > 0 ? fmt(r.green) : '—'}</td>
            <td className="px-3 py-2 text-right font-bold text-blue-700">{r.blue > 0 ? fmt(r.blue) : '—'}</td>
            <td className={`px-3 py-2 text-right font-black ${r.balance > 0 ? 'text-red-600' : r.balance < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                {r.balance > 0 ? `+ ${fmt(r.balance)}` : r.balance < 0 ? `- ${fmt(Math.abs(r.balance))}` : fmt(0)}
            </td>
        </tr>
    );

    const renderHead = () => (
        <thead className="bg-slate-50 sticky top-0 z-10">
            <tr className="text-[10px] uppercase font-black tracking-wider text-slate-500">
                <th className="text-left px-3 py-2">Dots</th>
                <th className="text-left px-3 py-2">Car</th>
                <th className="text-left px-3 py-2">Year</th>
                <th className="text-left px-3 py-2">Plate / VIN</th>
                <th className="text-left px-3 py-2">Buyer</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Sold</th>
                <th className="text-right px-3 py-2 text-emerald-700">Paid Korea</th>
                <th className="text-right px-3 py-2 text-blue-700">Paid Bank</th>
                <th className="text-right px-3 py-2">Balance</th>
            </tr>
        </thead>
    );

    const renderTotals = (t: { green: number; blue: number; sold: number }, label: string, accent: 'emerald' | 'slate') => {
        const bal = t.sold - t.green - t.blue;
        return (
            <div className={`border-t-2 ${accent === 'emerald' ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'} px-4 py-3`}>
                <div className="text-[10px] uppercase font-black tracking-wider text-slate-600 mb-2">{label}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Sold Price</div>
                        <div className="text-base font-black text-slate-900">{fmt(t.sold)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Total Paid Korea</div>
                        <div className="text-base font-black text-emerald-700">{fmt(t.green)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-blue-200 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-blue-700 tracking-wider flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Total Paid Bank</div>
                        <div className="text-base font-black text-blue-700">{fmt(t.blue)}</div>
                    </div>
                    <div className={`rounded-lg bg-white border px-3 py-2 ${bal > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Balance</div>
                        <div className={`text-base font-black ${bal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {bal > 0 ? `+ ${fmt(bal)}` : `- ${fmt(Math.abs(bal))}`}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="premium-card border border-slate-100 rounded-2xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                <div className="text-sm font-black uppercase tracking-wider text-slate-900">Lista Komplete e Makinave</div>
                <div className="text-[11px] text-slate-500">{registered.length + others.length} cars</div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />Paid Korea</div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700"><span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-200" />Paid by Bank</div>
                </div>
            </div>
            <div className="px-4 py-2 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search car / VIN / plate / buyer…" className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 bg-white" />
                </div>
            </div>

            <div className="overflow-auto flex-1">
                {/* Section 1: Registered (has payments) */}
                <div className="px-4 pt-3 pb-1 bg-emerald-50/40 border-b border-emerald-100">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <div className="text-[11px] uppercase font-black tracking-wider text-emerald-800">Të Regjistruara (6 muajt e fundit)</div>
                        <div className="text-[10px] text-slate-500">{registered.length} cars · invoice / cash / bank / korea</div>
                    </div>
                </div>
                <table className="w-full text-xs">
                    {renderHead()}
                    <tbody className="divide-y divide-slate-100">
                        {registered.length === 0 ? (
                            <tr><td colSpan={10} className="text-center text-slate-400 py-6">No registered cars.</td></tr>
                        ) : registered.map(renderRow)}
                    </tbody>
                </table>

                {/* Section 2: Others */}
                <div className="px-4 pt-4 pb-1 bg-slate-50 border-y border-slate-200">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full border border-slate-300 bg-white" />
                        <div className="text-[11px] uppercase font-black tracking-wider text-slate-700">Të Tjera (pa pagesa)</div>
                        <div className="text-[10px] text-slate-500">{others.length} cars</div>
                    </div>
                </div>
                <table className="w-full text-xs">
                    {renderHead()}
                    <tbody className="divide-y divide-slate-100">
                        {others.length === 0 ? (
                            <tr><td colSpan={10} className="text-center text-slate-400 py-6">No other cars.</td></tr>
                        ) : others.map(renderRow)}
                    </tbody>
                </table>
            </div>

            {renderTotals(totalsReg, 'Totale · Të Regjistruara', 'emerald')}
            {renderTotals(totalsOther, 'Totale · Të Tjera', 'slate')}
        </div>
    );
};

export default AutosalloniListView;
