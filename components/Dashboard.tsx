'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition, useCallback, useDeferredValue } from 'react';
import { Attachment, CarSale, ContractType, SaleStatus, ShitblerjeOverrides } from '@/app/types';
import { Plus, Search, FileText, RefreshCw, Trash2, Copy, ArrowRight, CheckSquare, Square, X, Clipboard, GripVertical, Eye, EyeOff, LogOut, ChevronDown, ChevronUp, ArrowUpDown, Edit, FolderPlus, Archive, Download, Loader2, ArrowRightLeft, Menu, Settings, Check } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';

import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { createRoot } from 'react-dom/client';
import { zip } from 'fflate';
import SaleModal from './SaleModal';
import EditShitblerjeModal from './EditShitblerjeModal';
import ViewSaleModal from './ViewSaleModal';
import EditablePreviewModal from './EditablePreviewModal';
import ProfileSelector from './ProfileSelector';
import InlineEditableCell from './InlineEditableCell';
import ContractDocument from './ContractDocument';
import InvoiceDocument from './InvoiceDocument';
import { normalizePdfLayout, sanitizePdfCloneStyles, waitForImages } from './pdfUtils';
import { useResizableColumns } from './useResizableColumns';
import { processImportedData } from '@/services/openaiService';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient, reassignProfileAndDelete, syncSalesWithSupabase, syncTransactionsWithSupabase } from '@/services/supabaseService';

const getBankFee = (price: number) => {
    if (price <= 10000) return 20;
    if (price <= 20000) return 50;
    return 100;
};
const calculateBalance = (sale: CarSale) => (sale.soldPrice || 0) - ((sale.amountPaidCash || 0) + (sale.amountPaidBank || 0) + (sale.deposit || 0));
const calculateProfit = (sale: CarSale) => ((sale.soldPrice || 0) - (sale.costToBuy || 0) - getBankFee(sale.soldPrice || 0) - (sale.servicesCost ?? 30.51) - (sale.includeTransport ? 350 : 0));

const ADMIN_PROFILE = 'Robert';
const ADMIN_PASSWORD = 'Robertoo1396$';
const LEGACY_ADMIN_PROFILE = 'Admin';

const normalizeProfileName = (name?: string | null | unknown) => {
    if (typeof name !== 'string' || !name) return '';
    const trimmed = name.trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase() === LEGACY_ADMIN_PROFILE.toLowerCase() ? ADMIN_PROFILE : trimmed;
};

const ALLOWED_PROFILES = [ADMIN_PROFILE, 'ETNIK', 'GENC', 'LEONIT', 'RAJMOND', 'RENAT'];
const REQUIRED_PROFILES = ALLOWED_PROFILES;
const ALLOWED_PROFILE_SET = new Set(ALLOWED_PROFILES.map(profile => normalizeProfileName(profile)));

const isLegacyAdminProfile = (name?: string | null) => {
    if (!name) return false;
    return name.trim().toLowerCase() === LEGACY_ADMIN_PROFILE.toLowerCase();
};

const normalizeAvatarMap = (avatars: Record<string, string>) => {
    const normalized: Record<string, string> = {};
    Object.entries(avatars).forEach(([name, value]) => {
        const normalizedName = normalizeProfileName(name);
        if (!normalizedName) return;
        if (normalized[normalizedName] && normalizedName === ADMIN_PROFILE && normalizedName !== name) return;
        normalized[normalizedName] = value;
    });
    return normalized;
};

type GroupMeta = {
    name: string;
    order: number;
    archived: boolean;
};

const SortableSaleItem = React.memo(function SortableSaleItem({ s, openInvoice, toggleSelection, isSelected, userProfile, canViewPrices, onClick, onDelete, onInlineUpdate, onRemoveFromGroup }: any) {
    const controls = useDragControls();
    const isAdmin = userProfile === ADMIN_PROFILE;
    const canEdit = isAdmin || s.soldBy === userProfile;
    const statusClass = s.status === 'Completed' ? 'status-completed' :
        (s.status === 'In Progress' || s.status === 'Autosallon') ? 'status-in-progress' :
            s.status === 'New' ? 'status-new' :
                s.status === 'Shipped' ? 'status-shipped' :
                    s.status === 'Inspection' ? 'status-inspection' :
                        'bg-slate-100 text-slate-500';
    const isSoldRow = s.status === 'Completed';
    const rowClassName = isSoldRow ? 'contents table-row-compact cars-sold-row' : 'contents group table-row-hover table-row-compact';
    const rowTapRef = useRef({ x: 0, y: 0, moved: false, active: false });

    const handleRowPointerDown = (event: React.PointerEvent) => {
        if (event.pointerType === 'mouse') return;
        rowTapRef.current = { x: event.clientX, y: event.clientY, moved: false, active: true };
    };

    const handleRowPointerMove = (event: React.PointerEvent) => {
        const state = rowTapRef.current;
        if (event.pointerType === 'mouse' || !state.active || state.moved) return;
        if (Math.abs(event.clientX - state.x) > ROW_TAP_MOVE_THRESHOLD || Math.abs(event.clientY - state.y) > ROW_TAP_MOVE_THRESHOLD) {
            rowTapRef.current.moved = true;
        }
    };

    const handleRowPointerEnd = () => {
        rowTapRef.current.active = false;
    };

    const handleInfoClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        if (rowTapRef.current.moved) {
            event.preventDefault();
            rowTapRef.current.moved = false;
            return;
        }
        onClick();
    };

    const handleFieldUpdate = async (field: keyof CarSale, value: string | number) => {
        if (onInlineUpdate) {
            await onInlineUpdate(s.id, field, value);
        }
    };

    return (
        <Reorder.Item
            value={s}
            id={s.id}
            className={rowClassName}
            dragListener={false}
            dragControls={controls}
        >
            {/* Hidden Card View */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 relative shadow-sm hover:border-slate-400 transition-colors hidden">
                <div className="flex justify-between mb-4">
                    <div className="font-bold text-lg text-slate-800">{s.brand} {s.model}</div>
                    <button onClick={(e) => openInvoice(s, e)} className="text-slate-900 hover:text-slate-900"><FileText className="w-5 h-5" /></button>
                </div>
                <div className="text-sm text-slate-500 space-y-2">
                    <div className="flex justify-between"><span>VIN</span><span className="font-mono text-xs text-slate-700">{s.vin}</span></div>
                    <div className="flex justify-between"><span>Buyer</span><span className="text-slate-700">{s.buyerName}</span></div>
                    {canViewPrices && <div className="flex justify-between pt-2 border-t border-slate-100 mt-2">
                        <span>Sold For</span>
                        <span className="text-emerald-600 font-bold text-lg">€{(s.soldPrice || 0).toLocaleString()}</span>
                    </div>}
                </div>
                {canViewPrices && <div className="mt-4 flex justify-end">
                    <span className={`text-xs font-semibold ${calculateBalance(s) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        Bal: €{calculateBalance(s).toLocaleString()}
                    </span>
                </div>}
                <div className={`absolute top-4 left-4 z-10 transition-opacity ${isSoldRow ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-transparent hover:border-slate-400'}`}>
                        <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* 1. Checkbox Column */}
            <div className="px-1 h-full flex items-center justify-center relative border-r border-slate-100 z-10 bg-white">
                <div
                    className={`absolute left-0.5 top-1/2 -translate-y-1/2 p-0.5 ${isSoldRow ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing'}`}
                    onPointerDown={(e) => controls.start(e)}
                >
                    <GripVertical className="w-3 h-3 text-slate-400" />
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleSelection(s.id); }}
                    className={`w-4 h-4 border rounded flex items-center justify-center transition-all cursor-pointer relative z-20 ${isSelected ? 'bg-slate-900 border-slate-900 text-white' : `border-slate-300 bg-transparent ${isSoldRow ? '' : 'hover:border-slate-500 hover:bg-slate-50'}`}`}
                >
                    {isSelected && <CheckSquare className="w-3 h-3" />}
                </button>
            </div>

            {/* 2. Car Info */}
            <div className="px-2 h-full flex items-center font-semibold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis border-r border-slate-100 bg-white min-w-0">
                <button
                    type="button"
                    onPointerDown={handleRowPointerDown}
                    onPointerMove={handleRowPointerMove}
                    onPointerUp={handleRowPointerEnd}
                    onPointerCancel={handleRowPointerEnd}
                    onClick={handleInfoClick}
                    className={`inline-flex items-center min-w-0 max-w-full truncate whitespace-nowrap text-left leading-tight transition-colors text-[11px] xl:text-xs ${isSoldRow ? 'text-slate-900' : 'hover:text-slate-700'}`}
                    title={`${s.brand} ${s.model}`}
                >
                    {s.brand} {s.model}
                </button>
            </div>

            {/* 3. Year */}
            <div className="px-2 h-full flex items-center justify-center text-slate-800 border-r border-slate-100 bg-white text-[11px] xl:text-xs font-medium">
                {canEdit ? (
                    <InlineEditableCell value={s.year} onSave={(v) => handleFieldUpdate('year', v)} type="number" className="text-slate-800" />
                ) : s.year}
            </div>

            {/* 4. KM */}
            <div className="px-2 h-full flex items-center justify-center text-slate-700 font-mono text-[11px] xl:text-xs border-r border-slate-100 bg-white">
                {canEdit ? (
                    <InlineEditableCell value={s.km || 0} onSave={(v) => handleFieldUpdate('km', v)} type="number" formatDisplay={(v) => `${Number(v || 0).toLocaleString()}`} className="text-slate-700" />
                ) : (s.km || 0).toLocaleString()}
            </div>

            {/* 5. Plate/VIN */}
            <div className="px-2 h-full flex items-center text-[11px] xl:text-xs border-r border-slate-100 bg-white leading-tight min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {canEdit ? (
                    <div className="flex items-center gap-1 min-w-0 max-w-full truncate" title={`${s.plateNumber || ''} • ${(s.vin || '').slice(-6)}`}>
                        <InlineEditableCell value={s.plateNumber} onSave={(v) => handleFieldUpdate('plateNumber', v)} className="font-mono text-slate-800 font-semibold truncate" />
                        <span className="text-slate-400">•</span>
                        <InlineEditableCell value={s.vin} onSave={(v) => handleFieldUpdate('vin', v)} className="text-slate-600 font-mono text-[10px] xl:text-[11px] truncate" placeholder="VIN" formatDisplay={(v) => (v ? String(v).slice(-6) : '-')} />
                    </div>
                ) : (
                    <div className="text-slate-800 font-mono font-semibold truncate" title={`${s.plateNumber || ''} • ${(s.vin || '').slice(-6)}`}>
                        {s.plateNumber} • <span className="text-slate-600">{(s.vin || '').slice(-6)}</span>
                    </div>
                )}
            </div>

            {/* 6. Buyer */}
            <div className="px-2 h-full flex items-center text-slate-800 truncate whitespace-nowrap border-r border-slate-100 bg-white text-[11px] xl:text-xs min-w-0 font-medium" title={s.buyerName}>
                {canEdit ? (
                    <InlineEditableCell value={s.buyerName} onSave={(v) => handleFieldUpdate('buyerName', v)} placeholder="Buyer" className="text-slate-800" />
                ) : s.buyerName}
            </div>

            {/* 7. Seller */}
            <div className="px-2 h-full flex items-center text-slate-700 truncate whitespace-nowrap border-r border-slate-100 bg-white text-[11px] xl:text-xs min-w-0" title={s.sellerName}>
                {canEdit ? (
                    <InlineEditableCell value={s.sellerName} onSave={(v) => handleFieldUpdate('sellerName', v)} placeholder="Seller" className="text-slate-700" />
                ) : s.sellerName}
            </div>

            {/* 8. Shipping */}
            <div className="px-2 h-full flex items-center text-slate-700 truncate whitespace-nowrap border-r border-slate-100 bg-white text-[11px] xl:text-xs min-w-0" title={s.shippingName}>
                {canEdit ? (
                    <InlineEditableCell value={s.shippingName} onSave={(v) => handleFieldUpdate('shippingName', v)} placeholder="Shipping" className="text-slate-700" />
                ) : s.shippingName}
            </div>

            {/* 9. Cost (Admin Only) */}
            {isAdmin && (
                <div className="px-2 h-full flex items-center justify-end font-mono text-slate-700 border-r border-slate-100 bg-white text-[11px] xl:text-xs">
                    {canEdit ? (
                        <InlineEditableCell value={s.costToBuy || 0} onSave={(v) => handleFieldUpdate('costToBuy', v)} type="number" prefix="€" className="text-slate-700" />
                    ) : `€${(s.costToBuy || 0).toLocaleString()}`}
                </div>
            )}

            {/* 10. Sold (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <div className="px-2 h-full flex items-center justify-end text-slate-900 font-semibold border-r border-slate-100 bg-white text-[11px] xl:text-xs">
                    {canEdit ? (
                        <InlineEditableCell value={s.soldPrice || 0} onSave={(v) => handleFieldUpdate('soldPrice', v)} type="number" prefix="€" className="text-slate-900 font-semibold" />
                    ) : `€${(s.soldPrice || 0).toLocaleString()}`}
                </div>
            ) : (
                <div className="px-2 h-full flex items-center justify-end font-mono text-slate-400 border-r border-slate-100 bg-white text-[11px] xl:text-xs">-</div>
            )}

            {/* 11. Paid (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <div className="px-2 h-full flex items-center justify-end border-r border-slate-100 bg-white">
                    {canEdit ? (
                        <div className="flex flex-col items-end gap-0.5 text-[10px] xl:text-[11px] leading-tight">
                            <div className="flex items-center gap-1">
                                <span className="uppercase text-[8px] text-slate-500 font-semibold">Bk</span>
                                <InlineEditableCell value={s.amountPaidBank || 0} onSave={(v) => handleFieldUpdate('amountPaidBank', v)} type="number" prefix="€" className="text-sky-700 font-semibold" />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="uppercase text-[8px] text-slate-500 font-semibold">Ca</span>
                                <InlineEditableCell value={s.amountPaidCash || 0} onSave={(v) => handleFieldUpdate('amountPaidCash', v)} type="number" prefix="€" className="text-slate-700 font-semibold" />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="uppercase text-[8px] text-slate-500 font-semibold">Dp</span>
                                <InlineEditableCell value={s.deposit || 0} onSave={(v) => handleFieldUpdate('deposit', v)} type="number" prefix="€" className="text-slate-600 font-semibold" />
                            </div>
                        </div>
                    ) : (
                        <div className="font-mono text-sky-700 font-semibold text-[11px] xl:text-xs">
                            €{((s.amountPaidCash || 0) + (s.amountPaidBank || 0) + (s.deposit || 0)).toLocaleString()}
                        </div>
                    )}
                </div>
            ) : (
                <div className="px-2 h-full flex items-center justify-end font-mono text-slate-400 border-r border-slate-100 bg-white text-[11px] xl:text-xs">-</div>
            )}

            {/* 12,13,14. Fees/Tax/Profit (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <>
                    <div className="px-2 h-full flex items-center justify-end font-mono text-[11px] xl:text-xs text-slate-600 border-r border-slate-100 bg-white">€{getBankFee(s.soldPrice || 0)}</div>
                    <div className="px-2 h-full flex items-center justify-end border-r border-slate-100 bg-white">
                        {canEdit ? (
                            <InlineEditableCell value={s.servicesCost ?? 30.51} onSave={(v) => handleFieldUpdate('servicesCost', v)} type="number" prefix="€" className="text-slate-600 font-mono text-[11px] xl:text-xs" />
                        ) : (
                            <span className="font-mono text-[11px] xl:text-xs text-slate-600">€{(s.servicesCost ?? 30.51).toLocaleString()}</span>
                        )}
                    </div>
                    {isAdmin && <div className="px-2 h-full flex items-center justify-end font-mono font-bold text-slate-900 whitespace-nowrap border-r border-slate-100 bg-white text-[11px] xl:text-xs">€{calculateProfit(s).toLocaleString()}</div>}
                </>
            ) : (
                <>
                    <div className="px-2 h-full flex items-center justify-end font-mono text-slate-400 border-r border-slate-100 bg-white text-[11px] xl:text-xs">-</div>
                    <div className="px-2 h-full flex items-center justify-end font-mono text-slate-400 border-r border-slate-100 bg-white text-[11px] xl:text-xs">-</div>
                </>
            )}

            {/* 15. Balance (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <div className="px-2 h-full flex items-center justify-end font-mono font-bold border-r border-slate-100 bg-white">
                    <span className={`text-[11px] xl:text-xs font-semibold ${calculateBalance(s) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        €{calculateBalance(s).toLocaleString()}
                    </span>
                </div>
            ) : (
                <div className="px-2 h-full flex items-center justify-end font-mono text-slate-400 border-r border-slate-100 bg-white text-[11px] xl:text-xs">-</div>
            )}

            {/* 15b. Korea Paid (Admin Only) */}
            {isAdmin && (
                <div className="px-2 h-full flex flex-col items-center justify-center gap-1 border-r border-slate-100 bg-white">
                    {canEdit && (
                        <InlineEditableCell value={s.amountPaidToKorea || 0} onSave={(v) => handleFieldUpdate('amountPaidToKorea', v)} type="number" prefix="€" className="text-[10px] xl:text-[11px] font-bold text-slate-700" />
                    )}
                    <span className={`text-[10px] xl:text-[11px] uppercase font-bold whitespace-nowrap px-2 py-0.5 rounded-full ${(s.costToBuy || 0) - (s.amountPaidToKorea || 0) > 0 ? (isSoldRow ? 'text-amber-700' : 'bg-amber-100 text-amber-700 border border-amber-300') : (isSoldRow ? 'text-emerald-700' : 'bg-emerald-100 text-emerald-700 border border-emerald-300')}`}>
                        {(s.costToBuy || 0) - (s.amountPaidToKorea || 0) > 0 ? `€${((s.costToBuy || 0) - (s.amountPaidToKorea || 0)).toLocaleString()}` : 'Paid'}
                    </span>
                </div>
            )}

            {/* 16. Status */}
            <div className="px-2 h-full flex items-center justify-center border-r border-slate-100 bg-white" title={s.status}>
                <div className="flex flex-col items-center gap-1">
                    {canEdit ? (
                        <InlineEditableCell value={s.status} onSave={(v) => handleFieldUpdate('status', v)} className={`status-badge text-[10px] xl:text-[11px] ${statusClass}`} />
                    ) : (
                        <span className={`status-badge text-[10px] xl:text-[11px] ${statusClass}`}>{s.status}</span>
                    )}
                    {s.isPaid && (
                        <span className={`text-[9px] xl:text-[10px] uppercase font-bold whitespace-nowrap px-2 py-0.5 rounded-full ${isSoldRow ? 'text-emerald-700' : 'bg-emerald-100 text-emerald-700 border border-emerald-300'}`}>
                            Paid
                        </span>
                    )}
                </div>
            </div>

            {/* 17. Sold By */}
            <div className="px-2 h-full flex items-center justify-center text-[11px] xl:text-xs border-r border-slate-100 bg-white font-medium" title={s.soldBy}>
                {canEdit ? (
                    <InlineEditableCell value={s.soldBy} onSave={(v) => handleFieldUpdate('soldBy', v)} className="text-slate-700" />
                ) : (
                    <span className="text-slate-700">{s.soldBy}</span>
                )}
            </div>

            {/* 18. Actions */}
            <div className="px-2 h-full flex items-center justify-center gap-1 bg-white">
                {s.group && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemoveFromGroup?.(s.id); }}
                        className={`text-slate-500 transition-colors p-1.5 rounded-lg ${isSoldRow ? '' : 'hover:text-red-600 hover:bg-red-50'}`}
                        title="Remove from group"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
                <button onClick={(e) => openInvoice(s, e)} className={`text-slate-600 transition-colors p-1.5 rounded-lg ${isSoldRow ? '' : 'hover:text-slate-900 hover:bg-slate-100'}`} title="View Invoice">
                    <FileText className="w-4 h-4" />
                </button>
            </div>
        </Reorder.Item>
    );
}, (prev, next) => (
    prev.s === next.s &&
    prev.isSelected === next.isSelected &&
    prev.userProfile === next.userProfile &&
    prev.canViewPrices === next.canViewPrices
));

const INITIAL_SALES: CarSale[] = [];
const UI_STATE_STORAGE_KEY = 'dashboard_ui_state_v1';
const SESSION_PROFILE_STORAGE_KEY = 'session_profile';
const ROW_TAP_MOVE_THRESHOLD = 10;

