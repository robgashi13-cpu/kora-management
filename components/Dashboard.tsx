'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition, useCallback, useDeferredValue } from 'react';
import { Attachment, CarSale, ContractType, SaleStatus, SellerAuditEntry, ShitblerjeOverrides } from '@/app/types';
import { Plus, Search, FileText, RefreshCw, Trash2, Copy, ArrowRight, CheckSquare, Square, X, Clipboard, GripVertical, Eye, EyeOff, LogOut, ChevronDown, ChevronUp, ArrowUpDown, Edit, FolderPlus, Archive, Download, Loader2, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';

import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { createRoot } from 'react-dom/client';
import { zip } from 'fflate';
import SaleModal from './SaleModal';
import EditShitblerjeModal from './EditShitblerjeModal';
import EditablePreviewModal from './EditablePreviewModal';
import ViewSaleModal from './ViewSaleModal';
import ProfileSelector from './ProfileSelector';
import InlineEditableCell from './InlineEditableCell';
import ContractDocument from './ContractDocument';
import InvoiceDocument from './InvoiceDocument';
import { addPdfFormFields, collectPdfTextFields, normalizePdfLayout, sanitizePdfCloneStyles, waitForImages } from './pdfUtils';
import { processImportedData } from '@/services/openaiService';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient, syncSalesWithSupabase, syncTransactionsWithSupabase } from '@/services/supabaseService';
import { createPasswordRecord, generateSetupToken } from '@/services/userAuth';

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
const REQUIRED_PROFILES = [ADMIN_PROFILE, 'Leonit'];

const normalizeProfileName = (name?: string | null) => {
    if (!name) return '';
    const trimmed = name.trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase() === LEGACY_ADMIN_PROFILE.toLowerCase() ? ADMIN_PROFILE : trimmed;
};

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

const normalizeGroupName = (name?: string | null) => {
    if (!name) return '';
    return name.trim();
};

const groupKeyForName = (name?: string | null) => normalizeGroupName(name).toLowerCase();

const normalizeGroupMetaList = (meta: GroupMeta[]) => {
    const normalized: GroupMeta[] = [];
    const indexByKey = new Map<string, number>();
    meta.forEach(group => {
        const name = normalizeGroupName(group.name);
        if (!name) return;
        const key = groupKeyForName(name);
        const existingIndex = indexByKey.get(key);
        if (existingIndex !== undefined) {
            const existing = normalized[existingIndex];
            normalized[existingIndex] = {
                ...existing,
                archived: existing.archived || group.archived,
                order: Math.min(existing.order, group.order)
            };
            return;
        }
        indexByKey.set(key, normalized.length);
        normalized.push({
            name,
            order: typeof group.order === 'number' ? group.order : normalized.length,
            archived: Boolean(group.archived)
        });
    });
    return normalized;
};

const mergeGroupMetaLists = (primary: GroupMeta[], secondary: GroupMeta[]) => {
    const merged: GroupMeta[] = [];
    const indexByKey = new Map<string, number>();
    const addGroup = (group: GroupMeta) => {
        const name = normalizeGroupName(group.name);
        if (!name) return;
        const key = groupKeyForName(name);
        const existingIndex = indexByKey.get(key);
        if (existingIndex !== undefined) {
            const existing = merged[existingIndex];
            merged[existingIndex] = {
                ...existing,
                archived: existing.archived || group.archived
            };
            return;
        }
        indexByKey.set(key, merged.length);
        merged.push({
            name,
            order: typeof group.order === 'number' ? group.order : merged.length,
            archived: Boolean(group.archived)
        });
    };
    normalizeGroupMetaList(primary).sort((a, b) => a.order - b.order).forEach(addGroup);
    normalizeGroupMetaList(secondary).sort((a, b) => a.order - b.order).forEach(addGroup);
    return merged;
};

const ensureGroupMetaIncludesNames = (meta: GroupMeta[], names: string[]) => {
    const next = [...meta];
    const keys = new Set(next.map(group => groupKeyForName(group.name)));
    names.forEach(name => {
        const normalized = normalizeGroupName(name);
        if (!normalized) return;
        const key = groupKeyForName(normalized);
        if (keys.has(key)) return;
        keys.add(key);
        next.push({ name: normalized, order: next.length, archived: false });
    });
    return next;
};

const serializeGroupMeta = (meta: GroupMeta[]) => JSON.stringify(
    normalizeGroupMetaList(meta).sort((a, b) => a.order - b.order)
);

type UserStatus = 'active' | 'pending';

type UserAccount = {
    id: string;
    name: string;
    email?: string;
    status: UserStatus;
    setupToken?: string | null;
    setupTokenCreatedAt?: string | null;
    passwordHash?: string | null;
    passwordSalt?: string | null;
    createdAt: string;
    createdBy?: string;
};

const scoreUserAccount = (account: UserAccount) => {
    let score = 0;
    if (account.status === 'active') score += 3;
    if (account.passwordHash) score += 3;
    if (account.setupToken) score += 1;
    if (account.email) score += 1;
    if (account.createdAt) score += 1;
    return score;
};

const choosePreferredAccount = (current: UserAccount, candidate: UserAccount) => {
    const currentScore = scoreUserAccount(current);
    const candidateScore = scoreUserAccount(candidate);
    if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
    const currentDate = current.createdAt ? Date.parse(current.createdAt) : 0;
    const candidateDate = candidate.createdAt ? Date.parse(candidate.createdAt) : 0;
    return candidateDate > currentDate ? candidate : current;
};

const mergeUserAccounts = (local: UserAccount[], remote: UserAccount[]) => {
    const merged = new Map<string, UserAccount>();
    [...local, ...remote].forEach(account => {
        const normalizedName = normalizeProfileName(account.name);
        if (!normalizedName) return;
        const existing = merged.get(normalizedName);
        const nextAccount = { ...account, name: normalizedName };
        if (!existing) {
            merged.set(normalizedName, nextAccount);
        } else {
            merged.set(normalizedName, choosePreferredAccount(existing, nextAccount));
        }
    });
    return Array.from(merged.values());
};

const userAccountSignature = (accounts: UserAccount[]) => JSON.stringify(
    [...accounts]
        .map(account => ({
            ...account,
            name: normalizeProfileName(account.name)
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
);

type SellerReassignmentAudit = {
    id: string;
    saleId: string;
    changedAt: string;
    changedBy: string;
    fromSeller?: string;
    toSeller?: string;
};

const SortableSaleItem = React.memo(function SortableSaleItem({ s, openInvoice, toggleSelection, isSelected, userProfile, canViewPrices, onClick, onDelete, onInlineUpdate, onRemoveFromGroup, onReassignSeller, onRestore }: any) {
    const controls = useDragControls();
    const isAdmin = userProfile === ADMIN_PROFILE;
    const canEdit = isAdmin || s.soldBy === userProfile;
    const statusClass = s.status === 'Completed' ? 'status-completed' :
        s.status === 'Archived' ? 'status-archived' :
        (s.status === 'In Progress' || s.status === 'Autosallon') ? 'status-in-progress' :
        s.status === 'New' ? 'status-new' :
        s.status === 'Shipped' ? 'status-shipped' :
        s.status === 'Inspection' ? 'status-inspection' :
        'bg-slate-100 text-slate-500';

    const handleFieldUpdate = async (field: keyof CarSale, value: string | number) => {
        if (onInlineUpdate) {
            await onInlineUpdate(s.id, field, value);
        }
    };

    return (
        <Reorder.Item value={s} id={s.id} className="contents group table-row-hover table-row-compact">
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
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${calculateBalance(s) > 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                        Bal: €{calculateBalance(s).toLocaleString()}
                    </span>
                </div>}
                <div className="absolute top-4 left-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-transparent hover:border-slate-400'}`}>
                        <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* 1. Checkbox Column */}
            <div className="px-1 h-full flex items-center justify-center relative border-r border-slate-100 z-10 bg-white">
                <div className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5" onPointerDown={(e) => controls.start(e)}>
                    <GripVertical className="w-3 h-3 text-slate-400" />
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleSelection(s.id); }}
                    className={`w-4 h-4 border rounded flex items-center justify-center transition-all cursor-pointer relative z-20 ${isSelected ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 bg-transparent hover:border-slate-500 hover:bg-slate-50'}`}
                >
                    {isSelected && <CheckSquare className="w-3 h-3" />}
                </button>
            </div>

            {/* 2. Car Info */}
            <div className="px-2 h-full flex items-center font-semibold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis border-r border-slate-100 bg-white min-w-0">
                <button
                    type="button"
                    onClick={onClick}
                    className="inline-flex items-center min-w-0 max-w-full truncate whitespace-nowrap text-left leading-tight hover:text-slate-700 transition-colors text-[11px] xl:text-xs"
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
                <div className="px-2 h-full flex items-center justify-end font-mono text-emerald-700 font-bold border-r border-slate-100 bg-white text-[11px] xl:text-xs">
                    {canEdit ? (
                        <InlineEditableCell value={s.soldPrice || 0} onSave={(v) => handleFieldUpdate('soldPrice', v)} type="number" prefix="€" className="text-emerald-700 font-bold" />
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
                    <span className={`px-2 py-0.5 rounded-full text-[11px] xl:text-xs font-bold ${calculateBalance(s) > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
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
                    <span className={`text-[10px] xl:text-[11px] uppercase font-bold whitespace-nowrap px-2 py-0.5 rounded-full ${(s.costToBuy || 0) - (s.amountPaidToKorea || 0) > 0 ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-emerald-100 text-emerald-700 border border-emerald-300'}`}>
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
                        <span className="text-[9px] xl:text-[10px] uppercase font-bold whitespace-nowrap px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
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
                {s.status === 'Archived' && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRestore?.(s.id); }}
                        className="text-slate-500 hover:text-slate-900 transition-colors p-1.5 hover:bg-slate-100 rounded-lg"
                        title="Restore from archive"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                )}
                {s.group && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemoveFromGroup?.(s.id); }}
                        className="text-slate-500 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded-lg"
                        title="Remove from group"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
                {isAdmin && s.status === 'Completed' && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onReassignSeller?.(s); }}
                        className="text-slate-500 hover:text-slate-900 transition-colors p-1.5 hover:bg-slate-100 rounded-lg"
                        title="Reassign seller"
                    >
                        <ArrowRightLeft className="w-4 h-4" />
                    </button>
                )}
                <button onClick={(e) => openInvoice(s, e)} className="text-slate-600 hover:text-slate-900 transition-colors p-1.5 hover:bg-slate-100 rounded-lg" title="View Invoice">
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

