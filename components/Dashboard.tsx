'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition, useCallback, useDeferredValue } from 'react';
import { Attachment, CarSale, ContractType, SaleStatus, ShitblerjeOverrides, TransportPaymentStatus } from '@/app/types';
import { Plus, Search, FileText, RefreshCw, Trash2, Copy, ArrowRight, CheckSquare, Square, X, Clipboard, GripVertical, Eye, EyeOff, LogOut, ChevronDown, ChevronUp, ArrowUpDown, Edit, FolderPlus, Archive, Download, Loader2, ArrowRightLeft, Menu, Settings, Check, History, Sun, Moon, MoreHorizontal, Truck, CircleDollarSign } from 'lucide-react';
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
import PdfTemplateBuilder, { defaultPdfTemplates, PdfTemplateMap, sanitizePdfTemplateMap } from './PdfTemplateBuilder';
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

type CustomDashboardColumn = {
    id: string;
    name: string;
};

type CustomDashboardRow = {
    id: string;
    cells: Record<string, string>;
};

type CustomDashboard = {
    id: string;
    name: string;
    columns: CustomDashboardColumn[];
    rows: CustomDashboardRow[];
    archived: boolean;
    createdAt: string;
    updatedAt: string;
};

const SortableSaleItem = React.memo(function SortableSaleItem({ s, openInvoice, toggleSelection, isSelected, userProfile, canViewPrices, onClick, onDelete, onInlineUpdate, onRemoveFromGroup, theme }: any) {
    const controls = useDragControls();
    const isAdmin = userProfile === ADMIN_PROFILE;
    const canEdit = isAdmin || s.soldBy === userProfile;
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
                                <InlineEditableCell value={s.amountPaidBank || 0} onSave={(v) => handleFieldUpdate('amountPaidBank', v)} type="number" prefix="€" className="text-slate-800 font-semibold" />
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
                        <div className="font-mono text-slate-800 font-semibold text-[11px] xl:text-xs">
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
                    {isAdmin && <div className="px-2 h-full flex items-center justify-end font-mono font-bold financial-positive-text whitespace-nowrap border-r border-slate-100 bg-white text-[11px] xl:text-xs">€{calculateProfit(s).toLocaleString()}</div>}
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
                    <span className={`text-[11px] xl:text-xs font-semibold ${calculateBalance(s) > 0 ? 'financial-negative-text' : 'financial-positive-text'}`}>
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
                        <span className={`text-[10px] xl:text-[11px] uppercase font-bold whitespace-nowrap ${(s.costToBuy || 0) - (s.amountPaidToKorea || 0) > 0 ? 'financial-negative-text' : 'financial-positive-text'}`}>
                        {(s.costToBuy || 0) - (s.amountPaidToKorea || 0) > 0 ? 'Not Paid' : 'Paid'}
                    </span>
                </div>
            )}

            {/* 16. Status */}
            <div className="px-2 h-full flex items-center justify-center border-r border-slate-100 bg-white" title={s.status}>
                <div className="flex flex-col items-center gap-1">
                    {canEdit ? (
                        <InlineEditableCell value={s.status} onSave={(v) => handleFieldUpdate('status', v)} className="text-[10px] xl:text-[11px] font-semibold text-slate-700" />
                    ) : (
                        <span className="text-[10px] xl:text-[11px] font-semibold text-slate-700">{s.status}</span>
                    )}
                    {s.isPaid && (
                        <span className="payment-badge payment-badge--paid financial-positive-text text-[9px] xl:text-[10px] uppercase font-bold whitespace-nowrap">
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
                        className={`row-action-button transition-colors p-1 rounded-md ${theme === 'dark' ? 'text-slate-100 hover:text-white' : 'text-slate-700 hover:text-slate-900'} ${isSoldRow ? '' : 'hover:bg-slate-100 dark:hover:bg-slate-700/40'}`}
                        title="Remove from group"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
                <button onClick={(e) => openInvoice(s, e)} className={`row-action-button transition-colors p-1 rounded-md ${theme === 'dark' ? 'text-slate-100 hover:text-white' : 'text-slate-700 hover:text-slate-900'} ${isSoldRow ? '' : 'hover:bg-slate-100 dark:hover:bg-slate-700/40'}`} title="View Invoice">
                    <FileText className="w-4 h-4" />
                </button>
            </div>
        </Reorder.Item>
    );
}, (prev, next) => (
    prev.s === next.s &&
    prev.isSelected === next.isSelected &&
    prev.userProfile === next.userProfile &&
    prev.canViewPrices === next.canViewPrices &&
    prev.theme === next.theme
));

const INITIAL_SALES: CarSale[] = [];
const UI_STATE_STORAGE_KEY = 'dashboard_ui_state_v1';
const SESSION_PROFILE_STORAGE_KEY = 'session_profile';
const ROW_TAP_MOVE_THRESHOLD = 10;
type InputMode = 'mouse' | 'touch';

const isMercedesB200Sale = (sale: CarSale) => {
    const brand = (sale.brand || '').trim().toLowerCase();
    const model = (sale.model || '').trim().toLowerCase();
    const vin = (sale.vin || '').trim().toUpperCase();
    return (brand.includes('mercedes') && model.includes('b200')) || vin === 'WDDMHOJBXGN149268';
};

const repairMercedesB200Visibility = (salesToRepair: CarSale[]) => {
    let hasChanges = false;
    const repaired = salesToRepair.map((sale) => {
        if (!isMercedesB200Sale(sale)) return sale;

        const nextStatus = ['Shipped', 'Inspection', 'Autosallon'].includes(sale.status) ? 'Completed' : sale.status;
        const nextSoldBy = normalizeProfileName(sale.soldBy || sale.sellerName || ADMIN_PROFILE);
        const nextSellerName = normalizeProfileName(sale.sellerName || sale.soldBy || ADMIN_PROFILE);

        const updatedSale = {
            ...sale,
            status: nextStatus,
            soldBy: nextSoldBy,
            sellerName: nextSellerName
        };

        if (
            updatedSale.status !== sale.status
            || updatedSale.soldBy !== sale.soldBy
            || updatedSale.sellerName !== sale.sellerName
        ) {
            hasChanges = true;
            return updatedSale;
        }

        return sale;
    });

    return { repaired, hasChanges };
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
    { id: 'INVOICES', label: 'Invoice', icon: FileText, view: 'invoices', category: 'SALES' },
    { id: 'SHIPPED', label: 'Shipped', icon: ArrowRight, view: 'dashboard', category: 'SHIPPED', adminOnly: true },
    { id: 'INSPECTIONS', label: 'Inspection', icon: Search, view: 'dashboard', category: 'INSPECTIONS' },
    { id: 'BALANCE_DUE', label: 'Balance Due', icon: CircleDollarSign, view: 'balance_due', adminOnly: true },
    { id: 'TRANSPORTI', label: 'Transporti', icon: Truck, view: 'transport', adminOnly: true },
    { id: 'AUTOSALLON', label: 'Autosalloni', icon: RefreshCw, view: 'dashboard', category: 'AUTOSALLON', adminOnly: true },
    { id: 'RECORD', label: 'Records', icon: History, view: 'record', adminOnly: true },
    { id: 'PDF', label: 'PDF', icon: FileText, view: 'pdf_list' },
    { id: 'SETTINGS', label: 'Settings', icon: Settings, view: 'settings', adminOnly: true },
];

const getClientTransportPaidStatus = (sale: Pick<CarSale, 'includeTransport' | 'transportPaid'>): TransportPaymentStatus => (
    sale.includeTransport ? 'PAID' : (sale.transportPaid === 'PAID' ? 'PAID' : 'NOT PAID')
);

