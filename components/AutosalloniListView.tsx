import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CarSale } from '@/src/types';

type Props = {
    sales: CarSale[];
    koreaAmountByVin: Map<string, number>;
    bankPaidByVin: Map<string, { id: string; date: string | null; amount: number; description: string | null }[]>;
    onOpenSale: (sale: CarSale) => void;
    onOpenKorea: (sale: CarSale) => void;
    onOpenBank: (sale: CarSale) => void;
};

const fmt = (n: number) => `€ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const AutosalloniListView: React.FC<Props> = ({ sales, koreaAmountByVin, bankPaidByVin, onOpenSale, onOpenKorea, onOpenBank }) => {
    const [search, setSearch] = useState('');

    const rows = useMemo(() => {
        const list = sales.slice().sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
        const q = search.trim().toLowerCase();
        return q ? list.filter(s => `${s.brand} ${s.model} ${s.year || ''} ${s.vin || ''} ${s.plateNumber || ''} ${s.buyerName || ''}`.toLowerCase().includes(q)) : list;
    }, [sales, search]);

    const totals = useMemo(() => {
        let green = 0, blue = 0, sold = 0;
        rows.forEach(s => {
            const vin = (s.vin || '').trim().toLowerCase();
            const g = vin ? (koreaAmountByVin.get(vin) || 0) : 0;
            const b = vin ? ((bankPaidByVin.get(vin) || []).reduce((a, r) => a + Number(r.amount || 0), 0)) : 0;
            green += g;
            blue += b;
            sold += Number(s.soldPrice || 0);
        });
        return { green, blue, sold };
    }, [rows, koreaAmountByVin, bankPaidByVin]);

    return (
        <div className="premium-card border border-slate-100 rounded-2xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                <div className="text-sm font-black uppercase tracking-wider text-slate-900">Lista Komplete e Makinave</div>
                <div className="text-[11px] text-slate-500">{rows.length} cars</div>
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
                <table className="w-full text-xs">
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
                    <tbody className="divide-y divide-slate-100">
                        {rows.length === 0 ? (
                            <tr><td colSpan={10} className="text-center text-slate-400 py-10">No cars.</td></tr>
                        ) : rows.map(s => {
                            const vin = (s.vin || '').trim().toLowerCase();
                            const green = vin ? (koreaAmountByVin.get(vin) || 0) : 0;
                            const blue = vin ? ((bankPaidByVin.get(vin) || []).reduce((a, r) => a + Number(r.amount || 0), 0)) : 0;
                            const sold = Number(s.soldPrice || 0);
                            const balance = sold - (green + blue);
                            return (
                                <tr key={s.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                            {green > 0 ? (
                                                <button type="button" title={`Korea: ${fmt(green)}`} onClick={() => onOpenKorea(s)} className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 hover:scale-110 transition-transform" />
                                            ) : <span className="w-2.5 h-2.5 rounded-full border border-slate-200" />}
                                            {blue > 0 ? (
                                                <button type="button" title={`Bank: ${fmt(blue)}`} onClick={() => onOpenBank(s)} className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-200 hover:scale-110 transition-transform" />
                                            ) : <span className="w-2.5 h-2.5 rounded-full border border-slate-200" />}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 font-bold text-slate-900">
                                        <button type="button" onClick={() => onOpenSale(s)} className="hover:underline text-left">
                                            {s.brand} {s.model}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">{s.year || '—'}</td>
                                    <td className="px-3 py-2 font-mono text-slate-700">
                                        <div className="truncate max-w-[180px]" title={`${s.plateNumber || ''} • ${s.vin || ''}`}>{s.plateNumber || '—'} <span className="text-slate-400">•</span> {(s.vin || '').slice(-8) || '—'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 truncate max-w-[160px]" title={s.buyerName}>{s.buyerName || '—'}</td>
                                    <td className="px-3 py-2 text-slate-600">{s.status}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmt(sold)}</td>
                                    <td className="px-3 py-2 text-right font-bold text-emerald-700">{green > 0 ? fmt(green) : '—'}</td>
                                    <td className="px-3 py-2 text-right font-bold text-blue-700">{blue > 0 ? fmt(blue) : '—'}</td>
                                    <td className={`px-3 py-2 text-right font-black ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                        {balance > 0 ? `+ ${fmt(balance)}` : balance < 0 ? `- ${fmt(Math.abs(balance))}` : fmt(0)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="border-t-2 border-slate-200 bg-slate-50 px-4 py-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Sold Price</div>
                        <div className="text-base font-black text-slate-900">{fmt(totals.sold)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Total Paid Korea</div>
                        <div className="text-base font-black text-emerald-700">{fmt(totals.green)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-blue-200 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-blue-700 tracking-wider flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Total Paid Bank</div>
                        <div className="text-base font-black text-blue-700">{fmt(totals.blue)}</div>
                    </div>
                    <div className={`rounded-lg bg-white border px-3 py-2 ${(totals.sold - totals.green - totals.blue) > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Balance</div>
                        <div className={`text-base font-black ${(totals.sold - totals.green - totals.blue) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {(totals.sold - totals.green - totals.blue) > 0 ? `+ ${fmt(totals.sold - totals.green - totals.blue)}` : `- ${fmt(Math.abs(totals.sold - totals.green - totals.blue))}`}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AutosalloniListView;