export default function Dashboard() {
    const dirtyIds = useRef<Set<string>>(new Set());
    const [, startTransition] = useTransition();
    const [sales, setSales] = useState<CarSale[]>([]);
    const salesRef = useRef(sales);
    useEffect(() => { salesRef.current = sales; }, [sales]);
    const [view, setView] = useState('profile_select');
    const [userProfile, setUserProfile] = useState<string | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<string[]>(['Robert Gashi', ADMIN_PROFILE, 'User', 'Leonit']);
    const [isLoading, setIsLoading] = useState(true);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [pendingProfile, setPendingProfile] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [newProfileName, setNewProfileName] = useState('');
    const [newProfileEmail, setNewProfileEmail] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [rememberProfile, setRememberProfile] = useState(false);

    const canViewPrices = userProfile === ADMIN_PROFILE;
    const isAdmin = userProfile === ADMIN_PROFILE;

    const [sortBy, setSortBy] = useState<string>('createdAt');

    useEffect(() => {
        if (!isAdmin && (sortBy === 'koreaBalance' || sortBy === 'costToBuy')) {
            setSortBy('createdAt');
        }
    }, [isAdmin, sortBy]);

    const [activeCategory, setActiveCategory] = useState<SaleStatus | 'SALES' | 'INVOICES' | 'SHIPPED' | 'INSPECTIONS' | 'AUTOSALLON' | 'ARCHIVE'>('SALES');
    const [editingSale, setEditingSale] = useState<CarSale | null>(null);
    const [pendingEditingSaleId, setPendingEditingSaleId] = useState<string | null>(null);
    const [pendingViewSaleId, setPendingViewSaleId] = useState<string | null>(null);
    const [pendingNewSaleDraft, setPendingNewSaleDraft] = useState(false);
    const [editChoiceSale, setEditChoiceSale] = useState<CarSale | null>(null);
    const [editChoiceReturnView, setEditChoiceReturnView] = useState('dashboard');
    const [editShitblerjeSale, setEditShitblerjeSale] = useState<CarSale | null>(null);
    const [viewSaleRecord, setViewSaleRecord] = useState<CarSale | null>(null);
    const [formReturnView, setFormReturnView] = useState('dashboard');
    const [activeGroupMoveMenu, setActiveGroupMoveMenu] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [groupMeta, setGroupMeta] = useState<GroupMeta[]>([]);
    const groupMetaRef = useRef<GroupMeta[]>([]);
    const [groupViewEnabled, setGroupViewEnabled] = useState(true);
    const hasInitializedGroups = useRef(false);
    const [documentPreview, setDocumentPreview] = useState<{
        sale: CarSale;
        type: 'invoice' | 'deposit' | 'full_marreveshje' | 'full_shitblerje';
        withDogane?: boolean;
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
    const [pullY, setPullY] = useState(0);
    const [profileAvatars, setProfileAvatars] = useState<Record<string, string>>({});
    const [showMoveMenu, setShowMoveMenu] = useState(false);
    const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
    const userAccountsRef = useRef<UserAccount[]>([]);
    const [pendingSetupToken, setPendingSetupToken] = useState<string | null>(null);
    const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
    const [setupPassword, setSetupPassword] = useState('');
    const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
    const [setupError, setSetupError] = useState('');
    const [setupSuccess, setSetupSuccess] = useState('');
    const [showSetupLinkModal, setShowSetupLinkModal] = useState(false);
    const [setupLinkData, setSetupLinkData] = useState<{ token: string; url: string; name: string } | null>(null);
    const [showSellerReassignModal, setShowSellerReassignModal] = useState(false);
    const [sellerReassignSale, setSellerReassignSale] = useState<CarSale | null>(null);
    const [sellerReassignTarget, setSellerReassignTarget] = useState('');
    const isFormOpen = view === 'sale_form';
    const isFormOpenRef = React.useRef(isFormOpen);

    useEffect(() => {
        groupMetaRef.current = groupMeta;
    }, [groupMeta]);

    useEffect(() => {
        userAccountsRef.current = userAccounts;
    }, [userAccounts]);

    const normalizeProfiles = useCallback((profiles: string[]) => {
        const normalized = profiles.map(p => normalizeProfileName(p)).filter(Boolean);
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

    const normalizeUserAccounts = useCallback((accounts: UserAccount[]) => {
        const normalized = accounts
            .map(account => ({
                ...account,
                name: normalizeProfileName(account.name),
                status: account.status || 'pending'
            }))
            .filter(account => account.name);
        const unique = new Map<string, UserAccount>();
        normalized.forEach(account => {
            if (!unique.has(account.name)) {
                unique.set(account.name, account);
            }
        });
        return Array.from(unique.values());
    }, []);

    const getUserAccount = useCallback((name: string) => {
        const normalized = normalizeProfileName(name);
        return userAccounts.find(account => account.name === normalized);
    }, [userAccounts]);

    const persistUserAccounts = useCallback(async (accounts: UserAccount[]) => {
        const normalized = normalizeUserAccounts(accounts);
        setUserAccounts(normalized);
        await Preferences.set({ key: 'user_accounts', value: JSON.stringify(normalized) });
        if (supabaseUrl && supabaseKey) {
            try {
                const client = createClient(supabaseUrl, supabaseKey);
                await client.from('sales').upsert({
                    id: 'config_user_accounts',
                    brand: 'CONFIG',
                    model: 'USERS',
                    status: 'Completed',
                    year: new Date().getFullYear(),
                    km: 0,
                    cost_to_buy: 0,
                    sold_price: 0,
                    amount_paid_cash: 0,
                    amount_paid_bank: 0,
                    deposit: 0,
                    attachments: { users: normalized }
                });
            } catch (e) {
                console.error('User account sync error', e);
            }
        }
        return normalized;
    }, [normalizeUserAccounts, supabaseKey, supabaseUrl]);

    const cacheUserAccounts = useCallback(async (accounts: UserAccount[]) => {
        setUserAccounts(accounts);
        await Preferences.set({ key: 'user_accounts', value: JSON.stringify(accounts) });
    }, []);

    const buildSetupLink = useCallback((token: string) => {
        if (typeof window === 'undefined') return token;
        const url = new URL(window.location.href);
        url.searchParams.set('setupToken', token);
        return url.toString();
    }, []);

    const normalizeSaleProfiles = useCallback((sale: CarSale) => ({
        ...sale,
        sellerName: normalizeProfileName(sale.sellerName),
        soldBy: normalizeProfileName(sale.soldBy)
    }), []);

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

    const handleSaleClick = (sale: CarSale) => {
        if (sale.status === 'Completed') {
            setViewSaleRecord(sale);
            return;
        }
        if (!isAdmin && sale.soldBy !== userProfile) {
            setViewSaleRecord(sale);
            return;
        }
        requestEditChoice(sale);
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
    }, [supabaseUrl, supabaseKey, userProfile]);

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

    useEffect(() => {
        if (!supabaseUrl || !supabaseKey) return;

        const syncUsersFromCloud = async () => {
            try {
                const client = createClient(supabaseUrl, supabaseKey);
                const { data, error } = await client
                    .from('sales')
                    .select('attachments')
                    .eq('id', 'config_user_accounts')
                    .maybeSingle();
                if (error) {
                    console.error('User account cloud sync error', error);
                    return;
                }
                if (!data?.attachments?.users || !Array.isArray(data.attachments.users)) return;
                const cloudUsers: UserAccount[] = normalizeUserAccounts(data.attachments.users);
                const localUsers = userAccountsRef.current;
                const mergedUsers = mergeUserAccounts(localUsers, cloudUsers);
                const mergedSignature = userAccountSignature(mergedUsers);
                const cloudSignature = userAccountSignature(cloudUsers);
                if (cloudUsers.length === 0 && localUsers.length > 0) {
                    if (isAdmin) {
                        await persistUserAccounts(mergedUsers);
                    } else {
                        await cacheUserAccounts(mergedUsers);
                    }
                    return;
                }
                if (isAdmin) {
                    await cacheUserAccounts(mergedUsers);
                    if (mergedSignature !== cloudSignature) {
                        await persistUserAccounts(mergedUsers);
                    }
                    return;
                }

                const normalizedProfile = normalizeProfileName(userProfile || '');
                const filteredUsers = mergedUsers.filter(account => (
                    (normalizedProfile && account.name === normalizedProfile) ||
                    (pendingSetupToken && account.setupToken === pendingSetupToken)
                ));
                if (filteredUsers.length > 0) {
                    await cacheUserAccounts(filteredUsers);
                    return;
                }
                if (userAccountsRef.current.length === 0 && mergedUsers.length > 0) {
                    await cacheUserAccounts(mergedUsers);
                }
            } catch (e) {
                console.error('User account cloud sync error', e);
            }
        };

        if (!isAdmin && !userProfile && !pendingSetupToken) return;
        syncUsersFromCloud();
        const interval = setInterval(syncUsersFromCloud, 30000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncUsersFromCloud();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [cacheUserAccounts, isAdmin, normalizeUserAccounts, pendingSetupToken, supabaseKey, supabaseUrl, userProfile]);

    useEffect(() => {
        if (!supabaseUrl || !supabaseKey) return;

        const syncGroupsFromCloud = async () => {
            try {
                const client = createClient(supabaseUrl, supabaseKey);
                const { data } = await client.from('sales').select('attachments').eq('id', 'config_group_meta').single();
                const cloudGroups = Array.isArray(data?.attachments?.groups) ? (data?.attachments?.groups as GroupMeta[]) : [];
                const localMeta = groupMetaRef.current || [];
                const groupNamesFromSales = Array.from(new Set(
                    salesRef.current
                        .map(sale => normalizeGroupName(sale.group))
                        .filter(Boolean)
                ));
                const merged = ensureGroupMetaIncludesNames(
                    mergeGroupMetaLists(cloudGroups, localMeta),
                    groupNamesFromSales
                );
                const mergedSignature = serializeGroupMeta(merged);
                const localSignature = serializeGroupMeta(localMeta);
                const cloudSignature = serializeGroupMeta(cloudGroups);
                if (mergedSignature !== localSignature) {
                    await persistGroupMeta(merged, { skipCloud: true });
                }
                if (mergedSignature !== cloudSignature) {
                    await syncGroupMetaToCloud(merged);
                }
            } catch (e) {
                console.error('Group meta cloud sync error', e);
            }
        };

        syncGroupsFromCloud();
        const interval = setInterval(syncGroupsFromCloud, 30000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncGroupsFromCloud();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [supabaseUrl, supabaseKey]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [touchStartY, setTouchStartY] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const uiStateHydrated = useRef(false);
    const selectionHydrated = useRef(false);
    const uiStateKey = 'dashboard_ui_state_v1';
    const selectionKey = 'dashboard_selected_ids_v1';
    const uiStateViewRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const raw = window.localStorage.getItem(uiStateKey);
        if (!raw) {
            uiStateHydrated.current = true;
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed.view === 'string') {
                uiStateViewRef.current = parsed.view;
                setView(parsed.view);
            }
            if (parsed.activeCategory) setActiveCategory(parsed.activeCategory);
            if (typeof parsed.searchTerm === 'string') setSearchTerm(parsed.searchTerm);
            if (typeof parsed.sortBy === 'string') setSortBy(parsed.sortBy);
            if (parsed.sortDir === 'asc' || parsed.sortDir === 'desc') setSortDir(parsed.sortDir);
            if (typeof parsed.groupViewEnabled === 'boolean') setGroupViewEnabled(parsed.groupViewEnabled);
            if (Array.isArray(parsed.expandedGroups)) setExpandedGroups(parsed.expandedGroups);
            if (typeof parsed.editingSaleId === 'string') setPendingEditingSaleId(parsed.editingSaleId);
            if (typeof parsed.viewSaleRecordId === 'string') setPendingViewSaleId(parsed.viewSaleRecordId);
            if (typeof parsed.pendingNewSaleDraft === 'boolean') setPendingNewSaleDraft(parsed.pendingNewSaleDraft);
            if (typeof parsed.formReturnView === 'string') setFormReturnView(parsed.formReturnView);
        } catch (e) {
            console.warn('Failed to restore dashboard UI state', e);
        } finally {
            uiStateHydrated.current = true;
        }
    }, []);

    useEffect(() => {
        if (!uiStateHydrated.current || typeof window === 'undefined') return;
        const payload = {
            view,
            activeCategory,
            searchTerm,
            sortBy,
            sortDir,
            groupViewEnabled,
            expandedGroups,
            editingSaleId: editingSale?.id || null,
            viewSaleRecordId: viewSaleRecord?.id || null,
            pendingNewSaleDraft: view === 'sale_form' && !editingSale?.id,
            formReturnView
        };
        window.localStorage.setItem(uiStateKey, JSON.stringify(payload));
    }, [activeCategory, searchTerm, sortBy, sortDir, groupViewEnabled, expandedGroups, view, editingSale, viewSaleRecord, formReturnView]);

    useEffect(() => {
        if (selectionHydrated.current || typeof window === 'undefined') return;
        if (sales.length === 0) return;
        const raw = window.localStorage.getItem(selectionKey);
        if (!raw) {
            selectionHydrated.current = true;
            return;
        }
        try {
            const parsed = JSON.parse(raw) as string[];
            const validIds = parsed.filter(id => sales.some(s => s.id === id));
            setSelectedIds(new Set(validIds));
        } catch (e) {
            console.warn('Failed to restore selection state', e);
        } finally {
            selectionHydrated.current = true;
        }
    }, [sales]);

    useEffect(() => {
        if (!selectionHydrated.current || typeof window === 'undefined') return;
        window.localStorage.setItem(selectionKey, JSON.stringify(Array.from(selectedIds)));
    }, [selectedIds]);

    useEffect(() => {
        if (!uiStateHydrated.current) return;
        if (pendingEditingSaleId && sales.length > 0) {
            const sale = sales.find(item => item.id === pendingEditingSaleId);
            if (sale) {
                setEditingSale(sale);
            }
            setPendingEditingSaleId(null);
        }
        if (pendingViewSaleId && sales.length > 0) {
            const sale = sales.find(item => item.id === pendingViewSaleId);
            if (sale) {
                setViewSaleRecord(sale);
            }
            setPendingViewSaleId(null);
        }
        if (pendingNewSaleDraft && !pendingEditingSaleId) {
            setEditingSale(null);
        }
    }, [pendingEditingSaleId, pendingNewSaleDraft, pendingViewSaleId, sales]);

    useEffect(() => {
        if (view !== 'sale_form' && pendingNewSaleDraft) {
            setPendingNewSaleDraft(false);
        }
    }, [pendingNewSaleDraft, view]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (view !== 'dashboard') return;
        const container = scrollContainerRef.current;
        if (!container) return;
        const key = `dashboard_scroll_${activeCategory}`;
        const stored = window.localStorage.getItem(key);
        if (stored) {
            const position = Number(stored);
            if (!Number.isNaN(position)) {
                requestAnimationFrame(() => {
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = position;
                    }
                });
            }
        }
        const handleScroll = () => {
            if (!scrollContainerRef.current) return;
            window.localStorage.setItem(key, String(scrollContainerRef.current.scrollTop));
        };
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            container.removeEventListener('scroll', handleScroll);
            if (scrollContainerRef.current) {
                window.localStorage.setItem(key, String(scrollContainerRef.current.scrollTop));
            }
        };
    }, [activeCategory, view]);

    const handlePullTouchStart = (e: React.TouchEvent) => {
        if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0) {
            setTouchStartY(e.targetTouches[0].clientY);
        }
    };

    const handlePullTouchMove = (e: React.TouchEvent) => {
        if (touchStartY === 0) return;
        const currentY = e.targetTouches[0].clientY;
        const deltaY = currentY - touchStartY;
        if (deltaY > 0 && (!scrollContainerRef.current || scrollContainerRef.current.scrollTop === 0)) {
            // Resistive pull
            setPullY(Math.min(deltaY * 0.5, 120));
        }
    };

    const handlePullTouchEnd = async () => {
        if (pullY > 60) {
            setIsRefreshing(true);
            setPullY(60); // Keep loading spinner visible
            if (userProfile) await performAutoSync(supabaseUrl, supabaseKey, userProfile);
            setTimeout(() => {
                setIsRefreshing(false);
                setPullY(0);
            }, 500);
        } else {
            setPullY(0);
        }
        setTouchStartY(0);
    };



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

    useEffect(() => {
        if (!viewSaleRecord) return;
        const updated = sales.find(s => s.id === viewSaleRecord.id);
        if (updated && JSON.stringify(updated) !== JSON.stringify(viewSaleRecord)) {
            setViewSaleRecord(updated);
        }
    }, [sales, viewSaleRecord]);


    const updateSalesAndSave = async (newSales: CarSale[]) => {
        const normalizedSales = newSales.map(normalizeSaleProfiles);
        setSales(normalizedSales);
        try {
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
            if (supabaseUrl && supabaseKey && userProfile) {
                await performAutoSync(supabaseUrl, supabaseKey, userProfile, normalizedSales);
            }
            return true;
        } catch (e) {
            console.error("Save failed", e);
            return false;
        }
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

    const generateInvoicePdfBase64 = async (sale: CarSale) => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '1024px';
        container.style.zIndex = '-1';
        document.body.appendChild(container);

        const root = createRoot(container);
        root.render(<InvoiceDocument sale={sale} />);

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
                    scale: 3,
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

        const fieldData = collectPdfTextFields(invoiceElement || container);
        const pdf = await html2pdf().set(opt).from(invoiceElement || container).toPdf().get('pdf');
        addPdfFormFields(pdf, fieldData);
        const dataUri = pdf.output('datauristring');

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
                    scale: 3,
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

        const fieldData = collectPdfTextFields(contractElement || container);
        const pdf = await html2pdf().set(opt).from(contractElement || container).toPdf().get('pdf');
        addPdfFormFields(pdf, fieldData);
        const dataUri = pdf.output('datauristring');

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
            for (const sale of selectedSales) {
                index += 1;
                setInvoiceDownloadStatus(`Packaging ${index}/${selectedSales.length}...`);

                const folderName = sanitizeFolderName(`Invoice_${sale.vin || sale.id}`);
                const invoicePdf = await generateInvoicePdfBase64(sale);
                fileMap[`Invoices_${dateStamp}/${folderName}/${invoicePdf.fileName}`] = base64ToUint8Array(invoicePdf.base64);

                const contractTypes: ContractType[] = ['deposit', 'full_marreveshje', 'full_shitblerje'];
                for (const contractType of contractTypes) {
                    const contractPdf = await generateContractPdfBase64(sale, contractType);
                    fileMap[`Invoices_${dateStamp}/${folderName}/${contractPdf.fileName}`] = base64ToUint8Array(contractPdf.base64);
                }

                collectInvoiceAttachments(sale).forEach(file => {
                    const base64Data = extractBase64(file.data);
                    fileMap[`Invoices_${dateStamp}/${folderName}/${file.name}`] = base64ToUint8Array(base64Data);
                });

                await new Promise(resolve => setTimeout(resolve, 0));
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

    const handleBulkArchive = async () => {
        if (!confirm(`Archive ${selectedIds.size} items?`)) return;

        const timestamp = new Date().toISOString();
        const actor = userProfile || 'Unknown';
        const newSales: CarSale[] = sales.map(sale => {
            if (!selectedIds.has(sale.id)) return sale;
            dirtyIds.current.add(sale.id);
            const wasArchived = sale.status === 'Archived';
            return {
                ...sale,
                archivedAt: timestamp,
                archivedBy: actor,
                archivedFromStatus: wasArchived ? sale.archivedFromStatus : sale.status,
                status: 'Archived' as SaleStatus
            };
        });
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    const handleBulkMove = async (status: SaleStatus) => {
        const newSales: CarSale[] = sales.map(s => {
            if (selectedIds.has(s.id)) {
                dirtyIds.current.add(s.id);
                return {
                    ...s,
                    status: status as SaleStatus,
                    archivedAt: status === 'Archived' ? s.archivedAt : undefined,
                    archivedBy: status === 'Archived' ? s.archivedBy : undefined,
                    archivedFromStatus: status === 'Archived' ? s.archivedFromStatus : undefined
                };
            }
            return s;
        });
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    const handleArchiveSingle = async (id: string) => {
        if (!confirm('Archive this car?')) return;
        const timestamp = new Date().toISOString();
        const actor = userProfile || 'Unknown';
        const newSales: CarSale[] = sales.map(sale => {
            if (sale.id !== id) return sale;
            dirtyIds.current.add(sale.id);
            const wasArchived = sale.status === 'Archived';
            return {
                ...sale,
                archivedAt: timestamp,
                archivedBy: actor,
                archivedFromStatus: wasArchived ? sale.archivedFromStatus : sale.status,
                status: 'Archived' as SaleStatus
            };
        });
        await updateSalesAndSave(newSales);
    };

    const handleBulkRestore = async () => {
        if (!confirm(`Restore ${selectedIds.size} archived items?`)) return;
        const newSales: CarSale[] = sales.map(sale => {
            if (!selectedIds.has(sale.id)) return sale;
            if (sale.status !== 'Archived') return sale;
            dirtyIds.current.add(sale.id);
            return {
                ...sale,
                status: (sale.archivedFromStatus || 'New') as SaleStatus,
                archivedAt: undefined,
                archivedBy: undefined,
                archivedFromStatus: undefined
            };
        });
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    const handleRestoreSingle = async (id: string) => {
        const sale = salesRef.current.find(s => s.id === id);
        if (!sale || sale.status !== 'Archived') return;
        const nextStatus = (sale.archivedFromStatus || 'New') as SaleStatus;
        const newSales: CarSale[] = sales.map(s => {
            if (s.id !== id) return s;
            dirtyIds.current.add(s.id);
            return {
                ...s,
                status: nextStatus,
                archivedAt: undefined,
                archivedBy: undefined,
                archivedFromStatus: undefined
            };
        });
        await updateSalesAndSave(newSales);
    };

    // Group management functions
    const syncGroupMetaToCloud = async (next: GroupMeta[]) => {
        if (!supabaseUrl || !supabaseKey) return;
        try {
            const client = createClient(supabaseUrl, supabaseKey);
            await client.from('sales').upsert({
                id: 'config_group_meta',
                brand: 'CONFIG',
                model: 'GROUPS',
                status: 'Completed',
                year: new Date().getFullYear(),
                km: 0,
                cost_to_buy: 0,
                sold_price: 0,
                amount_paid_cash: 0,
                amount_paid_bank: 0,
                deposit: 0,
                attachments: {
                    groups: next,
                    updatedAt: new Date().toISOString(),
                    updatedBy: userProfile || 'Unknown'
                }
            });
        } catch (e) {
            console.error('Group meta sync error', e);
        }
    };

    const persistGroupMeta = async (next: GroupMeta[], options?: { skipCloud?: boolean }) => {
        const normalized = normalizeGroupMetaList(next)
            .sort((a, b) => a.order - b.order)
            .map((group, index) => ({ ...group, order: index }));
        setGroupMeta(normalized);
        await Preferences.set({ key: 'sale_group_meta', value: JSON.stringify(normalized) });
        localStorage.setItem('sale_group_meta', JSON.stringify(normalized));
        if (!options?.skipCloud) {
            await syncGroupMetaToCloud(normalized);
        }
    };

    const getSalesInGroup = (groupName: string, sourceSales: CarSale[]) => {
        const key = groupKeyForName(groupName);
        if (!key) return [];
        return sourceSales.filter(sale => groupKeyForName(sale.group) === key);
    };

    const applySalesUpdateWithRollback = async (nextSales: CarSale[], previousSales: CarSale[], errorMessage: string) => {
        const success = await updateSalesAndSave(nextSales);
        if (!success) {
            setSales(previousSales);
            alert(errorMessage);
        }
        return success;
    };

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev =>
            prev.includes(groupName)
                ? prev.filter(g => g !== groupName)
                : [...prev, groupName]
        );
    };

    const groupNameExists = (name: string) => {
        const key = groupKeyForName(name);
        if (!key) return false;
        const inMeta = groupMeta.some(group => groupKeyForName(group.name) === key);
        if (inMeta) return true;
        return sales.some(sale => groupKeyForName(sale.group) === key);
    };

    const createGroupWithName = async (name: string, saleIds: string[]) => {
        if (!name?.trim() || saleIds.length === 0) return;
        const trimmed = name.trim();
        if (groupNameExists(trimmed)) {
            alert('Group already exists.');
            return;
        }

        const currentSales = salesRef.current;
        const salesById = new Map(currentSales.map(s => [s.id, s]));
        const ungroupedIds = saleIds.filter(id => {
            const sale = salesById.get(id);
            return !sale?.group || !sale.group.trim();
        });
        if (ungroupedIds.length === 0) {
            alert('Select ungrouped cars to create a new group.');
            return;
        }

        const nextMeta = [...groupMeta, { name: trimmed, order: groupMeta.length, archived: false }];
        await persistGroupMeta(nextMeta);
        setExpandedGroups(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));

        const saleIdSet = new Set(ungroupedIds);
        const newSales = currentSales.map(s => {
            if (!saleIdSet.has(s.id)) return s;
            dirtyIds.current.add(s.id);
            return { ...s, group: trimmed };
        });
        await applySalesUpdateWithRollback(
            newSales,
            currentSales,
            'Failed to create group and assign cars. Please try again.'
        );
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
        if (groupNameExists(trimmed)) {
            alert('Group name already exists.');
            return;
        }

        const nextMeta = groupMeta.map(g => g.name === groupName ? { ...g, name: trimmed } : g);
        await persistGroupMeta(nextMeta);
        const currentSales = salesRef.current;
        const newSales = currentSales.map(s => {
            if (s.group !== groupName) return s;
            dirtyIds.current.add(s.id);
            return { ...s, group: trimmed };
        });
        await applySalesUpdateWithRollback(
            newSales,
            currentSales,
            'Failed to rename the group. Please try again.'
        );
        setExpandedGroups(prev => prev.map(g => g === groupName ? trimmed : g));
    };

    const handleRenameGroup = async (groupName: string) => {
        const newName = prompt('Rename group to:', groupName);
        if (!newName || !newName.trim()) return;
        await renameGroupWithName(groupName, newName);
    };

    const handleArchiveGroup = async (groupName: string, archived: boolean) => {
        const currentSales = salesRef.current;
        const groupSales = getSalesInGroup(groupName, currentSales);
        if (archived && groupSales.length > 0) {
            const confirmArchive = confirm(`Archive "${groupName}"? ${groupSales.length} car${groupSales.length === 1 ? '' : 's'} will move to Ungrouped.`);
            if (!confirmArchive) return;
        }
        const nextMeta = groupMetaRef.current.map(g => g.name === groupName ? { ...g, archived } : g);
        await persistGroupMeta(nextMeta);
        if (archived) {
            setExpandedGroups(prev => prev.filter(g => g !== groupName));
        } else {
            setExpandedGroups(prev => (prev.includes(groupName) ? prev : [...prev, groupName]));
        }
        if (archived && groupSales.length > 0) {
            const nextSales = currentSales.map(sale => {
                if (groupKeyForName(sale.group) !== groupKeyForName(groupName)) return sale;
                dirtyIds.current.add(sale.id);
                return { ...sale, group: undefined };
            });
            await applySalesUpdateWithRollback(
                nextSales,
                currentSales,
                'Failed to archive group and move cars. Please try again.'
            );
        }
    };

    const handleDeleteGroup = async (groupName: string) => {
        const currentSales = salesRef.current;
        const groupSales = getSalesInGroup(groupName, currentSales);
        if (groupSales.length > 0) {
            alert('This group has cars assigned. Archive it instead to safely move cars to Ungrouped.');
            return;
        }
        const confirmation = prompt(`Type the group name to permanently delete "${groupName}". This cannot be undone.`);
        if (!confirmation || confirmation.trim() !== groupName) return;
        const nextMeta = groupMetaRef.current.filter(g => g.name !== groupName);
        await persistGroupMeta(nextMeta);
        setExpandedGroups(prev => prev.filter(g => g !== groupName));
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
        const currentSales = salesRef.current;
        const newSales = currentSales.map(s => {
            if (s.group?.trim() !== groupName) return s;
            dirtyIds.current.add(s.id);
            return {
                ...s,
                status,
                archivedAt: status === 'Archived' ? s.archivedAt : undefined,
                archivedBy: status === 'Archived' ? s.archivedBy : undefined,
                archivedFromStatus: status === 'Archived' ? s.archivedFromStatus : undefined
            };
        });
        await applySalesUpdateWithRollback(
            newSales,
            currentSales,
            'Failed to move cars to the selected tab. Please try again.'
        );
    };

    const handleRemoveFromGroup = async (id: string) => {
        const currentSales = salesRef.current;
        const newSales = currentSales.map(s => {
            if (s.id !== id) return s;
            dirtyIds.current.add(s.id);
            return { ...s, group: undefined };
        });
        await applySalesUpdateWithRollback(
            newSales,
            currentSales,
            'Failed to remove the car from the group. Please try again.'
        );
    };

    const handleAddToGroup = async (groupName: string, saleIds: string[]) => {
        if (saleIds.length === 0) return;
        const normalizedGroup = normalizeGroupName(groupName);
        if (!normalizedGroup) return;
        const currentSales = salesRef.current;
        const saleIdSet = new Set(saleIds);
        const newSales = currentSales.map(s => {
            if (!saleIdSet.has(s.id)) return s;
            dirtyIds.current.add(s.id);
            return { ...s, group: normalizedGroup };
        });
        await applySalesUpdateWithRollback(
            newSales,
            currentSales,
            'Failed to move cars to the group. Please try again.'
        );
        setExpandedGroups(prev => (prev.includes(normalizedGroup) ? prev : [...prev, normalizedGroup]));
        setSelectedIds(new Set());
    };

    const handleBulkGroupMove = async (groupName?: string) => {
        if (selectedIds.size === 0) return;
        const currentSales = salesRef.current;
        const saleIdSet = new Set(selectedIds);
        const normalizedGroup = normalizeGroupName(groupName);
        const newSales = currentSales.map(s => {
            if (!saleIdSet.has(s.id)) return s;
            dirtyIds.current.add(s.id);
            return { ...s, group: normalizedGroup || undefined };
        });
        await applySalesUpdateWithRollback(
            newSales,
            currentSales,
            'Failed to move cars to the group. Please try again.'
        );
        if (normalizedGroup) {
            setExpandedGroups(prev => (prev.includes(normalizedGroup) ? prev : [...prev, normalizedGroup]));
        }
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
        setRememberProfile(false);
        setShowProfileMenu(false);
    };

    const createUserProfile = useCallback(async (profileName: string, email?: string, remember = rememberProfile) => {
        const normalizedName = normalizeProfileName(profileName);
        if (!normalizedName) return;
        if (availableProfiles.includes(normalizedName)) {
            alert('Profile already exists!');
            return;
        }
        const setupToken = generateSetupToken();
        const updated = normalizeProfiles([...availableProfiles, normalizedName]);
        setAvailableProfiles(updated);
        setUserProfile(normalizedName);
        setRememberProfile(remember);
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
        await persistUserProfile(normalizedName, remember);
        syncProfilesToCloud(updated);
        const newAccount: UserAccount = {
            id: crypto.randomUUID(),
            name: normalizedName,
            email: email?.trim() || undefined,
            status: 'pending',
            setupToken,
            setupTokenCreatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: userProfile || undefined
        };
        const nextAccounts = [...userAccountsRef.current, newAccount];
        await persistUserAccounts(nextAccounts);
        setSetupLinkData({
            token: setupToken,
            url: buildSetupLink(setupToken),
            name: normalizedName
        });
        setShowSetupLinkModal(true);
    }, [availableProfiles, buildSetupLink, normalizeProfiles, persistUserAccounts, persistUserProfile, rememberProfile, syncProfilesToCloud, userAccounts, userProfile]);

    const handleAddProfile = async () => {
        if (!isAdmin) {
            alert(`Only ${ADMIN_PROFILE} can add users.`);
            return;
        }
        const normalizedName = normalizeProfileName(newProfileName);
        if (!normalizedName) return;
        await createUserProfile(normalizedName, newProfileEmail);
        setNewProfileName('');
        setNewProfileEmail('');
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
            await createUserProfile(normalizedName);
            setShowProfileMenu(false);
        }
    };

    const handleDeleteProfile = async (name: string) => {
        if (!isAdmin) {
            alert(`Only ${ADMIN_PROFILE} can delete users.`);
            return;
        }
        const updated = availableProfiles.filter(p => p !== name);
        const normalized = normalizeProfiles(updated);
        setAvailableProfiles(normalized);
        if (userProfile === name) setUserProfile('');
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(normalized) });
        syncProfilesToCloud(normalized);
        const remainingAccounts = userAccounts.filter(account => account.name !== name);
        await persistUserAccounts(remainingAccounts);
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
        const updatedAccounts = userAccounts.map(account => account.name === oldName ? { ...account, name: normalizedName } : account);
        await persistUserAccounts(updatedAccounts);
    };

    const openSetupModalForToken = useCallback((token: string) => {
        setPendingSetupToken(token);
        setSetupPassword('');
        setSetupPasswordConfirm('');
        setSetupError('');
        setSetupSuccess('');
        setIsSetupModalOpen(true);
    }, []);

    const handleSetupPasswordSubmit = async () => {
        if (!pendingSetupToken) return;
        const account = userAccounts.find(u => u.setupToken === pendingSetupToken);
        if (!account) {
            setSetupError('Invalid or expired setup link.');
            return;
        }
        if (!setupPassword || setupPassword.length < 8) {
            setSetupError('Password must be at least 8 characters.');
            return;
        }
        if (setupPassword !== setupPasswordConfirm) {
            setSetupError('Passwords do not match.');
            return;
        }

        try {
            const record = await createPasswordRecord(setupPassword);
            const updatedAccounts = userAccounts.map(u => {
                if (u.setupToken !== pendingSetupToken) return u;
                return {
                    ...u,
                    status: 'active' as UserStatus,
                    passwordHash: record.passwordHash,
                    passwordSalt: record.passwordSalt,
                    setupToken: null,
                    setupTokenCreatedAt: null
                };
            });
            await persistUserAccounts(updatedAccounts);
            setSetupSuccess('Password set successfully. You can now log in.');
            setSetupError('');
        } catch (error) {
            console.error('Setup error', error);
            setSetupError('Failed to set password. Please try again.');
        }
    };

    const handleSellerReassign = async (saleId: string, nextSeller: string) => {
        const normalizedSeller = normalizeProfileName(nextSeller);
        if (!normalizedSeller) return;
        const currentSales = salesRef.current;
        const saleIndex = currentSales.findIndex(sale => sale.id === saleId);
        if (saleIndex === -1) return;

        const sale = currentSales[saleIndex];
        const previousSeller = sale.soldBy;
        if (previousSeller === normalizedSeller) return;

        const auditEntry: SellerAuditEntry = {
            id: crypto.randomUUID(),
            changedAt: new Date().toISOString(),
            changedBy: userProfile || 'Unknown',
            fromSeller: previousSeller,
            toSeller: normalizedSeller
        };

        const nextAudit = [...(sale.sellerAudit || []), auditEntry];
        const updatedSale: CarSale = {
            ...sale,
            soldBy: normalizedSeller,
            sellerName: normalizedSeller,
            sellerAudit: nextAudit
        };
        const newSales = [...currentSales];
        newSales[saleIndex] = updatedSale;
        dirtyIds.current.add(saleId);
        await updateSalesAndSave(newSales);
    };

    const openSellerReassignModal = (sale: CarSale) => {
        setSellerReassignSale(sale);
        setSellerReassignTarget(sale.soldBy || '');
        setShowSellerReassignModal(true);
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
                const normalizedStoredProfile = normalizeProfileName(storedProfile);
                if (normalizedStoredProfile && normalizedStoredProfile !== storedProfile) {
                    storedProfile = normalizedStoredProfile;
                    await Preferences.set({ key: 'user_profile', value: normalizedStoredProfile });
                }
                if (storedProfile && shouldRemember) {
                    setUserProfile(storedProfile);
                    setView(uiStateViewRef.current || 'landing');
                } else if (storedProfile && !shouldRemember) {
                    await Preferences.remove({ key: 'user_profile' });
                }

                let { value: profiles } = await Preferences.get({ key: 'available_profiles' });
                if (profiles) {
                    const loaded = normalizeProfiles(JSON.parse(profiles));
                    setAvailableProfiles(loaded);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(loaded) });
                    syncProfilesToCloud(loaded);
                } else {
                    const defaults = normalizeProfiles(['Robert Gashi', ADMIN_PROFILE, 'User', 'Leonit']);
                    setAvailableProfiles(defaults);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(defaults) });
                    // Also sync to cloud on first run
                    syncProfilesToCloud(defaults);
                }

                const { value: storedUsers } = await Preferences.get({ key: 'user_accounts' });
                if (storedUsers) {
                    const loadedUsers = normalizeUserAccounts(JSON.parse(storedUsers));
                    setUserAccounts(loadedUsers);
                    await Preferences.set({ key: 'user_accounts', value: JSON.stringify(loadedUsers) });
                }

                const { value: groupMetaValue } = await Preferences.get({ key: 'sale_group_meta' });
                if (groupMetaValue) {
                    const parsed = JSON.parse(groupMetaValue) as GroupMeta[];
                    setGroupMeta(normalizeGroupMetaList(parsed));
                } else {
                    const stored = localStorage.getItem('sale_group_meta');
                    if (stored) {
                        setGroupMeta(normalizeGroupMetaList(JSON.parse(stored)));
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
                if (hasAdminOwnership) {
                    currentSales.forEach((sale: CarSale) => {
                        if (isLegacyAdminProfile(sale.sellerName) || isLegacyAdminProfile(sale.soldBy)) {
                            dirtyIds.current.add(sale.id);
                        }
                    });
                    await Preferences.set({ key: 'car_sales_data', value: JSON.stringify(normalizedSales) });
                    localStorage.setItem('car_sales_data', JSON.stringify(normalizedSales));
                }
                setSales(normalizedSales.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)));

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

    useEffect(() => {
        if (!userProfile || !supabaseUrl || !supabaseKey) return;
        const syncOnLogin = async () => {
            const { value } = await Preferences.get({ key: 'car_sales_data' });
            const localSales = value ? JSON.parse(value) : salesRef.current;
            performAutoSync(supabaseUrl, supabaseKey, userProfile, localSales);
        };
        syncOnLogin();
    }, [userProfile, supabaseUrl, supabaseKey]);

    useEffect(() => {
        if (!userProfile) return;
        const account = getUserAccount(userProfile);
        if (account && account.status === 'pending') {
            alert('Password setup required. Use the setup link from your admin.');
            setUserProfile('');
            setView('profile_select');
            persistUserProfile(null, false);
        }
    }, [getUserAccount, userProfile]);

    const performAutoSync = async (url: string, key: string, profile: string, currentLocalSales?: CarSale[]) => {
        setIsSyncing(true);
        setSyncError(''); // Clear previous errors
        console.log("Starting AutoSync to:", url);

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

            // 3. Clear Dirty IDs on success
            if (salesRes.success) {
                const failedIds = new Set(salesRes.failedIds || []);
                dirtyItems.forEach(s => {
                    if (!failedIds.has(s.id)) {
                        dirtyIds.current.delete(s.id);
                    }
                });
            }
            if (salesRes.success) {
                console.log("Sales Sync Success - content synced");
                if (salesRes.data) {
                    // Aggressive Deduplication: Filter by ID, VIN, and Plate Number
                    const seenIds = new Set<string>();
                    const seenVins = new Set<string>();
                    const seenPlates = new Set<string>();

                    const uniqueSales = salesRes.data.filter((s: CarSale) => {
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
            setSyncError(`Sync Exception: ${e.message} `);
        }
        finally { setIsSyncing(false); }
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

            await updateSalesAndSave(newSales);
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

    const saveSettings = async () => {
        await Preferences.set({ key: 'openai_api_key', value: apiKey.trim() });
        await Preferences.set({ key: 'supabase_url', value: supabaseUrl.trim() });
        await Preferences.set({ key: 'supabase_key', value: supabaseKey.trim() });
        await persistUserProfile((userProfile || '').trim());
        alert('Settings Saved!');
    };

    const handleDeleteAll = async () => {
        if (confirm('Archive all non-sold sales data? Sold cars will be kept.')) {
            if (confirm('Please confirm again: ARCHIVE ALL NON-SOLD DATA?')) {
                const timestamp = new Date().toISOString();
                const actor = userProfile || 'Unknown';
                const updated: CarSale[] = salesRef.current.map(sale => {
                    if (sale.status === 'Completed') return sale;
                    if (sale.id === 'config_profile_avatars' || sale.id === 'config_user_accounts') return sale;
                    return {
                        ...sale,
                        status: 'Archived' as SaleStatus,
                        archivedAt: timestamp,
                        archivedBy: actor,
                        archivedFromStatus: sale.status
                    };
                });
                await updateSalesAndSave(updated);
                alert('All non-sold data has been archived.');
            }
        }
    };

    const openInvoice = (sale: CarSale, e: React.MouseEvent, withDogane = false) => {
        e.stopPropagation();
        setDocumentPreview({ sale, type: 'invoice', withDogane });
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

    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

    useEffect(() => {
        const handle = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 200);
        return () => window.clearTimeout(handle);
    }, [searchTerm]);

    const deferredSearchTerm = useDeferredValue(debouncedSearchTerm);

    const filteredSales = React.useMemo(() => sales.filter(s => {
        // Filter out system config rows
        if (s.id === 'config_profile_avatars' || s.id === 'config_user_accounts') return false;

        // Restrict visibility for non-admin users to their own sales
        if (!isAdmin && s.soldBy !== userProfile) return false;


        // Category Filter
        if (activeCategory === 'ARCHIVE' && s.status !== 'Archived') return false;
        if (activeCategory !== 'ARCHIVE' && s.status === 'Archived') return false;
        if (activeCategory === 'SHIPPED' && s.status !== 'Shipped') return false;
        if (activeCategory === 'INSPECTIONS' && s.status !== 'Inspection') return false;
        if (activeCategory === 'AUTOSALLON' && s.status !== 'Autosallon') return false;
        if (activeCategory === 'SALES' && ['Shipped', 'Inspection', 'Autosallon'].includes(s.status)) return false;

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
    const selectedInvoices = React.useMemo(
        () => filteredSales.filter(sale => selectedIds.has(sale.id)),
        [filteredSales, selectedIds]
    );
    const selectedSales = React.useMemo(
        () => sales.filter(sale => selectedIds.has(sale.id)),
        [sales, selectedIds]
    );
    const hasArchivedSelection = selectedSales.some(sale => sale.status === 'Archived');
    const setupAccount = useMemo(() => {
        if (!pendingSetupToken) return null;
        return userAccounts.find(account => account.setupToken === pendingSetupToken) || null;
    }, [pendingSetupToken, userAccounts]);

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
    const groupingAvailable = activeCategory === 'SALES' || activeCategory === 'SHIPPED';
    const groupingEnabled = groupingAvailable && groupViewEnabled;

    const normalizedGroupMeta = useMemo(() => normalizeGroupMetaList(groupMeta), [groupMeta]);
    const groupNamesFromSales = useMemo(() => {
        const unique = new Set<string>();
        sales.forEach(sale => {
            const name = normalizeGroupName(sale.group);
            if (name) unique.add(name);
        });
        return Array.from(unique);
    }, [sales]);
    const resolvedGroupMeta = useMemo(
        () => ensureGroupMetaIncludesNames(normalizedGroupMeta, groupNamesFromSales),
        [normalizedGroupMeta, groupNamesFromSales]
    );
    const groupDisplayNameByKey = useMemo(() => {
        const map = new Map<string, string>();
        resolvedGroupMeta.forEach(group => {
            map.set(groupKeyForName(group.name), group.name);
        });
        return map;
    }, [resolvedGroupMeta]);

    const groupedSales = React.useMemo(() => {
        const groups: Record<string, CarSale[]> = {};
        resolvedGroupMeta.forEach(group => {
            groups[group.name] = [];
        });
        groups.Ungrouped = [];
        filteredSales.forEach(s => {
            const normalized = normalizeGroupName(s.group);
            const key = normalized ? groupKeyForName(normalized) : '';
            const groupKey = normalized ? (groupDisplayNameByKey.get(key) || normalized) : 'Ungrouped';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(s);
        });
        return groups;
    }, [filteredSales, resolvedGroupMeta, groupDisplayNameByKey]);

    useEffect(() => {
        if (sales.length === 0) return;
        const groupNames = new Set(sales.map(s => normalizeGroupName(s.group)).filter(Boolean) as string[]);
        if (groupNames.size === 0) return;
        const missing = Array.from(groupNames).filter(name => !normalizedGroupMeta.some(g => groupKeyForName(g.name) === groupKeyForName(name)));
        if (missing.length === 0) return;
        const nextMeta = [...normalizedGroupMeta];
        missing.forEach(name => {
            const trimmed = normalizeGroupName(name);
            if (!trimmed) return;
            nextMeta.push({ name: trimmed, order: nextMeta.length, archived: false });
        });
        persistGroupMeta(nextMeta);
    }, [sales, normalizedGroupMeta]);

    const orderedGroupMeta = useMemo(() => {
        return [...resolvedGroupMeta].sort((a, b) => a.order - b.order);
    }, [resolvedGroupMeta]);

    const activeGroups = useMemo(() => orderedGroupMeta.filter(g => !g.archived), [orderedGroupMeta]);
    const archivedGroups = useMemo(() => orderedGroupMeta.filter(g => g.archived), [orderedGroupMeta]);

    useEffect(() => {
        if (hasInitializedGroups.current) return;
        const initialGroups = [...activeGroups.map(g => g.name), 'Ungrouped'];
        if (initialGroups.length > 0) {
            setExpandedGroups(initialGroups);
            hasInitializedGroups.current = true;
        }
    }, [activeGroups]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const token = params.get('setupToken');
        if (!token) return;
        openSetupModalForToken(token);
        params.delete('setupToken');
        const nextUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
        window.history.replaceState({}, '', nextUrl);
    }, [openSetupModalForToken]);



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
            profiles={availableProfiles}
            onSelect={(p, remember) => {
                const normalizedProfile = normalizeProfileName(p);
                if (!normalizedProfile) return;
                const account = getUserAccount(normalizedProfile);
                if (account && account.status === 'pending') {
                    alert('Password setup required. Use the setup link from your admin.');
                    return;
                }
                setUserProfile(normalizedProfile);
                setView('landing');
                setRememberProfile(remember);
                persistUserProfile(normalizedProfile, remember);
            }}
            onAdd={(name, email, remember) => {
                createUserProfile(name, email, remember);
            }}
            onDelete={handleDeleteProfile}
            onEdit={handleEditProfile}
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


    return (
        <div className="h-screen flex flex-col bg-white text-slate-800 font-sans">
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

            <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-3 py-2 md:px-4 md:py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex flex-col gap-2 md:gap-3">
                    <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-2 md:gap-3">
                            <img src="/logo_new.jpg" alt="Korauto Logo" className="w-10 h-10 rounded-xl object-cover shadow-md border border-slate-100" />
                            <div>
                                <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">KORAUTO</h1>
                            </div>
                        </div>
                        <div className="hidden md:flex bg-slate-100 p-1 rounded-xl">
                            {[
                                { key: 'dashboard', label: 'Home' },
                                { key: 'invoices', label: 'Invoice' },
                                ...(isAdmin ? [{ key: 'settings', label: 'Settings' }] : [])
                            ].map((tab) => (
                                <button key={tab.key} onClick={() => setView(tab.key)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${view === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3 relative">
                            <button
                                onClick={() => userProfile && performAutoSync(supabaseUrl, supabaseKey, userProfile)}
                                className={`p-2 rounded-full hover:bg-slate-100 transition-all ${isSyncing ? 'animate-spin text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Force Sync"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>
                            <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-900 to-black p-[2px] shadow-md hover:shadow-lg transition-all hover:scale-105">
                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-sm font-bold text-slate-900">
                                    {userProfile ? userProfile[0].toUpperCase() : 'U'}
                                </div>
                            </button>

                            {showProfileMenu && (
                                <div className="absolute right-0 top-12 bg-white border border-slate-200 rounded-xl p-2 w-52 shadow-xl z-[60]">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide px-3 py-2">Switch Profile</div>
                                    <div className="max-h-40 overflow-y-auto scroll-container space-y-1">
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

                    <div className="flex md:hidden bg-white/80 border border-slate-100 p-1 rounded-full gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {[
                            { key: 'dashboard', label: 'Home' },
                            { key: 'invoices', label: 'Invoice' },
                            ...(isAdmin ? [{ key: 'settings', label: 'Settings' }] : [])
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setView(tab.key)}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap ${view === tab.key
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2 md:gap-3 justify-between items-center">
                        <div className="relative group flex-1 md:flex-none">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input placeholder="Search cars..." className="bg-white border border-slate-200 rounded-full pl-10 pr-4 py-2 text-sm w-full md:w-80 md:py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-400/15 focus:border-slate-300 text-slate-700 placeholder:text-slate-400 transition-all shadow-[0_1px_2px_rgba(15,23,42,0.04)]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex gap-2 items-center">
                            <div className="relative">
                                <ArrowUpDown className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); if (e.target.value === 'nameAlphabetic') setSortDir('asc'); else setSortDir('desc'); }}
                                    className="bg-white border border-slate-200 text-slate-700 text-xs md:text-sm rounded-full pl-8 pr-4 py-2 outline-none focus:ring-2 focus:ring-slate-400/15 focus:border-slate-300 appearance-none cursor-pointer w-[120px] md:w-auto truncate transition-all md:py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                                    <option value="createdAt">Date Added</option>
                                    <option value="nameAlphabetic">Name (A-Z)</option>
                                    <option value="dueBalance">Balance (Client)</option>
                                    {isAdmin && <option value="koreaBalance">Balance (Korea)</option>}
                                    <option value="year">Year</option>
                                </select>
                            </div>
                            {groupingAvailable && (
                                <button
                                    onClick={() => setGroupViewEnabled((prev) => !prev)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-full border text-[11px] md:text-xs font-semibold transition-all ${groupViewEnabled
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                        }`}
                                    title={`Group view ${groupViewEnabled ? 'on' : 'off'}`}
                                >
                                    {groupViewEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    <span className="hidden sm:inline">Group View</span>
                                    <span className="text-[9px] uppercase tracking-wide">{groupViewEnabled ? 'On' : 'Off'}</span>
                                </button>
                            )}
                            <button onClick={() => openSaleForm(null)} className="hidden md:flex bg-black hover:bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-semibold items-center gap-2 transition-all shadow-md shadow-slate-900/20 hover:shadow-lg hover:shadow-slate-900/30 active:scale-95">
                                <Plus className="w-4 h-4" /> Add Sale
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden bg-slate-50/70 p-3 md:p-6 flex flex-col relative">
                {view !== 'sale_form' && (
                    <>

                        {/* Global Tabs (Visible on Dashboard and Invoices) */}
                        {view !== 'settings' && (
                            <div className="flex gap-1.5 md:gap-2 mb-2 md:mb-4 overflow-x-auto pb-1 md:pb-2 no-scrollbar">
                                {(['SALES', 'SHIPPED', 'INSPECTIONS', 'AUTOSALLON', 'ARCHIVE'] as const).map(cat => {
                                    const isActive = (view === 'dashboard' && activeCategory === cat);
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => {
                                                setView('dashboard');
                                                setActiveCategory(cat as any);
                                            }}
                                            className={`px-3 py-1 md:px-3.5 md:py-1.5 rounded-full font-semibold text-[11px] md:text-xs tracking-wide transition-all whitespace-nowrap ${isActive
                                                ? 'bg-black text-white shadow-sm'
                                                : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            {cat}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {view === 'dashboard' ? (<>
                            <div
                                ref={scrollContainerRef}
                                className="border border-slate-100 rounded-2xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] relative hidden md:block overflow-auto scroll-container flex-1"
                            >
                                <div className="grid text-[10px] xl:text-xs divide-y divide-slate-200 min-w-max"
                                    style={{
                                        gridTemplateColumns: isAdmin ? 'var(--cols-admin)' : 'var(--cols-user)'
                                    }}>
                                    <div className="bg-slate-100 font-semibold text-slate-700 grid grid-cols-subgrid sticky top-0 z-30 border-b border-slate-200 text-xs" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                        <div className="p-2 xl:p-2.5 flex items-center justify-center cursor-pointer hover:text-slate-900" onClick={() => toggleAll(filteredSales)}>
                                            {selectedIds.size > 0 && selectedIds.size === filteredSales.length ? <CheckSquare className="w-4 h-4 text-slate-800" /> : <Square className="w-4 h-4" />}
                                        </div>
                                        <div className="p-2 xl:p-2.5 pl-3 cursor-pointer hover:text-slate-900 flex items-center gap-1" onClick={() => toggleSort('brand')}>
                                            Car Info {sortBy === 'brand' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-2.5 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1" onClick={() => toggleSort('year')}>
                                            Year {sortBy === 'year' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-2.5 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1" onClick={() => toggleSort('km')}>
                                            KM {sortBy === 'km' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1" onClick={() => toggleSort('plateNumber')}>
                                            Plate/VIN {sortBy === 'plateNumber' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1" onClick={() => toggleSort('buyerName')}>
                                            Buyer {sortBy === 'buyerName' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1" onClick={() => toggleSort('sellerName')}>
                                            Seller {sortBy === 'sellerName' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-3 cursor-pointer hover:text-slate-900 flex items-center gap-1" onClick={() => toggleSort('shippingName')}>
                                            Shipping {sortBy === 'shippingName' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        {isAdmin && (
                                            <div className="p-2 xl:p-3 text-right cursor-pointer hover:text-slate-900 flex items-center justify-end gap-1" onClick={() => toggleSort('costToBuy')}>
                                                Cost {sortBy === 'costToBuy' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                            </div>
                                        )}
                                        <div className="p-2 xl:p-3 text-right cursor-pointer hover:text-slate-900 flex items-center justify-end gap-1" onClick={() => toggleSort('soldPrice')}>
                                            Sold {sortBy === 'soldPrice' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-3 text-right">Paid</div>
                                        <div className="p-2 xl:p-3 text-right">Bank Fee</div>
                                        <div className="p-2 xl:p-3 text-right">Tax</div>
                                        {isAdmin && <div className="p-2 xl:p-3 text-right text-slate-900 font-bold">Profit</div>}
                                        <div className="p-2 xl:p-3 text-right">Balance</div>
                                        {isAdmin && <div className="p-2 xl:p-3 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1" onClick={() => toggleSort('koreaBalance')}>
                                            Korea {sortBy === 'koreaBalance' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>}
                                        <div className="p-2 xl:p-3 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1" onClick={() => toggleSort('status')}>
                                            Status {sortBy === 'status' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                        </div>
                                        <div className="p-2 xl:p-3 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1" onClick={() => toggleSort('soldBy')}>
                                            Sold By {sortBy === 'soldBy' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
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
                                                const match = resolvedGroupMeta.find(g => groupKeyForName(g.name) === groupKeyForName(name));
                                                return match ? { ...match, order: index } : { name, order: index, archived: false };
                                            });
                                            const updatedKeys = new Set(updated.map(group => groupKeyForName(group.name)));
                                            const archived = resolvedGroupMeta.filter(g => g.archived && !updatedKeys.has(groupKeyForName(g.name)));
                                            persistGroupMeta([...updated, ...archived.map((g, idx) => ({ ...g, order: updated.length + idx }))]);
                                        }}
                                        className="grid grid-cols-subgrid"
                                        style={{ gridColumn: isAdmin ? 'span 19' : 'span 16', display: 'grid' }}
                                    >
                                        {activeGroups.map(group => {
                                            const groupSales = groupedSales[group.name] || [];
                                            return (
                                                <Reorder.Item key={group.name} value={group.name} className="contents">
                                                    <div className="bg-slate-50/80 border-y border-slate-200 border-l-4 border-l-slate-300 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
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
                                                                            setActiveGroupMoveMenu(prev => prev === group.name ? null : group.name);
                                                                        }}
                                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                                                        title="Move group to tab"
                                                                    >
                                                                        <ArrowRightLeft className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    {activeGroupMoveMenu === group.name && (
                                                                        <div className="absolute right-0 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'In Progress');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                                            >
                                                                                Sales
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'Shipped');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                                            >
                                                                                Shipped
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'Inspection');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                                            >
                                                                                Inspections
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleMoveGroupStatus(group.name, 'Autosallon');
                                                                                    setActiveGroupMoveMenu(null);
                                                                                }}
                                                                                className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
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
                                                                <button
                                                                    onClick={() => handleDeleteGroup(group.name)}
                                                                    className="p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                                                                    title="Delete group"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {expandedGroups.includes(group.name) && (
                                                        groupSales.length > 0 ? (
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
                                                                        onClick={() => handleSaleClick(s)}
                                                                        onDelete={handleArchiveSingle}
                                                                        onRemoveFromGroup={handleRemoveFromGroup}
                                                                        onReassignSeller={openSellerReassignModal}
                                                                        onRestore={handleRestoreSingle}
                                                                    />
                                                                ))}
                                                            </Reorder.Group>
                                                        ) : (
                                                            <div className="col-span-full px-6 py-4 text-xs text-slate-400 italic bg-white border-t border-slate-100">
                                                                No cars in this group yet.
                                                            </div>
                                                        )
                                                    )}
                                                </Reorder.Item>
                                            );
                                        })}
                                        <div className="contents">
                                            <div className="bg-slate-50/80 border-y border-slate-200 border-l-4 border-l-slate-300 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
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
                                                groupedSales.Ungrouped.length > 0 ? (
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
                                                                onClick={() => handleSaleClick(s)}
                                                                onDelete={handleArchiveSingle}
                                                                onRemoveFromGroup={handleRemoveFromGroup}
                                                                onReassignSeller={openSellerReassignModal}
                                                                onRestore={handleRestoreSingle}
                                                            />
                                                        ))}
                                                    </Reorder.Group>
                                                ) : (
                                                    <div className="col-span-full px-6 py-4 text-xs text-slate-400 italic bg-white border-t border-slate-100">
                                                        No ungrouped cars.
                                                    </div>
                                                )
                                            )}
                                        </div>
                                        {archivedGroups.length > 0 && (
                                            <div className="contents">
                                                <div className="bg-slate-100 border-y border-slate-200 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                                    <div className="col-span-full px-3 py-2 flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                                            <span>Archived Groups</span>
                                                            <span className="text-xs text-slate-400 font-medium">({archivedGroups.length})</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {archivedGroups.map(group => {
                                                    const groupSales = groupedSales[group.name] || [];
                                                    return (
                                                        <div key={group.name} className="contents">
                                                            <div className="bg-slate-50/80 border-b border-slate-200 border-l-4 border-l-slate-300 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
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
                                                                        <button
                                                                            onClick={() => handleDeleteGroup(group.name)}
                                                                            className="p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                                                                            title="Delete group"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {expandedGroups.includes(group.name) && (
                                                                groupSales.length > 0 ? (
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
                                                                                    handleSaleClick(s);
                                                                                }}
                                                                                onDelete={handleArchiveSingle}
                                                                                onRemoveFromGroup={handleRemoveFromGroup}
                                                                                onReassignSeller={openSellerReassignModal}
                                                                                onRestore={handleRestoreSingle}
                                                                            />
                                                                        ))}
                                                                    </Reorder.Group>
                                                                ) : (
                                                                    <div className="col-span-full px-6 py-4 text-xs text-slate-400 italic bg-white border-t border-slate-100">
                                                                        No cars in this archived group.
                                                                    </div>
                                                                )
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
                                                    onClick={() => handleSaleClick(s)}
                                                    onDelete={handleArchiveSingle}
                                                    onReassignSeller={openSellerReassignModal}
                                                    onRestore={handleRestoreSingle}
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
                            <div className="md:hidden flex flex-col flex-1 h-full overflow-hidden relative">
                                <div className="flex flex-col flex-1 overflow-y-auto scroll-container pb-16 no-scrollbar">
                                    {groupingEnabled ? (
                                        <>
                                            {[...activeGroups, { name: 'Ungrouped', order: 9999, archived: false }].map(group => {
                                                const groupSales = groupedSales[group.name] || [];
                                                return (
                                                    <div key={group.name} className="border-b border-slate-200">
                                                        <div className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-slate-700 bg-slate-50 border-l-4 border-l-slate-300">
                                                            <button
                                                                onClick={() => toggleGroup(group.name)}
                                                                className="flex items-center gap-2 text-left"
                                                            >
                                                                {expandedGroups.includes(group.name) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                {group.name}
                                                                <span className="text-xs text-slate-400 font-medium">({groupSales.length})</span>
                                                            </button>
                                                            <div className="flex items-center gap-1.5">
                                                                {group.name !== 'Ungrouped' && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleArchiveGroup(group.name, true)}
                                                                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                                            title="Archive group"
                                                                        >
                                                                            <Archive className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteGroup(group.name)}
                                                                            className="p-1.5 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50"
                                                                            title="Delete group"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                                <div className="relative">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveGroupMoveMenu(prev => prev === group.name ? null : group.name);
                                                                    }}
                                                                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                                                    title="Move group to tab"
                                                                >
                                                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                                                </button>
                                                                {activeGroupMoveMenu === group.name && (
                                                                    <div className="absolute right-0 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                                                                        <button
                                                                            onClick={() => {
                                                                                handleMoveGroupStatus(group.name, 'In Progress');
                                                                                setActiveGroupMoveMenu(null);
                                                                            }}
                                                                            className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                                        >
                                                                            Sales
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                handleMoveGroupStatus(group.name, 'Shipped');
                                                                                setActiveGroupMoveMenu(null);
                                                                            }}
                                                                            className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                                        >
                                                                            Shipped
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                handleMoveGroupStatus(group.name, 'Inspection');
                                                                                setActiveGroupMoveMenu(null);
                                                                            }}
                                                                            className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                                        >
                                                                            Inspections
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                handleMoveGroupStatus(group.name, 'Autosallon');
                                                                                setActiveGroupMoveMenu(null);
                                                                            }}
                                                                            className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                                        >
                                                                            Autosallon
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {expandedGroups.includes(group.name) && (
                                                            groupSales.length > 0 ? (
                                                                <div>
                                                                {groupSales.map(sale => (
                                                                    <motion.div
                                                                        key={sale.id}
                                                                        initial={{ opacity: 0 }}
                                                                        animate={{ opacity: 1 }}
                                                                        className="relative border-b border-slate-200"
                                                                    >
                                                                        {/* Background Action (Archive) */}
                                                                        <div className="absolute inset-0 flex items-center justify-end px-4 bg-slate-700 overflow-hidden">
                                                                            <Archive className="text-white w-5 h-5" />
                                                                        </div>

                                                                        {/* Foreground Card */}
                                                                        <motion.div
                                                                            layout
                                                                            drag="x"
                                                                            dragDirectionLock
                                                                            dragConstraints={{ left: 0, right: 0 }}
                                                                            dragElastic={{ left: 0.8, right: 0 }}
                                                                            dragSnapToOrigin
                                                                            onDragEnd={(e, { offset }) => {
                                                                                if (offset.x < -100) {
                                                                                    const shouldArchive = confirm('Archive this item?');
                                                                                    if (shouldArchive) {
                                                                                        handleArchiveSingle(sale.id);
                                                                                    }
                                                                                }
                                                                            }}
                                                                            className="p-2 flex items-center gap-2 relative z-10 transition-colors"
                                                                            onClick={() => {
                                                                                if (selectedIds.size > 0) {
                                                                                    toggleSelection(sale.id);
                                                                                } else {
                                                                                    handleSaleClick(sale);
                                                                                }
                                                                            }}
                                                                            onContextMenu={(e) => {
                                                                                e.preventDefault();
                                                                                toggleSelection(sale.id);
                                                                            }}
                                                                            style={{ backgroundColor: selectedIds.has(sale.id) ? '#f5f5f5' : '#ffffff' }}
                                                                        >
                                                                            {selectedIds.size > 0 && (
                                                                                <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                                    {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                                </div>
                                                                            )}

                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex justify-between items-start">
                                                                                    <div className="font-bold text-slate-800 text-[13px] truncate pr-2">{sale.brand} {sale.model}</div>
                                                                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${sale.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                                                                                        (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'bg-slate-100 text-slate-900' :
                                                                                            sale.status === 'Inspection' ? 'bg-amber-50 text-amber-700' :
                                                                                                sale.status === 'Archived' ? 'bg-slate-200 text-slate-600' :
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
                                                                                {groupingAvailable && sale.group && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); handleRemoveFromGroup(sale.id); }}
                                                                                        className="mt-1 text-[9px] text-red-500 font-semibold hover:text-red-600"
                                                                                    >
                                                                                        Remove from group
                                                                                    </button>
                                                                                )}
                                                                                {sale.status === 'Archived' && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); handleRestoreSingle(sale.id); }}
                                                                                        className="mt-1 text-[9px] text-slate-600 font-semibold hover:text-slate-900"
                                                                                    >
                                                                                        Restore
                                                                                    </button>
                                                                                )}
                                                                                {isAdmin && sale.status === 'Completed' && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); openSellerReassignModal(sale); }}
                                                                                        className="mt-1 text-[9px] text-slate-600 font-semibold hover:text-slate-900"
                                                                                    >
                                                                                        Reassign seller
                                                                                    </button>
                                                                                )}
                                                                        </div>
                                                                    </motion.div>
                                                                    </motion.div>
                                                                ))}
                                                                </div>
                                                            ) : (
                                                                <div className="px-4 py-3 text-xs text-slate-400 italic bg-white border-t border-slate-100">
                                                                    No cars in this group yet.
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {archivedGroups.length > 0 && (
                                                <div className="border-b border-slate-200">
                                                    <div className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-slate-600 bg-slate-100">
                                                        <span>Archived Groups</span>
                                                        <span className="text-xs text-slate-400 font-medium">{archivedGroups.length} groups</span>
                                                    </div>
                                                    {archivedGroups.map(group => {
                                                        const groupSales = groupedSales[group.name] || [];
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
                                                                <button
                                                                    onClick={() => handleDeleteGroup(group.name)}
                                                                    className="text-xs text-red-600 font-semibold"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                                {expandedGroups.includes(group.name) && (
                                                                    groupSales.length > 0 ? (
                                                                        <div>
                                                                            {groupSales.map(sale => (
                                                                            <motion.div
                                                                                key={sale.id}
                                                                                initial={{ opacity: 0 }}
                                                                                animate={{ opacity: 1 }}
                                                                                className="relative border-b border-slate-200"
                                                                            >
                                                                                <div className="absolute inset-0 flex items-center justify-end px-4 bg-slate-700 overflow-hidden">
                                                                                    <Archive className="text-white w-5 h-5" />
                                                                                </div>
                                                                                <motion.div
                                                                                    layout
                                                                                    drag="x"
                                                                                    dragDirectionLock
                                                                                    dragConstraints={{ left: 0, right: 0 }}
                                                                                    dragElastic={{ left: 0.8, right: 0 }}
                                                                                    dragSnapToOrigin
                                                                                    onDragEnd={(e, { offset }) => {
                                                                                        if (offset.x < -100) {
                                                                                            const shouldArchive = confirm('Archive this item?');
                                                                                            if (shouldArchive) {
                                                                                                handleArchiveSingle(sale.id);
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    className="p-2 flex items-center gap-2 relative z-10 transition-colors"
                                                                                    onClick={() => {
                                                                                        if (selectedIds.size > 0) {
                                                                                            toggleSelection(sale.id);
                                                                                        } else {
                                                                                            handleSaleClick(sale);
                                                                                        }
                                                                                    }}
                                                                                    onContextMenu={(e) => {
                                                                                        e.preventDefault();
                                                                                        toggleSelection(sale.id);
                                                                                    }}
                                                                                    style={{ backgroundColor: selectedIds.has(sale.id) ? '#f5f5f5' : '#ffffff' }}
                                                                                >
                                                                                    {selectedIds.size > 0 && (
                                                                                        <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                                            {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="flex justify-between items-start">
                                                                                        <div className="font-bold text-slate-800 text-[13px] truncate pr-2">{sale.brand} {sale.model}</div>
                                                                                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${sale.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                                                                                            (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'bg-slate-100 text-slate-900' :
                                                                                                sale.status === 'Inspection' ? 'bg-amber-50 text-amber-700' :
                                                                                                    sale.status === 'Archived' ? 'bg-slate-200 text-slate-600' :
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
                                                                                    {groupingAvailable && sale.group && (
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); handleRemoveFromGroup(sale.id); }}
                                                                                            className="mt-1 text-[9px] text-red-500 font-semibold hover:text-red-600"
                                                                                        >
                                                                                            Remove from group
                                                                                        </button>
                                                                                    )}
                                                                                    {sale.status === 'Archived' && (
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); handleRestoreSingle(sale.id); }}
                                                                                            className="mt-1 text-[9px] text-slate-600 font-semibold hover:text-slate-900"
                                                                                        >
                                                                                            Restore
                                                                                        </button>
                                                                                    )}
                                                                                    {isAdmin && sale.status === 'Completed' && (
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); openSellerReassignModal(sale); }}
                                                                                            className="mt-1 text-[9px] text-slate-600 font-semibold hover:text-slate-900"
                                                                                        >
                                                                                            Reassign seller
                                                                                        </button>
                                                                                    )}
                                                                                    </div>
                                                                                </motion.div>
                                                                            </motion.div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="px-4 py-3 text-xs text-slate-400 italic bg-white border-t border-slate-100">
                                                                            No cars in this archived group.
                                                                        </div>
                                                                    )
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {filteredSales.map(sale => (
                                                <motion.div
                                                    key={sale.id}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    className="relative border-b border-slate-200"
                                                >
                                                    <div className="absolute inset-0 flex items-center justify-end px-4 bg-slate-700 overflow-hidden">
                                                        <Archive className="text-white w-5 h-5" />
                                                    </div>
                                                    <motion.div
                                                        layout
                                                        drag="x"
                                                        dragDirectionLock
                                                        dragConstraints={{ left: 0, right: 0 }}
                                                        dragElastic={{ left: 0.8, right: 0 }}
                                                        dragSnapToOrigin
                                                        onDragEnd={(e, { offset }) => {
                                                            if (offset.x < -100) {
                                                                const shouldArchive = confirm('Archive this item?');
                                                                if (shouldArchive) {
                                                                    handleArchiveSingle(sale.id);
                                                                }
                                                            }
                                                        }}
                                                        className="p-2.5 flex items-center gap-2.5 relative z-10 transition-colors"
                                                        onClick={() => {
                                                            if (selectedIds.size > 0) {
                                                                toggleSelection(sale.id);
                                                            } else {
                                                                handleSaleClick(sale);
                                                            }
                                                        }}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            toggleSelection(sale.id);
                                                        }}
                                                        style={{ backgroundColor: selectedIds.has(sale.id) ? '#f5f5f5' : '#ffffff' }}
                                                    >
                                                        {selectedIds.size > 0 && (
                                                            <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                                                                {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                            </div>
                                                        )}

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-start">
                                                                <div className="font-bold text-slate-800 text-sm truncate pr-2">{sale.brand} {sale.model}</div>
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${sale.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                                                                    (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'bg-slate-100 text-slate-900' :
                                                                        sale.status === 'Inspection' ? 'bg-amber-50 text-amber-700' :
                                                                            sale.status === 'Archived' ? 'bg-slate-200 text-slate-600' :
                                                                                'bg-slate-100 text-slate-500'
                                                                    }`}>{sale.status}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[11px] text-slate-500 mt-0.5">
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
                                                                <div className="flex justify-end items-center text-[10px] mt-0.5 gap-1">
                                                                    <span className="text-slate-400">Korea:</span>
                                                                    <span className={`font-mono font-bold ${(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                        {(sale.costToBuy || 0) - (sale.amountPaidToKorea || 0) > 0 ? `Due €${((sale.costToBuy || 0) - (sale.amountPaidToKorea || 0)).toLocaleString()}` : 'Paid'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {sale.status === 'Archived' && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleRestoreSingle(sale.id); }}
                                                                    className="mt-1 text-[9px] text-slate-600 font-semibold hover:text-slate-900"
                                                                >
                                                                    Restore
                                                                </button>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                </motion.div>
                                            ))}
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
                                            <button onClick={handleAddProfile} className="bg-slate-900 text-white font-semibold px-4 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-60 shadow-sm" disabled={!isAdmin}><Plus className="w-5 h-5" /></button>
                                        </div>
                                        <input value={newProfileEmail} onChange={e => setNewProfileEmail(e.target.value)} placeholder="Email for setup link (optional)" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 md:p-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 disabled:opacity-60" disabled={!isAdmin} />
                                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
                                            New users don’t need a password at creation. Share the setup link to let them create one securely on first login.
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
                                    <button onClick={handleDeleteAll} className="w-full border border-slate-200 text-slate-700 py-2.5 md:py-3 rounded-xl hover:bg-slate-50 transition-colors">Archive All Data</button>
                                </div>
                            </div>
                        ) : view === 'invoices' ? (
                            <div className="flex-1 overflow-auto scroll-container p-3 md:p-6">
                                <h2 className="text-2xl font-bold text-slate-900 mb-4 md:mb-6">Invoices</h2>
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleAll(filteredSales)}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                                        disabled={filteredSales.length === 0}
                                    >
                                        {selectedInvoices.length > 0 && selectedInvoices.length === filteredSales.length ? (
                                            <CheckSquare className="w-4 h-4 text-slate-700" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                        Select all
                                    </button>
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                        {selectedInvoices.length > 0 && (
                                            <span>{selectedInvoices.length} selected</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadSelectedInvoices(selectedInvoices)}
                                            disabled={selectedInvoices.length === 0 || isDownloadingInvoices}
                                            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                            {isDownloadingInvoices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                            {isDownloadingInvoices ? 'Preparing...' : 'Download Selected'}
                                        </button>
                                        {isDownloadingInvoices && invoiceDownloadStatus && (
                                            <span className="text-xs text-slate-400">{invoiceDownloadStatus}</span>
                                        )}
                                    </div>
                                </div>
                                {filteredSales.length === 0 ? (
                                    <div className="text-center text-slate-500 py-20">
                                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                        <p>No invoices to display</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                                        {filteredSales.map(s => (
                                            <div
                                                key={s.id}
                                                className={`relative bg-white border rounded-2xl p-4 md:p-5 hover:border-slate-200 transition-all cursor-pointer group shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${selectedIds.has(s.id) ? 'border-slate-200 ring-2 ring-slate-200' : 'border-slate-100'}`}
                                                onClick={() => openInvoice(s, { stopPropagation: () => { } } as any)}
                                            >
                                                <div className="absolute top-3 left-3">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }}
                                                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(s.id) ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 text-transparent hover:border-slate-400'}`}
                                                    >
                                                        <CheckSquare className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <div className="flex justify-between items-start mb-2 md:mb-3">
                                                    <div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); openSaleForm(s, 'invoices'); }}
                                                            className="font-bold text-slate-900 text-lg text-left hover:text-slate-900 transition-colors"
                                                        >
                                                            {s.brand} {s.model}
                                                        </button>
                                                        <div className="text-xs text-slate-500">{s.year} • {(s.km || 0).toLocaleString()} km</div>
                                                    </div>
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${s.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                                                        s.status === 'In Progress' ? 'bg-amber-50 text-amber-700' :
                                                            s.status === 'Shipped' ? 'bg-slate-100 text-slate-700' :
                                                                s.status === 'Archived' ? 'bg-slate-200 text-slate-600' :
                                                                    'bg-slate-100 text-slate-500'
                                                        }`}>{s.status}</span>
                                                </div>
                                                <div className="space-y-1.5 md:space-y-2 text-sm">
                                                    <div className="flex justify-between text-slate-500">
                                                        <span>Buyer</span>
                                                        <span className="text-slate-800 truncate ml-2">{s.buyerName || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between text-slate-500">
                                                        <span>VIN</span>
                                                        <span className="font-mono text-xs text-slate-500">{(s.vin || '').slice(-8)}</span>
                                                    </div>
                                                    <div className="h-px bg-slate-200 my-1.5 md:my-2" />
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Sold Price</span>
                                                        <span className="text-emerald-600 font-bold">€{(s.soldPrice || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Balance</span>
                                                        <span className={calculateBalance(s) > 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>
                                                            €{calculateBalance(s).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="mt-3 md:mt-4 pt-2.5 md:pt-3 border-t border-slate-200 block">
                                                    <div className="flex justify-between items-center mb-2 md:mb-3">
                                                        <span className="text-xs text-slate-500">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDocumentPreview({ sale: s, type: 'deposit' }); }}
                                                            className="flex flex-col items-center justify-center p-1.5 md:p-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-500 gap-1 transition-colors border border-slate-200"
                                                        >
                                                            <FileText className="w-4 h-4 text-amber-500" />
                                                            View Deposit
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDocumentPreview({ sale: s, type: 'full_marreveshje' }); }}
                                                            className="flex flex-col items-center justify-center p-1.5 md:p-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-500 gap-1 transition-colors border border-slate-200"
                                                        >
                                                            <FileText className="w-4 h-4 text-slate-700" />
                                                            Marrëveshje
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDocumentPreview({ sale: s, type: 'full_shitblerje' }); }}
                                                            className="flex flex-col items-center justify-center p-1.5 md:p-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-500 gap-1 transition-colors border border-slate-200"
                                                        >
                                                            <FileText className="w-4 h-4 text-slate-600" />
                                                            Shitblerje
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openInvoice(s, e); }}
                                                            className="flex flex-col items-center justify-center p-1.5 md:p-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-500 gap-1 transition-colors border border-slate-200"
                                                        >
                                                            <FileText className="w-4 h-4 text-emerald-600" />
                                                            View Invoice
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
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

                                    {groupingAvailable && (
                                        <button onClick={handleCreateGroup} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                            <FolderPlus className="w-5 h-5 text-slate-600" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-slate-600">Create Group</span>
                                        </button>
                                    )}

                                    <div className="relative">
                                        <button onClick={() => setShowMoveMenu(!showMoveMenu)} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                            <ArrowRight className="w-5 h-5 text-amber-500" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-amber-500">Move</span>
                                        </button>
                                        {showMoveMenu && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white border border-slate-200 rounded-xl p-2 shadow-xl flex flex-col gap-1 w-48 z-50 animate-in fade-in zoom-in-95 duration-150">
                                                <div className="px-3 pt-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Move to tab</div>
                                                <button onClick={() => { handleBulkMove('In Progress'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Sales</button>
                                                <button onClick={() => { handleBulkMove('Shipped'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Shipped</button>
                                                <button onClick={() => { handleBulkMove('Inspection'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Inspections</button>
                                                <button onClick={() => { handleBulkMove('Autosallon'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Autosallon</button>
                                                <div className="px-3 pt-2 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Move to group</div>
                                                <button onClick={() => { handleBulkGroupMove(); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Ungrouped</button>
                                                {activeGroups.map(group => (
                                                    <button
                                                        key={group.name}
                                                        onClick={() => { handleBulkGroupMove(group.name); setShowMoveMenu(false); }}
                                                        className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                                                    >
                                                        {group.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <button onClick={() => handleBulkMove('Completed')} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                        <CheckSquare className="w-5 h-5 text-slate-700" />
                                        <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-slate-700">Sold</span>
                                    </button>

                                    {hasArchivedSelection && (
                                        <button onClick={handleBulkRestore} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                            <RefreshCw className="w-5 h-5 text-slate-600" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-slate-700">Restore</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={handleBulkArchive}
                                        title="Archive"
                                        className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group"
                                    >
                                        <Archive className="w-5 h-5 text-slate-500" />
                                        <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-slate-700">Archive</span>
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
                            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button
                                    onClick={() => {
                                        if (!editChoiceSale) return;
                                        setViewSaleRecord(editChoiceSale);
                                        setEditChoiceSale(null);
                                    }}
                                    className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 shadow-sm"
                                >
                                    View Sale
                                </button>
                                <button
                                    onClick={handleEditSaleChoice}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Edit Sale
                                </button>
                                <button
                                    onClick={handleEditShitblerjeChoice}
                                    className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
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
                                <div className="w-20" />
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
            {showSetupLinkModal && setupLinkData && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900">Invite link</h3>
                            <button onClick={() => setShowSetupLinkModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                            Share this link with <span className="font-semibold text-slate-900">{setupLinkData.name}</span> so they can set a password securely on first login.
                        </p>
                        <div className="flex items-center gap-2">
                            <input
                                readOnly
                                value={setupLinkData.url}
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600"
                            />
                            <button
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(setupLinkData.url);
                                        alert('Setup link copied.');
                                    } catch (e) {
                                        console.error(e);
                                        alert('Copy failed. Please copy the link manually.');
                                    }
                                }}
                                className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isSetupModalOpen && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900">Set your password</h3>
                            <button onClick={() => setIsSetupModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                            {setupAccount ? `Account: ${setupAccount.name}` : 'Use your setup link to activate your account.'}
                        </p>
                        <div className="space-y-3">
                            <input
                                type="password"
                                value={setupPassword}
                                onChange={(e) => setSetupPassword(e.target.value)}
                                placeholder="New password"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                            />
                            <input
                                type="password"
                                value={setupPasswordConfirm}
                                onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                                placeholder="Confirm password"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                            />
                            {setupError && <p className="text-sm text-red-500">{setupError}</p>}
                            {setupSuccess && <p className="text-sm text-emerald-600">{setupSuccess}</p>}
                        </div>
                        <button
                            onClick={handleSetupPasswordSubmit}
                            disabled={!setupAccount}
                            className="w-full mt-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save password
                        </button>
                    </div>
                </div>
            )}
            {showSellerReassignModal && sellerReassignSale && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900">Reassign seller</h3>
                            <button onClick={() => setShowSellerReassignModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                            {sellerReassignSale.brand} {sellerReassignSale.model} ({sellerReassignSale.vin || sellerReassignSale.id})
                        </p>
                        <select
                            value={sellerReassignTarget}
                            onChange={(e) => setSellerReassignTarget(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700"
                        >
                            <option value="">Select seller</option>
                            {profileOptions.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                        <button
                            onClick={async () => {
                                await handleSellerReassign(sellerReassignSale.id, sellerReassignTarget);
                                setShowSellerReassignModal(false);
                            }}
                            className="w-full mt-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800"
                        >
                            Save reassignment
                        </button>
                    </div>
                </div>
            )}
            {viewSaleRecord && (
                <ViewSaleModal
                    isOpen={!!viewSaleRecord}
                    sale={viewSaleRecord}
                    onClose={() => setViewSaleRecord(null)}
                    isAdmin={isAdmin}
                />
            )}

            {/* Contextual FAB for Inspections/Autosallon */}
            {documentPreview && (
                <EditablePreviewModal
                    isOpen={!!documentPreview}
                    onClose={() => setDocumentPreview(null)}
                    sale={documentPreview.sale}
                    documentType={documentPreview.type}
                    withDogane={documentPreview.withDogane}
                    onSaveToSale={(updates) => handlePreviewSaveToSale(documentPreview.sale.id, updates)}
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
        </div >
    );
}