export default function Dashboard() {
    const dirtyIds = useRef<Set<string>>(new Set());
    const [, startTransition] = useTransition();
    const [sales, setSales] = useState<CarSale[]>([]);
    const salesRef = useRef(sales);
    useEffect(() => { salesRef.current = sales; }, [sales]);
    const [view, setView] = useState('dashboard');
    const [activeCustomDashboardId, setActiveCustomDashboardId] = useState<string | null>(null);
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
    const [isSalesGroupOpen, setIsSalesGroupOpen] = useState(true);
    const [isOperationsGroupOpen, setIsOperationsGroupOpen] = useState(true);
    const [isFinanceGroupOpen, setIsFinanceGroupOpen] = useState(true);
    const hasSyncedTransportPaidRef = useRef(false);

    const isAdmin = userProfile === ADMIN_PROFILE;
    const isRecordAdmin = userProfile === ADMIN_PROFILE;
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

    const columnWidthStorageKey = useMemo(() => {
        const profileKey = normalizeProfileName(userProfile || 'guest') || 'guest';
        return `table-widths-${isAdmin ? 'admin' : 'user'}-${profileKey}`;
    }, [isAdmin, userProfile]);

    const { getColumnStyle, handleMouseDown, columnWidths, setColumnWidths } = useResizableColumns(defaultWidths, {
        storageKey: columnWidthStorageKey,
        minWidth: 30,
        onWidthsChange: (widths) => {
            void Preferences.set({ key: columnWidthStorageKey, value: JSON.stringify(widths) });
        },
        onResizeComplete: ({ columnKey, oldWidth, newWidth }) => {
            setLastResizeAudit({ columnKey, oldWidth, newWidth });
        }
    });

    useEffect(() => {
        let cancelled = false;

        const hydrateColumnWidths = async () => {
            const fromPrefs = await Preferences.get({ key: columnWidthStorageKey });
            const raw = fromPrefs.value || (typeof window !== 'undefined' ? localStorage.getItem(columnWidthStorageKey) : null);
            if (!raw) return;

            try {
                const parsed = JSON.parse(raw);
                if (cancelled || !parsed || typeof parsed !== 'object') return;
                const merged = { ...defaultWidths, ...parsed };
                setColumnWidths(merged);
                if (typeof window !== 'undefined') {
                    localStorage.setItem(columnWidthStorageKey, JSON.stringify(merged));
                }
            } catch (error) {
                console.error('Failed to restore column widths', error);
            }
        };

        void hydrateColumnWidths();

        return () => {
            cancelled = true;
        };
    }, [columnWidthStorageKey, defaultWidths, setColumnWidths]);

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

    useEffect(() => {
        if (isAdmin) return;
        if (view === 'record' || view === 'settings' || view === 'transport' || view === 'balance_due' || view === 'pdf_templates') {
            setView('dashboard');
        }
        if (activeCategory === 'SHIPPED' || activeCategory === 'AUTOSALLON') {
            setActiveCategory('SALES');
        }
    }, [isAdmin, view, activeCategory]);

    const currentNavId = useMemo(() => {
        if (view === 'settings') return 'SETTINGS';
        if (view === 'record') return 'RECORD';
        if (view === 'invoices') return 'INVOICES';
        if (view === 'balance_due') return 'BALANCE_DUE';
        if (view === 'transport') return 'TRANSPORTI';
        if (view === 'pdf_templates' || view === 'pdf_list') return 'PDF';
        if (view === 'custom_dashboard') return activeCustomDashboardId || 'CREATE';
        return activeCategory as string;
    }, [view, activeCategory, activeCustomDashboardId]);
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
    const [pdfTemplates, setPdfTemplates] = useState<PdfTemplateMap>(sanitizePdfTemplateMap(defaultPdfTemplates()));
    const [isSavingPdfTemplates, setIsSavingPdfTemplates] = useState(false);
    const [profileAvatars, setProfileAvatars] = useState<Record<string, string>>({});
    const [showMoveMenu, setShowMoveMenu] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [customDashboards, setCustomDashboards] = useState<CustomDashboard[]>([]);
    const [activeCustomDashboardMenuId, setActiveCustomDashboardMenuId] = useState<string | null>(null);
    const [showArchivedDashboards, setShowArchivedDashboards] = useState(false);
    const [auditLogs, setAuditLogs] = useState<Array<any>>([]);
    const [isLoadingAudit, setIsLoadingAudit] = useState(false);
    const [auditPage, setAuditPage] = useState(0);
    const [lastResizeAudit, setLastResizeAudit] = useState<{ columnKey: string; oldWidth: number; newWidth: number } | null>(null);
    const [showGroupMenu, setShowGroupMenu] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [inputMode, setInputMode] = useState<InputMode>('mouse');
    const forceMobileLayout = false;
    const isFormOpen = view === 'sale_form';
    const isFormOpenRef = React.useRef(isFormOpen);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const restoredScrollTopRef = useRef<number | null>(null);
    const didRestoreUiStateRef = useRef(false);
    const mobileRowTapStateRef = useRef<Record<string, { x: number; y: number; moved: boolean; active: boolean }>>({});
    const interactionGuardRef = useRef<Record<number, { x: number; y: number; moved: boolean }>>({});

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const coarsePointerQuery = window.matchMedia('(any-pointer: coarse)');
        const updateFromMediaQuery = () => {
            if (coarsePointerQuery.matches) {
                setInputMode((prev) => (prev === 'mouse' ? 'touch' : prev));
            }
        };

        updateFromMediaQuery();

        const handlePointerDown = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                setInputMode('mouse');
                return;
            }

            if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                setInputMode('touch');
            }
        };

        window.addEventListener('pointerdown', handlePointerDown, { passive: true });
        if (typeof coarsePointerQuery.addEventListener === 'function') {
            coarsePointerQuery.addEventListener('change', updateFromMediaQuery);
        } else {
            coarsePointerQuery.addListener(updateFromMediaQuery);
        }

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            if (typeof coarsePointerQuery.removeEventListener === 'function') {
                coarsePointerQuery.removeEventListener('change', updateFromMediaQuery);
            } else {
                coarsePointerQuery.removeListener(updateFromMediaQuery);
            }
        };
    }, []);

    const isTouchInputMode = inputMode === 'touch';

    const handleAppPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse') return;
        interactionGuardRef.current[event.pointerId] = { x: event.clientX, y: event.clientY, moved: false };
    };

    const handleAppPointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
        const state = interactionGuardRef.current[event.pointerId];
        if (!state || state.moved) return;
        if (Math.abs(event.clientX - state.x) > ROW_TAP_MOVE_THRESHOLD || Math.abs(event.clientY - state.y) > ROW_TAP_MOVE_THRESHOLD) {
            state.moved = true;
        }
    };

    const handleAppPointerUpCapture = (event: React.PointerEvent<HTMLDivElement>) => {
        window.setTimeout(() => {
            delete interactionGuardRef.current[event.pointerId];
        }, 0);
    };

    const handleAppClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
        const nativeEvent = event.nativeEvent as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } };
        const fromTouch = nativeEvent.sourceCapabilities?.firesTouchEvents;
        if (!fromTouch) return;
        const hasMovedPointer = Object.values(interactionGuardRef.current).some((state) => state.moved);
        if (hasMovedPointer) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    useEffect(() => {
        if (typeof document === 'undefined' || !userProfile || !supabaseUrl || !supabaseKey) return;

        const writeClickAudit = async (actionLabel: string, tagName: string) => {
            try {
                const client = createSupabaseClient(supabaseUrl, supabaseKey);
                const payload = {
                    p_actor_profile_id: userProfile,
                    p_actor_profile_name: userProfile,
                    p_action_type: 'CLICK',
                    p_entity_type: 'ui_interaction',
                    p_entity_id: actionLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/g, ''),
                    p_page_context: view,
                    p_route: typeof window !== 'undefined' ? window.location.pathname : null,
                    p_metadata: { actionLabel, tagName }
                };
                const rpc = await client.rpc('log_ui_audit_event', payload);
                if (rpc.error) {
                    await client.from('audit_logs').insert({
                        actor_profile_id: userProfile,
                        actor_profile_name: userProfile,
                        action_type: 'CLICK',
                        entity_type: 'ui_interaction',
                        entity_id: payload.p_entity_id,
                        page_context: view,
                        route: payload.p_route,
                        metadata: payload.p_metadata,
                        source: 'ui'
                    });
                }
            } catch (error) {
                console.error('Audit click log write failed', error);
            }
        };

        const clickHandler = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            const interactive = target.closest('button,[role="button"],a,[data-audit-click]') as HTMLElement | null;
            if (!interactive) return;

            const explicitAction = interactive.getAttribute('data-audit-click');
            const actionLabel = explicitAction || interactive.getAttribute('aria-label') || (interactive.textContent || '').trim().slice(0, 80);
            if (!actionLabel) return;
            void writeClickAudit(actionLabel, interactive.tagName.toLowerCase());
        };

        document.addEventListener('click', clickHandler, true);
        return () => document.removeEventListener('click', clickHandler, true);
    }, [supabaseKey, supabaseUrl, userProfile, view]);

    const CUSTOM_DASHBOARDS_STORAGE_KEY = 'custom_dashboards_v1';

    const persistCustomDashboards = useCallback(async (next: CustomDashboard[]) => {
        localStorage.setItem(CUSTOM_DASHBOARDS_STORAGE_KEY, JSON.stringify(next));
        await Preferences.set({ key: CUSTOM_DASHBOARDS_STORAGE_KEY, value: JSON.stringify(next) });
    }, []);

    const activeCustomDashboard = useMemo(() => customDashboards.find(d => d.id === activeCustomDashboardId) || null, [customDashboards, activeCustomDashboardId]);

    const logAuditEvent = useCallback(async (entry: {
        actionType: 'CREATE' | 'UPDATE' | 'MOVE' | 'ARCHIVE' | 'RESTORE' | 'DELETE' | 'RESIZE' | 'VIEW' | 'CLICK' | 'DOWNLOAD' | 'PRINT' | 'PREVIEW';
        entityType: string;
        entityId: string;
        beforeData?: unknown;
        afterData?: unknown;
        pageContext?: string;
        metadata?: Record<string, unknown>;
    }) => {
        if (!supabaseUrl || !supabaseKey || !userProfile) return;
        const requestId = crypto.randomUUID();
        const payload = {
            actor_profile_id: userProfile,
            actor_profile_name: userProfile,
            action_type: entry.actionType,
            entity_type: entry.entityType,
            entity_id: entry.entityId,
            before_data: entry.beforeData ?? null,
            after_data: entry.afterData ?? null,
            page_context: entry.pageContext ?? view,
            request_id: requestId,
            route: typeof window !== 'undefined' ? window.location.pathname : null,
            metadata: entry.metadata ?? null,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
        };
        try {
            const client = createSupabaseClient(supabaseUrl, supabaseKey);
            const { error } = await client.rpc('log_ui_audit_event', {
                p_actor_profile_id: payload.actor_profile_id,
                p_actor_profile_name: payload.actor_profile_name,
                p_action_type: payload.action_type,
                p_entity_type: payload.entity_type,
                p_entity_id: payload.entity_id,
                p_before_data: payload.before_data,
                p_after_data: payload.after_data,
                p_page_context: payload.page_context,
                p_request_id: payload.request_id,
                p_route: payload.route,
                p_metadata: payload.metadata,
                p_user_agent: payload.user_agent
            });
            if (error) {
                const fallback = await client.from('audit_logs').insert(payload);
                if (fallback.error) throw fallback.error;
            }
        } catch (error) {
            console.error('Audit log write failed', error);
        }
    }, [supabaseUrl, supabaseKey, userProfile, view]);

    useEffect(() => {
        if (!lastResizeAudit) return;
        void logAuditEvent({
            actionType: 'RESIZE',
            entityType: 'table_column',
            entityId: lastResizeAudit.columnKey,
            beforeData: { width: lastResizeAudit.oldWidth },
            afterData: { width: lastResizeAudit.newWidth },
            pageContext: 'cars_sold',
            metadata: { tableName: 'Cars Sold', columnKey: lastResizeAudit.columnKey, oldWidth: lastResizeAudit.oldWidth, newWidth: lastResizeAudit.newWidth }
        });
    }, [lastResizeAudit, logAuditEvent]);

    const applyTheme = useCallback((nextTheme: 'light' | 'dark') => {
        setTheme(nextTheme);
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', nextTheme);
            document.body.setAttribute('data-theme', nextTheme);
        }
        Preferences.set({ key: 'theme_mode', value: nextTheme });
        localStorage.setItem('theme_mode', nextTheme);
    }, []);


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
        soldBy: normalizeProfileName(sale.soldBy),
        transportPaid: getClientTransportPaidStatus(sale),
        paidToTransportusi: (sale.paidToTransportusi === 'PAID' ? 'PAID' : 'NOT PAID') as TransportPaymentStatus,
        transportCost: typeof sale.transportCost === 'number' ? sale.transportCost : (sale.includeTransport ? 350 : 0)
    }), []);

    useEffect(() => {
        if (isLoading || hasSyncedTransportPaidRef.current || !sales.length) return;
        const hasMismatch = sales.some((sale) => sale.transportPaid !== getClientTransportPaidStatus(sale));
        if (!hasMismatch) {
            hasSyncedTransportPaidRef.current = true;
            return;
        }
        hasSyncedTransportPaidRef.current = true;
        const reconciledSales = sales.map((sale) => ({ ...sale, transportPaid: getClientTransportPaidStatus(sale) }));
        void updateSalesAndSave(reconciledSales);
    // updateSalesAndSave is intentionally omitted to avoid render-loop re-syncs while preserving one-time reconciliation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, sales]);

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

    const handleCreateCustomDashboard = async () => {
        const now = new Date().toISOString();
        const salesLayoutLabels = ['Car', 'Year', 'KM', 'Plate/VIN', 'Buyer', 'Seller', 'Shipping', 'Cost', 'Sold', 'Paid', 'Status'];
        const dashboard: CustomDashboard = {
            id: crypto.randomUUID(),
            name: '',
            columns: salesLayoutLabels.map(() => ({ id: crypto.randomUUID(), name: '' })),
            rows: [],
            archived: false,
            createdAt: now,
            updatedAt: now
        };
        const next = [...customDashboards, dashboard];
        setCustomDashboards(next);
        setActiveCustomDashboardId(dashboard.id);
        setView('custom_dashboard');
        await persistCustomDashboards(next);
    };

    const patchActiveCustomDashboard = async (patcher: (dashboard: CustomDashboard) => CustomDashboard) => {
        if (!activeCustomDashboard) return;
        const next = customDashboards.map((dashboard) => {
            if (dashboard.id !== activeCustomDashboard.id) return dashboard;
            return { ...patcher(dashboard), updatedAt: new Date().toISOString() };
        });
        setCustomDashboards(next);
        await persistCustomDashboards(next);
    };

    const handleAddCustomDashboardColumn = async () => {
        await patchActiveCustomDashboard((dashboard) => {
            const nextColumn = { id: crypto.randomUUID(), name: `Column ${dashboard.columns.length + 1}` };
            return {
                ...dashboard,
                columns: [...dashboard.columns, nextColumn],
                rows: dashboard.rows.map((row) => ({ ...row, cells: { ...row.cells, [nextColumn.id]: '' } }))
            };
        });
    };

    const handleAddCustomDashboardRow = async () => {
        await patchActiveCustomDashboard((dashboard) => ({
            ...dashboard,
            rows: [
                ...dashboard.rows,
                { id: crypto.randomUUID(), cells: Object.fromEntries(dashboard.columns.map((column) => [column.id, ''])) }
            ]
        }));
    };

    const handleArchiveCustomDashboard = async (dashboardId: string, archived: boolean) => {
        const target = customDashboards.find((dashboard) => dashboard.id === dashboardId);
        if (!target) return;

        const next = customDashboards.map((dashboard) =>
            dashboard.id === dashboardId ? { ...dashboard, archived, updatedAt: new Date().toISOString() } : dashboard
        );
        setCustomDashboards(next);
        if (archived && activeCustomDashboardId === dashboardId) {
            setActiveCustomDashboardId(null);
            setView('dashboard');
        }
        await persistCustomDashboards(next);
        setActiveCustomDashboardMenuId(null);
        await logAuditEvent({
            actionType: archived ? 'ARCHIVE' : 'RESTORE',
            entityType: 'custom_dashboard',
            entityId: dashboardId,
            beforeData: target,
            afterData: next.find((dashboard) => dashboard.id === dashboardId),
            pageContext: 'sidebar'
        });
    };

    const handleDeleteCustomDashboard = async (dashboardId: string) => {
        const target = customDashboards.find((dashboard) => dashboard.id === dashboardId);
        if (!target) return;
        if (!window.confirm(`Delete dashboard "${target.name}" permanently? This action cannot be undone.`)) return;

        const next = customDashboards.filter((dashboard) => dashboard.id !== dashboardId);
        setCustomDashboards(next);
        if (activeCustomDashboardId === dashboardId) {
            setActiveCustomDashboardId(null);
            setView('dashboard');
        }
        await persistCustomDashboards(next);
        setActiveCustomDashboardMenuId(null);
        await logAuditEvent({
            actionType: 'DELETE',
            entityType: 'custom_dashboard',
            entityId: dashboardId,
            beforeData: target,
            pageContext: 'sidebar'
        });
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
        if (!isAdmin && normalizeProfileName(sale.soldBy) !== normalizeProfileName(userProfile)) {
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

    const savePdfTemplates = useCallback(async () => {
        setIsSavingPdfTemplates(true);
        try {
            const sanitizedTemplates = sanitizePdfTemplateMap(pdfTemplates);
            await Preferences.set({ key: 'pdf_templates', value: JSON.stringify(sanitizedTemplates) });
            if (supabaseUrl && supabaseKey) {
                const client = createSupabaseClient(supabaseUrl, supabaseKey);
                await client.from('sales').upsert({
                    id: 'config_pdf_templates',
                    attachments: { templates: sanitizedTemplates, updatedAt: new Date().toISOString() }
                });
            }
        } finally {
            setIsSavingPdfTemplates(false);
        }
    }, [pdfTemplates, supabaseUrl, supabaseKey]);

    useEffect(() => {
        const loadPdfTemplates = async () => {
            const local = await Preferences.get({ key: 'pdf_templates' });
            if (local.value) {
                try {
                    setPdfTemplates(sanitizePdfTemplateMap({ ...defaultPdfTemplates(), ...JSON.parse(local.value) }));
                } catch {
                    setPdfTemplates(sanitizePdfTemplateMap(defaultPdfTemplates()));
                }
            }

            if (supabaseUrl && supabaseKey) {
                const client = createSupabaseClient(supabaseUrl, supabaseKey);
                const { data } = await client.from('sales').select('attachments').eq('id', 'config_pdf_templates').single();
                const cloudTemplates = data?.attachments?.templates;
                if (cloudTemplates && typeof cloudTemplates === 'object') {
                    const merged = sanitizePdfTemplateMap({ ...defaultPdfTemplates(), ...cloudTemplates });
                    setPdfTemplates(merged);
                    await Preferences.set({ key: 'pdf_templates', value: JSON.stringify(merged) });
                }
            }
        };

        void loadPdfTemplates();
    }, [supabaseUrl, supabaseKey]);

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
        const salesStorageKey = getSalesStorageKey();
        await Preferences.set({ key: salesStorageKey, value: JSON.stringify(normalizedSales) });
        localStorage.setItem(salesStorageKey, JSON.stringify(normalizedSales));

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

    const getSalesStorageKey = (profile?: string | null) => {
        const normalized = normalizeProfileName(profile || userProfile || 'guest') || 'guest';
        return `car_sales_data_${normalized}`;
    };

    const getDirtyIdsStorageKey = (profile?: string | null) => {
        const normalized = normalizeProfileName(profile || userProfile || 'guest') || 'guest';
        return `${DIRTY_IDS_KEY}_${normalized}`;
    };

    const persistDirtyIds = async (ids: Set<string>) => {
        const payload = JSON.stringify(Array.from(ids));
        const dirtyStorageKey = getDirtyIdsStorageKey();
        await Preferences.set({ key: dirtyStorageKey, value: payload });
        localStorage.setItem(dirtyStorageKey, payload);
    };

    const updateSalesAndSave = async (newSales: CarSale[]): Promise<{ success: boolean; error?: string }> => {
        const previousSales = salesRef.current;
        const normalizedSales = newSales.map(normalizeSaleProfiles);
        setSales(normalizedSales);
        try {
            await persistSalesLocally(normalizedSales);

            if (supabaseUrl && supabaseKey && userProfile) {
                const syncResult = await performAutoSync(supabaseUrl, supabaseKey, userProfile, normalizedSales);
                if (!syncResult.success) {
                    setSales(previousSales);
                    alert(`Save failed: ${syncResult.error || 'Sync failed.'}`);
                    return { success: false, error: syncResult.error || 'Sync failed.' };
                }
            } else {
                const missing = !supabaseUrl || !supabaseKey ? 'Supabase settings' : 'User profile';
                const message = `Save failed: ${missing} missing.`;
                setSales(previousSales);
                alert(message);
                return { success: false, error: message };
            }
            return { success: true };
        } catch (e: any) {
            setSales(previousSales);
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
        if (!isAdmin && (field === 'sellerName' || field === 'soldBy' || field === 'shippingName' || field === 'shippingDate')) {
            return;
        }

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
        await logAuditEvent({ actionType: field === 'status' ? 'MOVE' : 'UPDATE', entityType: 'sale', entityId: id, beforeData: currentSales[index], afterData: updatedSale, pageContext: 'inline_edit' });

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
        if (!isAdmin) {
            delete updates.sellerName;
            delete updates.soldBy;
            delete updates.shippingName;
            delete updates.shippingDate;
        }

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
        mobileRowTapStateRef.current[id] = {
            x: event.clientX,
            y: event.clientY,
            moved: false,
            active: true
        };
    };

    const handleMobileRowPointerMove = (id: string, event: React.PointerEvent) => {
        const state = mobileRowTapStateRef.current[id];
        if (!state?.active || state.moved) return;
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

    const handleMobileSaleClick = (sale: CarSale, isSoldSale: boolean) => {
        if (shouldIgnoreMobileRowTap(sale.id)) return;
        if (selectedIds.size > 0 && !isSoldSale) {
            toggleSelection(sale.id);
            return;
        }
        handleSaleInteraction(sale);
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
            await logAuditEvent({ actionType: 'DOWNLOAD', entityType: 'invoice_download', entityId: `${selectedSales.length}_sales`, afterData: { sales: selectedSales.map(s => s.id), file: downloadName }, pageContext: 'invoices', metadata: { action: 'DOWNLOAD' } });
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
        const beforeSales = sales.filter(s => selectedIds.has(s.id));
        const newSales = sales.filter(s => !selectedIds.has(s.id));
        await updateSalesAndSave(newSales);
        await logAuditEvent({ actionType: 'DELETE', entityType: 'sale_bulk', entityId: idsToDelete.join(','), beforeData: beforeSales, pageContext: 'dashboard' });
        setSelectedIds(new Set());
    };

    const handleBulkMove = async (status: SaleStatus) => {
        const beforeSales = sales.filter(s => selectedIds.has(s.id));
        const newSales = sales.map(s => {
            if (selectedIds.has(s.id)) {
                dirtyIds.current.add(s.id);
                return { ...s, status };
            }
            return s;
        });
        await updateSalesAndSave(newSales);
        await logAuditEvent({ actionType: 'MOVE', entityType: 'sale_bulk', entityId: Array.from(selectedIds).join(','), beforeData: beforeSales, afterData: newSales.filter(s => selectedIds.has(s.id)), pageContext: 'dashboard' });
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
        const beforeSale = sales.find(s => s.id === id);
        const newSales = sales.filter(s => s.id !== id);
        await updateSalesAndSave(newSales);
        if (beforeSale) await logAuditEvent({ actionType: 'DELETE', entityType: 'sale', entityId: id, beforeData: beforeSale, pageContext: 'dashboard' });
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
                if (!userProfile) return;
                window.setTimeout(() => {
                    void performAutoSync(supabaseUrl, supabaseKey, userProfile);
                }, 150);
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

                const dirtyStorageKey = getDirtyIdsStorageKey(storedProfile);
                const { value: dirtyValue } = await Preferences.get({ key: dirtyStorageKey });
                if (dirtyValue) {
                    const parsed = JSON.parse(dirtyValue) as string[];
                    dirtyIds.current = new Set(parsed.filter(Boolean));
                } else {
                    const storedDirty = localStorage.getItem(dirtyStorageKey);
                    if (storedDirty) {
                        const parsed = JSON.parse(storedDirty) as string[];
                        dirtyIds.current = new Set(parsed.filter(Boolean));
                    }
                }

                const { value: customDashboardsValue } = await Preferences.get({ key: CUSTOM_DASHBOARDS_STORAGE_KEY });
                const customDashboardsRaw = customDashboardsValue || localStorage.getItem(CUSTOM_DASHBOARDS_STORAGE_KEY);
                if (customDashboardsRaw) {
                    try {
                        const parsed = JSON.parse(customDashboardsRaw) as CustomDashboard[];
                        if (Array.isArray(parsed)) {
                            const normalizedDashboards = parsed.map((dashboard) => ({
                                ...dashboard,
                                archived: Boolean((dashboard as Partial<CustomDashboard>).archived)
                            }));
                            setCustomDashboards(normalizedDashboards);
                        }
                    } catch (error) {
                        console.error('Failed to parse custom dashboards', error);
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
                const scopedSalesKey = getSalesStorageKey(userProfile || localStorage.getItem(SESSION_PROFILE_STORAGE_KEY));
                const { value } = await Preferences.get({ key: scopedSalesKey });
                if (value) {
                    currentSales = JSON.parse(value);
                } else {
                    const saved = localStorage.getItem(scopedSalesKey);
                    if (saved) {
                        currentSales = JSON.parse(saved);
                    }
                }

                // Just load the saved data - no auto-import
                const normalizedSales = currentSales.map(normalizeSaleProfiles);
                const hasAdminOwnership = currentSales.some((sale: CarSale) => isLegacyAdminProfile(sale.sellerName) || isLegacyAdminProfile(sale.soldBy));
                const { repaired: visibilityRepairedSales, hasChanges: hasVisibilityRepairs } = repairMercedesB200Visibility(normalizedSales);
                if (hasAdminOwnership || hasVisibilityRepairs) {
                    currentSales.forEach((sale: CarSale) => {
                        if (isLegacyAdminProfile(sale.sellerName) || isLegacyAdminProfile(sale.soldBy)) {
                            dirtyIds.current.add(sale.id);
                        }
                    });
                    if (hasVisibilityRepairs) {
                        visibilityRepairedSales.forEach((sale: CarSale) => {
                            if (isMercedesB200Sale(sale)) {
                                dirtyIds.current.add(sale.id);
                            }
                        });
                    }
                    await persistDirtyIds(dirtyIds.current);
                    await Preferences.set({ key: scopedSalesKey, value: JSON.stringify(visibilityRepairedSales) });
                    localStorage.setItem(scopedSalesKey, JSON.stringify(visibilityRepairedSales));
                }
                setSales(visibilityRepairedSales.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)));

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
                const scopedSalesKey = getSalesStorageKey(prof);
                const { value: s } = await Preferences.get({ key: scopedSalesKey });
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

        if (profilesChanged) {
            setAvailableProfiles(normalizedProfiles);
            Preferences.set({ key: 'available_profiles', value: JSON.stringify(normalizedProfiles) });
            if (supabaseUrl && supabaseKey) {
                syncProfilesToCloud(normalizedProfiles);
            }
        }
    }, [sales, availableProfiles, supabaseUrl, supabaseKey, normalizeProfiles]);

    useEffect(() => {
        if (!userProfile || !supabaseUrl || !supabaseKey) return;
        const syncOnLogin = async () => {
            const scopedSalesKey = getSalesStorageKey(userProfile);
            const { value } = await Preferences.get({ key: scopedSalesKey });
            const localSales = value ? JSON.parse(value) : salesRef.current;
            performAutoSync(supabaseUrl, supabaseKey, userProfile, localSales);
        };
        syncOnLogin();
    }, [userProfile, supabaseUrl, supabaseKey]);

    useEffect(() => {
        if (!userProfile || !supabaseUrl || !supabaseKey) return;
        const timer = window.setInterval(() => {
            if (!isFormOpenRef.current) {
                void performAutoSync(supabaseUrl, supabaseKey, userProfile);
            }
        }, 5000);
        return () => window.clearInterval(timer);
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
                const scopedSalesKey = getSalesStorageKey(userProfile || localStorage.getItem(SESSION_PROFILE_STORAGE_KEY));
                const { value } = await Preferences.get({ key: scopedSalesKey });
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

            const syncedDirtyIds = new Set<string>();
            if (salesRes.success) {
                const failedIds = new Set(salesRes.failedIds || []);
                dirtyItems.forEach(s => {
                    if (!failedIds.has(s.id)) {
                        syncedDirtyIds.add(s.id);
                    }
                });
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
                    const uniqueSales = Array.from(mergedById.values());

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
                    const scopedSalesKey = getSalesStorageKey(profile);
                    await Preferences.set({ key: scopedSalesKey, value: JSON.stringify(normalizedSales) });
                    localStorage.setItem(scopedSalesKey, JSON.stringify(normalizedSales));

                    if (syncedDirtyIds.size > 0) {
                        syncedDirtyIds.forEach((id) => dirtyIds.current.delete(id));
                        await persistDirtyIds(dirtyIds.current);
                    }
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
            const isCreate = index < 0;

            console.info('[sale.save] submitting payload', {
                mode: isCreate ? 'create' : 'update',
                id: sale.id,
                brand: sale.brand,
                model: sale.model,
                status: sale.status,
                soldBy: sale.soldBy,
                sellerName: sale.sellerName
            });

            const sessionSellerId = normalizeProfileName(userProfile || 'Unknown');
            const sellerLabel = profileOptions.find(p => p.id === sessionSellerId)?.label || sessionSellerId;
            const sellerFromSession = {
                soldBy: sessionSellerId,
                sellerName: sellerLabel
            };

            const deriveSellerFieldsForCreate = (input: Partial<CarSale>) => {
                if (!isAdmin) {
                    return {
                        soldBy: sessionSellerId,
                        sellerName: sellerLabel
                    };
                }
                const resolvedSoldBy = resolveSoldBy(input, sessionSellerId);
                return {
                    soldBy: resolvedSoldBy,
                    sellerName: profileOptions.find(p => p.id === resolvedSoldBy)?.label || input.sellerName || resolvedSoldBy
                };
            };

            if (index >= 0) {
                // UPDATE
                const currentSale = currentSales[index];
                const merged = isAdmin
                    ? sale
                    : { ...sale, soldBy: currentSale.soldBy, sellerName: currentSale.sellerName, shippingName: currentSale.shippingName || '', shippingDate: currentSale.shippingDate || '' };
                newSales = [...currentSales];
                newSales[index] = { ...currentSale, ...merged };
                await logAuditEvent({
                    actionType: 'UPDATE',
                    entityType: 'sale',
                    entityId: sale.id,
                    beforeData: currentSale,
                    afterData: newSales[index],
                    pageContext: 'sale_form'
                });
            } else {
                // CREATE
                const created = isAdmin ? sale : { ...sale, ...sellerFromSession, shippingName: '', shippingDate: '' };
                const finalized = { ...created, ...deriveSellerFieldsForCreate(created) };
                newSales = [...currentSales, finalized];
                await logAuditEvent({
                    actionType: 'CREATE',
                    entityType: 'sale',
                    entityId: sale.id,
                    afterData: finalized,
                    pageContext: 'sale_form'
                });
            }

            const saveResult = await updateSalesAndSave(newSales);
            if (!saveResult.success) {
                console.error('[sale.save] failed', {
                    id: sale.id,
                    error: saveResult.error
                });
                return { success: false, error: saveResult.error || 'Sync failed.' };
            }
            console.info('[sale.save] success', { id: sale.id, mode: isCreate ? 'create' : 'update' });
            return { success: true };
        } catch (e) {
            console.error("Save Error", e);
            return { success: false, error: 'Error saving sale.' };
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        const loadTheme = async () => {
            const { value } = await Preferences.get({ key: 'theme_mode' });
            const stored = value || localStorage.getItem('theme_mode') || 'light';
            applyTheme(stored === 'dark' ? 'dark' : 'light');
        };
        loadTheme();
    }, [applyTheme]);

    useEffect(() => {
        if (view === 'record') setAuditPage(0);
    }, [view]);

    useEffect(() => {
        if (!isRecordAdmin || view !== 'record' || !supabaseUrl || !supabaseKey) return;
        const loadAuditLogs = async () => {
            setIsLoadingAudit(true);
            try {
                const client = createSupabaseClient(supabaseUrl, supabaseKey);
                const from = auditPage * 200;
                const to = from + 199;
                const { data, error } = await client
                    .from('audit_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(from, to);
                if (error) {
                    console.error('Audit load failed', error);
                    return;
                }
                setAuditLogs(data || []);
            } finally {
                setIsLoadingAudit(false);
            }
        };
        loadAuditLogs();
        const interval = window.setInterval(() => { void loadAuditLogs(); }, 10000);
        return () => window.clearInterval(interval);
    }, [auditPage, isRecordAdmin, view, supabaseUrl, supabaseKey]);

    useEffect(() => {
        if (!viewSaleModalItem) return;
        void logAuditEvent({
            actionType: 'VIEW',
            entityType: 'sale',
            entityId: viewSaleModalItem.id,
            afterData: { label: `${viewSaleModalItem.brand} ${viewSaleModalItem.model}`.trim(), vin: viewSaleModalItem.vin },
            pageContext: 'view_sale_modal'
        });
    }, [viewSaleModalItem, logAuditEvent]);

    useEffect(() => {
        if (!documentPreview) return;
        void logAuditEvent({
            actionType: 'PREVIEW',
            entityType: 'pdf_document',
            entityId: `${documentPreview.type}:${documentPreview.sale.id}`,
            afterData: { saleId: documentPreview.sale.id, documentType: documentPreview.type, vin: documentPreview.sale.vin },
            pageContext: 'documents'
        });
    }, [documentPreview, logAuditEvent]);

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
        const beforeData = { apiKey: '***', supabaseUrl, userProfile };
        await Preferences.set({ key: 'openai_api_key', value: apiKey.trim() });
        await Preferences.set({ key: 'supabase_url', value: supabaseUrl.trim() });
        await Preferences.set({ key: 'supabase_key', value: supabaseKey.trim() });
        await persistUserProfile((userProfile || '').trim());
        await logAuditEvent({
            actionType: 'UPDATE',
            entityType: 'settings',
            entityId: 'system',
            beforeData,
            afterData: { apiKey: '***', supabaseUrl: supabaseUrl.trim(), userProfile },
            pageContext: 'settings'
        });
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
                    await Preferences.remove({ key: getSalesStorageKey() });
                    localStorage.removeItem(getSalesStorageKey());
                    alert('All data has been deleted from local and database.');
                } catch (e) { console.error('Error clearing data', e); }
            }
        }
    };

    const openInvoice = (sale: CarSale, e: React.MouseEvent, withDogane = false, showBankOnly = false) => {
        e.stopPropagation();
        setDocumentPreview({ sale, type: 'invoice', withDogane, showBankOnly });
        void logAuditEvent({
            actionType: 'PREVIEW',
            entityType: 'pdf_invoice',
            entityId: sale.id,
            afterData: { file: `Invoice_${sale.vin || sale.id}.pdf`, withDogane, showBankOnly },
            pageContext: 'invoices',
            metadata: { action: 'PREVIEW' }
        });
    };


    const openPdfDocument = (
        sale: CarSale,
        type: 'invoice' | 'deposit' | 'full_marreveshje' | 'full_shitblerje',
        e: React.MouseEvent,
        withDogane = false,
        showBankOnly = false
    ) => {
        e.stopPropagation();
        setDocumentPreview({ sale, type, withDogane, showBankOnly });
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
            const canAccessOwnRecord = normalizedSoldBy === normalizedUser || normalizedSellerName === normalizedUser;
            if (!canAccessOwnRecord) return false;
        }


        if (activeCategory === 'SALES') {
            if (['Shipped', 'Inspection', 'Autosallon'].includes(s.status)) return false;
        } else {
            if (activeCategory === 'SHIPPED') {
                if (!isAdmin) return false;
                if (s.status !== 'Shipped') return false;
            }
            if (activeCategory === 'INSPECTIONS' && s.status !== 'Inspection') return false;
            if (activeCategory === 'AUTOSALLON') {
                if (!isAdmin) return false;
                if (s.status !== 'Autosallon') return false;
            }
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
    }), [sales, userProfile, activeCategory, deferredSearchTerm, sortBy, sortDir, isAdmin]);
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

    const transportSales = React.useMemo(
        () => filteredSales.filter((sale) => sale.status !== 'Completed' && sale.status !== 'Archived'),
        [filteredSales]
    );

    const transportClientPaidCount = React.useMemo(
        () => transportSales.filter((sale) => getClientTransportPaidStatus(sale) === 'PAID').length,
        [transportSales]
    );

    const balanceDueSales = React.useMemo(
        () => filteredSales
            .filter((sale) => calculateBalance(sale) > 0)
            .sort((a, b) => calculateBalance(b) - calculateBalance(a)),
        [filteredSales]
    );

    const updateTransportField = async (saleId: string, field: 'transportPaid' | 'paidToTransportusi', value: TransportPaymentStatus) => {
        const currentSales = salesRef.current;
        const index = currentSales.findIndex((sale) => sale.id === saleId);
        if (index === -1) return;
        const before = currentSales[index];
        if (field === 'transportPaid' && before.includeTransport) return;
        const updated = { ...before, [field]: value };
        const nextSales = [...currentSales];
        nextSales[index] = updated;
        dirtyIds.current.add(saleId);
        const result = await updateSalesAndSave(nextSales);
        if (!result.success) return;
        await logAuditEvent({
            actionType: 'UPDATE',
            entityType: 'sale_transport',
            entityId: saleId,
            beforeData: { [field]: before[field] },
            afterData: { [field]: value },
            pageContext: 'transport',
            metadata: { action: field === 'transportPaid' ? 'TRANSPORT_PAID_CHANGE' : 'PAID_TO_TRANSPORTUSI_CHANGE' }
        });
    };

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

    const groupedTransportSales = React.useMemo(() => {
        const groups: Record<string, CarSale[]> = {};
        transportSales.forEach((sale) => {
            const groupKey = sale.group?.trim() || 'Ungrouped';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(sale);
        });
        return groups;
    }, [transportSales]);

    const transportGroupOrder = React.useMemo(
        () => [...activeGroups.map((g) => g.name), ...(groupedTransportSales.Ungrouped?.length ? ['Ungrouped'] : [])],
        [activeGroups, groupedTransportSales]
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
                <div className="w-64 space-y-3">
                    <div className="h-4 rounded-xl luxury-skeleton" />
                    <div className="h-4 rounded-xl luxury-skeleton w-5/6" />
                    <div className="h-4 rounded-xl luxury-skeleton w-4/6" />
                </div>
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
        (() => {
            const activeCustomDashboardItems = customDashboards.filter((dashboard) => !dashboard.archived);
            const archivedCustomDashboardItems = customDashboards.filter((dashboard) => dashboard.archived);
            const mainNavItems = navItems.filter((item) => item.id !== 'SETTINGS');
            const salesGroupItems = mainNavItems.filter((item) => ['SALES', 'SHIPPED', 'AUTOSALLON'].includes(item.id));
            const operationsGroupItems = mainNavItems.filter((item) => ['INSPECTIONS', 'INVOICES'].includes(item.id));
            const financeControlGroupItems = mainNavItems.filter((item) => ['BALANCE_DUE', 'TRANSPORTI', 'RECORD'].includes(item.id));
            const pdfNavItem = mainNavItems.find((item) => item.id === 'PDF');
            const secondaryNavItems = navItems.filter((item) => item.id === 'SETTINGS');
            const combinedNavItems = [
                ...activeCustomDashboardItems.map<NavItem>((d) => ({ id: d.id, label: d.name, icon: FolderPlus, view: 'custom_dashboard' })),
                ...secondaryNavItems
            ];
            return (
        <div className="flex flex-col h-full bg-black text-slate-300">
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
                        className="ui-control w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-900 font-bold shadow-inner group-hover:scale-105 transition-transform">
                            {userProfile ? userProfile[0].toUpperCase() : 'U'}
                        </div>
                        <div className="flex-1 text-left overflow-hidden">
                            <div className="text-sm font-bold text-white truncate">{userProfile}</div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Switch Profile</div>
                        </div>
                        <ChevronUp className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors duration-150" />
                    </button>

                    {showProfileMenu && (
                        <div className="absolute top-full mt-2 left-0 right-0 bg-zinc-950 border border-zinc-800 rounded-2xl p-2 shadow-2xl z-[70] animate-in fade-in slide-in-from-top-2">
                            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wide px-3 py-2">Switch Profile</div>
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
                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${userProfile === p ? 'bg-zinc-800 text-white font-medium' : 'text-slate-300 hover:bg-zinc-900'}`}>
                                        <span>{p}</span>
                                        {userProfile === p && <CheckSquare className="w-4 h-4" />}
                                    </button>
                                ))}
                            </div>
                            <div className="h-px bg-zinc-800 my-2" />
                            <button onClick={quickAddProfile} className="w-full text-left px-3 py-2.5 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:pointer-events-none" disabled={!isAdmin}>
                                <Plus className="w-4 h-4" /> Add Profile
                            </button>
                            <div className="h-px bg-zinc-800 my-2" />
                            <button onClick={handleLogout} className="w-full text-left px-3 py-2.5 text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors duration-150">
                                <LogOut className="w-4 h-4" /> Log Out
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto scroll-container px-4 mt-4 pb-4">
                <div className="space-y-2">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5">
                        <button
                            type="button"
                            onClick={() => setIsSalesGroupOpen((prev) => !prev)}
                            className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-400 hover:bg-zinc-900 hover:text-white transition-colors duration-150"
                        >
                            <span>Sales Flow</span>
                            {isSalesGroupOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className={`grid overflow-hidden sidebar-group-panel ${isSalesGroupOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-50 mt-0'}`}>
                            <div className="min-h-0 space-y-1 px-1 pb-1">
                                {salesGroupItems.map((item) => {
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
                                            className={`ui-control sidebar-nav-item w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${isActive
                                                ? 'bg-zinc-100 text-black shadow-md shadow-black/20'
                                                : 'text-slate-300 hover:bg-zinc-900 hover:text-white'
                                                }`}
                                        >
                                            <item.icon className={`w-4 h-4 ${isActive ? 'text-slate-900' : 'text-slate-500'}`} />
                                            <span className="flex-1 text-left truncate">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5">
                        <button
                            type="button"
                            onClick={() => setIsOperationsGroupOpen((prev) => !prev)}
                            className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-400 hover:bg-zinc-900 hover:text-white transition-colors duration-150"
                        >
                            <span>Operations</span>
                            {isOperationsGroupOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className={`grid overflow-hidden sidebar-group-panel ${isOperationsGroupOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-50 mt-0'}`}>
                            <div className="min-h-0 space-y-1 px-1 pb-1">
                                {operationsGroupItems.map((item) => {
                                    if (item.adminOnly && !isAdmin) return null;
                                    const isActive = currentNavId === item.id;
                                    return (
                                        <React.Fragment key={item.id}>
                                            <button
                                                onClick={() => {
                                                    setView(item.view);
                                                    if (item.category) setActiveCategory(item.category as any);
                                                    setIsMobileMenuOpen(false);
                                                }}
                                                className={`ui-control sidebar-nav-item w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${isActive
                                                    ? 'bg-zinc-100 text-black shadow-md shadow-black/20'
                                                    : 'text-slate-300 hover:bg-zinc-900 hover:text-white'
                                                    }`}
                                            >
                                                <item.icon className={`w-4 h-4 ${isActive ? 'text-slate-900' : 'text-slate-500'}`} />
                                                <span className="flex-1 text-left truncate">{item.label}</span>
                                            </button>
                                            {item.id === 'INVOICES' && pdfNavItem && (!pdfNavItem.adminOnly || isAdmin) && (
                                                <button
                                                    onClick={() => {
                                                        setView(pdfNavItem.view);
                                                        if (pdfNavItem.category) setActiveCategory(pdfNavItem.category as any);
                                                        setIsMobileMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 ml-3 rounded-lg text-[11px] font-semibold transition-all ${currentNavId === pdfNavItem.id
                                                        ? 'bg-zinc-100 text-black shadow-md shadow-black/20'
                                                        : 'text-slate-300 hover:bg-zinc-900 hover:text-white'
                                                        }`}
                                                >
                                                    <pdfNavItem.icon className={`w-4 h-4 ${currentNavId === pdfNavItem.id ? 'text-slate-900' : 'text-slate-500'}`} />
                                                    <span className="flex-1 text-left truncate">{pdfNavItem.label}</span>
                                                </button>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5">
                        <button
                            type="button"
                            onClick={() => setIsFinanceGroupOpen((prev) => !prev)}
                            className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-400 hover:bg-zinc-900 hover:text-white transition-colors duration-150"
                        >
                            <span>Finance/Control</span>
                            {isFinanceGroupOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className={`grid overflow-hidden sidebar-group-panel ${isFinanceGroupOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-50 mt-0'}`}>
                            <div className="min-h-0 space-y-1 px-1 pb-1">
                                {financeControlGroupItems.map((item) => {
                                    if (item.adminOnly && !isAdmin) return null;
                                    const isActive = currentNavId === item.id;
                                    const badge = item.id === 'TRANSPORTI'
                                        ? `${transportClientPaidCount}/${transportSales.length}`
                                        : item.id === 'BALANCE_DUE'
                                            ? `${balanceDueSales.length}`
                                            : null;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                setView(item.view);
                                                if (item.category) setActiveCategory(item.category as any);
                                                setIsMobileMenuOpen(false);
                                            }}
                                            className={`ui-control sidebar-nav-item w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${isActive
                                                ? 'bg-zinc-100 text-black shadow-md shadow-black/20'
                                                : 'text-slate-300 hover:bg-zinc-900 hover:text-white'
                                                }`}
                                        >
                                            <item.icon className={`w-4 h-4 ${isActive ? 'text-slate-900' : 'text-slate-500'}`} />
                                            <span className="flex-1 text-left truncate">{item.label}</span>
                                            {badge && (
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-black/10 text-black' : 'bg-zinc-800 text-slate-300'}`}>
                                                    {badge}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1 pt-1">
                        {combinedNavItems.map((item) => {
                            if (item.adminOnly && !isAdmin) return null;
                            const isActive = currentNavId === item.id || (item.view === 'custom_dashboard' && activeCustomDashboardId === item.id);
                            const isCustomDashboardItem = item.view === 'custom_dashboard' && !navItems.some((navItem) => navItem.id === item.id);
                            return (
                                <div key={item.id} className="relative">
                                    <button
                                        onClick={() => {
                                            setView(item.view);
                                            if (item.category) setActiveCategory(item.category as any);
                                            if (item.view === 'custom_dashboard') setActiveCustomDashboardId(item.id);
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={`ui-control sidebar-nav-item w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${isActive
                                            ? 'bg-zinc-100 text-black shadow-md shadow-black/20'
                                            : 'text-slate-300 hover:bg-zinc-900 hover:text-white'
                                            }`}
                                    >
                                        <item.icon className={`w-4 h-4 ${isActive ? 'text-slate-900' : 'text-slate-500'}`} />
                                        <span className="flex-1 text-left truncate">{item.label}</span>
                                    </button>
                                    {isCustomDashboardItem && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setActiveCustomDashboardMenuId((prev) => (prev === item.id ? null : item.id));
                                                }}
                                                className="ui-control absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-zinc-900 text-slate-400"
                                                aria-label={`Dashboard options for ${item.label}`}
                                            >
                                                <MoreHorizontal className="w-4 h-4" />
                                            </button>
                                            {activeCustomDashboardMenuId === item.id && (
                                                <div className="absolute right-0 top-full mt-1 z-30 w-40 rounded-xl border border-zinc-700 bg-black shadow-2xl p-1">
                                                    <button onClick={() => handleArchiveCustomDashboard(item.id, true)} className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-zinc-900">Archive</button>
                                                    <button onClick={() => handleDeleteCustomDashboard(item.id)} className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-zinc-900">Delete</button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {archivedCustomDashboardItems.length > 0 && (
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setShowArchivedDashboards((prev) => !prev)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-slate-400"
                            >
                                <span>Archived Dashboards ({archivedCustomDashboardItems.length})</span>
                                {showArchivedDashboards ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {showArchivedDashboards && (
                                <div className="space-y-1 mt-1">
                                    {archivedCustomDashboardItems.map((dashboard) => (
                                        <div key={dashboard.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900">
                                            <Archive className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="flex-1 text-xs text-slate-300 truncate">{dashboard.name}</span>
                                            <button onClick={() => handleArchiveCustomDashboard(dashboard.id, false)} className="text-xs text-white px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800">Restore</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </nav>

            <div className="px-4 pb-4 pt-3 border-t border-slate-800 bg-slate-900/95 backdrop-blur sticky bottom-0 z-20">
                <div className="grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        title="Create"
                        aria-label="Create"
                        onClick={() => {
                            handleCreateCustomDashboard();
                            setIsMobileMenuOpen(false);
                        }}
                        className="ui-control h-11 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:border-slate-500 transition-colors inline-flex items-center justify-center"
                    >
                        <FolderPlus className="w-5 h-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => { const nextTheme = theme === 'dark' ? 'light' : 'dark'; applyTheme(nextTheme); void logAuditEvent({ actionType: 'UPDATE', entityType: 'theme', entityId: 'theme_mode', beforeData: { theme }, afterData: { theme: nextTheme }, pageContext: 'sidebar' }); }}
                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        className="ui-control h-11 rounded-xl border border-slate-700 bg-black text-white hover:border-slate-500 transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        <span className="text-[11px] font-semibold">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                    </button>
                    <button
                        type="button"
                        title="Settings"
                        aria-label="Settings"
                        onClick={() => {
                            setView('settings');
                            setIsMobileMenuOpen(false);
                        }}
                        className="ui-control h-11 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:border-slate-500 transition-colors inline-flex items-center justify-center"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </div>

        </div>
            );
        })()
    );

    return (
        <div
            data-page-shell="true"
            className={`flex h-[100dvh] w-full bg-white relative overflow-hidden font-sans text-slate-900 ${isTouchInputMode ? 'touch-input-mode' : ''}`}
            onPointerDownCapture={handleAppPointerDownCapture}
            onPointerMoveCapture={handleAppPointerMoveCapture}
            onPointerUpCapture={handleAppPointerUpCapture}
            onPointerCancelCapture={handleAppPointerUpCapture}
            onClickCapture={handleAppClickCapture}
        >
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
                        <button onClick={() => setSyncError('')} className="p-1 hover:bg-red-100 rounded-lg transition-colors duration-150"><X className="w-4 h-4 text-red-500" /></button>
                    </div>
                    <p className="text-xs font-mono text-red-600 break-words leading-relaxed">{syncError}</p>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className={`${forceMobileLayout ? 'hidden' : 'hidden md:flex'} flex-col bg-slate-900 text-white shadow-xl z-20 shrink-0 overflow-hidden transition-[width,opacity,transform] duration-200 ease-out will-change-[width,opacity,transform] origin-left ${isSidebarCollapsed ? 'w-0 -translate-x-2 opacity-0 pointer-events-none' : 'w-64 translate-x-0 opacity-100'}`}>
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

            <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden transition-[width] duration-200 ease-out">
                <header className={`backdrop-blur-xl border-b px-4 py-3 sticky top-0 z-40 transition-colors ${theme === 'dark'
                    ? 'bg-black/90 border-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
                    : 'bg-white/90 border-black/10 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'}`}>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsMobileMenuOpen(true)}
                                aria-label="Open navigation menu"
                                className={`ui-control p-2 -ml-2 rounded-xl transition-colors ${theme === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-slate-100 text-slate-600'} ${forceMobileLayout ? '' : 'md:hidden'}`}
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                            <button
                                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                                className={`ui-control p-2 -ml-2 rounded-xl transition-colors ${theme === 'dark' ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-slate-100 text-slate-600'} ${forceMobileLayout ? 'hidden' : 'hidden md:block'}`}
                                title={isSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
                                aria-label={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                            <h2 className={`text-lg font-bold hidden sm:flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                                {view === 'settings' ? 'Settings' : view === 'invoices' ? 'Invoices' : view === 'pdf_list' ? 'PDF' : view === 'transport' ? 'Transporti' : view === 'balance_due' ? 'Balance Due' : view === 'pdf_templates' ? 'PDF Templates' : activeCategory}
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${theme === 'dark' ? 'text-slate-300 bg-white/5 border-white/15' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                                    {filteredSales.length} {filteredSales.length === 1 ? 'car' : 'cars'}
                                </span>
                            </h2>
                        </div>

                        <div className={`flex-1 max-w-xl ${forceMobileLayout ? 'hidden' : 'hidden md:block'}`}>
                            <div className="relative group">
                                <Search className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${theme === 'dark' ? 'text-slate-500 group-focus-within:text-slate-300' : 'text-slate-400 group-focus-within:text-slate-600'}`} />
                                <input
                                    placeholder="Search sales..."
                                    aria-label="Search sales"
                                    className={`w-full rounded-2xl pl-11 pr-4 py-2 text-sm border transition-all outline-none ${theme === 'dark'
                                        ? 'bg-white/5 border-white/15 text-slate-100 placeholder:text-slate-500 focus:bg-white/10 focus:border-white/30 focus:ring-4 focus:ring-white/10'
                                        : 'bg-slate-100 border-transparent text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-900/5'}`}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => userProfile && performAutoSync(supabaseUrl, supabaseKey, userProfile)}
                                className={`ui-control p-2.5 rounded-xl transition-all ${isSyncing
                                    ? `${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'} animate-spin`
                                    : theme === 'dark'
                                        ? 'text-slate-400 hover:text-slate-100 hover:bg-white/10'
                                        : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
                                title="Sync Now"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>

                            <div className="flex gap-2">
                                <div className="relative hidden sm:block">
                                    <ArrowUpDown className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme === 'dark' ? 'text-slate-400' : 'text-slate-400'}`} />
                                    <select
                                        aria-label="Sort sales"
                                        value={sortBy}
                                        onChange={(e) => { setSortBy(e.target.value); if (e.target.value === 'nameAlphabetic') setSortDir('asc'); else setSortDir('desc'); }}
                                        className={`ui-control text-sm rounded-xl pl-9 pr-8 py-2.5 outline-none transition-all appearance-none cursor-pointer font-medium border ${theme === 'dark'
                                            ? 'bg-white/5 border-white/15 text-slate-100 focus:bg-white/10 focus:border-white/30'
                                            : 'bg-slate-100 border-transparent text-slate-700 focus:bg-white focus:border-slate-300'}`}
                                    >
                                        <option value="createdAt">Date Added</option>
                                        <option value="nameAlphabetic">Name (A-Z)</option>
                                        <option value="dueBalance">Balance (Client)</option>
                                        {isAdmin && <option value="koreaBalance">Balance (Korea)</option>}
                                        <option value="year">Year</option>
                                    </select>
                                    <ChevronDown className={`w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme === 'dark' ? 'text-slate-400' : 'text-slate-400'}`} />
                                </div>

                                <button
                                    onClick={() => openSaleForm(null)}
                                    aria-label="Create new sale"
                                    className={`ui-control px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 border ${theme === 'dark'
                                        ? 'bg-white text-black border-white hover:bg-slate-100 shadow-lg shadow-black/25'
                                        : 'bg-black text-white border-black hover:bg-slate-900 shadow-lg shadow-slate-900/20'}`}
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
                            <Search className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`} />
                            <input
                                placeholder="Search sales..."
                                aria-label="Search sales"
                                className={`ui-control w-full rounded-xl pl-11 pr-4 py-2.5 text-sm border transition-all outline-none ${theme === 'dark'
                                    ? 'bg-white/5 border-white/15 text-slate-100 placeholder:text-slate-500 focus:bg-white/10 focus:border-white/30'
                                    : 'bg-slate-100 border-transparent text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300'}`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                <main className={`flex-1 overflow-hidden bg-slate-50/70 p-2.5 md:p-6 flex flex-col relative min-h-0`}>
                    {view !== 'sale_form' && (
                        <>

                            {view === 'dashboard' ? (<>
                                <div
                                    ref={scrollContainerRef}
                                    className={`premium-card border border-slate-100 rounded-2xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] relative ${forceMobileLayout ? 'hidden' : 'hidden md:block'} overflow-auto scroll-container flex-1`}
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
                                                                            theme={theme}
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
                                                                        theme={theme}
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
                                                                                    theme={theme}
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
                                                        theme={theme}
                                                    />
                                                ))}
                                            </Reorder.Group>
                                        )}

                                        {/* Footer Totals */}
                                        <div className="bg-slate-50 font-bold border-t border-slate-200 sticky bottom-0 z-30 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                            <div className="p-3 text-right col-span-8 text-slate-600">Totals</div>
                                            {isAdmin && <div className="p-3 text-right font-mono text-slate-700">€{totalCost.toLocaleString()}</div>}
                                            <div className="p-3 text-right font-mono financial-positive-text">€{totalSold.toLocaleString()}</div>
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
                                                                                className={`mobile-car-row-compact flex items-center gap-1.5 sm:gap-2 relative z-10 transition-colors ${isSoldSale ? 'cars-sold-row' : ''} ${!isSoldSale ? 'touch-swipe-only-row' : ''}`}
                                                                                onPointerDown={(event) => handleMobileRowPointerDown(sale.id, event)}
                                                                                onPointerMove={(event) => handleMobileRowPointerMove(sale.id, event)}
                                                                                onPointerUp={() => handleMobileRowPointerEnd(sale.id)}
                                                                                onPointerCancel={() => handleMobileRowPointerEnd(sale.id)}
                                                                                onClick={() => handleMobileSaleClick(sale, isSoldSale)}
                                                                                onContextMenu={(e) => {
                                                                                    if (selectedIds.size > 0 && !isSoldSale) {
                                                                                        e.preventDefault();
                                                                                        toggleSelection(sale.id);
                                                                                    }
                                                                                }}
                                                                                style={{
                                                                                    touchAction: isTouchInputMode ? 'pan-y' : 'auto',
                                                                                    userSelect: isTouchInputMode ? 'none' : 'auto',
                                                                                    WebkitUserSelect: isTouchInputMode ? 'none' : 'auto',
                                                                                    WebkitTouchCallout: isTouchInputMode ? 'none' : 'default',
                                                                                    WebkitTapHighlightColor: isTouchInputMode ? 'transparent' : undefined,
                                                                                    backgroundColor: selectedIds.has(sale.id) && !isSoldSale ? '#f5f5f5' : '#ffffff'
                                                                                }}
                                                                            >
                                                                                {selectedIds.size > 0 && !isSoldSale && (
                                                                                    <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                                        {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                                    </div>
                                                                                )}

                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex justify-between items-start gap-2">
                                                                                        <div className="min-w-0">
                                                                                            <div className="font-semibold text-slate-900 text-[11px] sm:text-[12px] leading-tight truncate">{sale.brand} {sale.model}</div>
                                                                                            <div className="text-[8px] sm:text-[9px] text-slate-500 truncate">{sale.plateNumber || 'No plate'} • {sale.vin || 'No VIN'}</div>
                                                                                        </div>
                                                                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${sale.status === 'Completed' ? 'text-emerald-700' :
                                                                                            (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'text-slate-700' :
                                                                                                sale.status === 'Inspection' ? 'text-amber-700' :
                                                                                                    'text-slate-500'
                                                                                            }`}>{sale.status}</span>
                                                                                    </div>
                                                                                    <div className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] text-slate-600">
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
                                                                                                Korea {(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? 'Not Paid' : 'Paid'}
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
                                                                                        className={`mobile-car-row-compact flex items-center gap-1.5 sm:gap-2 relative z-10 transition-colors ${isSoldSale ? 'cars-sold-row' : ''} ${!isSoldSale ? 'touch-swipe-only-row' : ''}`}
                                                                                        onPointerDown={(event) => handleMobileRowPointerDown(sale.id, event)}
                                                                                        onPointerMove={(event) => handleMobileRowPointerMove(sale.id, event)}
                                                                                        onPointerUp={() => handleMobileRowPointerEnd(sale.id)}
                                                                                        onPointerCancel={() => handleMobileRowPointerEnd(sale.id)}
                                                                                        onClick={() => handleMobileSaleClick(sale, isSoldSale)}
                                                                                        onContextMenu={(e) => {
                                                                                            if (selectedIds.size > 0 && !isSoldSale) {
                                                                                                e.preventDefault();
                                                                                                toggleSelection(sale.id);
                                                                                            }
                                                                                        }}
                                                                                        style={{
                                                                                            touchAction: isTouchInputMode ? 'pan-y' : 'auto',
                                                                                            userSelect: isTouchInputMode ? 'none' : 'auto',
                                                                                            WebkitUserSelect: isTouchInputMode ? 'none' : 'auto',
                                                                                            WebkitTouchCallout: isTouchInputMode ? 'none' : 'default',
                                                                                            WebkitTapHighlightColor: isTouchInputMode ? 'transparent' : undefined,
                                                                                            backgroundColor: selectedIds.has(sale.id) && !isSoldSale ? '#f5f5f5' : '#ffffff'
                                                                                        }}
                                                                                    >
                                                                                        {selectedIds.size > 0 && !isSoldSale && (
                                                                                            <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                                                {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <div className="flex justify-between items-start">
                                                                                                <div className="font-bold text-slate-800 text-[13px] truncate pr-2">{sale.brand} {sale.model}</div>
                                                                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${sale.status === 'Completed' ? 'text-emerald-700' :
                                                                                                    (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'text-slate-700' :
                                                                                                        sale.status === 'Inspection' ? 'text-amber-700' :
                                                                                                            'text-slate-500'
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
                                                            className={`mobile-car-row-compact flex items-center gap-2 sm:gap-2.5 relative z-10 transition-colors ${isSoldSale ? 'cars-sold-row' : ''} ${!isSoldSale ? 'touch-swipe-only-row' : ''}`}
                                                            onPointerDown={(event) => handleMobileRowPointerDown(sale.id, event)}
                                                            onPointerMove={(event) => handleMobileRowPointerMove(sale.id, event)}
                                                            onPointerUp={() => handleMobileRowPointerEnd(sale.id)}
                                                            onPointerCancel={() => handleMobileRowPointerEnd(sale.id)}
                                                            onClick={() => handleMobileSaleClick(sale, isSoldSale)}
                                                            onContextMenu={(e) => {
                                                                if (selectedIds.size > 0 && !isSoldSale) {
                                                                    e.preventDefault();
                                                                    toggleSelection(sale.id);
                                                                }
                                                            }}
                                                            style={{
                                                                touchAction: isTouchInputMode ? 'pan-y' : 'auto',
                                                                userSelect: isTouchInputMode ? 'none' : 'auto',
                                                                WebkitUserSelect: isTouchInputMode ? 'none' : 'auto',
                                                                WebkitTouchCallout: isTouchInputMode ? 'none' : 'default',
                                                                WebkitTapHighlightColor: isTouchInputMode ? 'transparent' : undefined,
                                                                backgroundColor: selectedIds.has(sale.id) && !isSoldSale ? '#f5f5f5' : '#ffffff'
                                                            }}
                                                        >
                                                            {selectedIds.size > 0 && !isSoldSale && (
                                                                <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                    {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                </div>
                                                            )}

                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex justify-between items-start gap-2">
                                                                                        <div className="min-w-0">
                                                                                            <div className="font-semibold text-slate-900 text-[11px] sm:text-[12px] leading-tight truncate">{sale.brand} {sale.model}</div>
                                                                                            <div className="text-[8px] sm:text-[9px] text-slate-500 truncate">{sale.plateNumber || 'No plate'} • {sale.vin || 'No VIN'}</div>
                                                                                        </div>
                                                                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${sale.status === 'Completed' ? 'text-emerald-700' :
                                                                                            (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'text-slate-700' :
                                                                                                sale.status === 'Inspection' ? 'text-amber-700' :
                                                                                                    'text-slate-500'
                                                                                            }`}>{sale.status}</span>
                                                                                    </div>
                                                                                    <div className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] text-slate-600">
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
                                                                                                Korea {(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? 'Not Paid' : 'Paid'}
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
                            </> ) : view === 'custom_dashboard' ? (
                                <div className="flex-1 overflow-auto scroll-container p-3 md:p-5 bg-white rounded-2xl border border-slate-100 shadow-sm mx-4 my-2">
                                    {!activeCustomDashboard ? (
                                        <div className="text-center py-16">
                                            <p className="text-slate-500 mb-4">No custom dashboard selected.</p>
                                            <button onClick={handleCreateCustomDashboard} className="px-4 py-2 rounded-lg bg-slate-900 text-white">Create dashboard</button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <input value={activeCustomDashboard.name} onChange={(e) => patchActiveCustomDashboard((d) => ({ ...d, name: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 font-semibold" />
                                            <div className="flex gap-2">
                                                <button onClick={handleAddCustomDashboardColumn} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">Add Column</button>
                                                <button onClick={handleAddCustomDashboardRow} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-800 text-sm">Add Row</button>
                                            </div>
                                            <div className="overflow-auto border border-slate-200 rounded-xl">
                                                <table className="min-w-full text-sm">
                                                    <thead className="bg-slate-50"><tr>{activeCustomDashboard.columns.map((column, index) => (<th key={column.id} className="p-2 border-b border-slate-200"><div className="flex items-center gap-1"><input value={column.name} onChange={(e) => patchActiveCustomDashboard((d) => ({ ...d, columns: d.columns.map(c => c.id === column.id ? { ...c, name: e.target.value } : c) }))} className="w-full bg-white border border-slate-200 rounded px-2 py-1" /><button onClick={() => patchActiveCustomDashboard((d) => ({ ...d, columns: d.columns.filter(c => c.id !== column.id), rows: d.rows.map(r => { const nextCells = { ...r.cells }; delete nextCells[column.id]; return { ...r, cells: nextCells }; }) }))} className="text-red-500">×</button><button disabled={index===0} onClick={() => patchActiveCustomDashboard((d) => { const cols=[...d.columns]; [cols[index-1],cols[index]]=[cols[index],cols[index-1]]; return { ...d, columns: cols }; })}>↑</button><button disabled={index===activeCustomDashboard.columns.length-1} onClick={() => patchActiveCustomDashboard((d) => { const cols=[...d.columns]; [cols[index],cols[index+1]]=[cols[index+1],cols[index]]; return { ...d, columns: cols }; })}>↓</button></div></th>))}<th className="p-2 border-b border-slate-200">Actions</th></tr></thead>
                                                    <tbody>
                                                        {activeCustomDashboard.rows.map((row) => (
                                                            <tr key={row.id} className="border-b border-slate-100">
                                                                {activeCustomDashboard.columns.map((column) => (
                                                                    <td key={column.id} className="p-2"><input value={row.cells[column.id] || ''} onChange={(e) => patchActiveCustomDashboard((d) => ({ ...d, rows: d.rows.map(r => r.id === row.id ? { ...r, cells: { ...r.cells, [column.id]: e.target.value } } : r) }))} className="w-full bg-white border border-slate-200 rounded px-2 py-1" /></td>
                                                                ))}
                                                                <td className="p-2"><button onClick={() => patchActiveCustomDashboard((d) => ({ ...d, rows: d.rows.filter(r => r.id !== row.id) }))} className="text-red-500">Delete</button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : view === 'pdf_templates' ? (
                                <PdfTemplateBuilder
                                    templates={pdfTemplates}
                                    onChange={setPdfTemplates}
                                    onSave={savePdfTemplates}
                                    onAutoSave={() => { void savePdfTemplates(); }}
                                    saving={isSavingPdfTemplates}
                                />
                            ) : view === 'settings' ? (
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
                                        <button onClick={handleDeleteAll} className="w-full border border-red-200 text-red-600 py-2.5 md:py-3 rounded-xl hover:bg-red-50 transition-colors duration-150">Delete All Data</button>
                                    </div>
                                </div>
                            ) : view === 'record' ? (
                                !isRecordAdmin ? (
                                    <div className="w-full max-w-xl mx-auto bg-white p-6 rounded-2xl border border-slate-100">
                                        <h2 className="text-xl font-bold text-slate-900">Access denied</h2>
                                        <p className="text-slate-500 mt-2">Record tab is restricted to ROBERT.</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto scroll-container p-3 md:p-5 bg-white rounded-2xl border border-slate-100 shadow-sm mx-4 my-2">
                                        <h2 className="text-2xl font-black text-slate-900 mb-3">Record Timeline</h2>
                                        {isLoadingAudit ? (
                                            <p className="text-slate-500">Loading records...</p>
                                        ) : auditLogs.length === 0 ? (
                                            <p className="text-slate-500">No records found.</p>
                                        ) : (
                                            <>
                                            <div className="space-y-2">
                                                {auditLogs.map((log) => (
                                                    <div key={log.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                                                        <div className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()} • {log.actor_profile_name} ({log.actor_profile_id || 'unknown'}) • {log.action_type}</div>
                                                        <div className="text-sm font-semibold text-slate-800">{log.entity_type} / {log.entity_id}</div>
                                                        <details className="mt-2 text-xs text-slate-600">
                                                            <summary className="cursor-pointer">Before / After / Field Diff</summary>
                                                            <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify({ diff: log.field_changes, before: log.before_data, after: log.after_data, metadata: log.metadata, route: log.route, occurred_at: log.occurred_at }, null, 2)}</pre>
                                                        </details>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex items-center justify-end gap-2">
                                                <button onClick={() => setAuditPage((prev) => Math.max(0, prev - 1))} disabled={auditPage === 0 || isLoadingAudit} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-50">Previous</button>
                                                <span className="text-xs text-slate-500">Page {auditPage + 1}</span>
                                                <button onClick={() => setAuditPage((prev) => prev + 1)} disabled={isLoadingAudit || auditLogs.length < 200} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-50">Next</button>
                                            </div>
                                            </>
                                        )}
                                    </div>
                                )
                            ) : view === 'balance_due' ? (
                                <div className="flex-1 overflow-auto scroll-container p-3 md:p-5 bg-white rounded-2xl border border-slate-100 shadow-sm mx-4 my-2">
                                    <h2 className="text-2xl font-black text-slate-900 mb-1">Balance Due</h2>
                                    <p className="text-xs text-slate-500 mb-3">Cars that are not fully paid by client.</p>
                                    {balanceDueSales.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                                            No outstanding balances.
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                            <div className="grid grid-cols-[1.3fr_1fr_130px] gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 bg-slate-50 border-b border-slate-200">
                                                <div>Car</div>
                                                <div>VIN / Plate</div>
                                                <div className="text-right">Balance Due</div>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {balanceDueSales.map((sale) => (
                                                    <div key={sale.id} data-list-row="true" className="grid grid-cols-[1.3fr_1fr_130px] gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm">
                                                        <div className="font-semibold text-slate-900 truncate">{sale.brand} {sale.model}</div>
                                                        <div className="font-mono text-slate-600 truncate">{sale.plateNumber || '-'} / {(sale.vin || '-').slice(-8)}</div>
                                                        <div className="text-right font-bold text-red-600">€{calculateBalance(sale).toLocaleString()}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : view === 'transport' ? (
                                <div className="flex-1 overflow-auto scroll-container p-3 md:p-5 bg-white rounded-2xl border border-slate-100 shadow-sm mx-4 my-2">
                                    <h2 className="text-2xl font-black text-slate-900 mb-3">Transporti</h2>
                                    <div className="space-y-3">
                                        {transportGroupOrder.map((groupName) => {
                                            const groupSales = groupedTransportSales[groupName] || [];
                                            if (!groupSales.length) return null;
                                            const totalTransport = groupSales.reduce((sum, sale) => sum + (sale.transportCost || 0), 0);
                                            const clientPaid = groupSales.filter((sale) => getClientTransportPaidStatus(sale) === 'PAID').reduce((sum, sale) => sum + (sale.transportCost || 0), 0);
                                            const transportusiPaid = groupSales.filter((sale) => sale.paidToTransportusi === 'PAID').reduce((sum, sale) => sum + (sale.transportCost || 0), 0);
                                            return (
                                                <div key={groupName} className="rounded-2xl border border-slate-200 overflow-hidden">
                                                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-800">{groupName}</div>
                                                    <div className="divide-y divide-slate-100">
                                                        {groupSales.map((sale) => (
                                                            <div key={sale.id} data-list-row="true" className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_140px_190px] gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm">
                                                                <div className="font-semibold text-slate-900">{sale.brand} {sale.model}</div>
                                                                <div className="font-mono text-slate-600">{sale.plateNumber || '-'} / {(sale.vin || '-').slice(-8)}</div>
                                                                <select value={getClientTransportPaidStatus(sale)} onChange={(e) => updateTransportField(sale.id, 'transportPaid', e.target.value as TransportPaymentStatus)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold" disabled={sale.includeTransport} title={sale.includeTransport ? 'Auto-set from Transport: Yes' : 'Set client payment status'}>
                                                                    <option value="PAID">PAID</option>
                                                                    <option value="NOT PAID">NOT PAID</option>
                                                                </select>
                                                                <select value={sale.paidToTransportusi || 'NOT PAID'} onChange={(e) => updateTransportField(sale.id, 'paidToTransportusi', e.target.value as TransportPaymentStatus)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold">
                                                                    <option value="PAID">PAID</option>
                                                                    <option value="NOT PAID">NOT PAID</option>
                                                                </select>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 flex flex-wrap gap-3">
                                                        <span>Total Transport: €{totalTransport.toLocaleString()}</span>
                                                        <span>Client Paid: €{clientPaid.toLocaleString()} | Not Paid: €{(totalTransport - clientPaid).toLocaleString()}</span>
                                                        <span>Paid to Transportusi: €{transportusiPaid.toLocaleString()} | Not Paid: €{(totalTransport - transportusiPaid).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700">
                                        {(() => {
                                            const total = transportSales.reduce((sum, sale) => sum + (sale.transportCost || 0), 0);
                                            const clientPaid = transportSales.filter((sale) => getClientTransportPaidStatus(sale) === 'PAID').reduce((sum, sale) => sum + (sale.transportCost || 0), 0);
                                            const transportusiPaid = transportSales.filter((sale) => sale.paidToTransportusi === 'PAID').reduce((sum, sale) => sum + (sale.transportCost || 0), 0);
                                            return (
                                                <div className="flex flex-wrap gap-3">
                                                    <span>Overall Transport: €{total.toLocaleString()}</span>
                                                    <span>Client Paid: €{clientPaid.toLocaleString()} | Not Paid: €{(total - clientPaid).toLocaleString()}</span>
                                                    <span>Paid to Transportusi: €{transportusiPaid.toLocaleString()} | Not Paid: €{(total - transportusiPaid).toLocaleString()}</span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ) : view === 'invoices' || view === 'pdf_list' ? (
                                <div className="flex-1 overflow-auto scroll-container p-2 md:p-3 bg-white rounded-2xl border border-slate-100 shadow-sm mx-3 my-2">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 md:px-3 md:py-2">
                                        <div>
                                            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{view === 'pdf_list' ? 'PDF' : 'Invoices'}</h2>
                                            <p className="text-[11px] md:text-xs text-slate-500 mt-0.5">All sold cars grouped like Sold tab. Download includes only rows with bank paid amount.</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleAll(validInvoiceSales)}
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
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
                                                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-black/10 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 transition-all"
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
                                                                <div className="hidden md:grid grid-cols-[56px_1.35fr_minmax(120px,1fr)_110px_130px_130px_132px] gap-3 px-4 py-2.5 bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 border-b border-slate-200">
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
                                                                            className={`group relative grid grid-cols-[28px_minmax(0,1fr)_auto_auto_78px] md:grid-cols-[56px_1.35fr_minmax(120px,1fr)_110px_130px_130px_132px] gap-2 md:gap-3 items-center px-2 py-2 md:px-4 md:py-3 transition-colors ${isSelected ? 'bg-slate-50' : 'bg-white'}`}
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
                                                                                    <div className="mt-0.5 h-6 w-6 md:h-7 md:w-7 shrink-0 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center">
                                                                                        <FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                                                    </div>
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                                                                                            <span className="font-bold text-slate-900 text-xs md:text-sm leading-tight truncate">{s.brand} {s.model}</span>
                                                                                            <span className="text-[9px] md:text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-tighter">{s.year}</span>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1.5 md:gap-2 mt-1 flex-wrap">
                                                                                            <span className="text-[9px] md:text-[9px] font-mono text-slate-400 uppercase tracking-wider">VIN: {(s.vin || '').slice(-8)}</span>
                                                                                            <span className={`text-[9px] md:text-[9px] font-bold ${s.status === 'Completed' ? 'text-emerald-600' : 'text-slate-600'}`}>{s.status}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="hidden md:block text-xs md:text-sm font-semibold text-slate-700 truncate md:pr-2">
                                                                                <div className="truncate">{s.buyerName || '---'}</div>
                                                                            </div>

                                                                            <div className="text-center">
                                                                                <div className="text-[9px] md:hidden text-slate-400 font-bold uppercase tracking-tight">Transport</div>
                                                                                <select value={getClientTransportPaidStatus(s)} onChange={(e) => { e.stopPropagation(); updateTransportField(s.id, 'transportPaid', e.target.value as TransportPaymentStatus); }} className="rounded-md border border-slate-200 px-1.5 py-1 text-[10px] font-bold" disabled={s.includeTransport} title={s.includeTransport ? 'Auto-set from Transport: Yes' : 'Set client payment status'}>
                                                                                    <option value="PAID">PAID</option>
                                                                                    <option value="NOT PAID">NOT PAID</option>
                                                                                </select>
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
                                                                                {view === 'pdf_list' ? (
                                                                                    <div className="flex flex-wrap items-center justify-end gap-1">
                                                                                        <button onClick={(e) => openPdfDocument(s, 'full_shitblerje', e)} className="px-1.5 py-1 rounded-md border border-slate-300 text-[9px] font-bold text-slate-700 hover:bg-slate-100">Kontrata</button>
                                                                                        <button onClick={(e) => openPdfDocument(s, 'deposit', e)} className="px-1.5 py-1 rounded-md border border-slate-300 text-[9px] font-bold text-slate-700 hover:bg-slate-100">Deposite</button>
                                                                                        <button onClick={(e) => openPdfDocument(s, 'full_marreveshje', e)} className="px-1.5 py-1 rounded-md border border-slate-300 text-[9px] font-bold text-slate-700 hover:bg-slate-100">Marveshje</button>
                                                                                        <button onClick={(e) => openPdfDocument(s, 'invoice', e, false, true)} className="px-1.5 py-1 rounded-md bg-slate-900 text-[9px] font-bold text-white">Fatura</button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); openInvoice(s, e, false, true); }}
                                                                                        className="inline-flex items-center justify-center gap-1 px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg bg-slate-900 text-white min-w-[74px] md:min-w-[110px] text-[10px] md:text-[11px] font-bold transition-all shadow-sm active:scale-95"
                                                                                    >
                                                                                        <FileText className="w-3.5 h-3.5" />
                                                                                        <span className="uppercase tracking-wider">View</span>
                                                                                    </button>
                                                                                )}
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
                                                                    className="w-full px-3 py-2 text-left text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors duration-150"
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
                                                    <button onClick={() => { handleBulkMove('In Progress'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors duration-150">Sales</button>
                                                    <button onClick={() => { handleBulkMove('Shipped'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors duration-150">Shipped</button>
                                                    <button onClick={() => { handleBulkMove('Inspection'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors duration-150">Inspections</button>
                                                    <button onClick={() => { handleBulkMove('Autosallon'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors duration-150">Autosallon</button>
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
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors duration-150"
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
                                    currentProfile={userProfile}
                                    availableProfiles={profileOptions}
                                    existingSales={sales}
                                    pdfTemplates={pdfTemplates}
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
                pdfTemplates={pdfTemplates}
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
                    templates={pdfTemplates}
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
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pr-12 text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/20 transition-colors duration-150"
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
                                <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors duration-150">Cancel</button>
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