const LEGACY_MERCEDES_B200: CarSale = {
    id: 'legacy-mercedes-b200-wddmhojbxgn149268',
    brand: 'MERCEDES',
    model: 'B200',
    year: 2016,
    km: 0,
    color: 'WHITE',
    plateNumber: '0736',
    vin: 'WDDMHOJBXGN149268',
    sellerName: ADMIN_PROFILE,
    buyerName: 'ARLIND',
    shippingName: '',
    shippingDate: '',
    includeTransport: false,
    costToBuy: 7350,
    soldPrice: 7750,
    amountPaidCash: 7350,
    amountPaidBank: 0,
    deposit: 0,
    servicesCost: 30.51,
    tax: 0,
    amountPaidByClient: 7350,
    amountPaidToKorea: 0,
    paidDateToKorea: null,
    paidDateFromClient: null,
    isPaid: false,
    paymentMethod: 'Cash',
    status: 'Completed',
    createdAt: '2024-11-13T00:00:00.000Z',
    soldBy: ADMIN_PROFILE
};


type NavItem = {
    id: string;
    label: string;
    icon: any;
    view: string;
    category?: string;
    adminOnly?: boolean;
};

const navItems: NavItem[] = [
    { id: 'SALES', label: 'Sales', icon: Clipboard, view: 'dashboard', category: 'SALES' },
    { id: 'INVOICES', label: 'Invoices', icon: FileText, view: 'invoices', category: 'SALES' },
    { id: 'SHIPPED', label: 'Shipped', icon: ArrowRight, view: 'dashboard', category: 'SHIPPED' },
    { id: 'INSPECTIONS', label: 'Inspections', icon: Search, view: 'dashboard', category: 'INSPECTIONS' },
    { id: 'AUTOSALLON', label: 'Autosallon', icon: RefreshCw, view: 'dashboard', category: 'AUTOSALLON' },
    { id: 'SETTINGS', label: 'Settings', icon: Settings, view: 'settings', adminOnly: true },
];

export default function Dashboard() {
    const dirtyIds = useRef<Set<string>>(new Set());
    const [, startTransition] = useTransition();
    const [sales, setSales] = useState<CarSale[]>([]);
    const salesRef = useRef(sales);
    useEffect(() => { salesRef.current = sales; }, [sales]);
    const [view, setView] = useState('dashboard');
    const [userProfile, setUserProfile] = useState<string | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<string[]>(['Robert Gashi', ADMIN_PROFILE, 'User', 'Leonit']);
    const [isLoading, setIsLoading] = useState(true);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [pendingProfile, setPendingProfile] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [newProfileName, setNewProfileName] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [rememberProfile, setRememberProfile] = useState(false);
    const [viewSaleModalItem, setViewSaleModalItem] = useState<CarSale | null>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const isAdmin = userProfile === ADMIN_PROFILE;
    const canViewPrices = isAdmin;

    const defaultWidths = useMemo(() => ({
        selection: 30,
        carInfo: 185,
        year: 60,
        km: 80,
        plateVin: 130,
        buyer: 150,
        seller: 120,
        shipping: 120,
        cost: 96,
        sold: 106,
        paid: 120,
        bankFee: 66,
        tax: 76,
        profit: 96,
        balance: 120,
        korea: 110,
        status: 104,
        soldBy: 96,
        actions: 52
    }), []);

    const { getColumnStyle, handleMouseDown, columnWidths } = useResizableColumns(defaultWidths, {
        storageKey: isAdmin ? 'table-widths-admin' : 'table-widths-user',
        minWidth: 30
    });

    const gridTemplateColumns = useMemo(() => {
        const cols = [
            getColumnStyle('selection').width + 'px',
            getColumnStyle('carInfo').width + 'px',
            getColumnStyle('year').width + 'px',
            getColumnStyle('km').width + 'px',
            getColumnStyle('plateVin').width + 'px',
            getColumnStyle('buyer').width + 'px',
            getColumnStyle('seller').width + 'px',
            getColumnStyle('shipping').width + 'px',
        ];
        if (isAdmin) cols.push(getColumnStyle('cost').width + 'px');
        cols.push(getColumnStyle('sold').width + 'px');
        cols.push(getColumnStyle('paid').width + 'px');
        cols.push(getColumnStyle('bankFee').width + 'px');
        cols.push(getColumnStyle('tax').width + 'px');
        if (isAdmin) cols.push(getColumnStyle('profit').width + 'px');
        cols.push(getColumnStyle('balance').width + 'px');
        if (isAdmin) cols.push(getColumnStyle('korea').width + 'px');
        cols.push(getColumnStyle('status').width + 'px');
        cols.push(getColumnStyle('soldBy').width + 'px');
        cols.push(getColumnStyle('actions').width + 'px');
        return cols.join(' ');
    }, [isAdmin, getColumnStyle, columnWidths]);

    const [sortBy, setSortBy] = useState<string>('createdAt');

    useEffect(() => {
        if (!isAdmin && (sortBy === 'koreaBalance' || sortBy === 'costToBuy')) {
            setSortBy('createdAt');
        }
    }, [isAdmin, sortBy]);

    const [activeCategory, setActiveCategory] = useState<SaleStatus | 'SALES' | 'INVOICES' | 'SHIPPED' | 'INSPECTIONS' | 'AUTOSALLON'>('SALES');

    const currentNavId = useMemo(() => {
        if (view === 'settings') return 'SETTINGS';
        if (view === 'invoices') return 'INVOICES';
        return activeCategory as string;
    }, [view, activeCategory]);
    const [editingSale, setEditingSale] = useState<CarSale | null>(null);
    const [editChoiceSale, setEditChoiceSale] = useState<CarSale | null>(null);
    const [editChoiceReturnView, setEditChoiceReturnView] = useState('dashboard');
    const [editShitblerjeSale, setEditShitblerjeSale] = useState<CarSale | null>(null);
    const [formReturnView, setFormReturnView] = useState('dashboard');
    const [activeGroupMoveMenu, setActiveGroupMoveMenu] = useState<string | null>(null);
    const [groupMoveInFlight, setGroupMoveInFlight] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [groupMeta, setGroupMeta] = useState<GroupMeta[]>([]);
    const [showArchivedGroups, setShowArchivedGroups] = useState(false);
    const hasInitializedGroups = useRef(false);
    const [documentPreview, setDocumentPreview] = useState<{
        sale: CarSale;
        type: 'invoice' | 'deposit' | 'full_marreveshje' | 'full_shitblerje';
        withDogane?: boolean;
        showBankOnly?: boolean;
    } | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDownloadingInvoices, setIsDownloadingInvoices] = useState(false);
    const [invoiceDownloadStatus, setInvoiceDownloadStatus] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [apiKey, setApiKey] = useState('');
    const [importStatus, setImportStatus] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [syncError, setSyncError] = useState<string>('');
    const [profileAvatars, setProfileAvatars] = useState<Record<string, string>>({});
    const [showMoveMenu, setShowMoveMenu] = useState(false);
    const [showGroupMenu, setShowGroupMenu] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const forceMobileLayout = false;
    const isFormOpen = view === 'sale_form';
    const isFormOpenRef = React.useRef(isFormOpen);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const restoredScrollTopRef = useRef<number | null>(null);
    const didRestoreUiStateRef = useRef(false);
    const mobileRowTapStateRef = useRef<Record<string, { x: number; y: number; moved: boolean; active: boolean }>>({});

    const normalizeProfiles = useCallback((profiles: string[]) => {
        const normalized = profiles
            .map(p => normalizeProfileName(p))
            .filter(profile => profile && ALLOWED_PROFILE_SET.has(profile));
        const unique = new Set(normalized);
        REQUIRED_PROFILES.forEach(profile => unique.add(profile));
        const ordered: string[] = [];
        REQUIRED_PROFILES.forEach(profile => {
            if (unique.has(profile)) {
                ordered.push(profile);
                unique.delete(profile);
            }
        });
        return [...ordered, ...Array.from(unique)];
    }, []);

    const normalizeSaleProfiles = useCallback((sale: CarSale) => ({
        ...sale,
        sellerName: normalizeProfileName(sale.sellerName),
        soldBy: normalizeProfileName(sale.soldBy)
    }), []);

    const ensureMercedesB200Present = useCallback((currentSales: CarSale[]) => {
        const hasB200 = currentSales.some((sale) => {
            const vin = (sale.vin || '').trim().toUpperCase();
            const model = (sale.model || '').trim().toUpperCase();
            const brand = (sale.brand || '').trim().toUpperCase();
            const plate = (sale.plateNumber || '').trim();

            return vin === LEGACY_MERCEDES_B200.vin
                || (brand === 'MERCEDES' && model === 'B200' && plate === LEGACY_MERCEDES_B200.plateNumber);
        });

        if (hasB200) return { sales: currentSales, added: false };

        return {
            sales: [...currentSales, { ...LEGACY_MERCEDES_B200, sortOrder: currentSales.length }],
            added: true
        };
    }, []);

    const enforceAllowedSalesProfiles = useCallback((currentSales: CarSale[]) => {
        let hasChanges = false;
        const updatedSales = currentSales.map((sale) => {
            const normalizedSeller = normalizeProfileName(sale.sellerName);
            const normalizedSoldBy = normalizeProfileName(sale.soldBy);
            const shouldReplaceSeller = normalizedSeller && !ALLOWED_PROFILE_SET.has(normalizedSeller);
            const shouldReplaceSoldBy = normalizedSoldBy && !ALLOWED_PROFILE_SET.has(normalizedSoldBy);

            if (!shouldReplaceSeller && !shouldReplaceSoldBy) return sale;

            hasChanges = true;
            dirtyIds.current.add(sale.id);
            return {
                ...sale,
                sellerName: shouldReplaceSeller ? ADMIN_PROFILE : sale.sellerName,
                soldBy: shouldReplaceSoldBy ? ADMIN_PROFILE : sale.soldBy
            };
        });

        return { updatedSales, hasChanges };
    }, []);

    const profileOptions = useMemo(() => {
        const profileMap = new Map<string, string>();
        availableProfiles.forEach(name => {
            const normalized = normalizeProfileName(name);
            if (normalized) profileMap.set(normalized, name);
        });
        sales.forEach(sale => {
            const seller = normalizeProfileName(sale.sellerName);
            const soldBy = normalizeProfileName(sale.soldBy);
            if (seller && !profileMap.has(seller)) profileMap.set(seller, sale.sellerName || seller);
            if (soldBy && !profileMap.has(soldBy)) profileMap.set(soldBy, sale.soldBy || soldBy);
        });
        return Array.from(profileMap.entries())
            .map(([id, label]) => ({ id, label: label || id }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [availableProfiles, sales]);

    const profileOptionIds = useMemo(() => new Set(profileOptions.map(option => option.id)), [profileOptions]);

    const persistUserProfile = async (profile: string | null, remember = rememberProfile) => {
        const normalizedProfile = profile ? normalizeProfileName(profile) : null;
        if (normalizedProfile) {
            localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, normalizedProfile);
        } else {
            localStorage.removeItem(SESSION_PROFILE_STORAGE_KEY);
        }

        if (remember && normalizedProfile) {
            await Preferences.set({ key: 'user_profile', value: normalizedProfile });
            await Preferences.set({ key: 'remember_profile', value: 'true' });
        } else {
            await Preferences.remove({ key: 'user_profile' });
            await Preferences.set({ key: 'remember_profile', value: 'false' });
        }
    };

    const openSaleForm = (sale: CarSale | null, returnView = view) => {
        setEditingSale(sale);
        setFormReturnView(returnView);
        setView('sale_form');
    };

    const requestEditChoice = (sale: CarSale, returnView = view) => {
        setEditChoiceSale(sale);
        setEditChoiceReturnView(returnView);
    };

    const handleSaleInteraction = (sale: CarSale, returnView = view) => {
        if (!isAdmin && sale.soldBy !== userProfile) {
            setViewSaleModalItem(sale);
            return;
        }
        requestEditChoice(sale, returnView);
    };

    const handleEditSaleChoice = () => {
        if (!editChoiceSale) return;
        const sale = editChoiceSale;
        const returnView = editChoiceReturnView;
        setEditChoiceSale(null);
        openSaleForm(sale, returnView);
    };

    const handleEditShitblerjeChoice = () => {
        if (!editChoiceSale) return;
        const sale = editChoiceSale;
        setEditChoiceSale(null);
        setEditShitblerjeSale(sale);
    };

    const closeSaleForm = (returnView = formReturnView) => {
        setEditingSale(null);
        setView(returnView);
    };

    const handleSaveShitblerjeOverrides = async (sale: CarSale, overrides: ShitblerjeOverrides) => {
        dirtyIds.current.add(sale.id);
        const currentSales = salesRef.current;
        const newSales = currentSales.map(existing =>
            existing.id === sale.id
                ? { ...existing, shitblerjeOverrides: overrides }
                : existing
        );
        await updateSalesAndSave(newSales);
        setEditShitblerjeSale(null);
    };

    useEffect(() => { isFormOpenRef.current = isFormOpen; }, [isFormOpen]);

    // Initialize & Sync Avatars
    useEffect(() => {
        const syncAvatars = async () => {
            const stored = (await Preferences.get({ key: 'profile_avatars' })).value;
            let current = stored ? JSON.parse(stored) : {};

            if (supabaseUrl && supabaseKey) {
                try {
                    const client = createClient(supabaseUrl, supabaseKey);
                    const { data } = await client.from('sales').select('attachments').eq('id', 'config_profile_avatars').single();
                    if (data?.attachments?.avatars) {
                        current = normalizeAvatarMap({ ...current, ...data.attachments.avatars });
                        setProfileAvatars(current);
                        await Preferences.set({ key: 'profile_avatars', value: JSON.stringify(current) });
                    } else {
                        current = normalizeAvatarMap(current);
                        setProfileAvatars(current);
                    }
                } catch (e) {
                    console.error("Avatar Sync Error", e);
                    current = normalizeAvatarMap(current);
                    setProfileAvatars(current);
                }
            } else {
                current = normalizeAvatarMap(current);
                setProfileAvatars(current);
            }
        };
        syncAvatars();
    }, [supabaseUrl, supabaseKey]);

    const handleEditAvatar = async (name: string, base64: string) => {
        const normalizedName = normalizeProfileName(name);
        if (!normalizedName) return;
        const updated = { ...profileAvatars, [normalizedName]: base64 };
        setProfileAvatars(updated);
        await Preferences.set({ key: 'profile_avatars', value: JSON.stringify(updated) });

        if (supabaseUrl && supabaseKey) {
            try {
                const client = createClient(supabaseUrl, supabaseKey);
                await client.from('sales').upsert({
                    id: 'config_profile_avatars',
                    brand: 'CONFIG',
                    model: 'AVATARS',
                    status: 'Completed',
                    year: new Date().getFullYear(),
                    km: 0,
                    cost_to_buy: 0,
                    sold_price: 0,
                    amount_paid_cash: 0,
                    amount_paid_bank: 0,
                    deposit: 0,
                    attachments: { avatars: updated, profiles: availableProfiles }
                });
            } catch (e) { console.error("Avatar Upload Error", e); }
        }
    };

    // Sync profiles to Supabase when they change
    const syncProfilesToCloud = async (profiles: string[]) => {
        if (!supabaseUrl || !supabaseKey) return;
        try {
            const client = createClient(supabaseUrl, supabaseKey);
            await client.from('sales').upsert({
                id: 'config_profile_avatars',
                brand: 'CONFIG',
                model: 'AVATARS',
                status: 'Completed',
                year: new Date().getFullYear(),
                km: 0,
                cost_to_buy: 0,
                sold_price: 0,
                amount_paid_cash: 0,
                amount_paid_bank: 0,
                deposit: 0,
                attachments: { avatars: profileAvatars, profiles: profiles }
            });
        } catch (e) { console.error("Profile Sync Error", e); }
    };

    // Load profiles from cloud on startup and periodically
    useEffect(() => {
        if (!supabaseUrl || !supabaseKey) return;

        const syncProfilesFromCloud = async () => {
            try {
                const client = createClient(supabaseUrl, supabaseKey);
                const { data } = await client.from('sales').select('attachments').eq('id', 'config_profile_avatars').single();
                if (data?.attachments?.profiles) {
                    const cloudProfiles: string[] = normalizeProfiles(data.attachments.profiles);
                    // Use cloud as source of truth - don't merge with defaults
                    setAvailableProfiles(cloudProfiles);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(cloudProfiles) });
                    syncProfilesToCloud(cloudProfiles);
                } else {
                    // Only set defaults if cloud has no data
                    const systemDefaults = normalizeProfiles(['Robert Gashi', ADMIN_PROFILE, 'User', 'Leonit']);
                    setAvailableProfiles(systemDefaults);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(systemDefaults) });
                    syncProfilesToCloud(systemDefaults);
                }
            } catch (e) { console.error("Profile Cloud Sync Error", e); }
        };

        syncProfilesFromCloud();

        // Sync profiles every 30 seconds to catch deletions from other devices
        const interval = setInterval(syncProfilesFromCloud, 30000);

        // Also sync immediately when app comes to foreground
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncProfilesFromCloud();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [supabaseUrl, supabaseKey]);


    const handlePasswordSubmit = () => {
        if (passwordInput === ADMIN_PASSWORD) {
            const normalizedProfile = normalizeProfileName(pendingProfile);
            setUserProfile(normalizedProfile);
            persistUserProfile(normalizedProfile);
            setShowProfileMenu(false);
            performAutoSync(supabaseUrl, supabaseKey, normalizedProfile);
            setShowPasswordModal(false);
            setPasswordInput('');
            setPendingProfile('');
        } else {
            alert('Incorrect Password!');
        }
    };




    // Document Preview Auto-Sync
    useEffect(() => {
        if (!documentPreview) return;
        const updated = sales.find(s => s.id === documentPreview.sale.id);
        if (updated && JSON.stringify(updated) !== JSON.stringify(documentPreview.sale)) {
            setDocumentPreview(prev => prev ? { ...prev, sale: updated } : prev);
        }
    }, [sales, documentPreview]);


    const persistSalesLocally = async (normalizedSales: CarSale[]) => {
        await Preferences.set({ key: 'car_sales_data', value: JSON.stringify(normalizedSales) });
        localStorage.setItem('car_sales_data', JSON.stringify(normalizedSales));

        if (Capacitor.isNativePlatform()) {
            await Filesystem.writeFile({
                path: 'sales_backup.json',
                data: JSON.stringify(normalizedSales, null, 2),
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
        }
    };

    const DIRTY_IDS_KEY = 'dirty_sale_ids';

    const persistDirtyIds = async (ids: Set<string>) => {
        const payload = JSON.stringify(Array.from(ids));
        await Preferences.set({ key: DIRTY_IDS_KEY, value: payload });
        localStorage.setItem(DIRTY_IDS_KEY, payload);
    };

    const updateSalesAndSave = async (newSales: CarSale[]): Promise<{ success: boolean; error?: string }> => {
        const normalizedSales = newSales.map(normalizeSaleProfiles);
        setSales(normalizedSales);
        try {
            await persistSalesLocally(normalizedSales);

            if (supabaseUrl && supabaseKey && userProfile) {
                const syncResult = await performAutoSync(supabaseUrl, supabaseKey, userProfile, normalizedSales);
                if (!syncResult.success) {
                    alert(`Save failed: ${syncResult.error || 'Sync failed.'}`);
                    return { success: false, error: syncResult.error || 'Sync failed.' };
                }
            } else {
                const missing = !supabaseUrl || !supabaseKey ? 'Supabase settings' : 'User profile';
                const message = `Save failed: ${missing} missing.`;
                alert(message);
                return { success: false, error: message };
            }
            return { success: true };
        } catch (e: any) {
            console.error("Save failed", e);
            alert(`Save failed: ${e?.message || 'Unknown error'}`);
            return { success: false, error: e?.message || 'Save failed.' };
        }
    };

    const markSalesDirty = (saleIds: string[]) => {
        saleIds.forEach(id => dirtyIds.current.add(id));
        void persistDirtyIds(dirtyIds.current);
    };

    const inlineRequiredFields = new Set<keyof CarSale>(['brand', 'model', 'buyerName', 'soldPrice']);
    const inlineNumericFields = new Set<keyof CarSale>([
        'year',
        'km',
        'costToBuy',
        'soldPrice',
        'amountPaidBank',
        'amountPaidCash',
        'deposit',
        'servicesCost',
        'amountPaidToKorea'
    ]);

    const resolveSoldBy = (sale: Partial<CarSale>, fallback?: string) => {
        const seller = sale.sellerName ? normalizeProfileName(sale.sellerName) : '';
        const soldBy = sale.soldBy ? normalizeProfileName(sale.soldBy) : '';
        if (seller && profileOptionIds.has(seller)) return seller;
        if (soldBy && profileOptionIds.has(soldBy)) return soldBy;
        return normalizeProfileName(soldBy || seller || fallback || userProfile || 'Unknown');
    };

    const handleInlineUpdate = async (id: string, field: keyof CarSale, value: string | number) => {
        const currentSales = salesRef.current;
        const index = currentSales.findIndex(s => s.id === id);
        if (index === -1) return;

        const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
        const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;

        let normalized: string | number = value;
        if (inlineNumericFields.has(field)) {
            const numericValue = typeof value === 'string' ? Number(value) : value;
            normalized = Number.isNaN(numericValue) ? 0 : numericValue;
        }
        if (typeof normalized === 'string') {
            normalized = normalized.trim();
        }
        if (inlineRequiredFields.has(field) && (normalized === '' || normalized === null || normalized === undefined)) {
            alert('This field is required.');
            return;
        }

        let normalizedValue = normalized;
        if ((field === 'sellerName' || field === 'soldBy') && typeof normalized === 'string') {
            normalizedValue = normalizeProfileName(normalized);
        }

        let updatedSale = { ...currentSales[index], [field]: normalizedValue };
        if (field === 'sellerName') {
            updatedSale = {
                ...updatedSale,
                soldBy: resolveSoldBy({ sellerName: String(normalizedValue) }, currentSales[index].soldBy)
            };
        }
        if (field === 'soldBy') {
            updatedSale = {
                ...updatedSale,
                sellerName: String(normalizedValue),
                soldBy: resolveSoldBy({ soldBy: String(normalizedValue) }, currentSales[index].soldBy)
            };
        }
        const newSales = [...currentSales];
        newSales[index] = updatedSale;
        dirtyIds.current.add(id);
        await updateSalesAndSave(newSales);

        requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = scrollTop;
                scrollContainerRef.current.scrollLeft = scrollLeft;
            }
        });
    };

    const handlePreviewSaveToSale = async (saleId: string, updates: Partial<CarSale>) => {
        const currentSales = salesRef.current;
        const index = currentSales.findIndex(s => s.id === saleId);
        if (index === -1) return;

        let updatedSale = { ...currentSales[index], ...updates };
        if (updates.sellerName) {
            updatedSale.sellerName = normalizeProfileName(updates.sellerName);
        }
        if (updates.soldBy) {
            updatedSale.soldBy = normalizeProfileName(updates.soldBy);
        }
        if (updates.sellerName || updates.soldBy) {
            updatedSale = {
                ...updatedSale,
                soldBy: resolveSoldBy(updatedSale, currentSales[index].soldBy),
                sellerName: updatedSale.sellerName || currentSales[index].sellerName
            };
        }

        const newSales = [...currentSales];
        newSales[index] = updatedSale;
        dirtyIds.current.add(saleId);
        await updateSalesAndSave(newSales);
    };

    useEffect(() => {
        const loadTx = async () => {
            const { value } = await Preferences.get({ key: 'bank_transactions' });
            if (value) { try { setTransactions(JSON.parse(value)); } catch (e) { console.error(e) } }
        };
        loadTx();
    }, []);



    const saveTransactions = async (txs: any[]) => {
        setTransactions(txs);
        await Preferences.set({ key: 'bank_transactions', value: JSON.stringify(txs) });

        // Sync to Supabase
        if (supabaseUrl && supabaseKey && userProfile) {
            const client = createSupabaseClient(supabaseUrl.trim(), supabaseKey.trim());
            syncTransactionsWithSupabase(client, txs, userProfile.trim())
                .then(res => {
                    if (res.success && res.data) {
                        setTransactions(res.data);
                        Preferences.set({ key: 'bank_transactions', value: JSON.stringify(res.data) });
                    } else if (res.error) {
                        console.error("TX Sync failed", res.error);
                    }
                });
        }
    };

    // Bulk Actions Handlers
    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback((visibleSales: CarSale[]) => {
        setSelectedIds(prev => {
            if (prev.size === visibleSales.length && visibleSales.length > 0) {
                return new Set();
            }
            return new Set(visibleSales.map(s => s.id));
        });
    }, []);

    const handleMobileRowPointerDown = (id: string, event: React.PointerEvent) => {
        if (event.pointerType === 'mouse') return;
        mobileRowTapStateRef.current[id] = {
            x: event.clientX,
            y: event.clientY,
            moved: false,
            active: true
        };
    };

    const handleMobileRowPointerMove = (id: string, event: React.PointerEvent) => {
        const state = mobileRowTapStateRef.current[id];
        if (event.pointerType === 'mouse' || !state?.active || state.moved) return;
        if (Math.abs(event.clientX - state.x) > ROW_TAP_MOVE_THRESHOLD || Math.abs(event.clientY - state.y) > ROW_TAP_MOVE_THRESHOLD) {
            state.moved = true;
        }
    };

    const handleMobileRowPointerEnd = (id: string) => {
        const state = mobileRowTapStateRef.current[id];
        if (state) state.active = false;
    };

    const shouldIgnoreMobileRowTap = (id: string) => {
        const state = mobileRowTapStateRef.current[id];
        if (!state?.moved) return false;
        state.moved = false;
        return true;
    };

    const sanitizeFolderName = (name: string) => {
        const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
        return cleaned || 'Invoice';
    };

    const extractBase64 = (data: string) => {
        const base64Index = data.indexOf('base64,');
        if (base64Index >= 0) {
            return data.slice(base64Index + 'base64,'.length);
        }
        const parts = data.split(',');
        return parts.length > 1 ? parts[1] : data;
    };

    const base64ToUint8Array = (base64: string) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    };

    const uint8ToBase64 = (bytes: Uint8Array) => {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    };

    const collectInvoiceAttachments = (sale: CarSale) => {
        const files: Attachment[] = [];
        if (sale.bankReceipt) files.push(sale.bankReceipt);
        if (sale.bankInvoice) files.push(sale.bankInvoice);
        if (sale.bankReceipts?.length) files.push(...sale.bankReceipts);
        if (sale.bankInvoices?.length) files.push(...sale.bankInvoices);
        if (sale.depositInvoices?.length) files.push(...sale.depositInvoices);
        const contractCollections: Array<Attachment[] | undefined> = [
            (sale as { contractFiles?: Attachment[] }).contractFiles,
            (sale as { contractAttachments?: Attachment[] }).contractAttachments,
            (sale as { contracts?: Attachment[] }).contracts
        ];
        contractCollections.forEach(collection => {
            if (collection?.length) files.push(...collection);
        });
        const contractSingles: Array<Attachment | undefined> = [
            (sale as { contractFile?: Attachment }).contractFile,
            (sale as { contractAttachment?: Attachment }).contractAttachment
        ];
        contractSingles.forEach(file => {
            if (file) files.push(file);
        });
        return files.filter(file => file?.data);
    };

    const generateInvoicePdfBase64 = async (sale: CarSale, showBankOnly: boolean = false) => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '1024px';
        container.style.zIndex = '-1';
        document.body.appendChild(container);

        const root = createRoot(container);
        root.render(<InvoiceDocument sale={sale} showBankOnly={showBankOnly} />);

        await new Promise(resolve => setTimeout(resolve, 300));

        const invoiceElement = container.querySelector('#invoice-content') as HTMLElement | null;
        if (invoiceElement) {
            await waitForImages(invoiceElement);
        }

        // @ts-ignore
        const html2pdf = (await import('html2pdf.js')).default;
        const opt = {
            margin: 0,
            filename: `Invoice_${sale.vin || sale.id}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.92 },
            html2canvas: {
                scale: 4,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                imageTimeout: 10000,
                onclone: (clonedDoc: Document) => {
                    sanitizePdfCloneStyles(clonedDoc);
                    normalizePdfLayout(clonedDoc);
                    const invoiceNode = clonedDoc.querySelector('#invoice-content');
                    clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
                        if (invoiceNode && node.closest('#invoice-content')) {
                            return;
                        }
                        node.remove();
                    });
                }
            },
            jsPDF: {
                unit: 'mm' as const,
                format: 'a4' as const,
                orientation: 'portrait' as const,
                compress: true,
                putOnlyUsedFonts: true
            },
            pagebreak: { mode: ['css', 'legacy', 'avoid-all'] as const }
        };

        const pdf = html2pdf().set(opt).from(invoiceElement || container);
        const dataUri = await pdf.outputPdf('datauristring');

        root.unmount();
        container.remove();

        const base64 = dataUri.split(',')[1];
        if (!base64) {
            throw new Error('Failed to generate invoice PDF data.');
        }

        return {
            fileName: `Invoice_${sale.vin || sale.id}.pdf`,
            base64
        };
    };

    const generateContractPdfBase64 = async (sale: CarSale, type: ContractType) => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '1024px';
        container.style.zIndex = '-1';
        document.body.appendChild(container);

        const root = createRoot(container);
        root.render(<ContractDocument sale={sale} type={type} />);

        await new Promise(resolve => setTimeout(resolve, 300));

        const contractElement = container.querySelector('[data-contract-document]') as HTMLElement | null;
        if (contractElement) {
            await waitForImages(contractElement);
        }

        // @ts-ignore
        const html2pdf = (await import('html2pdf.js')).default;
        const fileName = `Contract_${type}_${sale.vin || sale.id}.pdf`;
        const opt = {
            margin: 0,
            filename: fileName,
            image: { type: 'jpeg' as const, quality: 0.92 },
            html2canvas: {
                scale: 4,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                imageTimeout: 10000,
                onclone: (clonedDoc: Document) => {
                    sanitizePdfCloneStyles(clonedDoc);
                    normalizePdfLayout(clonedDoc);
                }
            },
            jsPDF: {
                unit: 'mm' as const,
                format: 'a4' as const,
                orientation: 'portrait' as const,
                compress: true,
                putOnlyUsedFonts: true
            },
            pagebreak: { mode: ['css', 'legacy', 'avoid-all'] as const }
        };

        const pdf = html2pdf().set(opt).from(contractElement || container);
        const dataUri = await pdf.outputPdf('datauristring');

        root.unmount();
        container.remove();

        const base64 = dataUri.split(',')[1];
        if (!base64) {
            throw new Error('Failed to generate contract PDF data.');
        }

        return {
            fileName,
            base64
        };
    };

    const handleDownloadSelectedInvoices = async (selectedSales: CarSale[]) => {
        if (selectedSales.length === 0 || isDownloadingInvoices) return;

        setIsDownloadingInvoices(true);
        setInvoiceDownloadStatus(`Preparing ${selectedSales.length} invoices...`);

        try {
            const dateStamp = new Date().toISOString().split('T')[0];
            const fileMap: Record<string, Uint8Array> = {};

            let index = 0;
            let successCount = 0;
            for (const sale of selectedSales) {
                index += 1;

                // Skip sales with no bank payment if that's what user considers "blank" or non-invoiceable for bank purposes
                // "real invoice and only bank paid price"
                if (!sale.amountPaidBank || sale.amountPaidBank <= 0) {
                    console.warn(`Skipping sale ${sale.id} - no bank payment for invoice.`);
                    continue;
                }

                setInvoiceDownloadStatus(`Packaging ${index}/${selectedSales.length}...`);

                try {
                    // Generate ONLY invoice as requested (only bank paid price)
                    const invoicePdf = await generateInvoicePdfBase64(sale, true); // true for showBankOnly
                    const normalizedName = sanitizeFolderName(invoicePdf.fileName.replace(/\.pdf$/i, ''));
                    const uniqueName = `${normalizedName}_${sanitizeFolderName(sale.id)}.pdf`;
                    fileMap[`Invoices_${dateStamp}/${uniqueName}`] = base64ToUint8Array(invoicePdf.base64);
                    successCount++;
                } catch (e) {
                    console.error(`Failed to generate invoice for ${sale.id}`, e);
                }

                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (successCount === 0) {
                alert("No valid invoices found to download (requires bank payment info).");
                return;
            }

            const zipData = await new Promise<Uint8Array>((resolve, reject) => {
                zip(fileMap, { level: 0 }, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });

            const downloadName = `Invoices_${dateStamp}.zip`;
            if (Capacitor.isNativePlatform()) {
                const zipBase64 = uint8ToBase64(zipData);
                const savedFile = await Filesystem.writeFile({
                    path: downloadName,
                    data: zipBase64,
                    directory: Directory.Documents,
                });

                await Share.share({
                    title: 'Invoices',
                    text: `Invoices bundle (${selectedSales.length})`,
                    url: savedFile.uri,
                    dialogTitle: 'Download invoices'
                });
            } else {
                const zipBuffer = zipData.buffer.slice(zipData.byteOffset, zipData.byteOffset + zipData.byteLength) as ArrayBuffer;
                const blob = new Blob([zipBuffer], { type: 'application/zip' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = downloadName;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            }

            setSelectedIds(new Set());
        } catch (error: any) {
            console.error('Invoice download failed:', error);
            alert(`Download failed: ${error?.message || 'Unknown error'}`);
        } finally {
            setIsDownloadingInvoices(false);
            setInvoiceDownloadStatus('');
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.size} items permanently?`)) return;

        // Get IDs to delete
        const idsToDelete = Array.from(selectedIds);

        // Delete from Supabase immediately
        if (supabaseUrl && supabaseKey) {
            try {
                const client = createSupabaseClient(supabaseUrl, supabaseKey);
                for (const id of idsToDelete) {
                    await client.from('sales').delete().eq('id', id);
                }
                console.log("Deleted from Supabase:", idsToDelete.length, "records");
            } catch (e) {
                console.error("Supabase delete error:", e);
            }
        }

        // Delete locally
        const newSales = sales.filter(s => !selectedIds.has(s.id));
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    const handleBulkMove = async (status: SaleStatus) => {
        const newSales = sales.map(s => {
            if (selectedIds.has(s.id)) {
                dirtyIds.current.add(s.id);
                return { ...s, status };
            }
            return s;
        });
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    // Delete a single car immediately
    const handleDeleteSingle = async (id: string) => {
        if (!confirm('Delete this car permanently?')) return;

        // Delete from Supabase immediately
        if (supabaseUrl && supabaseKey) {
            try {
                const client = createSupabaseClient(supabaseUrl, supabaseKey);
                await client.from('sales').delete().eq('id', id);
                console.log("Deleted from Supabase:", id);
            } catch (e) {
                console.error("Supabase delete error:", e);
            }
        }

        // Delete locally
        const newSales = sales.filter(s => s.id !== id);
        await updateSalesAndSave(newSales);
    };

    // Group management functions
    const persistGroupMeta = async (next: GroupMeta[]) => {
        setGroupMeta(next);
        await Preferences.set({ key: 'sale_group_meta', value: JSON.stringify(next) });
        localStorage.setItem('sale_group_meta', JSON.stringify(next));
    };

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev =>
            prev.includes(groupName)
                ? prev.filter(g => g !== groupName)
                : [...prev, groupName]
        );
    };

    const createGroupWithName = async (name: string, saleIds: string[]) => {
        if (!name?.trim() || saleIds.length === 0) return;
        const trimmed = name.trim();
        if (groupMeta.some(g => g.name.toLowerCase() === trimmed.toLowerCase())) {
            alert('Group already exists.');
            return;
        }

        const nextMeta = [...groupMeta, { name: trimmed, order: groupMeta.length, archived: false }];
        await persistGroupMeta(nextMeta);
        setExpandedGroups(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));

        const saleIdSet = new Set(saleIds);
        markSalesDirty(saleIds);
        const newSales = sales.map(s => saleIdSet.has(s.id) ? { ...s, group: trimmed } : s);
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    const handleCreateGroup = async () => {
        if (selectedIds.size === 0) return;
        const name = prompt('Enter group name:');
        if (!name?.trim()) return;
        await createGroupWithName(name, Array.from(selectedIds));
    };

    const renameGroupWithName = async (groupName: string, newName: string) => {
        if (!newName || !newName.trim()) return;
        const trimmed = newName.trim();
        if (trimmed === groupName) return;
        if (groupMeta.some(g => g.name.toLowerCase() === trimmed.toLowerCase())) {
            alert('Group name already exists.');
            return;
        }

        const nextMeta = groupMeta.map(g => g.name === groupName ? { ...g, name: trimmed } : g);
        await persistGroupMeta(nextMeta);
        const affectedIds = sales.filter(s => s.group === groupName).map(s => s.id);
        markSalesDirty(affectedIds);
        const newSales = sales.map(s => s.group === groupName ? { ...s, group: trimmed } : s);
        await updateSalesAndSave(newSales);
        setExpandedGroups(prev => prev.map(g => g === groupName ? trimmed : g));
    };

    const handleRenameGroup = async (groupName: string) => {
        const newName = prompt('Rename group to:', groupName);
        if (!newName || !newName.trim()) return;
        await renameGroupWithName(groupName, newName);
    };

    const handleArchiveGroup = async (groupName: string, archived: boolean) => {
        const nextMeta = groupMeta.map(g => g.name === groupName ? { ...g, archived } : g);
        await persistGroupMeta(nextMeta);
        if (archived) {
            setExpandedGroups(prev => prev.filter(g => g !== groupName));
        } else {
            setExpandedGroups(prev => (prev.includes(groupName) ? prev : [...prev, groupName]));
        }
    };

    const moveGroup = async (groupName: string, direction: 'up' | 'down') => {
        const ordered = [...groupMeta].sort((a, b) => a.order - b.order);
        const active = ordered.filter(g => !g.archived);
        const index = active.findIndex(g => g.name === groupName);
        if (index === -1) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= active.length) return;
        const updatedActive = [...active];
        [updatedActive[index], updatedActive[targetIndex]] = [updatedActive[targetIndex], updatedActive[index]];
        const reorderedActive = updatedActive.map((g, idx) => ({ ...g, order: idx }));
        const archived = ordered.filter(g => g.archived).map((g, idx) => ({ ...g, order: reorderedActive.length + idx }));
        await persistGroupMeta([...reorderedActive, ...archived]);
    };

    const handleMoveGroupStatus = async (groupName: string, status: SaleStatus) => {
        const trimmedGroup = groupName.trim();
        if (!trimmedGroup) return;
        const affectedSales = sales.filter(s => s.group?.trim() === trimmedGroup);
        if (affectedSales.length === 0) return;

        const previousSales = salesRef.current;
        const previousDirtyIds = new Set(dirtyIds.current);
        const newSales = sales.map(s => s.group?.trim() === trimmedGroup ? { ...s, status } : s);

        affectedSales.forEach(sale => dirtyIds.current.add(sale.id));
        setGroupMoveInFlight(trimmedGroup);

        try {
            const result = await updateSalesAndSave(newSales);
            if (!result.success) {
                dirtyIds.current = previousDirtyIds;
                setSales(previousSales);
                await persistSalesLocally(previousSales);
                alert(`Move failed. ${result.error || 'Please try again.'}`);
            }
        } finally {
            setGroupMoveInFlight(null);
        }
    };

    const handleRemoveFromGroup = async (id: string) => {
        markSalesDirty([id]);
        const newSales = sales.map(s => s.id === id ? { ...s, group: null } : s);
        await updateSalesAndSave(newSales);
    };

    const handleAddToGroup = async (groupName: string, saleIds: string[]) => {
        if (saleIds.length === 0) return;
        markSalesDirty(saleIds);
        const saleIdSet = new Set(saleIds);
        const newSales = sales.map(s => saleIdSet.has(s.id) ? { ...s, group: groupName } : s);
        await updateSalesAndSave(newSales);
        setExpandedGroups(prev => (prev.includes(groupName) ? prev : [...prev, groupName]));
        setSelectedIds(new Set());
    };

    const handleRemoveSelectedFromGroup = async (saleIds: string[]) => {
        if (saleIds.length === 0) return;
        markSalesDirty(saleIds);
        const saleIdSet = new Set(saleIds);
        const newSales = sales.map(s => saleIdSet.has(s.id) ? { ...s, group: null } : s);
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    const handleBulkCopy = () => {
        const itemsToCopy = sales.filter(s => selectedIds.has(s.id));
        localStorage.setItem('clipboard_sales', JSON.stringify(itemsToCopy));
        alert(`${itemsToCopy.length} items copied to clipboard`);
        setSelectedIds(new Set());
    };

    const handleBulkPaste = async () => {
        const clipboard = localStorage.getItem('clipboard_sales');
        if (!clipboard) return;
        const itemsToPaste: CarSale[] = JSON.parse(clipboard);
        const newItems = itemsToPaste.map(item => ({
            ...item,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            vin: `${item.vin} (Copy)`,
            plateNumber: `${item.plateNumber} (Copy)`
        }));
        await updateSalesAndSave([...newItems, ...sales]);
    };

    const handleLogout = async () => {
        setUserProfile('');
        await Preferences.remove({ key: 'user_profile' });
        await Preferences.remove({ key: 'remember_profile' });
        localStorage.removeItem(SESSION_PROFILE_STORAGE_KEY);
        setRememberProfile(false);
        setShowProfileMenu(false);
    };

    const handleAddProfile = async () => {
        if (!isAdmin) {
            alert(`Only ${ADMIN_PROFILE} can add users.`);
            return;
        }
        const normalizedName = normalizeProfileName(newProfileName);
        if (!normalizedName) return;
        if (availableProfiles.includes(normalizedName)) {
            alert('Profile already exists!');
            return;
        }
        const updated = normalizeProfiles([...availableProfiles, normalizedName]);
        setAvailableProfiles(updated);
        setUserProfile(normalizedName);
        setNewProfileName('');
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
        await persistUserProfile(normalizedName);
        syncProfilesToCloud(updated);
    };

    const quickAddProfile = async () => {
        if (!isAdmin) {
            alert(`Only ${ADMIN_PROFILE} can add users.`);
            return;
        }
        const name = prompt("Enter new profile name:");
        if (name && name.trim()) {
            const normalizedName = normalizeProfileName(name);
            if (!normalizedName) return;
            if (availableProfiles.includes(normalizedName)) {
                alert('Profile already exists!');
                return;
            }
            const updated = normalizeProfiles([...availableProfiles, normalizedName]);
            setAvailableProfiles(updated);
            setUserProfile(normalizedName);
            await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
            await persistUserProfile(normalizedName);
            setShowProfileMenu(false);
            syncProfilesToCloud(updated);
        }
    };

    const handleDeleteProfile = async (name: string) => {
        const normalizedTarget = normalizeProfileName(name);
        if (!normalizedTarget) return;

        const normalizedAdmin = normalizeProfileName(ADMIN_PROFILE);
        const hasAdminProfile = availableProfiles.some(profile => normalizeProfileName(profile) === normalizedAdmin);
        if (!hasAdminProfile) {
            alert(`Cannot delete "${name}". Admin profile "${ADMIN_PROFILE}" was not found.`);
            return;
        }

        // Check for sales to reassign
        const salesToReassign = sales.filter(s => normalizeProfileName(s.soldBy) === normalizedTarget || normalizeProfileName(s.sellerName) === normalizedTarget);

        if (salesToReassign.length > 0) {
            if (!confirm(`This profile has ${salesToReassign.length} sales. Deleting it will reassign these sales to '${ADMIN_PROFILE}'. Continue?`)) {
                return;
            }
        }

        if (supabaseUrl && supabaseKey) {
            const client = createSupabaseClient(supabaseUrl, supabaseKey);
            const reassignResult = await reassignProfileAndDelete(client, normalizedTarget, normalizedAdmin);
            if (!reassignResult.success) {
                alert(`Failed to delete profile "${name}". ${reassignResult.error || ''}`.trim());
                return;
            }
        }

        // Reassign sales to Admin locally
        const updatedSales = sales.map(s => {
            const sBy = normalizeProfileName(s.soldBy);
            const sName = normalizeProfileName(s.sellerName);

            if (sBy === normalizedTarget || sName === normalizedTarget) {
                return {
                    ...s,
                    soldBy: sBy === normalizedTarget ? ADMIN_PROFILE : s.soldBy,
                    sellerName: sName === normalizedTarget ? ADMIN_PROFILE : s.sellerName
                };
            }
            return s;
        });
        const saveResult = await updateSalesAndSave(updatedSales);
        if (!saveResult.success) {
            alert(`Failed to update sales for "${name}". ${saveResult.error || ''}`.trim());
            return;
        }

        const updated = availableProfiles.filter(p => normalizeProfileName(p) !== normalizedTarget);
        const normalized = normalizeProfiles(updated);
        setAvailableProfiles(normalized);
        if (normalizeProfileName(userProfile) === normalizedTarget) setUserProfile('');
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(normalized) });
        syncProfilesToCloud(normalized);
    };

    const handleEditProfile = async (oldName: string, newName: string) => {
        const normalizedName = normalizeProfileName(newName);
        if (!normalizedName || (normalizedName !== oldName && availableProfiles.includes(normalizedName))) return;
        const updated = normalizeProfiles(availableProfiles.map(p => p === oldName ? normalizedName : p));
        setAvailableProfiles(updated);
        if (userProfile === oldName) {
            setUserProfile(normalizedName);
            await persistUserProfile(normalizedName);
        }
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
        syncProfilesToCloud(updated);
    };



    // Real-time Subscription
    useEffect(() => {
        if (!supabaseUrl || !supabaseKey || !userProfile) return;
        const client = createSupabaseClient(supabaseUrl, supabaseKey);

        console.log("Subscribing to realtime changes...");
        const channel = client
            .channel('public:sales')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, (payload) => {
                console.log('Realtime Change:', payload);
                // Trigger auto-sync to pull latest data and merge
                // We pass undefined for sales to force a fresh read from Persistence to avoid stale closure state
                if (userProfile) performAutoSync(supabaseUrl, supabaseKey, userProfile);
            })
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [supabaseUrl, supabaseKey, userProfile]);
    useEffect(() => {
        const initSettings = async () => {
            // Hardcoded Credentials (as fallback/default)
            const SUPABASE_URL = "https://zqsofkosyepcaealphbu.supabase.co";
            const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxc29ma29zeWVwY2FlYWxwaGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDc5NzgsImV4cCI6MjA4MDg4Mzk3OH0.QaVhZ8vTDwvSrQ0lp_tw5Uximi_yvliOISHvySke0H0";

            try {
                // Ensure Supabase URL/Key exist
                let { value: url } = await Preferences.get({ key: 'supabase_url' });
                let { value: keyName } = await Preferences.get({ key: 'supabase_key' });

                if (!url) { url = SUPABASE_URL; await Preferences.set({ key: 'supabase_url', value: SUPABASE_URL }); }
                if (!keyName) { keyName = SUPABASE_KEY; await Preferences.set({ key: 'supabase_key', value: SUPABASE_KEY }); }

                setSupabaseUrl(url);
                setSupabaseKey(keyName);

                if (url !== SUPABASE_URL) await Preferences.set({ key: 'supabase_url', value: SUPABASE_URL });
                if (keyName !== SUPABASE_KEY) await Preferences.set({ key: 'supabase_key', value: SUPABASE_KEY });

                const { value: apiKeyVal } = await Preferences.get({ key: 'openai_api_key' });
                if (apiKeyVal) setApiKey(apiKeyVal);

                const { value: rememberVal } = await Preferences.get({ key: 'remember_profile' });
                const shouldRemember = rememberVal === 'true';
                setRememberProfile(shouldRemember);

                let { value: storedProfile } = await Preferences.get({ key: 'user_profile' });
                const sessionProfile = localStorage.getItem(SESSION_PROFILE_STORAGE_KEY);
                if ((!storedProfile || !shouldRemember) && sessionProfile) {
                    storedProfile = sessionProfile;
                }

                const normalizedStoredProfile = normalizeProfileName(storedProfile);
                if (normalizedStoredProfile && normalizedStoredProfile !== storedProfile) {
                    storedProfile = normalizedStoredProfile;
                    localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, normalizedStoredProfile);
                    if (shouldRemember) {
                        await Preferences.set({ key: 'user_profile', value: normalizedStoredProfile });
                    }
                }
                if (storedProfile) {
                    setUserProfile(storedProfile);
                    setView('landing');
                    localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, storedProfile);
                }
                if (storedProfile && !shouldRemember) {
                    await Preferences.remove({ key: 'user_profile' });
                }

                let { value: profiles } = await Preferences.get({ key: 'available_profiles' });
                if (profiles) {
                    const loaded = normalizeProfiles(JSON.parse(profiles));
                    setAvailableProfiles(loaded);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(loaded) });
                    syncProfilesToCloud(loaded);
                } else {
                    const defaults = normalizeProfiles(ALLOWED_PROFILES);
                    setAvailableProfiles(defaults);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(defaults) });
                    // Also sync to cloud on first run
                    syncProfilesToCloud(defaults);
                }

                const { value: groupMetaValue } = await Preferences.get({ key: 'sale_group_meta' });
                if (groupMetaValue) {
                    const parsed = JSON.parse(groupMetaValue) as GroupMeta[];
                    setGroupMeta(parsed);
                } else {
                    const stored = localStorage.getItem('sale_group_meta');
                    if (stored) {
                        setGroupMeta(JSON.parse(stored));
                    }
                }

                const { value: dirtyValue } = await Preferences.get({ key: DIRTY_IDS_KEY });
                if (dirtyValue) {
                    const parsed = JSON.parse(dirtyValue) as string[];
                    dirtyIds.current = new Set(parsed.filter(Boolean));
                } else {
                    const storedDirty = localStorage.getItem(DIRTY_IDS_KEY);
                    if (storedDirty) {
                        const parsed = JSON.parse(storedDirty) as string[];
                        dirtyIds.current = new Set(parsed.filter(Boolean));
                    }
                }

                const persistedUiState = localStorage.getItem(UI_STATE_STORAGE_KEY);
                if (persistedUiState) {
                    try {
                        const parsed = JSON.parse(persistedUiState) as {
                            view?: string;
                            activeCategory?: SaleStatus | 'SALES' | 'INVOICES' | 'SHIPPED' | 'INSPECTIONS' | 'AUTOSALLON';
                            searchTerm?: string;
                            sortBy?: string;
                            sortDir?: 'asc' | 'desc';
                            expandedGroups?: string[];
                            scrollTop?: number;
                        };
                        if (parsed.view) setView(parsed.view);
                        if (parsed.activeCategory) setActiveCategory(parsed.activeCategory);
                        if (typeof parsed.searchTerm === 'string') setSearchTerm(parsed.searchTerm);
                        if (parsed.sortBy) setSortBy(parsed.sortBy);
                        if (parsed.sortDir === 'asc' || parsed.sortDir === 'desc') setSortDir(parsed.sortDir);
                        if (Array.isArray(parsed.expandedGroups)) {
                            setExpandedGroups(parsed.expandedGroups.filter(Boolean));
                            hasInitializedGroups.current = true;
                        }
                        if (typeof parsed.scrollTop === 'number' && Number.isFinite(parsed.scrollTop)) {
                            restoredScrollTopRef.current = parsed.scrollTop;
                        }
                        didRestoreUiStateRef.current = true;
                    } catch (uiErr) {
                        console.error('Failed to parse UI state:', uiErr);
                    }
                }
            } catch (e) {
                console.error("Initialization Failed:", e);
            } finally {
                setIsLoading(false);
            }
        };
        initSettings();
    }, []);

    useEffect(() => {
        if (isLoading) return;

        const uiState = {
            view,
            activeCategory,
            searchTerm,
            sortBy,
            sortDir,
            expandedGroups,
            scrollTop: scrollContainerRef.current?.scrollTop ?? restoredScrollTopRef.current ?? 0
        };

        localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(uiState));
    }, [isLoading, view, activeCategory, searchTerm, sortBy, sortDir, expandedGroups]);

    useEffect(() => {
        if (isLoading || !didRestoreUiStateRef.current) return;
        if (restoredScrollTopRef.current === null) return;

        const restoreScroll = () => {
            if (!scrollContainerRef.current) return;
            scrollContainerRef.current.scrollTop = restoredScrollTopRef.current ?? 0;
        };

        requestAnimationFrame(restoreScroll);
        const timeoutId = window.setTimeout(restoreScroll, 120);
        return () => window.clearTimeout(timeoutId);
    }, [isLoading, sales.length, view, activeCategory]);

    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;

        const onScroll = () => {
            if (isLoading) return;
            let existing: Record<string, unknown> = {};
            const existingRaw = localStorage.getItem(UI_STATE_STORAGE_KEY);
            if (existingRaw) {
                try {
                    existing = JSON.parse(existingRaw) as Record<string, unknown>;
                } catch {
                    existing = {};
                }
            }
            const nextState = {
                ...existing,
                view,
                activeCategory,
                searchTerm,
                sortBy,
                sortDir,
                expandedGroups,
                scrollTop: container.scrollTop
            };
            localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(nextState));
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll);
    }, [isLoading, view, activeCategory, searchTerm, sortBy, sortDir, expandedGroups]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            const currentState = {
                view,
                activeCategory,
                searchTerm,
                sortBy,
                sortDir,
                expandedGroups,
                scrollTop: scrollContainerRef.current?.scrollTop ?? restoredScrollTopRef.current ?? 0
            };
            localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(currentState));
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [view, activeCategory, searchTerm, sortBy, sortDir, expandedGroups]);

    useEffect(() => {
        if (!userProfile) return;
        localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, userProfile);
    }, [userProfile]);

    useEffect(() => {
        if (userProfile) return;
        const fallbackProfile = localStorage.getItem(SESSION_PROFILE_STORAGE_KEY);
        const normalizedFallback = normalizeProfileName(fallbackProfile);
        if (normalizedFallback) {
            setUserProfile(normalizedFallback);
            if (view === 'profile_select') {
                setView('landing');
            }
        }
    }, [userProfile, view]);

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === SESSION_PROFILE_STORAGE_KEY && !event.newValue) {
                setUserProfile('');
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    useEffect(() => {
        const loadSales = async () => {
            try {
                // 1. Load Local Data First for Immediate Display
                let currentSales = INITIAL_SALES;
                const { value } = await Preferences.get({ key: 'car_sales_data' });
                if (value) {
                    currentSales = JSON.parse(value);
                } else {
                    const saved = localStorage.getItem('car_sales_data');
                }

                // Just load the saved data - no auto-import
                const normalizedSales = currentSales.map(normalizeSaleProfiles);
                const hasAdminOwnership = currentSales.some((sale: CarSale) => isLegacyAdminProfile(sale.sellerName) || isLegacyAdminProfile(sale.soldBy));
                const { updatedSales: reassignedSales, hasChanges: hasReassignments } = enforceAllowedSalesProfiles(normalizedSales);
                const { sales: salesWithB200, added: addedMissingB200 } = ensureMercedesB200Present(reassignedSales);
                if (hasAdminOwnership || hasReassignments || addedMissingB200) {
                    currentSales.forEach((sale: CarSale) => {
                        if (isLegacyAdminProfile(sale.sellerName) || isLegacyAdminProfile(sale.soldBy)) {
                            dirtyIds.current.add(sale.id);
                        }
                    });
                    await persistDirtyIds(dirtyIds.current);
                    await Preferences.set({ key: 'car_sales_data', value: JSON.stringify(salesWithB200) });
                    localStorage.setItem('car_sales_data', JSON.stringify(salesWithB200));
                }
                setSales(salesWithB200.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)));

                // 2. Fetch/Sync with Supabase (Background)
                const { value: key } = await Preferences.get({ key: 'openai_api_key' });
                const { value: sbUrl } = await Preferences.get({ key: 'supabase_url' });
                const { value: sbKey } = await Preferences.get({ key: 'supabase_key' });
                const { value: profile } = await Preferences.get({ key: 'user_profile' });

                if (key && sbUrl && sbKey && profile) {
                    performAutoSync(sbUrl, sbKey, profile, currentSales);
                }
            } catch (e) {
                console.error("Load failed", e);
            }
        };

        const initApp = async () => {
            await loadSales();
        };
        initApp();

        // Auto-sync on focus
        const onFocus = async () => {
            // Prevent sync if user is editing
            if (isFormOpenRef.current) return;

            const { value: url } = await Preferences.get({ key: 'supabase_url' });
            const { value: sbKey } = await Preferences.get({ key: 'supabase_key' });
            const { value: prof } = await Preferences.get({ key: 'user_profile' });
            if (url && sbKey && prof) {
                console.log("App focused, syncing...", url);
                const { value: s } = await Preferences.get({ key: 'car_sales_data' });
                const latestSales = s ? JSON.parse(s) : [];
                performAutoSync(url, sbKey, prof, latestSales);
            }
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    // Keep profiles limited to allowed list and reassign any sales owned by deleted profiles
    useEffect(() => {
        if (sales.length === 0) return;

        const normalizedProfiles = normalizeProfiles(availableProfiles);
        const profilesChanged = normalizedProfiles.length !== availableProfiles.length
            || normalizedProfiles.some((profile, index) => profile !== availableProfiles[index]);

        const { updatedSales, hasChanges } = enforceAllowedSalesProfiles(sales);

        if (hasChanges) {
            setSales(updatedSales);
            Preferences.set({ key: 'car_sales_data', value: JSON.stringify(updatedSales) });
            localStorage.setItem('car_sales_data', JSON.stringify(updatedSales));
        }

        if (profilesChanged) {
            setAvailableProfiles(normalizedProfiles);
            Preferences.set({ key: 'available_profiles', value: JSON.stringify(normalizedProfiles) });
            if (supabaseUrl && supabaseKey) {
                syncProfilesToCloud(normalizedProfiles);
            }
        }
    }, [sales, availableProfiles, supabaseUrl, supabaseKey, enforceAllowedSalesProfiles, normalizeProfiles]);

    useEffect(() => {
        if (!userProfile || !supabaseUrl || !supabaseKey) return;
        const syncOnLogin = async () => {
            const { value } = await Preferences.get({ key: 'car_sales_data' });
            const localSales = value ? JSON.parse(value) : salesRef.current;
            performAutoSync(supabaseUrl, supabaseKey, userProfile, localSales);
        };
        syncOnLogin();
    }, [userProfile, supabaseUrl, supabaseKey]);

    const performAutoSync = async (
        url: string,
        key: string,
        profile: string,
        currentLocalSales?: CarSale[]
    ): Promise<{ success: boolean; error?: string }> => {
        setIsSyncing(true);
        setSyncError(''); // Clear previous errors
        console.log("Starting AutoSync to:", url);
        let syncErrorMessage = '';

        try {
            let localSalesToSync = currentLocalSales;
            if (!localSalesToSync) {
                const { value } = await Preferences.get({ key: 'car_sales_data' });
                localSalesToSync = value ? JSON.parse(value) : (sales.length > 0 ? sales : []);
            }
            if (!localSalesToSync) localSalesToSync = [];

            const client = createSupabaseClient(url.trim(), key.trim());

            // 1. Identify Dirty Items to Push
            const dirtyItems = localSalesToSync.filter(s => dirtyIds.current.has(s.id));
            if (localSalesToSync.length > 0 && dirtyIds.current.size === 0) {
                console.log("No local changes to push (Clean Sync)");
            }

            // 2. Sync (Upsert Dirty -> Fetch All)
            const salesRes = await syncSalesWithSupabase(client, dirtyItems, profile.trim());
            if (!salesRes.success) {
                syncErrorMessage = salesRes.error || 'Sales sync failed.';
            }

            // 3. Clear Dirty IDs on success
            if (salesRes.success) {
                const failedIds = new Set(salesRes.failedIds || []);
                dirtyItems.forEach(s => {
                    if (!failedIds.has(s.id)) {
                        dirtyIds.current.delete(s.id);
                    }
                });
                await persistDirtyIds(dirtyIds.current);
            }
            if (salesRes.success) {
                console.log("Sales Sync Success - content synced");
                if (salesRes.data) {
                    const mergedById = new Map<string, CarSale>();
                    salesRes.data.forEach((sale: CarSale) => {
                        mergedById.set(sale.id, sale);
                    });
                    localSalesToSync.forEach((sale: CarSale) => {
                        if (dirtyIds.current.has(sale.id) || !mergedById.has(sale.id)) {
                            mergedById.set(sale.id, sale);
                        }
                    });
                    const mergedSales = Array.from(mergedById.values());
                    // Aggressive Deduplication: Filter by ID, VIN, and Plate Number
                    const seenIds = new Set<string>();
                    const seenVins = new Set<string>();
                    const seenPlates = new Set<string>();

                    const uniqueSales = mergedSales.filter((s: CarSale) => {
                        // 1. Check ID
                        if (seenIds.has(s.id)) return false;

                        // 2. Check VIN (if present and valid length > 5 to avoid short garbage)
                        if (s.vin && s.vin.trim().length > 5) {
                            const normalizedVin = s.vin.trim().toUpperCase();
                            if (seenVins.has(normalizedVin)) return false;
                            seenVins.add(normalizedVin);
                        }

                        // 3. Check Plate (if present)
                        if (s.plateNumber && s.plateNumber.trim().length > 3) {
                            const normalizedPlate = s.plateNumber.trim().toUpperCase().replace(/\s+/g, '');
                            if (seenPlates.has(normalizedPlate)) return false;
                            seenPlates.add(normalizedPlate);
                        }

                        seenIds.add(s.id);
                        return true;
                    });

                    const normalizedSales = uniqueSales.map(normalizeSaleProfiles);
                    const hasAdminOwnership = uniqueSales.some(sale => isLegacyAdminProfile(sale.sellerName) || isLegacyAdminProfile(sale.soldBy));
                    if (hasAdminOwnership) {
                        uniqueSales.forEach(sale => {
                            if (isLegacyAdminProfile(sale.sellerName) || isLegacyAdminProfile(sale.soldBy)) {
                                dirtyIds.current.add(sale.id);
                            }
                        });
                        await persistDirtyIds(dirtyIds.current);
                    }
                    setSales(normalizedSales);
                    await Preferences.set({ key: 'car_sales_data', value: JSON.stringify(normalizedSales) });
                    localStorage.setItem('car_sales_data', JSON.stringify(normalizedSales));
                }
            } else if (salesRes.error) {
                console.error("Sales Sync Failed:", salesRes.error);
                setSyncError(`Sales Sync Failed: ${salesRes.error} `);
            }
            if (salesRes.success && salesRes.error) {
                console.warn("Sales Sync Partial Failure:", salesRes.error);
                setSyncError(`Sales Sync Warning: ${salesRes.error} `);
            }

            // Sync Transactions
            const { value: txJson } = await Preferences.get({ key: 'bank_transactions' });
            let localTxs = [];
            try { localTxs = txJson ? JSON.parse(txJson) : []; } catch (e) { }

            const txRes = await syncTransactionsWithSupabase(client, localTxs, profile.trim());
            if (txRes.success && txRes.data) {
                console.log("TX Sync Success:", txRes.data.length);
                setTransactions(txRes.data);
                await Preferences.set({ key: 'bank_transactions', value: JSON.stringify(txRes.data) });
            } else if (txRes.error) {
                console.error("TX Sync Failed:", txRes.error);
                setSyncError(prev => prev ? `${prev} | TX Sync Failed: ${txRes.error} ` : `TX Sync Failed: ${txRes.error} `);
            }

        } catch (e: any) {
            console.error("Auto Sync Exception", e);
            syncErrorMessage = e.message || 'Sync Exception';
            setSyncError(`Sync Exception: ${e.message} `);
        }
        finally { setIsSyncing(false); }
        if (syncErrorMessage) {
            return { success: false, error: syncErrorMessage };
        }
        return { success: true };
    };

    const handleAddSale = async (sale: CarSale): Promise<{ success: boolean; error?: string }> => {
        if (!sale.id) {
            console.error("Attempted to save sale without ID");
            return { success: false, error: 'Missing sale ID.' };
        }
        setIsSyncing(true);
        dirtyIds.current.add(sale.id);

        try {
            const currentSales = salesRef.current;
            const index = currentSales.findIndex(s => s.id === sale.id);
            let newSales;

            if (index >= 0) {
                // UPDATE
                const currentSoldBy = currentSales[index].soldBy;
                newSales = [...currentSales];
                newSales[index] = { ...sale, soldBy: resolveSoldBy(sale, currentSoldBy) };
            } else {
                // CREATE
                newSales = [...currentSales, { ...sale, soldBy: resolveSoldBy(sale, userProfile || 'Unknown') }];
            }

            const saveResult = await updateSalesAndSave(newSales);
            if (!saveResult.success) {
                return { success: false, error: saveResult.error || 'Sync failed. Data saved locally.' };
            }
            const nextView = formReturnView === 'landing' ? 'dashboard' : formReturnView;
            closeSaleForm(nextView);
            return { success: true };
        } catch (e) {
            console.error("Save Error", e);
            return { success: false, error: 'Error saving sale. Data is saved locally but might not be synced.' };
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';
        const loadSidebarPreference = async () => {
            const { value } = await Preferences.get({ key: SIDEBAR_COLLAPSED_KEY });
            if (value !== null && value !== undefined) {
                setIsSidebarCollapsed(value === 'true');
                return;
            }
            const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
            if (stored !== null) {
                setIsSidebarCollapsed(stored === 'true');
            }
        };
        loadSidebarPreference();
    }, []);

    useEffect(() => {
        const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';
        Preferences.set({ key: SIDEBAR_COLLAPSED_KEY, value: String(isSidebarCollapsed) });
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    const saveSettings = async () => {
        await Preferences.set({ key: 'openai_api_key', value: apiKey.trim() });
        await Preferences.set({ key: 'supabase_url', value: supabaseUrl.trim() });
        await Preferences.set({ key: 'supabase_key', value: supabaseKey.trim() });
        await persistUserProfile((userProfile || '').trim());
        alert('Settings Saved!');
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this sale?')) { updateSalesAndSave(sales.filter(s => s.id !== id)); }
    };

    const handleDeleteAll = async () => {
        if (confirm('DANGER: Are you sure you want to delete ALL sales data? This cannot be undone.')) {
            if (confirm('Please confirm again: DELETE ALL DATA from local AND database?')) {
                // Delete from Supabase immediately
                if (supabaseUrl && supabaseKey) {
                    try {
                        const client = createSupabaseClient(supabaseUrl, supabaseKey);
                        // Delete all records
                        const { data: allSales } = await client.from('sales').select('id');
                        if (allSales && allSales.length > 0) {
                            for (const sale of allSales) {
                                await client.from('sales').delete().eq('id', sale.id);
                            }
                            console.log("Deleted all from Supabase:", allSales.length, "records");
                        }
                    } catch (e) {
                        console.error("Supabase delete all error:", e);
                    }
                }

                // Delete locally
                updateSalesAndSave([]);
                try {
                    await Preferences.remove({ key: 'car_sales_data' });
                    localStorage.removeItem('car_sales_data');
                    alert('All data has been deleted from local and database.');
                } catch (e) { console.error('Error clearing data', e); }
            }
        }
    };

    const openInvoice = (sale: CarSale, e: React.MouseEvent, withDogane = false, showBankOnly = false) => {
        e.stopPropagation();
        setDocumentPreview({ sale, type: 'invoice', withDogane, showBankOnly });
    };

    const handleFullBackup = async () => {
        const backupData = {
            version: 1,
            timestamp: new Date().toISOString(),
            type: 'full_backup',
            sales,
            transactions,
            settings: {
                apiKey,
                supabaseUrl,
                supabaseKey,
                userProfile
            }
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rg_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = async () => {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json, .xlsx';
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    setImportStatus('Reading file...');
                    await new Promise(r => setTimeout(r, 100));

                    if (file.name.endsWith('.json')) {
                        const text = await file.text();
                        try {
                            const data = JSON.parse(text);

                            // Check for Full Backup Structure
                            if (data.type === 'full_backup' && data.sales) {
                                if (confirm('Restoring Full Backup! This will OVERWRITE current data. Continue?')) {
                                    // 1. Restore Operations
                                    await updateSalesAndSave(data.sales || []);
                                    await saveTransactions(data.transactions || []);

                                    // 2. Restore Settings
                                    if (data.settings) {
                                        if (data.settings.apiKey) { setApiKey(data.settings.apiKey); await Preferences.set({ key: 'openai_api_key', value: data.settings.apiKey }); }
                                        if (data.settings.supabaseUrl) { setSupabaseUrl(data.settings.supabaseUrl); await Preferences.set({ key: 'supabase_url', value: data.settings.supabaseUrl }); }
                                        if (data.settings.supabaseKey) { setSupabaseKey(data.settings.supabaseKey); await Preferences.set({ key: 'supabase_key', value: data.settings.supabaseKey }); }
                                        if (data.settings.userProfile) {
                                            const normalizedProfile = normalizeProfileName(data.settings.userProfile);
                                            setUserProfile(normalizedProfile);
                                            await persistUserProfile(normalizedProfile);
                                        }
                                    }

                                    setImportStatus('Full Backup Restored Successfully!');
                                    setTimeout(() => window.location.reload(), 1500); // Reload to apply settings fresh
                                }
                                return;
                            }

                            // Fallback to legacy JSON array import
                            if (Array.isArray(data)) {
                                // Assume it's just sales list
                                if (confirm(`Import ${data.length} sales ? `)) {
                                    await updateSalesAndSave([...data, ...sales]); // Merge
                                    setImportStatus('Imported JSON successfully');
                                }
                            }
                        } catch (e) {
                            console.error(e);
                            setImportStatus('Invalid JSON File');
                        }
                        return;
                    }

                    if (file.name.endsWith('.xlsx')) {
                        try {
                            const XLSX = await import('xlsx');
                            const arrayBuffer = await file.arrayBuffer();
                            const workbook = XLSX.read(arrayBuffer);
                            const sheet = workbook.Sheets[workbook.SheetNames[0]];
                            const jsonData = XLSX.utils.sheet_to_json(sheet);
                            setImportStatus(`Found ${jsonData.length} rows.Analyzing structure...`);

                            // Helper for standard mapping
                            const mapStandardImport = (data: any[]) => {
                                const findVal = (row: any, keys: string[]) => {
                                    const rowKeys = Object.keys(row);
                                    for (const key of keys) {
                                        if (row[key] !== undefined) return row[key];
                                        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                                        const foundKey = rowKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanKey));
                                        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                                    }
                                    return undefined;
                                };
                                const parseNum = (val: any) => {
                                    if (typeof val === 'number') return val;
                                    if (typeof val === 'string') return parseFloat(val.replace(/[^0-9.-]/g, '')) || 0;
                                    return 0;
                                };
                                const parseDate = (val: any) => {
                                    if (!val) return undefined;
                                    if (val instanceof Date) return val.toISOString().split('T')[0];
                                    if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString().split('T')[0];
                                    return String(val);
                                };

                                return data.map((row: any) => ({
                                    id: findVal(row, ['id', 'ID', 'uuid']) || crypto.randomUUID(),
                                    brand: findVal(row, ['brand', 'item', 'make', 'car model']) || 'Unknown',
                                    model: findVal(row, ['model', 'car model', 'type']) || 'Unknown',
                                    year: parseInt(findVal(row, ['year', 'yr']) || new Date().getFullYear()),
                                    km: parseNum(findVal(row, ['km', 'mileage', 'odometer', 'kilometers'])),
                                    vin: findVal(row, ['vin', 'vin number', 'chassis']) || 'N/A',
                                    costToBuy: parseNum(findVal(row, ['costToBuy', 'cost', 'buyPrice', 'purchasePrice'])),
                                    soldPrice: parseNum(findVal(row, ['soldPrice', 'sold', 'salePrice'])),
                                    amountPaidCash: parseNum(findVal(row, ['amountPaidCash', 'cash', 'paid-cash'])),
                                    amountPaidBank: parseNum(findVal(row, ['amountPaidBank', 'bank', 'paid-check', 'paid check'])),
                                    deposit: parseNum(findVal(row, ['deposit', 'downPayment'])),
                                    servicesCost: parseNum(findVal(row, ['services', 'serviceCost'])),
                                    tax: parseNum(findVal(row, ['tax', 'taxes', 'vat', 'faturat'])),
                                    color: findVal(row, ['color', 'paint']),
                                    buyerName: findVal(row, ['buyerName', 'buyer name', 'client']),
                                    sellerName: findVal(row, ['sellerName', 'seller name', 'seller']),
                                    shippingName: findVal(row, ['shippingName', 'ship name', 'shipper']),
                                    shippingDate: parseDate(findVal(row, ['shippingDate', 'ship date', 'date'])),
                                    plateNumber: findVal(row, ['plateNumber', 'plate', 'registration']),
                                    status: findVal(row, ['status', 'state']) || 'In Progress',
                                    paymentMethod: findVal(row, ['paymentMethod', 'method']),
                                    paidDateToKorea: parseDate(findVal(row, ['paidDateToKorea', 'paidKorea', 'date to korea'])),
                                    paidDateFromClient: parseDate(findVal(row, ['paidDateFromClient', 'paidClient', 'date from client', 'paid date'])),
                                    invoiceId: findVal(row, ['invoiceId', 'invoice']),
                                    createdAt: new Date().toISOString()
                                })) as CarSale[];
                            };

                            let importedSales = mapStandardImport(jsonData);
                            if (apiKey && confirm('Use OpenAI for enhanced import?')) {
                                try {
                                    setImportStatus('AI Analysis...');
                                    importedSales = await processImportedData(apiKey, jsonData, setImportStatus);
                                } catch (e) { importedSales = mapStandardImport(jsonData); }
                            }
                            updateSalesAndSave([...sales, ...importedSales]);
                            setImportStatus('');

                        } catch (e) { alert('Invalid JSON: ' + e); setImportStatus(''); }
                    }
                }
            };
            input.click();
        } catch (e) { console.error(e); }
    };

    const deferredSearchTerm = useDeferredValue(searchTerm);

    const filteredSales = React.useMemo(() => sales.filter(s => {
        // Filter out system config rows
        if (s.id === 'config_profile_avatars') return false;

        // Restrict visibility for non-admin users to their own sales
        if (!isAdmin) {
            const normalizedUser = normalizeProfileName(userProfile);
            const normalizedSoldBy = normalizeProfileName(s.soldBy);
            const normalizedSellerName = normalizeProfileName(s.sellerName);
            const isSold = (s.soldPrice || 0) > 0 || s.status === 'Completed';
            const canAccessOwnRecord = normalizedSoldBy === normalizedUser || normalizedSellerName === normalizedUser;

            // Never hide sold records; also keep legacy seller-owned rows visible.
            if (!canAccessOwnRecord && !isSold) return false;
        }


        if (activeCategory === 'SALES') {
            if (['Shipped', 'Inspection', 'Autosallon'].includes(s.status)) return false;
        } else {
            if (activeCategory === 'SHIPPED' && s.status !== 'Shipped') return false;
            if (activeCategory === 'INSPECTIONS' && s.status !== 'Inspection') return false;
            if (activeCategory === 'AUTOSALLON' && s.status !== 'Autosallon') return false;
        }

        const term = deferredSearchTerm.toLowerCase().trim();
        if (!term) return true;
        return JSON.stringify(s).toLowerCase().includes(term);
    }).sort((a, b) => {
        // Apply sorting
        let aVal: any = '';
        let bVal: any = '';

        if (sortBy === 'koreaBalance') {
            aVal = (a.costToBuy || 0) - (a.amountPaidToKorea || 0);
            bVal = (b.costToBuy || 0) - (b.amountPaidToKorea || 0);
        } else if (sortBy === 'dueBalance') {
            aVal = calculateBalance(a);
            bVal = calculateBalance(b);
        } else if (sortBy === 'nameAlphabetic') {
            aVal = ((a.brand || '') + ' ' + (a.model || '')).trim();
            bVal = ((b.brand || '') + ' ' + (b.model || '')).trim();
        } else {
            aVal = a[sortBy as keyof CarSale];
            bVal = b[sortBy as keyof CarSale];
        }

        // Handle undefined/null (treat as 0 for numbers, empty for strings)
        if (aVal === undefined || aVal === null) aVal = typeof aVal === 'number' ? 0 : '';
        if (bVal === undefined || bVal === null) bVal = typeof bVal === 'number' ? 0 : '';

        // Handle string sorting
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        // Handle number sorting
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return 0;
    }), [sales, userProfile, activeCategory, deferredSearchTerm, sortBy, sortDir]);
    const soldInvoiceSales = React.useMemo(
        () => filteredSales.filter(sale => (sale.soldPrice || 0) > 0 || sale.status === 'Completed'),
        [filteredSales]
    );

    const groupedInvoiceSales = React.useMemo(() => {
        const groups: Record<string, CarSale[]> = {};
        soldInvoiceSales.forEach((sale) => {
            const groupKey = sale.group?.trim() || 'Ungrouped';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(sale);
        });
        return groups;
    }, [soldInvoiceSales]);


    const selectedInvoices = React.useMemo(
        () => soldInvoiceSales.filter(sale => selectedIds.has(sale.id)),
        [soldInvoiceSales, selectedIds]
    );

    const selectedDownloadableInvoices = React.useMemo(
        () => selectedInvoices.filter(sale => (sale.amountPaidBank || 0) > 0),
        [selectedInvoices]
    );

    const validInvoiceSales = React.useMemo(
        () => soldInvoiceSales.filter(sale => (sale.amountPaidBank || 0) > 0),
        [soldInvoiceSales]
    );

    // Toggle sort column
    const toggleSort = (column: string) => {
        if (sortBy === column) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortDir(column === 'year' || column === 'createdAt' ? 'desc' : 'asc'); // Newest first for year/date
        }
    };

    const totalCost = filteredSales.reduce((acc, s) => acc + (s.costToBuy || 0), 0);
    const totalSold = filteredSales.reduce((acc, s) => acc + (s.soldPrice || 0), 0);
    const totalPaid = filteredSales.reduce((acc, s) => acc + ((s.amountPaidCash || 0) + (s.amountPaidBank || 0) + (s.deposit || 0)), 0);
    const totalBankFee = filteredSales.reduce((acc, s) => acc + getBankFee(s.soldPrice || 0), 0);
    const totalServices = filteredSales.reduce((acc, s) => acc + (s.servicesCost ?? 30.51), 0);
    const totalProfit = filteredSales.reduce((acc, s) => acc + calculateProfit(s), 0);
    const groupingEnabled = activeCategory === 'SALES' || activeCategory === 'SHIPPED' || activeCategory === 'AUTOSALLON';

    const groupedSales = React.useMemo(() => {
        const groups: Record<string, CarSale[]> = {};
        filteredSales.forEach(s => {
            const groupKey = s.group?.trim() || 'Ungrouped';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(s);
        });
        return groups;
    }, [filteredSales]);

    useEffect(() => {
        if (sales.length === 0) return;
        const groupNames = new Set(sales.map(s => s.group).filter(Boolean) as string[]);
        if (groupNames.size === 0) return;
        const missing = Array.from(groupNames).filter(name => !groupMeta.some(g => g.name === name));
        if (missing.length === 0) return;
        const nextMeta = [...groupMeta];
        missing.forEach(name => {
            nextMeta.push({ name, order: nextMeta.length, archived: false });
        });
        persistGroupMeta(nextMeta);
    }, [sales, groupMeta]);

    const orderedGroupMeta = useMemo(() => {
        return [...groupMeta].sort((a, b) => a.order - b.order);
    }, [groupMeta]);

    const activeGroups = useMemo(() => orderedGroupMeta.filter(g => !g.archived), [orderedGroupMeta]);
    const archivedGroups = useMemo(() => orderedGroupMeta.filter(g => g.archived), [orderedGroupMeta]);


    const invoiceGroupOrder = React.useMemo(
        () => [...activeGroups.map(g => g.name), ...(groupedInvoiceSales.Ungrouped?.length ? ['Ungrouped'] : [])],
        [activeGroups, groupedInvoiceSales]
    );

    useEffect(() => {
        if (hasInitializedGroups.current) return;
        const initialGroups = activeGroups.map(g => g.name);
        if (groupedSales.Ungrouped?.length) {
            initialGroups.push('Ungrouped');
        }
        if (initialGroups.length > 0) {
            setExpandedGroups(initialGroups);
            hasInitializedGroups.current = true;
        }
    }, [activeGroups, groupedSales.Ungrouped?.length]);



    if (isLoading) {
        return (
            <div className="h-screen bg-gradient-to-br from-white to-slate-100 flex flex-col items-center justify-center gap-4">
                <div className="w-14 h-14 border-4 border-slate-800 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 animate-pulse font-medium">Loading...</p>
            </div>
        );
    }

    if (!userProfile) {
        return <ProfileSelector
            profiles={profileOptions.map(p => ({ name: p.label, archived: false }))}
            onSelect={(p, remember) => {
                const normalizedProfile = normalizeProfileName(p);
                if (!normalizedProfile) return;
                setUserProfile(normalizedProfile);
                setView('landing');
                setRememberProfile(remember);
                persistUserProfile(normalizedProfile, remember);
            }}
            onAdd={(name, _email, remember) => {
                const normalizedName = normalizeProfileName(name);
                if (!normalizedName) return;
                const updated = normalizeProfiles([...availableProfiles, normalizedName]);
                setAvailableProfiles(updated);
                Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
                setUserProfile(normalizedName);
                setRememberProfile(remember);
                persistUserProfile(normalizedName, remember);
                syncProfilesToCloud(updated);
            }}
            onDelete={handleDeleteProfile}
            onEdit={handleEditProfile}
            onRestore={() => { }}
            avatars={profileAvatars}
            onEditAvatar={handleEditAvatar}
            rememberDefault={rememberProfile}
        />;
    }

    if (view === 'landing') {
        return (
            <div className="h-screen bg-gradient-to-br from-white via-white to-slate-100 flex flex-col items-center justify-center gap-8 relative overflow-hidden font-sans">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_rgba(15,23,42,0.08),_transparent_50%)]" />
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-slate-200/40 to-transparent rounded-full blur-3xl" />

                <div className="z-10 text-center mb-8">
                    <h1 className="text-3xl font-bold mb-4 mt-8 tracking-tight bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Welcome, {userProfile}</h1>
                    <p className="text-slate-500 text-lg">Select an operation to proceed</p>
                </div>

                <div className="z-10 flex flex-col md:flex-row gap-6 w-full max-w-4xl px-8">
                    <button
                        id="btn-add-sale"
                        onClick={() => openSaleForm(null, 'landing')}
                        className="flex-1 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/10 p-12 rounded-3xl transition-all group flex flex-col items-center gap-6 shadow-lg"
                    >
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-white to-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 group-hover:scale-110 group-hover:from-slate-900 group-hover:to-black group-hover:text-white group-hover:border-slate-900 transition-all duration-150 shadow-inner">
                            <Plus className="w-12 h-12" />
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-slate-800 mb-2">Add New Sale</div>
                            <div className="text-slate-500">Record a new vehicle sale</div>
                        </div>
                    </button>

                    <button
                        id="btn-view-sales"
                        onClick={() => { setActiveCategory('SALES'); setView('dashboard'); }}
                        className="flex-1 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/10 p-12 rounded-3xl transition-all group flex flex-col items-center gap-6 shadow-lg"
                    >
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-white to-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 group-hover:scale-110 group-hover:from-slate-900 group-hover:to-black group-hover:text-white group-hover:border-slate-900 transition-all duration-150 shadow-inner">
                            <Clipboard className="w-12 h-12" />
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-slate-800 mb-2">View Sales</div>
                            <div className="text-slate-500">Access dashboard & history</div>
                        </div>
                    </button>
                </div>

                <button onClick={() => { setUserProfile(''); setView('profile_select'); }} className="z-10 mt-12 flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors bg-white/80 backdrop-blur-sm border border-slate-200 px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm hover:shadow-md">
                    <LogOut className="w-4 h-4" /> Switch Profile
                </button>
            </div>
        );
    }



    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-slate-900 text-slate-400">
            <div className="p-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-slate-200 p-[2px] shadow-lg">
                    <img src="/logo_new.jpg" alt="Logo" className="w-full h-full rounded-lg object-cover" />
                </div>
                <span className="text-xl font-bold text-white tracking-tight">KORAUTO</span>
            </div>

            <div className="px-4 pb-2">
                <div className="relative">
                    <button
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-900 font-bold shadow-inner group-hover:scale-105 transition-transform">
                            {userProfile ? userProfile[0].toUpperCase() : 'U'}
                        </div>
                        <div className="flex-1 text-left overflow-hidden">
                            <div className="text-sm font-bold text-white truncate">{userProfile}</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Switch Profile</div>
                        </div>
                        <ChevronUp className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </button>

                    {showProfileMenu && (
                        <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl p-2 shadow-2xl z-[70] animate-in fade-in slide-in-from-top-2">
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide px-3 py-2">Switch Profile</div>
                            <div className="max-h-60 overflow-y-auto scroll-container space-y-1">
                                {availableProfiles.map(p => (
                                    <button key={p} onClick={() => {
                                        if (p === ADMIN_PROFILE && userProfile !== p) {
                                            setPendingProfile(p);
                                            setPasswordInput('');
                                            setIsPasswordVisible(false);
                                            setShowPasswordModal(true);
                                            return;
                                        }
                                        setShowProfileMenu(false);
                                        startTransition(() => { setUserProfile(p); });
                                        persistUserProfile(p);
                                        setTimeout(() => performAutoSync(supabaseUrl, supabaseKey, p), 100);
                                    }}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${userProfile === p ? 'bg-black text-white font-medium' : 'text-slate-700 hover:bg-slate-50'}`}>
                                        <span>{p}</span>
                                        {userProfile === p && <CheckSquare className="w-4 h-4" />}
                                    </button>
                                ))}
                            </div>
                            <div className="h-px bg-slate-100 my-2" />
                            <button onClick={quickAddProfile} className="w-full text-left px-3 py-2.5 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none" disabled={!isAdmin}>
                                <Plus className="w-4 h-4" /> Add Profile
                            </button>
                            <div className="h-px bg-slate-100 my-2" />
                            <button onClick={handleLogout} className="w-full text-left px-3 py-2.5 text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors">
                                <LogOut className="w-4 h-4" /> Log Out
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto scroll-container px-4 space-y-1 mt-4 pb-4">
                {navItems.map((item) => {
                    if (item.adminOnly && !isAdmin) return null;
                    const isActive = currentNavId === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                setView(item.view);
                                if (item.category) setActiveCategory(item.category as any);
                                setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${isActive
                                ? 'bg-white text-slate-900 shadow-lg shadow-black/20'
                                : 'hover:bg-slate-800 hover:text-white'
                                }`}
                        >
                            <item.icon className={`w-5 h-5 ${isActive ? 'text-slate-900' : 'text-slate-500'}`} />
                            {item.label}
                        </button>
                    );
                })}
            </nav>
        </div>
    );

    return (
        <div className={`flex min-h-[100dvh] ${forceMobileLayout ? '' : 'md:h-screen'} w-full bg-slate-50 relative overflow-x-hidden font-sans text-slate-900`}>
            {importStatus && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center">
                    <div className="bg-white border border-slate-200 p-8 rounded-2xl flex flex-col items-center gap-4 shadow-2xl">
                        <div className="w-12 h-12 border-4 border-slate-700 border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-700 font-medium">{importStatus}</p>
                    </div>
                </div>
            )}

            {/* Global Sync Error Toast */}
            {syncError && (
                <div className="fixed top-20 right-4 z-[90] bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl shadow-lg max-w-md">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <strong className="text-red-700 text-sm font-semibold">Sync Issues Detected</strong>
                        </div>
                        <button onClick={() => setSyncError('')} className="p-1 hover:bg-red-100 rounded-lg transition-colors"><X className="w-4 h-4 text-red-500" /></button>
                    </div>
                    <p className="text-xs font-mono text-red-600 break-words leading-relaxed">{syncError}</p>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className={`${forceMobileLayout ? 'hidden' : 'hidden md:flex'} flex-col bg-slate-900 text-white shadow-xl z-20 shrink-0 transition-[width,opacity] duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-64 opacity-100'}`}>
                <SidebarContent />
            </aside>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] ${forceMobileLayout ? '' : 'md:hidden'}`}
                        />
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className={`fixed inset-y-0 left-0 w-[280px] bg-slate-900 z-[70] ${forceMobileLayout ? '' : 'md:hidden'} shadow-2xl`}
                        >
                            <SidebarContent />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <div className="flex-1 flex flex-col min-w-0 relative transition-[width] duration-300 ease-in-out">
                <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 sticky top-0 z-40">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsMobileMenuOpen(true)}
                                className={`p-2 -ml-2 rounded-xl hover:bg-slate-100 ${forceMobileLayout ? '' : 'md:hidden'} text-slate-600`}
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                            <button
                                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                                className={`p-2 -ml-2 rounded-xl hover:bg-slate-100 ${forceMobileLayout ? 'hidden' : 'hidden md:block'} text-slate-600 transition-colors`}
                                title={isSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                            <h2 className="text-lg font-bold text-slate-900 hidden sm:flex items-center gap-2">
                                {view === 'settings' ? 'Settings' : view === 'invoices' ? 'Invoices' : activeCategory}
                                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {filteredSales.length} {filteredSales.length === 1 ? 'car' : 'cars'}
                                </span>
                            </h2>
                        </div>

                        <div className={`flex-1 max-w-xl ${forceMobileLayout ? 'hidden' : 'hidden md:block'}`}>
                            <div className="relative group">
                                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                                <input
                                    placeholder="Search sales..."
                                    className="w-full bg-slate-100 border-transparent rounded-2xl pl-11 pr-4 py-2 text-sm focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-900/5 transition-all outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => userProfile && performAutoSync(supabaseUrl, supabaseKey, userProfile)}
                                className={`p-2.5 rounded-xl hover:bg-slate-100 transition-all ${isSyncing ? 'animate-spin text-slate-900' : 'text-slate-400 hover:text-slate-900'}`}
                                title="Sync Now"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>

                            <div className="flex gap-2">
                                <div className="relative hidden sm:block">
                                    <ArrowUpDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <select
                                        value={sortBy}
                                        onChange={(e) => { setSortBy(e.target.value); if (e.target.value === 'nameAlphabetic') setSortDir('asc'); else setSortDir('desc'); }}
                                        className="bg-slate-100 border-transparent text-sm rounded-xl pl-9 pr-8 py-2.5 outline-none focus:bg-white focus:border-slate-300 transition-all appearance-none cursor-pointer text-slate-700 font-medium"
                                    >
                                        <option value="createdAt">Date Added</option>
                                        <option value="nameAlphabetic">Name (A-Z)</option>
                                        <option value="dueBalance">Balance (Client)</option>
                                        {isAdmin && <option value="koreaBalance">Balance (Korea)</option>}
                                        <option value="year">Year</option>
                                    </select>
                                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>

                                <button
                                    onClick={() => openSaleForm(null)}
                                    className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 active:scale-95"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden lg:inline">New Sale</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Search - Visible only on mobile */}
                    <div className={`mt-3 ${forceMobileLayout ? '' : 'md:hidden'}`}>
                        <div className="relative group">
                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                placeholder="Search sales..."
                                className="w-full bg-slate-100 border-transparent rounded-xl pl-11 pr-4 py-2.5 text-sm focus:bg-white focus:border-slate-300 transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                <main className={`flex-1 overflow-visible ${forceMobileLayout ? '' : 'md:overflow-hidden'} bg-slate-50/70 p-2.5 md:p-6 flex flex-col relative min-h-0`}>
                    {view !== 'sale_form' && (
                        <>

                            {view === 'dashboard' ? (<>
                                <div
                                    ref={scrollContainerRef}
                                    className={`border border-slate-100 rounded-2xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] relative ${forceMobileLayout ? 'hidden' : 'hidden md:block'} overflow-auto scroll-container flex-1`}
                                >
                                    <div className="grid text-[10px] xl:text-xs divide-y divide-slate-200 min-w-max"
                                        style={{
                                            gridTemplateColumns: gridTemplateColumns
                                        }}>
                                        <div className="bg-slate-100 font-semibold text-slate-700 grid grid-cols-subgrid sticky top-0 z-30 border-b border-slate-200 text-xs" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                            <div className="p-2 xl:p-2.5 flex items-center justify-center cursor-pointer hover:text-slate-900 border-r border-slate-200 resizable-header" onClick={() => toggleAll(filteredSales)}>
                                                {selectedIds.size > 0 && selectedIds.size === filteredSales.length ? <CheckSquare className="w-4 h-4 text-slate-800" /> : <Square className="w-4 h-4" />}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('selection', e)} />
                                            </div>
                                            <div className="p-2 xl:p-2.5 pl-3 cursor-pointer hover:text-slate-900 flex items-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('brand')}>
                                                Car Info {sortBy === 'brand' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('carInfo', e)} />
                                            </div>
                                            <div className="p-2 xl:p-2.5 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('year')}>
                                                Year {sortBy === 'year' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('year', e)} />
                                            </div>
                                            <div className="p-2 xl:p-2.5 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('km')}>
                                                KM {sortBy === 'km' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('km', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('plateNumber')}>
                                                Plate/VIN {sortBy === 'plateNumber' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('plateVin', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('buyerName')}>
                                                Buyer {sortBy === 'buyerName' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('buyer', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('sellerName')}>
                                                Seller {sortBy === 'sellerName' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('seller', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('shippingName')}>
                                                Shipping {sortBy === 'shippingName' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('shipping', e)} />
                                            </div>
                                            {isAdmin && (
                                                <div className="p-2 xl:p-3 text-right cursor-pointer hover:text-slate-900 flex items-center justify-end gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('costToBuy')}>
                                                    Cost {sortBy === 'costToBuy' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                    <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('cost', e)} />
                                                </div>
                                            )}
                                            <div className="p-2 xl:p-3 text-right cursor-pointer hover:text-slate-900 flex items-center justify-end gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('soldPrice')}>
                                                Sold {sortBy === 'soldPrice' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('sold', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 text-right border-r border-slate-200 resizable-header">
                                                Paid
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('paid', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 text-right border-r border-slate-200 resizable-header">
                                                Bank Fee
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('bankFee', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 text-right border-r border-slate-200 resizable-header">
                                                Tax
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('tax', e)} />
                                            </div>
                                            {isAdmin && <div className="p-2 xl:p-3 text-right text-slate-900 font-bold border-r border-slate-200 resizable-header">
                                                Profit
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('profit', e)} />
                                            </div>}
                                            <div className="p-2 xl:p-3 text-right border-r border-slate-200 resizable-header">
                                                Balance
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('balance', e)} />
                                            </div>
                                            {isAdmin && <div className="p-2 xl:p-3 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('koreaBalance')}>
                                                Korea {sortBy === 'koreaBalance' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('korea', e)} />
                                            </div>}
                                            <div className="p-2 xl:p-3 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('status')}>
                                                Status {sortBy === 'status' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('status', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1 border-r border-slate-200 resizable-header" onClick={() => toggleSort('soldBy')}>
                                                Sold By {sortBy === 'soldBy' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                                <div className="resize-handle" onMouseDown={(e: React.MouseEvent) => handleMouseDown('soldBy', e)} />
                                            </div>
                                            <div className="p-2 xl:p-3"></div>
                                        </div>
                                        {/* Render Rows */}
                                        {groupingEnabled ? (
                                            <Reorder.Group
                                                axis="y"
                                                values={activeGroups.map(g => g.name)}
                                                onReorder={(newOrder) => {
                                                    const updated = newOrder.map((name, index) => {
                                                        const match = groupMeta.find(g => g.name === name);
                                                        return match ? { ...match, order: index } : { name, order: index, archived: false };
                                                    });
                                                    const archived = groupMeta.filter(g => g.archived);
                                                    persistGroupMeta([...updated, ...archived.map((g, idx) => ({ ...g, order: updated.length + idx }))]);
                                                }}
                                                className="grid grid-cols-subgrid"
                                                style={{ gridColumn: isAdmin ? 'span 19' : 'span 16', display: 'grid' }}
                                            >
                                                {activeGroups.map(group => {
                                                    const groupSales = groupedSales[group.name] || [];
                                                    if (groupSales.length === 0) return null;
                                                    const isMovingGroup = groupMoveInFlight === group.name;
                                                    return (
                                                        <Reorder.Item key={group.name} value={group.name} className="contents">
                                                            <div className="bg-slate-50/80 border-y border-slate-200 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                                                <div className="col-span-full px-3 py-2 flex items-center justify-between gap-3">
                                                                    <button
                                                                        onClick={() => toggleGroup(group.name)}
                                                                        className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                                                                    >
                                                                        {expandedGroups.includes(group.name) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                        <span>{group.name}</span>
                                                                        <span className="text-xs text-slate-400 font-medium">({groupSales.length})</span>
                                                                    </button>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => moveGroup(group.name, 'up')}
                                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                                                            title="Move group up"
                                                                        >
                                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => moveGroup(group.name, 'down')}
                                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                                                            title="Move group down"
                                                                        >
                                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <div className="relative">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (!isMovingGroup) {
                                                                                        setActiveGroupMoveMenu(prev => prev === group.name ? null : group.name);
                                                                                    }
                                                                                }}
                                                                                className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 ${isMovingGroup ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                                title="Move group to tab"
                                                                                disabled={isMovingGroup}
                                                                            >
                                                                                {isMovingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                                                                            </button>
                                                                            {activeGroupMoveMenu === group.name && (
                                                                                <div className="absolute right-0 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            handleMoveGroupStatus(group.name, 'In Progress');
                                                                                            setActiveGroupMoveMenu(null);
                                                                                        }}
                                                                                        className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                        disabled={isMovingGroup}
                                                                                    >
                                                                                        Sales
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            handleMoveGroupStatus(group.name, 'Shipped');
                                                                                            setActiveGroupMoveMenu(null);
                                                                                        }}
                                                                                        className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                        disabled={isMovingGroup}
                                                                                    >
                                                                                        Shipped
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            handleMoveGroupStatus(group.name, 'Inspection');
                                                                                            setActiveGroupMoveMenu(null);
                                                                                        }}
                                                                                        className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                        disabled={isMovingGroup}
                                                                                    >
                                                                                        Inspections
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            handleMoveGroupStatus(group.name, 'Autosallon');
                                                                                            setActiveGroupMoveMenu(null);
                                                                                        }}
                                                                                        className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                        disabled={isMovingGroup}
                                                                                    >
                                                                                        Autosallon
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleRenameGroup(group.name)}
                                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                                            title="Rename group"
                                                                        >
                                                                            <Edit className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleArchiveGroup(group.name, true)}
                                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                                            title="Archive group"
                                                                        >
                                                                            <Archive className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {expandedGroups.includes(group.name) && (
                                                                <Reorder.Group
                                                                    axis="y"
                                                                    values={groupSales}
                                                                    onReorder={(newOrder) => {
                                                                        setSales(prev => {
                                                                            const next = [...prev];
                                                                            newOrder.forEach((newItem, newIndex) => {
                                                                                const foundIndex = next.findIndex(x => x.id === newItem.id);
                                                                                if (foundIndex !== -1) next[foundIndex] = { ...next[foundIndex], sortOrder: newIndex };
                                                                            });
                                                                            return next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                                                        });
                                                                    }}
                                                                    className="grid grid-cols-subgrid"
                                                                    style={{ gridColumn: isAdmin ? 'span 19' : 'span 16', display: 'grid' }}
                                                                >
                                                                    {groupSales.map(s => (
                                                                        <SortableSaleItem
                                                                            key={s.id}
                                                                            s={s}
                                                                            userProfile={userProfile}
                                                                            canViewPrices={canViewPrices}
                                                                            toggleSelection={toggleSelection}
                                                                            isSelected={selectedIds.has(s.id)}
                                                                            openInvoice={openInvoice}
                                                                            onInlineUpdate={handleInlineUpdate}
                                                                            onClick={() => {
                                                                                handleSaleInteraction(s);
                                                                            }}
                                                                            onDelete={handleDeleteSingle}
                                                                            onRemoveFromGroup={handleRemoveFromGroup}
                                                                        />
                                                                    ))}
                                                                </Reorder.Group>
                                                            )}
                                                        </Reorder.Item>
                                                    );
                                                })}
                                                {groupedSales.Ungrouped?.length > 0 && (
                                                    <div className="contents">
                                                        <div className="bg-slate-50/80 border-y border-slate-200 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                                            <div className="col-span-full px-3 py-2 flex items-center justify-between gap-3">
                                                                <button
                                                                    onClick={() => toggleGroup('Ungrouped')}
                                                                    className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                                                                >
                                                                    {expandedGroups.includes('Ungrouped') ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                    <span>Ungrouped</span>
                                                                    <span className="text-xs text-slate-400 font-medium">({groupedSales.Ungrouped.length})</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {expandedGroups.includes('Ungrouped') && (
                                                            <Reorder.Group
                                                                axis="y"
                                                                values={groupedSales.Ungrouped}
                                                                onReorder={(newOrder) => {
                                                                    setSales(prev => {
                                                                        const next = [...prev];
                                                                        newOrder.forEach((newItem, newIndex) => {
                                                                            const foundIndex = next.findIndex(x => x.id === newItem.id);
                                                                            if (foundIndex !== -1) next[foundIndex] = { ...next[foundIndex], sortOrder: newIndex };
                                                                        });
                                                                        return next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                                                    });
                                                                }}
                                                                className="grid grid-cols-subgrid"
                                                                style={{ gridColumn: isAdmin ? 'span 19' : 'span 16', display: 'grid' }}
                                                            >
                                                                {groupedSales.Ungrouped.map(s => (
                                                                    <SortableSaleItem
                                                                        key={s.id}
                                                                        s={s}
                                                                        userProfile={userProfile}
                                                                        canViewPrices={canViewPrices}
                                                                        toggleSelection={toggleSelection}
                                                                        isSelected={selectedIds.has(s.id)}
                                                                        openInvoice={openInvoice}
                                                                        onInlineUpdate={handleInlineUpdate}
                                                                        onClick={() => {
                                                                            handleSaleInteraction(s);
                                                                        }}
                                                                        onDelete={handleDeleteSingle}
                                                                        onRemoveFromGroup={handleRemoveFromGroup}
                                                                    />
                                                                ))}
                                                            </Reorder.Group>
                                                        )}
                                                    </div>
                                                )}
                                                {archivedGroups.length > 0 && (
                                                    <div className="contents">
                                                        <div className="bg-slate-100 border-y border-slate-200 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                                            <div className="col-span-full px-3 py-2 flex items-center justify-between gap-3">
                                                                <button
                                                                    onClick={() => setShowArchivedGroups(prev => !prev)}
                                                                    className="flex items-center gap-2 text-sm font-semibold text-slate-600"
                                                                >
                                                                    {showArchivedGroups ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                    <span>Archived Groups</span>
                                                                    <span className="text-xs text-slate-400 font-medium">({archivedGroups.length})</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {showArchivedGroups && archivedGroups.map(group => {
                                                            const groupSales = groupedSales[group.name] || [];
                                                            return (
                                                                <div key={group.name} className="contents">
                                                                    <div className="bg-slate-50/80 border-b border-slate-200 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                                                        <div className="col-span-full px-3 py-2 flex items-center justify-between gap-3">
                                                                            <button
                                                                                onClick={() => toggleGroup(group.name)}
                                                                                className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                                                                            >
                                                                                {expandedGroups.includes(group.name) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                                <span>{group.name}</span>
                                                                                <span className="text-xs text-slate-400 font-medium">({groupSales.length})</span>
                                                                            </button>
                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    onClick={() => handleArchiveGroup(group.name, false)}
                                                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                                                    title="Unarchive group"
                                                                                >
                                                                                    <Eye className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {expandedGroups.includes(group.name) && (
                                                                        <Reorder.Group
                                                                            axis="y"
                                                                            values={groupSales}
                                                                            onReorder={(newOrder) => {
                                                                                setSales(prev => {
                                                                                    const next = [...prev];
                                                                                    newOrder.forEach((newItem, newIndex) => {
                                                                                        const foundIndex = next.findIndex(x => x.id === newItem.id);
                                                                                        if (foundIndex !== -1) next[foundIndex] = { ...next[foundIndex], sortOrder: newIndex };
                                                                                    });
                                                                                    return next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                                                                });
                                                                            }}
                                                                            className="grid grid-cols-subgrid"
                                                                            style={{ gridColumn: isAdmin ? 'span 19' : 'span 16', display: 'grid' }}
                                                                        >
                                                                            {groupSales.map(s => (
                                                                                <SortableSaleItem
                                                                                    key={s.id}
                                                                                    s={s}
                                                                                    userProfile={userProfile}
                                                                                    canViewPrices={canViewPrices}
                                                                                    toggleSelection={toggleSelection}
                                                                                    isSelected={selectedIds.has(s.id)}
                                                                                    openInvoice={openInvoice}
                                                                                    onInlineUpdate={handleInlineUpdate}
                                                                                    onClick={() => {
                                                                                        handleSaleInteraction(s);
                                                                                    }}
                                                                                    onDelete={handleDeleteSingle}
                                                                                    onRemoveFromGroup={handleRemoveFromGroup}
                                                                                />
                                                                            ))}
                                                                        </Reorder.Group>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </Reorder.Group>
                                        ) : (
                                            <Reorder.Group
                                                axis="y"
                                                values={filteredSales}
                                                onReorder={(newOrder) => {
                                                    setSales(prev => {
                                                        const next = [...prev];
                                                        newOrder.forEach((newItem, newIndex) => {
                                                            const foundIndex = next.findIndex(x => x.id === newItem.id);
                                                            if (foundIndex !== -1) next[foundIndex] = { ...next[foundIndex], sortOrder: newIndex };
                                                        });
                                                        return next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                                    });
                                                }}
                                                className="grid grid-cols-subgrid"
                                                style={{ gridColumn: isAdmin ? 'span 19' : 'span 16', display: 'grid' }}
                                            >
                                                {filteredSales.map(s => (
                                                    <SortableSaleItem
                                                        key={s.id}
                                                        s={s}
                                                        userProfile={userProfile}
                                                        canViewPrices={canViewPrices}
                                                        toggleSelection={toggleSelection}
                                                        isSelected={selectedIds.has(s.id)}
                                                        openInvoice={openInvoice}
                                                        onInlineUpdate={handleInlineUpdate}
                                                        onClick={() => {
                                                            handleSaleInteraction(s);
                                                        }}
                                                        onDelete={handleDeleteSingle}
                                                    />
                                                ))}
                                            </Reorder.Group>
                                        )}

                                        {/* Footer Totals */}
                                        <div className="bg-slate-50 font-bold border-t border-slate-200 sticky bottom-0 z-30 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                            <div className="p-3 text-right col-span-8 text-slate-600">Totals</div>
                                            {isAdmin && <div className="p-3 text-right font-mono text-slate-700">€{totalCost.toLocaleString()}</div>}
                                            <div className="p-3 text-right font-mono text-emerald-600">€{totalSold.toLocaleString()}</div>
                                            <div className="p-3 text-right font-mono text-slate-500">€{totalPaid.toLocaleString()}</div>
                                            {isAdmin && <>
                                                <div className="p-3 text-right font-mono text-slate-400 text-xs">€{totalBankFee.toLocaleString()}</div>
                                                <div className="p-3 text-right font-mono text-slate-400 text-xs">€{totalServices.toLocaleString()}</div>
                                                <div className="p-3 text-right font-mono text-slate-900">€{totalProfit.toLocaleString()}</div>
                                            </>}
                                            <div className="p-3 col-span-3"></div>
                                        </div>
                                    </div>
                                </div>
                                {/* Mobile Card View */}
                                {/* Mobile Compact List View - Swipeable */}
                                <div className={`${forceMobileLayout ? '' : 'md:hidden'} flex flex-col flex-1 min-h-0 relative`}>
                                    <div className="flex flex-col flex-1 overflow-y-auto scroll-container pb-20 no-scrollbar">
                                        <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur border-b border-slate-200 px-2 py-1.5 mb-1">
                                            <div className="flex items-center justify-between text-[11px] text-slate-600">
                                                <span className="font-semibold text-slate-900">{activeCategory}</span>
                                                <span>{filteredSales.length} cars</span>
                                            </div>
                                        </div>
                                        {groupingEnabled ? (
                                            <>
                                                {[...activeGroups, ...(groupedSales.Ungrouped?.length ? [{ name: 'Ungrouped', order: 9999, archived: false }] : [])].map(group => {
                                                    const groupSales = groupedSales[group.name] || [];
                                                    if (groupSales.length === 0) return null;
                                                    const isMovingGroup = groupMoveInFlight === group.name;
                                                    return (
                                                        <div key={group.name} className="border-b border-slate-200">
                                                            <div className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-slate-700 bg-slate-50">
                                                                <button
                                                                    onClick={() => toggleGroup(group.name)}
                                                                    className="flex items-center gap-2 text-left"
                                                                >
                                                                    {expandedGroups.includes(group.name) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                    {group.name}
                                                                    <span className="text-xs text-slate-400 font-medium">({groupSales.length})</span>
                                                                </button>
                                                                <div className="relative">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!isMovingGroup) {
                                                                                setActiveGroupMoveMenu(prev => prev === group.name ? null : group.name);
                                                                            }
                                                                        }}
                                                                        className={`p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 ${isMovingGroup ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        title="Move group to tab"
                                                                        disabled={isMovingGroup}
                                                                    >
                                                                        {isMovingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                                                                    </button>
                                                                    {activeGroupMoveMenu === group.name && (
                                                                        <div className="absolute right-0 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'In Progress');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                disabled={isMovingGroup}
                                                                            >
                                                                                Sales
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'Shipped');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                disabled={isMovingGroup}
                                                                            >
                                                                                Shipped
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'Inspection');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                disabled={isMovingGroup}
                                                                            >
                                                                                Inspections
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'Autosallon');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className={`w-full px-3 py-2 text-left text-xs ${isMovingGroup ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                                                                                disabled={isMovingGroup}
                                                                            >
                                                                                Autosallon
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {expandedGroups.includes(group.name) && (
                                                                <div>
                                                                    {groupSales.map(sale => {
                                                                        const isSoldSale = sale.status === 'Completed' || (sale.soldPrice || 0) > 0;

                                                                        return (
                                                                        <motion.div
                                                                            key={sale.id}
                                                                            initial={{ opacity: 0 }}
                                                                            animate={{ opacity: 1 }}
                                                                            className="relative border-b border-slate-200"
                                                                        >
                                                                            {/* Background Actions (Swipe Left) */}
                                                                            {!isSoldSale && (
                                                                                <div className="absolute inset-0 flex items-center justify-end gap-2 px-3 bg-gradient-to-l from-red-700 via-red-600 to-amber-500 overflow-hidden">
                                                                                    {groupingEnabled && sale.group && sale.status !== 'Completed' && (
                                                                                        <div className="inline-flex items-center rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white">
                                                                                            Remove
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white">
                                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                                        Delete
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            {/* Foreground Card */}
                                                                            <motion.div
                                                                                layout
                                                                                drag={isSoldSale ? false : 'x'}
                                                                                dragDirectionLock
                                                                                dragConstraints={{ left: 0, right: 0 }}
                                                                                dragElastic={{ left: 0.8, right: 0 }}
                                                                                dragSnapToOrigin
                                                                                onDragEnd={(e, { offset }) => {
                                                                                    if (isSoldSale) return;

                                                                                    const canRemoveFromGroup = groupingEnabled && sale.group && sale.status !== 'Completed';
                                                                                    if (offset.x < -165) {
                                                                                        const shouldDelete = confirm('Delete this item?');
                                                                                        if (shouldDelete) {
                                                                                            handleDeleteSingle(sale.id);
                                                                                        }
                                                                                    } else if (offset.x < -90 && canRemoveFromGroup) {
                                                                                        handleRemoveFromGroup(sale.id);
                                                                                    }
                                                                                }}
                                                                                className="p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2 relative z-10 transition-colors"
                                                                                onPointerDown={(event) => handleMobileRowPointerDown(sale.id, event)}
                                                                                onPointerMove={(event) => handleMobileRowPointerMove(sale.id, event)}
                                                                                onPointerUp={() => handleMobileRowPointerEnd(sale.id)}
                                                                                onPointerCancel={() => handleMobileRowPointerEnd(sale.id)}
                                                                                onClick={() => {
                                                                                    if (shouldIgnoreMobileRowTap(sale.id)) return;
                                                                                    if (selectedIds.size > 0) {
                                                                                        toggleSelection(sale.id);
                                                                                    } else {
                                                                                        handleSaleInteraction(sale);
                                                                                    }
                                                                                }}
                                                                                onContextMenu={(e) => {
                                                                                    if (selectedIds.size > 0) {
                                                                                        e.preventDefault();
                                                                                        toggleSelection(sale.id);
                                                                                    }
                                                                                }}
                                                                                style={{
                                                                                    touchAction: 'pan-y',
                                                                                    backgroundColor: selectedIds.has(sale.id) ? '#f5f5f5' : '#ffffff'
                                                                                }}
                                                                            >
                                                                                {selectedIds.size > 0 && (
                                                                                    <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                                        {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                                    </div>
                                                                                )}

                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex justify-between items-start gap-2">
                                                                                        <div className="min-w-0">
                                                                                            <div className="font-semibold text-slate-900 text-[12px] sm:text-[13px] leading-tight truncate">{sale.brand} {sale.model}</div>
                                                                                            <div className="text-[9px] sm:text-[10px] text-slate-500 truncate">{sale.plateNumber || 'No plate'} • {sale.vin || 'No VIN'}</div>
                                                                                        </div>
                                                                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${sale.status === 'Completed' ? 'text-emerald-700' :
                                                                                            (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'bg-slate-100 text-slate-800' :
                                                                                                sale.status === 'Inspection' ? 'bg-amber-50 text-amber-700' :
                                                                                                    'bg-slate-100 text-slate-500'
                                                                                            }`}>{sale.status}</span>
                                                                                    </div>
                                                                                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] sm:text-[11px] text-slate-600">
                                                                                        <span><span className="text-slate-400">Year/Km:</span> <span className="font-medium text-slate-700">{sale.year} • {(sale.km || 0).toLocaleString()} km</span></span>
                                                                                        <span className="text-right"><span className="text-slate-400">Buyer:</span> <span className="font-medium text-slate-700">{sale.buyerName || 'N/A'}</span></span>
                                                                                        {(isAdmin || sale.soldBy === userProfile) ? (
                                                                                            <span><span className="text-slate-400">Sold:</span> <span className="font-semibold text-slate-900"> €{(sale.soldPrice || 0).toLocaleString()}</span></span>
                                                                                        ) : (
                                                                                            <span className="text-slate-400">Price hidden</span>
                                                                                        )}
                                                                                        {(isAdmin || sale.soldBy === userProfile) ? (
                                                                                            <span className={`text-right font-semibold ${sale.isPaid ? 'text-emerald-600' : calculateBalance(sale) > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                                                                                {sale.isPaid ? 'Paid' : `Due: €${calculateBalance(sale).toLocaleString()}`}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-right text-slate-400">-</span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="mt-0.5 flex items-center justify-between text-[9px] sm:text-[10px] text-slate-500">
                                                                                        <span>Sold by <span className="font-medium text-slate-700">{sale.soldBy}</span></span>
                                                                                        {isAdmin && (
                                                                                            <span className={`font-semibold ${(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                                                Korea {(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? `Due €${((sale.costToBuy || 0) - (sale.amountPaidToKorea || 0)).toLocaleString()}` : 'Paid'}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    {groupingEnabled && sale.group && sale.status === 'Completed' && (
                                                                                        <div className="mt-1 text-[9px] sm:text-[10px] text-slate-400">Sold cars stay locked in group.</div>
                                                                                    )}
                                                                                </div>
                                                                            </motion.div>
                                                                        </motion.div>
                                                                    );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {archivedGroups.length > 0 && (
                                                    <div className="border-b border-slate-200">
                                                        <button
                                                            onClick={() => setShowArchivedGroups(prev => !prev)}
                                                            className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-slate-600 bg-slate-100"
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                {showArchivedGroups ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                Archived Groups
                                                            </span>
                                                            <span className="text-xs text-slate-400 font-medium">{archivedGroups.length} groups</span>
                                                        </button>
                                                        {showArchivedGroups && archivedGroups.map(group => {
                                                            const groupSales = groupedSales[group.name] || [];
                                                            if (groupSales.length === 0) return null;
                                                            return (
                                                                <div key={group.name} className="border-b border-slate-200">
                                                                    <div className="px-4 py-2 flex items-center justify-between text-sm font-semibold text-slate-700 bg-slate-50">
                                                                        <button
                                                                            onClick={() => toggleGroup(group.name)}
                                                                            className="flex items-center gap-2"
                                                                        >
                                                                            {expandedGroups.includes(group.name) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                            {group.name}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleArchiveGroup(group.name, false)}
                                                                            className="text-xs text-slate-900 font-semibold"
                                                                        >
                                                                            Unarchive
                                                                        </button>
                                                                    </div>
                                                                    {expandedGroups.includes(group.name) && (
                                                                        <div>
                                                                            {groupSales.map(sale => {
                                                                                const isSoldSale = sale.status === 'Completed' || (sale.soldPrice || 0) > 0;

                                                                                return (
                                                                                <motion.div
                                                                                    key={sale.id}
                                                                                    initial={{ opacity: 0 }}
                                                                                    animate={{ opacity: 1 }}
                                                                                    className="relative border-b border-slate-200"
                                                                                >
                                                                                    {!isSoldSale && (
                                                                                        <div className="absolute inset-0 flex items-center justify-end gap-2 px-3 bg-gradient-to-l from-red-700 via-red-600 to-amber-500 overflow-hidden">
                                                                                            {groupingEnabled && sale.group && sale.status !== 'Completed' && (
                                                                                                <div className="inline-flex items-center rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white">
                                                                                                    Remove
                                                                                                </div>
                                                                                            )}
                                                                                            <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white">
                                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                                                Delete
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                    <motion.div
                                                                                        layout
                                                                                        drag={isSoldSale ? false : 'x'}
                                                                                        dragDirectionLock
                                                                                        dragConstraints={{ left: 0, right: 0 }}
                                                                                        dragElastic={{ left: 0.8, right: 0 }}
                                                                                        dragSnapToOrigin
                                                                                        onDragEnd={(e, { offset }) => {
                                                                                            if (isSoldSale) return;

                                                                                            const canRemoveFromGroup = groupingEnabled && sale.group && sale.status !== 'Completed';
                                                                                            if (offset.x < -165) {
                                                                                                const shouldDelete = confirm('Delete this item?');
                                                                                                if (shouldDelete) {
                                                                                                    handleDeleteSingle(sale.id);
                                                                                                }
                                                                                            } else if (offset.x < -90 && canRemoveFromGroup) {
                                                                                                handleRemoveFromGroup(sale.id);
                                                                                            }
                                                                                        }}
                                                                                        className="p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2 relative z-10 transition-colors"
                                                                                        onPointerDown={(event) => handleMobileRowPointerDown(sale.id, event)}
                                                                                        onPointerMove={(event) => handleMobileRowPointerMove(sale.id, event)}
                                                                                        onPointerUp={() => handleMobileRowPointerEnd(sale.id)}
                                                                                        onPointerCancel={() => handleMobileRowPointerEnd(sale.id)}
                                                                                        onClick={() => {
                                                                                            if (shouldIgnoreMobileRowTap(sale.id)) return;
                                                                                            if (selectedIds.size > 0) {
                                                                                                toggleSelection(sale.id);
                                                                                            } else {
                                                                                                handleSaleInteraction(sale);
                                                                                            }
                                                                                        }}
                                                                                        onContextMenu={(e) => {
                                                                                            if (selectedIds.size > 0) {
                                                                                                e.preventDefault();
                                                                                                toggleSelection(sale.id);
                                                                                            }
                                                                                        }}
                                                                                        style={{
                                                                                            touchAction: 'pan-y',
                                                                                            backgroundColor: selectedIds.has(sale.id) ? '#f5f5f5' : '#ffffff'
                                                                                        }}
                                                                                    >
                                                                                        {selectedIds.size > 0 && (
                                                                                            <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                                                {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <div className="flex justify-between items-start">
                                                                                                <div className="font-bold text-slate-800 text-[13px] truncate pr-2">{sale.brand} {sale.model}</div>
                                                                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${sale.status === 'Completed' ? 'text-emerald-700' :
                                                                                                    (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'bg-slate-100 text-slate-900' :
                                                                                                        sale.status === 'Inspection' ? 'bg-amber-50 text-amber-700' :
                                                                                                            'bg-slate-100 text-slate-500'
                                                                                                    }`}>{sale.status}</span>
                                                                                            </div>
                                                                                            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-0.5">
                                                                                                <span>{sale.year} • {(sale.km || 0).toLocaleString()} km</span>
                                                                                                {(isAdmin || sale.soldBy === userProfile) ? (
                                                                                                    <span className={`font-mono font-bold ${sale.isPaid ? 'text-emerald-600' : calculateBalance(sale) > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                                                                                        {sale.isPaid ? 'Paid by Client' : `Due: €${calculateBalance(sale).toLocaleString()}`}
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <span className="font-mono text-slate-400">-</span>
                                                                                                )}
                                                                                            </div>
                                                                                            {isAdmin && (
                                                                                                <div className="flex justify-end items-center text-[9px] mt-0.5 gap-1">
                                                                                                    <span className="text-slate-400">Korea:</span>
                                                                                                    <span className={`font-mono font-bold ${(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                                                        {(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? `Due €${((sale.costToBuy || 0) - (sale.amountPaidToKorea || 0)).toLocaleString()}` : 'Paid'}
                                                                                                    </span>
                                                                                                </div>
                                                                                            )}
                                                                                            {groupingEnabled && sale.group && sale.status === 'Completed' && (
                                                                                                <div className="mt-1 text-[9px] sm:text-[10px] text-slate-400">Sold cars stay locked in group.</div>
                                                                                            )}
                                                                                        </div>
                                                                                    </motion.div>
                                                                                </motion.div>
                                                                            );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {filteredSales.map(sale => {
                                                    const isSoldSale = sale.status === 'Completed' || (sale.soldPrice || 0) > 0;

                                                    return (
                                                    <motion.div
                                                        key={sale.id}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        className="relative border-b border-slate-200"
                                                    >
                                                        {!isSoldSale && (
                                                            <div className="absolute inset-0 flex items-center justify-end gap-2 px-3 bg-gradient-to-l from-red-700 via-red-600 to-amber-500 overflow-hidden">
                                                                {groupingEnabled && sale.group && sale.status !== 'Completed' && (
                                                                    <div className="inline-flex items-center rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white">
                                                                        Remove
                                                                    </div>
                                                                )}
                                                                <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                    Delete
                                                                </div>
                                                            </div>
                                                        )}
                                                        <motion.div
                                                            layout
                                                            drag={isSoldSale ? false : 'x'}
                                                            dragDirectionLock
                                                            dragConstraints={{ left: 0, right: 0 }}
                                                            dragElastic={{ left: 0.8, right: 0 }}
                                                            dragSnapToOrigin
                                                            onDragEnd={(e, { offset }) => {
                                                                if (isSoldSale) return;

                                                                const canRemoveFromGroup = groupingEnabled && sale.group && sale.status !== 'Completed';
                                                                if (offset.x < -165) {
                                                                    const shouldDelete = confirm('Delete this item?');
                                                                    if (shouldDelete) {
                                                                        handleDeleteSingle(sale.id);
                                                                    }
                                                                } else if (offset.x < -90 && canRemoveFromGroup) {
                                                                    handleRemoveFromGroup(sale.id);
                                                                }
                                                            }}
                                                            className="p-2.5 flex items-center gap-2.5 relative z-10 transition-colors"
                                                            onClick={() => {
                                                                if (selectedIds.size > 0) {
                                                                    toggleSelection(sale.id);
                                                                } else {
                                                                    handleSaleInteraction(sale);
                                                                }
                                                            }}
                                                            onContextMenu={(e) => {
                                                                if (selectedIds.size > 0) {
                                                                    e.preventDefault();
                                                                    toggleSelection(sale.id);
                                                                }
                                                            }}
                                                            style={{
                                                                touchAction: 'pan-y',
                                                                backgroundColor: selectedIds.has(sale.id) ? '#f5f5f5' : '#ffffff'
                                                            }}
                                                        >
                                                            {selectedIds.size > 0 && (
                                                                <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                    {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                </div>
                                                            )}

                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex justify-between items-start gap-2">
                                                                                        <div className="min-w-0">
                                                                                            <div className="font-semibold text-slate-900 text-[12px] sm:text-[13px] leading-tight truncate">{sale.brand} {sale.model}</div>
                                                                                            <div className="text-[9px] sm:text-[10px] text-slate-500 truncate">{sale.plateNumber || 'No plate'} • {sale.vin || 'No VIN'}</div>
                                                                                        </div>
                                                                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${sale.status === 'Completed' ? 'text-emerald-700' :
                                                                                            (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'bg-slate-100 text-slate-800' :
                                                                                                sale.status === 'Inspection' ? 'bg-amber-50 text-amber-700' :
                                                                                                    'bg-slate-100 text-slate-500'
                                                                                            }`}>{sale.status}</span>
                                                                                    </div>
                                                                                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] sm:text-[11px] text-slate-600">
                                                                                        <span><span className="text-slate-400">Year/Km:</span> <span className="font-medium text-slate-700">{sale.year} • {(sale.km || 0).toLocaleString()} km</span></span>
                                                                                        <span className="text-right"><span className="text-slate-400">Buyer:</span> <span className="font-medium text-slate-700">{sale.buyerName || 'N/A'}</span></span>
                                                                                        {(isAdmin || sale.soldBy === userProfile) ? (
                                                                                            <span><span className="text-slate-400">Sold:</span> <span className="font-semibold text-slate-900"> €{(sale.soldPrice || 0).toLocaleString()}</span></span>
                                                                                        ) : (
                                                                                            <span className="text-slate-400">Price hidden</span>
                                                                                        )}
                                                                                        {(isAdmin || sale.soldBy === userProfile) ? (
                                                                                            <span className={`text-right font-semibold ${sale.isPaid ? 'text-emerald-600' : calculateBalance(sale) > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                                                                                {sale.isPaid ? 'Paid' : `Due: €${calculateBalance(sale).toLocaleString()}`}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-right text-slate-400">-</span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="mt-0.5 flex items-center justify-between text-[9px] sm:text-[10px] text-slate-500">
                                                                                        <span>Sold by <span className="font-medium text-slate-700">{sale.soldBy}</span></span>
                                                                                        {isAdmin && (
                                                                                            <span className={`font-semibold ${(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                                                Korea {(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? `Due €${((sale.costToBuy || 0) - (sale.amountPaidToKorea || 0)).toLocaleString()}` : 'Paid'}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    {groupingEnabled && sale.group && sale.status === 'Completed' && (
                                                                                        <div className="mt-1 text-[9px] sm:text-[10px] text-slate-400">Sold cars stay locked in group.</div>
                                                                                    )}
                                                                                </div>
                                                        </motion.div>
                                                    </motion.div>
                                                );
                                                })}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </>) : view === 'settings' ? (
                                <div className="w-full max-w-xl mx-auto bg-white p-4 md:p-6 rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                                    <h2 className="text-xl font-bold mb-4 text-slate-900">Settings</h2>
                                    <div className="space-y-3 md:space-y-4">
                                        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="OpenAI API Key" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 md:p-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400" />

                                        <div className="space-y-2">
                                            <label className="text-sm text-slate-500">User Profile</label>
                                            <div className="flex gap-2">
                                                <select value={userProfile} onChange={e => {
                                                    setUserProfile(e.target.value);
                                                    persistUserProfile(e.target.value);
                                                }} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 md:p-3 text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400">
                                                    <option value="">Select Profile</option>
                                                    {availableProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <button onClick={() => handleDeleteProfile(userProfile)} disabled={!userProfile} className="p-2.5 md:p-3 bg-red-50 text-red-500 rounded-xl border border-red-200 disabled:opacity-50"><Trash2 className="w-5 h-5" /></button>
                                            </div>
                                            <div className="flex gap-2">
                                                <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="Add New Profile" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 md:p-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 disabled:opacity-60" disabled={!isAdmin} />
                                                <button onClick={handleAddProfile} className="bg-emerald-600 text-white font-bold px-4 rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-60" disabled={!isAdmin}><Plus className="w-5 h-5" /></button>
                                            </div>
                                            {!isAdmin && (
                                                <p className="text-xs text-slate-400">Only {ADMIN_PROFILE} can add users.</p>
                                            )}
                                        </div>

                                        <input value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="Supabase URL" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 md:p-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400" />
                                        <input type="password" value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)} placeholder="Supabase Key" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 md:p-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400" />

                                        <div className="h-px bg-slate-200 my-3 md:my-4" />
                                        <button onClick={saveSettings} className="w-full bg-black text-white font-bold py-2.5 md:py-3 rounded-xl">Save Settings</button>
                                        <div className="h-px bg-slate-200 my-3 md:my-4" />
                                        <button onClick={handleDeleteAll} className="w-full border border-red-200 text-red-600 py-2.5 md:py-3 rounded-xl hover:bg-red-50 transition-colors">Delete All Data</button>
                                    </div>
                                </div>
                            ) : view === 'invoices' ? (
                                <div className="flex-1 overflow-auto scroll-container p-3 md:p-5 bg-white rounded-2xl border border-slate-100 shadow-sm mx-4 my-2">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-3 py-3 md:px-4 md:py-3">
                                        <div>
                                            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Invoices</h2>
                                            <p className="text-xs md:text-sm text-slate-500 mt-0.5">All sold cars grouped like Sold tab. Download includes only rows with bank paid amount.</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleAll(validInvoiceSales)}
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs md:text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all"
                                            >
                                                {selectedDownloadableInvoices.length > 0 && selectedDownloadableInvoices.length === validInvoiceSales.length ? (
                                                    <CheckSquare className="w-4 h-4 text-slate-900" />
                                                ) : (
                                                    <Square className="w-4 h-4" />
                                                )}
                                                Select all valid
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadSelectedInvoices(selectedDownloadableInvoices)}
                                                disabled={selectedDownloadableInvoices.length === 0 || isDownloadingInvoices}
                                                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs md:text-sm font-bold text-white shadow-md shadow-black/10 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 transition-all"
                                            >
                                                {isDownloadingInvoices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                {isDownloadingInvoices ? 'Generating...' : `Download ${selectedDownloadableInvoices.length} Invoices`}
                                            </button>
                                        </div>
                                    </div>

                                    {soldInvoiceSales.length === 0 ? (
                                        <div className="text-center text-slate-500 py-32 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                                            <FileText className="w-16 h-16 mx-auto mb-4 opacity-20 text-slate-900" />
                                            <h3 className="text-xl font-bold text-slate-900">No sold cars found</h3>
                                            <p className="text-slate-500 max-w-xs mx-auto mt-2">When a car is sold it will appear here in its group, same as the Sold tab.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {invoiceGroupOrder.map((groupName) => {
                                                const groupSales = groupedInvoiceSales[groupName] || [];
                                                if (groupSales.length === 0) return null;

                                                return (
                                                    <div key={groupName} className="rounded-2xl border border-slate-200/70 overflow-hidden bg-white">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroup(groupName)}
                                                            className="w-full px-3 py-2.5 md:px-4 md:py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs md:text-sm font-black uppercase tracking-[0.12em] text-slate-700">{groupName}</span>
                                                                <span className="text-[10px] md:text-xs text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">{groupSales.length}</span>
                                                            </div>
                                                            {expandedGroups.includes(groupName) ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                                                        </button>

                                                        {expandedGroups.includes(groupName) && (
                                                            <div className="divide-y divide-slate-100">
                                                                <div className="hidden md:grid grid-cols-[56px_1.45fr_minmax(130px,1fr)_130px_130px_132px] gap-3 px-4 py-2.5 bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 border-b border-slate-200">
                                                                    <div className="text-center">Select</div>
                                                                    <div>Vehicle Details</div>
                                                                    <div>Buyer</div>
                                                                    <div className="text-right">Bank Amount</div>
                                                                    <div className="text-right">Balance</div>
                                                                    <div className="text-center">Actions</div>
                                                                </div>

                                                                {groupSales.map(s => {
                                                                    const isSelected = selectedIds.has(s.id);
                                                                    return (
                                                                        <div
                                                                            key={s.id}
                                                                            className={`group relative grid grid-cols-[28px_minmax(0,1fr)_auto_auto_78px] md:grid-cols-[56px_1.45fr_minmax(130px,1fr)_130px_130px_132px] gap-2 md:gap-3 items-center px-2 py-2 md:px-4 md:py-3 transition-colors ${isSelected ? 'bg-slate-50' : 'bg-white'}`}
                                                                            onClick={() => openInvoice(s, { stopPropagation: () => { } } as any, false, true)}
                                                                        >
                                                                            <div className="md:flex md:items-center md:justify-center">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }}
                                                                                    className={`w-5 h-5 md:w-6 md:h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-transparent bg-white'}`}
                                                                                >
                                                                                    <Check className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                                                </button>
                                                                            </div>

                                                                            <div className="min-w-0">
                                                                                <div className="flex items-start gap-2">
                                                                                    <div className="mt-0.5 h-7 w-7 md:h-8 md:w-8 shrink-0 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center">
                                                                                        <FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                                                    </div>
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                                                                                            <span className="font-extrabold text-slate-900 text-xs md:text-[15px] leading-tight truncate">{s.brand} {s.model}</span>
                                                                                            <span className="text-[9px] md:text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-tighter">{s.year}</span>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1.5 md:gap-2 mt-1 flex-wrap">
                                                                                            <span className="text-[9px] md:text-[10px] font-mono text-slate-400 uppercase tracking-wider">VIN: {(s.vin || '').slice(-8)}</span>
                                                                                            <span className={`text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.status === 'Completed' ? 'text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{s.status}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="hidden md:block text-xs md:text-sm font-semibold text-slate-700 truncate md:pr-2">
                                                                                <div className="truncate">{s.buyerName || '---'}</div>
                                                                            </div>

                                                                            <div className="text-right">
                                                                                <div className="text-[9px] md:hidden text-slate-400 font-bold uppercase tracking-tight">Bank</div>
                                                                                <div className="text-xs md:text-sm font-black text-emerald-600">€{(s.amountPaidBank || 0).toLocaleString()}</div>
                                                                            </div>

                                                                            <div className="text-right">
                                                                                <div className="text-[9px] md:hidden text-slate-400 font-bold uppercase tracking-tight">Due</div>
                                                                                <div className={`text-xs md:text-sm font-black ${calculateBalance(s) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>€{calculateBalance(s).toLocaleString()}</div>
                                                                            </div>

                                                                            <div className="flex items-center justify-center">
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); openInvoice(s, e, false, true); }}
                                                                                    className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 md:px-3 md:py-2 rounded-lg bg-slate-900 text-white min-w-[74px] md:min-w-[110px] text-[10px] md:text-[11px] font-bold transition-all shadow-sm active:scale-95"
                                                                                >
                                                                                    <FileText className="w-3.5 h-3.5" />
                                                                                    <span className="uppercase tracking-wider">View</span>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {/* Floating Bulk Action Bar */}
                            <AnimatePresence>
                                {selectedIds.size > 0 && (
                                    <motion.div
                                        initial={{ y: 100, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: 100, opacity: 0 }}
                                        className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white border border-slate-200 shadow-xl rounded-2xl p-2 flex items-center gap-2 z-50"
                                    >
                                        <div className="px-4 border-r border-slate-200 mr-2 flex flex-col items-center justify-center min-w-[60px]">
                                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Selected</span>
                                            <span className="font-mono text-xl font-bold text-slate-900 leading-none">{selectedIds.size}</span>
                                        </div>

                                        {selectedIds.size === 1 && (
                                            <button
                                                onClick={() => {
                                                    const sale = sales.find(s => s.id === Array.from(selectedIds)[0]);
                                                    if (sale) { openSaleForm(sale); }
                                                }}
                                                className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 tooltip flex flex-col items-center gap-1 group relative"
                                            >
                                                <Edit className="w-5 h-5 text-slate-500" />
                                                <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-slate-700">Edit</span>
                                            </button>
                                        )}

                                        <button onClick={handleBulkCopy} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                            <Copy className="w-5 h-5 text-emerald-500" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-emerald-500">Copy</span>
                                        </button>

                                        {groupingEnabled && (
                                            <div className="relative">
                                                <button onClick={() => setShowGroupMenu(!showGroupMenu)} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                                    <FolderPlus className="w-5 h-5 text-slate-600" />
                                                    <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-slate-600">Group</span>
                                                </button>
                                                {showGroupMenu && (
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white border border-slate-200 rounded-xl p-2 shadow-xl flex flex-col gap-1 w-48 z-50 animate-in fade-in zoom-in-95 duration-150">
                                                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide px-3 py-1.5 border-b border-slate-50 mb-1">Move to Group</div>
                                                        <div className="max-h-48 overflow-y-auto scroll-container py-1">
                                                            {activeGroups.map(g => (
                                                                <button
                                                                    key={g.name}
                                                                    onClick={() => {
                                                                        handleAddToGroup(g.name, Array.from(selectedIds));
                                                                        setShowGroupMenu(false);
                                                                        setSelectedIds(new Set());
                                                                    }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-between"
                                                                >
                                                                    <span>{g.name}</span>
                                                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{groupedSales[g.name]?.length || 0}</span>
                                                                </button>
                                                            ))}
                                                            {groupedSales.Ungrouped?.length > 0 && (
                                                                <button
                                                                    onClick={() => {
                                                                        const ids = Array.from(selectedIds);
                                                                        handleRemoveSelectedFromGroup(ids);
                                                                        setShowGroupMenu(false);
                                                                    }}
                                                                    className="w-full px-3 py-2 text-left text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                                                                >
                                                                    Ungrouped
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="h-px bg-slate-100 my-1" />
                                                        <button
                                                            onClick={() => {
                                                                setShowGroupMenu(false);
                                                                handleCreateGroup();
                                                            }}
                                                            className="w-full px-3 py-2.5 text-left text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-2"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" />
                                                            Create New Group
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="relative">
                                            <button onClick={() => setShowMoveMenu(!showMoveMenu)} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                                <ArrowRight className="w-5 h-5 text-amber-500" />
                                                <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-amber-500">Move</span>
                                            </button>
                                            {showMoveMenu && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white border border-slate-200 rounded-xl p-2 shadow-xl flex flex-col gap-1 w-32 z-50 animate-in fade-in zoom-in-95 duration-150">
                                                    <button onClick={() => { handleBulkMove('In Progress'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Sales</button>
                                                    <button onClick={() => { handleBulkMove('Shipped'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Shipped</button>
                                                    <button onClick={() => { handleBulkMove('Inspection'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Inspections</button>
                                                    <button onClick={() => { handleBulkMove('Autosallon'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Autosallon</button>
                                                </div>
                                            )}
                                        </div>

                                        <button onClick={() => handleBulkMove('Completed')} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                            <CheckSquare className="w-5 h-5 text-slate-700" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-slate-700">Sold</span>
                                        </button>

                                        <button onClick={handleBulkDelete} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                            <Trash2 className="w-5 h-5 text-red-500" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-red-500">Delete</span>
                                        </button>

                                        <div className="w-px h-8 bg-slate-200 mx-1" />

                                        <button onClick={() => setSelectedIds(new Set())} className="p-3 hover:bg-slate-100 rounded-xl text-slate-500">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )}

                </main>
            </div> {/* Close flex-1 */}
            <AnimatePresence>
                {editChoiceSale && (
                    <motion.div
                        className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setEditChoiceSale(null)}
                    >
                        <motion.div
                            className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl p-5"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900">What do you want to edit?</h3>
                                    <p className="text-xs text-slate-500 mt-1">{editChoiceSale.brand} {editChoiceSale.model}</p>
                                </div>
                                <button
                                    onClick={() => setEditChoiceSale(null)}
                                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                    aria-label="Close"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="mt-4 flex flex-col gap-2">
                                <button
                                    onClick={() => {
                                        const sale = editChoiceSale;
                                        setEditChoiceSale(null);
                                        setViewSaleModalItem(sale);
                                    }}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-900 bg-slate-50 hover:bg-slate-100 flex items-center justify-center gap-2"
                                >
                                    <Eye className="w-4 h-4" />
                                    View Sale
                                </button>
                                <button
                                    onClick={handleEditSaleChoice}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Edit Sale
                                </button>
                                <button
                                    onClick={handleEditShitblerjeChoice}
                                    className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                >
                                    Edit Shitblerje
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {view === 'sale_form' && (
                    <motion.div
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <motion.div
                            className="relative w-full max-w-5xl max-h-[85vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 24 }}
                            transition={{ duration: 0.25 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => closeSaleForm()}
                                className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-white/95 border border-slate-200 text-slate-600 shadow-sm hover:text-slate-900 hover:border-slate-300 hover:shadow-md transition-all duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                                aria-label="Close sale form"
                                type="button"
                            >
                                <X className="w-5 h-5 mx-auto" />
                            </button>
                            <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50/80">
                                <button onClick={() => closeSaleForm()} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors text-sm">
                                    <ArrowRight className="w-4 h-4 rotate-180" />
                                    {formReturnView === 'landing' ? 'Back to Menu' : formReturnView === 'invoices' ? 'Back to Invoices' : 'Back to Dashboard'}
                                </button>
                                <h2 className="text-lg font-semibold text-slate-900">{editingSale ? 'Edit Sale' : 'New Sale Entry'}</h2>
                                <div className="flex items-center gap-2">
                                    {editingSale && (
                                        <button
                                            onClick={() => setViewSaleModalItem(editingSale)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors"
                                        >
                                            <Eye className="w-4 h-4" />
                                            <span>View Sale</span>
                                        </button>
                                    )}
                                    <div className="w-10 sm:w-20" />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto scroll-container bg-white">
                                <SaleModal
                                    isOpen={true}
                                    inline={true}
                                    hideHeader={true}
                                    onClose={() => closeSaleForm()}
                                    onSave={handleAddSale}
                                    existingSale={editingSale}
                                    defaultStatus={activeCategory === 'INSPECTIONS' ? 'Inspection' : activeCategory === 'AUTOSALLON' ? 'Autosallon' : 'New'}
                                    isAdmin={isAdmin}
                                    availableProfiles={profileOptions}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <EditShitblerjeModal
                isOpen={!!editShitblerjeSale}
                sale={editShitblerjeSale}
                onClose={() => setEditShitblerjeSale(null)}
                onSave={(overrides) => editShitblerjeSale ? handleSaveShitblerjeOverrides(editShitblerjeSale, overrides) : Promise.resolve()}
            />

            {/* Contextual FAB for Inspections/Autosallon */}
            {documentPreview && (
                <EditablePreviewModal
                    isOpen={!!documentPreview}
                    onClose={() => setDocumentPreview(null)}
                    sale={documentPreview.sale}
                    documentType={documentPreview.type}
                    withDogane={documentPreview.withDogane}
                    showBankOnly={documentPreview.showBankOnly}
                    onSaveToSale={(updates) => handlePreviewSaveToSale(documentPreview.sale.id, updates)}
                />
            )}

            {viewSaleModalItem && (
                <ViewSaleModal
                    isOpen={!!viewSaleModalItem}
                    sale={viewSaleModalItem}
                    onClose={() => setViewSaleModalItem(null)}
                    isAdmin={isAdmin}
                />
            )}
            {
                showPasswordModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}>
                        <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Enter {ADMIN_PROFILE} Password</h3>
                            <div className="relative mb-6">
                                <input
                                    type={isPasswordVisible ? 'text' : 'password'}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pr-12 text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/20 transition-colors"
                                    placeholder="Password"
                                    value={passwordInput}
                                    onChange={e => setPasswordInput(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                                />
                                <button
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                                >
                                    {isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            <label className="mb-5 flex items-center justify-center gap-3 text-sm text-slate-600 font-semibold">
                                <input
                                    type="checkbox"
                                    checked={rememberProfile}
                                    onChange={(e) => setRememberProfile(e.target.checked)}
                                    className="h-4 w-4 accent-slate-900"
                                />
                                Remember me on this device
                            </label>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button onClick={handlePasswordSubmit} className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold transition-colors shadow-sm">Submit</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {view !== 'sale_form' && (
                <button
                    onClick={() => openSaleForm(null)}
                    className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-[60] h-12 w-12 rounded-full border border-slate-200 bg-white/90 text-slate-900 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:border-slate-300 hover:scale-105 transition-all duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                    aria-label="Add sale"
                    type="button"
                >
                    <Plus className="w-5 h-5 mx-auto" />
                </button>
            )}
        </div>
    );
}
