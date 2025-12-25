'use client';

import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import { CarSale, ContractType, SaleStatus } from '@/app/types';
import { Plus, Search, FileText, RefreshCw, Trash2, Copy, ArrowRight, CheckSquare, Square, X, Clipboard, GripVertical, Eye, EyeOff, LogOut, ChevronDown, ChevronUp, ArrowUpDown, Edit } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';

import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import SaleModal from './SaleModal';
import InvoiceModal from './InvoiceModal';
import ContractModal from './ContractModal';
import ProfileSelector from './ProfileSelector';
import InlineEditableCell from './InlineEditableCell';
import { processImportedData } from '@/services/openaiService';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient, syncSalesWithSupabase, syncTransactionsWithSupabase } from '@/services/supabaseService';

const getBankFee = (price: number) => {
    if (price <= 10000) return 20;
    if (price <= 20000) return 50;
    return 100;
};
const calculateBalance = (sale: CarSale) => (sale.soldPrice || 0) - ((sale.amountPaidCash || 0) + (sale.amountPaidBank || 0) + (sale.deposit || 0));
const calculateProfit = (sale: CarSale) => ((sale.soldPrice || 0) - (sale.costToBuy || 0) - getBankFee(sale.soldPrice || 0) - (sale.servicesCost ?? 30.51) - (sale.includeTransport ? 350 : 0));

const SortableSaleItem = ({ s, openInvoice, toggleSelection, selectedIds, userProfile, canViewPrices, onClick, onDelete, onInlineUpdate }: any) => {
    const controls = useDragControls();
    const isAdmin = userProfile === 'Admin';
    const canEdit = isAdmin || s.soldBy === userProfile;
    const statusClass = s.status === 'Completed' ? 'status-completed' :
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
        <Reorder.Item value={s} id={s.id} className="contents group table-row-hover">
            {/* Hidden Card View */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 relative shadow-sm hover:border-blue-400 transition-colors hidden">
                <div className="flex justify-between mb-4">
                    <div className="font-bold text-lg text-slate-800">{s.brand} {s.model}</div>
                    <button onClick={(e) => openInvoice(s, e)} className="text-blue-600 hover:text-blue-700"><FileText className="w-5 h-5" /></button>
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
                    <button onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(s.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-transparent hover:border-blue-400'}`}>
                        <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* 1. Checkbox Column */}
            <div className="p-1 xl:p-2 px-1.5 h-full flex items-center justify-center relative border-r border-slate-100 z-10 bg-white">
                <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1" onPointerDown={(e) => controls.start(e)}>
                    <GripVertical className="w-4 h-4 text-slate-400" />
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleSelection(s.id); }}
                    className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all cursor-pointer relative z-20 ${selectedIds.has(s.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-transparent hover:border-blue-500 hover:bg-blue-50'}`}
                >
                    {selectedIds.has(s.id) && <CheckSquare className="w-3.5 h-3.5" />}
                </button>
            </div>

            {/* 2. Car Info */}
            <div className="px-1 xl:px-2 h-full flex items-center font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis border-r border-slate-100 bg-white">
                <button
                    type="button"
                    onClick={onClick}
                    className="inline-flex items-center min-w-0 max-w-full truncate whitespace-nowrap text-left leading-none hover:text-blue-600 transition-colors"
                >
                    {s.brand} {s.model}
                </button>
            </div>

            {/* 3. Year */}
            <div className="px-1 xl:px-2 h-full flex items-center justify-center text-slate-600 border-r border-slate-100 bg-white">
                {canEdit ? (
                    <InlineEditableCell value={s.year} onSave={(v) => handleFieldUpdate('year', v)} type="number" className="text-slate-600" />
                ) : s.year}
            </div>

            {/* 4. KM */}
            <div className="px-1 xl:px-2 h-full flex items-center justify-center text-slate-500 font-mono text-sm border-r border-slate-100 bg-white">
                {canEdit ? (
                    <InlineEditableCell value={s.km || 0} onSave={(v) => handleFieldUpdate('km', v)} type="number" formatDisplay={(v) => `${Number(v || 0).toLocaleString()}`} className="text-slate-500" />
                ) : (s.km || 0).toLocaleString()}
            </div>

            {/* 5. Plate/VIN */}
            <div className="px-1 xl:px-2 h-full flex flex-col justify-center text-xs border-r border-slate-100 bg-white">
                {canEdit ? (
                    <>
                        <InlineEditableCell value={s.plateNumber} onSave={(v) => handleFieldUpdate('plateNumber', v)} className="font-mono text-slate-700 font-medium" />
                        <InlineEditableCell value={s.vin} onSave={(v) => handleFieldUpdate('vin', v)} className="text-slate-400 font-mono" placeholder="VIN" formatDisplay={(v) => (v ? String(v).slice(-6) : '-')} />
                    </>
                ) : (
                    <>
                        <div className="text-slate-700 font-mono font-medium">{s.plateNumber}</div>
                        <div className="text-slate-400 font-mono" title={s.vin}>{(s.vin || '').slice(-6)}</div>
                    </>
                )}
            </div>

            {/* 6. Buyer */}
            <div className="px-1 xl:px-2 h-full flex items-center text-slate-700 whitespace-normal break-words leading-tight border-r border-slate-100 bg-white" title={s.buyerName}>
                {canEdit ? (
                    <InlineEditableCell value={s.buyerName} onSave={(v) => handleFieldUpdate('buyerName', v)} placeholder="Buyer" className="text-slate-700" />
                ) : s.buyerName}
            </div>

            {/* 7. Seller */}
            <div className="px-1 xl:px-2 h-full flex items-center text-slate-600 truncate border-r border-slate-100 bg-white" title={s.sellerName}>
                {canEdit ? (
                    <InlineEditableCell value={s.sellerName} onSave={(v) => handleFieldUpdate('sellerName', v)} placeholder="Seller" className="text-slate-600" />
                ) : s.sellerName}
            </div>

            {/* 8. Shipping */}
            <div className="px-1 xl:px-2 h-full flex items-center text-slate-600 truncate border-r border-slate-100 bg-white" title={s.shippingName}>
                {canEdit ? (
                    <InlineEditableCell value={s.shippingName} onSave={(v) => handleFieldUpdate('shippingName', v)} placeholder="Shipping" className="text-slate-600" />
                ) : s.shippingName}
            </div>

            {/* 9. Cost (Admin Only) */}
            {isAdmin && (
                <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-slate-500 border-r border-slate-100 bg-white">
                    {canEdit ? (
                        <InlineEditableCell value={s.costToBuy || 0} onSave={(v) => handleFieldUpdate('costToBuy', v)} type="number" prefix="€" className="text-slate-500" />
                    ) : `€${(s.costToBuy || 0).toLocaleString()}`}
                </div>
            )}

            {/* 10. Sold (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-emerald-600 font-bold border-r border-slate-100 bg-white">
                    {canEdit ? (
                        <InlineEditableCell value={s.soldPrice || 0} onSave={(v) => handleFieldUpdate('soldPrice', v)} type="number" prefix="€" className="text-emerald-600 font-bold" />
                    ) : `€${(s.soldPrice || 0).toLocaleString()}`}
                </div>
            ) : (
                <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-slate-300 border-r border-slate-100 bg-white">-</div>
            )}

            {/* 11. Paid (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <div className="px-1 xl:px-2 h-full flex items-center justify-end border-r border-slate-100 bg-white">
                    {canEdit ? (
                        <div className="flex flex-col items-end gap-1 text-[10px] leading-tight">
                            <div className="flex items-center gap-1">
                                <span className="uppercase text-[9px] text-slate-400">Bank</span>
                                <InlineEditableCell value={s.amountPaidBank || 0} onSave={(v) => handleFieldUpdate('amountPaidBank', v)} type="number" prefix="€" className="text-sky-600 font-medium" />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="uppercase text-[9px] text-slate-400">Cash</span>
                                <InlineEditableCell value={s.amountPaidCash || 0} onSave={(v) => handleFieldUpdate('amountPaidCash', v)} type="number" prefix="€" className="text-slate-600 font-medium" />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="uppercase text-[9px] text-slate-400">Dep</span>
                                <InlineEditableCell value={s.deposit || 0} onSave={(v) => handleFieldUpdate('deposit', v)} type="number" prefix="€" className="text-slate-500 font-medium" />
                            </div>
                        </div>
                    ) : (
                        <div className="font-mono text-sky-600 font-medium">
                            €{((s.amountPaidCash || 0) + (s.amountPaidBank || 0) + (s.deposit || 0)).toLocaleString()}
                        </div>
                    )}
                </div>
            ) : (
                <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-slate-300 border-r border-slate-100 bg-white">-</div>
            )}

            {/* 12,13,14. Fees/Tax/Profit (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <>
                    <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-xs text-slate-400 border-r border-slate-100 bg-white">€{getBankFee(s.soldPrice || 0)}</div>
                    <div className="px-1 xl:px-2 h-full flex items-center justify-end border-r border-slate-100 bg-white">
                        {canEdit ? (
                            <InlineEditableCell value={s.servicesCost ?? 30.51} onSave={(v) => handleFieldUpdate('servicesCost', v)} type="number" prefix="€" className="text-slate-500 font-mono text-xs" />
                        ) : (
                            <span className="font-mono text-xs text-slate-400">€{(s.servicesCost ?? 30.51).toLocaleString()}</span>
                        )}
                    </div>
                    {isAdmin && <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono font-bold text-violet-600 whitespace-nowrap border-r border-slate-100 bg-white">€{calculateProfit(s).toLocaleString()}</div>}
                </>
            ) : (
                <>
                    <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-slate-300 border-r border-slate-100 bg-white">-</div>
                    <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-slate-300 border-r border-slate-100 bg-white">-</div>
                </>
            )}

            {/* 15. Balance (Admin OR own sale) */}
            {(isAdmin || s.soldBy === userProfile) ? (
                <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono font-bold border-r border-slate-100 bg-white">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${calculateBalance(s) > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        €{calculateBalance(s).toLocaleString()}
                    </span>
                </div>
            ) : (
                <div className="px-1 xl:px-2 h-full flex items-center justify-end font-mono text-slate-300 border-r border-slate-100 bg-white">-</div>
            )}

            {/* 15b. Korea Paid (Admin Only) */}
            {isAdmin && (
                <div className="px-1 xl:px-2 h-full flex flex-col items-center justify-center gap-1 border-r border-slate-100 bg-white">
                    {canEdit && (
                        <InlineEditableCell value={s.amountPaidToKorea || 0} onSave={(v) => handleFieldUpdate('amountPaidToKorea', v)} type="number" prefix="€" className="text-[10px] font-semibold text-slate-600" />
                    )}
                    <span className={`text-[10px] uppercase font-semibold whitespace-nowrap px-2 py-0.5 rounded-full ${(s.costToBuy || 0) - (s.amountPaidToKorea || 0) > 0 ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                        {(s.costToBuy || 0) - (s.amountPaidToKorea || 0) > 0 ? `Due €${((s.costToBuy || 0) - (s.amountPaidToKorea || 0)).toLocaleString()}` : 'Paid'}
                    </span>
                </div>
            )}

            {/* 16. Status */}
            <div className="px-1 xl:px-2 h-full flex items-center justify-center border-r border-slate-100 bg-white">
                {canEdit ? (
                    <InlineEditableCell value={s.status} onSave={(v) => handleFieldUpdate('status', v)} className={`status-badge ${statusClass}`} />
                ) : (
                    <span className={`status-badge ${statusClass}`}>{s.status}</span>
                )}
            </div>

            {/* 17. Sold By */}
            <div className="px-1 xl:px-2 h-full flex items-center justify-center text-xs border-r border-slate-100 bg-white">
                {canEdit ? (
                    <InlineEditableCell value={s.soldBy} onSave={(v) => handleFieldUpdate('soldBy', v)} className="text-slate-500" />
                ) : (
                    <span className="text-slate-500">{s.soldBy}</span>
                )}
            </div>

            {/* 18. Actions */}
            <div className="px-1 xl:px-2 h-full flex items-center justify-center gap-1 bg-white">
                <button onClick={(e) => openInvoice(s, e)} className="text-blue-500 hover:text-blue-700 transition-colors p-1.5 hover:bg-blue-50 rounded-lg" title="View Invoice">
                    <FileText className="w-4 h-4" />
                </button>
            </div>
        </Reorder.Item>
    );
};

const INITIAL_SALES: CarSale[] = [];

export default function Dashboard() {
    const dirtyIds = useRef<Set<string>>(new Set());
    const [, startTransition] = useTransition();
    const [sales, setSales] = useState<CarSale[]>([]);
    const salesRef = useRef(sales);
    useEffect(() => { salesRef.current = sales; }, [sales]);
    const [view, setView] = useState('profile_select');
    const [userProfile, setUserProfile] = useState<string | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<string[]>(['Robert Gashi', 'Admin', 'User']);
    const [isLoading, setIsLoading] = useState(true);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [pendingProfile, setPendingProfile] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [newProfileName, setNewProfileName] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [rememberProfile, setRememberProfile] = useState(false);

    const canViewPrices = userProfile === 'Admin';
    const isAdmin = userProfile === 'Admin';

    const [sortBy, setSortBy] = useState<string>('createdAt');

    useEffect(() => {
        if (!isAdmin && (sortBy === 'koreaBalance' || sortBy === 'costToBuy')) {
            setSortBy('createdAt');
        }
    }, [isAdmin, sortBy]);

    const [activeCategory, setActiveCategory] = useState<SaleStatus | 'SALES' | 'INVOICES' | 'SHIPPED' | 'INSPECTIONS' | 'AUTOSALLON'>('SALES');
    const [editingSale, setEditingSale] = useState<CarSale | null>(null);
    const [formReturnView, setFormReturnView] = useState('dashboard');
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['ACTIVE', '5 december', '15 november SANG SHIN']);
    const [customGroups, setCustomGroups] = useState<string[]>(['ACTIVE', '5 december', '15 november SANG SHIN']);
    const [invoiceSale, setInvoiceSale] = useState<CarSale | null>(null);
    const [contractSale, setContractSale] = useState<CarSale | null>(null);
    const [contractType, setContractType] = useState<ContractType>('full_shitblerje');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    const isFormOpen = view === 'sale_form';
    const isFormOpenRef = React.useRef(isFormOpen);

    const persistUserProfile = async (profile: string | null, remember = rememberProfile) => {
        if (remember && profile) {
            await Preferences.set({ key: 'user_profile', value: profile });
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

    const closeSaleForm = (returnView = formReturnView) => {
        setEditingSale(null);
        setView(returnView);
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
                        current = { ...current, ...data.attachments.avatars };
                        setProfileAvatars(current);
                        await Preferences.set({ key: 'profile_avatars', value: JSON.stringify(current) });
                    } else {
                        setProfileAvatars(current);
                    }
                } catch (e) {
                    console.error("Avatar Sync Error", e);
                    setProfileAvatars(current);
                }
            } else {
                setProfileAvatars(current);
            }
        };
        syncAvatars();
    }, [supabaseUrl, supabaseKey]);

    const handleEditAvatar = async (name: string, base64: string) => {
        const updated = { ...profileAvatars, [name]: base64 };
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
                    const cloudProfiles: string[] = data.attachments.profiles;
                    // Use cloud as source of truth - don't merge with defaults
                    setAvailableProfiles(cloudProfiles);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(cloudProfiles) });
                } else {
                    // Only set defaults if cloud has no data
                    const systemDefaults = ['Robert Gashi', 'Admin', 'User', 'Robert'];
                    setAvailableProfiles(systemDefaults);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(systemDefaults) });
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
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [touchStartY, setTouchStartY] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

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
        if (passwordInput === 'Robertoo1396$') {
            setUserProfile(pendingProfile);
            persistUserProfile(pendingProfile);
            setShowProfileMenu(false);
            performAutoSync(supabaseUrl, supabaseKey, pendingProfile);
            setShowPasswordModal(false);
            setPasswordInput('');
            setPendingProfile('');
        } else {
            alert('Incorrect Password!');
        }
    };




    // Invoice Auto-Sync
    useEffect(() => {
        if (invoiceSale) {
            const updated = sales.find(s => s.id === invoiceSale.id);
            if (updated && JSON.stringify(updated) !== JSON.stringify(invoiceSale)) {
                setInvoiceSale(updated);
            }
        }
    }, [sales, invoiceSale]);


    const updateSalesAndSave = async (newSales: CarSale[]) => {
        setSales(newSales);
        try {
            await Preferences.set({ key: 'car_sales_data', value: JSON.stringify(newSales) });
            localStorage.setItem('car_sales_data', JSON.stringify(newSales));

            if (Capacitor.isNativePlatform()) {
                await Filesystem.writeFile({
                    path: 'sales_backup.json',
                    data: JSON.stringify(newSales, null, 2),
                    directory: Directory.Documents,
                    encoding: Encoding.UTF8
                });
            }
            if (supabaseUrl && supabaseKey && userProfile) {
                await performAutoSync(supabaseUrl, supabaseKey, userProfile, newSales);
            }
        } catch (e) { console.error("Save failed", e); }
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

    const handleInlineUpdate = async (id: string, field: keyof CarSale, value: string | number) => {
        const currentSales = salesRef.current;
        const index = currentSales.findIndex(s => s.id === id);
        if (index === -1) return;

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

        const updatedSale = { ...currentSales[index], [field]: normalized };
        const newSales = [...currentSales];
        newSales[index] = updatedSale;
        dirtyIds.current.add(id);
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
    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const toggleAll = (visibleSales: CarSale[]) => {
        if (selectedIds.size === visibleSales.length && visibleSales.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(visibleSales.map(s => s.id)));
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
    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev =>
            prev.includes(groupName)
                ? prev.filter(g => g !== groupName)
                : [...prev, groupName]
        );
    };

    const handleDeleteGroup = async (groupName: string) => {
        if (!confirm(`Delete group "${groupName}" and all its cars?`)) return;
        const newSales = sales.filter(s => s.group !== groupName);
        await updateSalesAndSave(newSales);
        setCustomGroups(prev => prev.filter(g => g !== groupName));
        setExpandedGroups(prev => prev.filter(g => g !== groupName));
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

    const handleAddProfile = async () => {
        if (!newProfileName.trim()) return;
        const updated = [...availableProfiles, newProfileName.trim()];
        setAvailableProfiles(updated);
        setUserProfile(newProfileName.trim());
        setNewProfileName('');
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
        await persistUserProfile(newProfileName.trim());
        syncProfilesToCloud(updated);
    };

    const quickAddProfile = async () => {
        const name = prompt("Enter new profile name:");
        if (name && name.trim()) {
            const updated = [...availableProfiles, name.trim()];
            setAvailableProfiles(updated);
            setUserProfile(name.trim());
            await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
            await persistUserProfile(name.trim());
            setShowProfileMenu(false);
            syncProfilesToCloud(updated);
        }
    };

    const handleDeleteProfile = async (name: string) => {
        const updated = availableProfiles.filter(p => p !== name);
        setAvailableProfiles(updated);
        if (userProfile === name) setUserProfile('');
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
        syncProfilesToCloud(updated);
    };

    const handleEditProfile = async (oldName: string, newName: string) => {
        if (!newName.trim() || availableProfiles.includes(newName)) return;
        const updated = availableProfiles.map(p => p === oldName ? newName : p);
        setAvailableProfiles(updated);
        if (userProfile === oldName) {
            setUserProfile(newName);
            await persistUserProfile(newName);
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
                if (storedProfile && shouldRemember) {
                    setUserProfile(storedProfile);
                    setView('landing');
                } else if (storedProfile && !shouldRemember) {
                    await Preferences.remove({ key: 'user_profile' });
                }

                let { value: profiles } = await Preferences.get({ key: 'available_profiles' });
                if (profiles) {
                    const loaded = JSON.parse(profiles);
                    // Use stored profiles as-is - don't merge with defaults
                    setAvailableProfiles(loaded);
                } else {
                    const defaults = ['Robert Gashi', 'Admin', 'User', 'Robert'];
                    setAvailableProfiles(defaults);
                    await Preferences.set({ key: 'available_profiles', value: JSON.stringify(defaults) });
                    // Also sync to cloud on first run
                    syncProfilesToCloud(defaults);
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
                setSales(currentSales.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)));

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
                dirtyItems.forEach(s => dirtyIds.current.delete(s.id));
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

                    setSales(uniqueSales);
                    await Preferences.set({ key: 'car_sales_data', value: JSON.stringify(uniqueSales) });
                    localStorage.setItem('car_sales_data', JSON.stringify(uniqueSales));
                }
            } else if (salesRes.error) {
                console.error("Sales Sync Failed:", salesRes.error);
                setSyncError(`Sales Sync Failed: ${salesRes.error} `);
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

    const handleAddSale = async (sale: CarSale) => {
        if (!sale.id) {
            console.error("Attempted to save sale without ID");
            return;
        }
        setIsSyncing(true);
        dirtyIds.current.add(sale.id);

        try {
            const currentSales = salesRef.current;
            const index = currentSales.findIndex(s => s.id === sale.id);
            let newSales;

            if (index >= 0) {
                // UPDATE
                newSales = [...currentSales];
                newSales[index] = { ...sale, soldBy: currentSales[index].soldBy };
            } else {
                // CREATE
                newSales = [...currentSales, { ...sale, soldBy: userProfile || 'Unknown' }];
            }

            await updateSalesAndSave(newSales);

            alert(editingSale ? 'Sale updated successfully and saved to database!' : 'Sale created successfully and saved to database!');
            const nextView = formReturnView === 'landing' ? 'dashboard' : formReturnView;
            closeSaleForm(nextView);
        } catch (e) {
            console.error("Save Error", e);
            alert("Error saving sale. Data is saved locally but might not be synced.");
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

    const openInvoice = (sale: CarSale, e: React.MouseEvent) => { e.stopPropagation(); setInvoiceSale(sale); };

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
                                            setUserProfile(data.settings.userProfile);
                                            await persistUserProfile(data.settings.userProfile);
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

    const filteredSales = React.useMemo(() => sales.filter(s => {
        // Filter out system config rows
        if (s.id === 'config_profile_avatars') return false;

        // Restrict visibility for non-admin users to their own sales
        if (!isAdmin && s.soldBy !== userProfile) return false;


        // Category Filter
        if (activeCategory === 'SHIPPED' && s.status !== 'Shipped') return false;
        if (activeCategory === 'INSPECTIONS' && s.status !== 'Inspection') return false;
        if (activeCategory === 'AUTOSALLON' && s.status !== 'Autosallon') return false;
        if (activeCategory === 'SALES' && ['Shipped', 'Inspection', 'Autosallon'].includes(s.status)) return false;

        const term = searchTerm.toLowerCase().trim();
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
    }), [sales, userProfile, activeCategory, searchTerm, sortBy, sortDir]);

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

    const [groupBy, setGroupBy] = useState<'none' | 'status' | 'brand'>('none');

    const groupedSales = React.useMemo(() => {
        if (groupBy === 'none') return { 'All': filteredSales };
        const groups: Record<string, CarSale[]> = {};
        filteredSales.forEach(s => {
            const key = groupBy === 'status' ? s.status : s.brand;
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        });
        return groups;
    }, [filteredSales, groupBy]);



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
                setUserProfile(p);
                setView('landing');
                setRememberProfile(remember);
                persistUserProfile(p, remember);
            }}
            onAdd={(name, remember) => {
                const updated = [...availableProfiles, name];
                setAvailableProfiles(updated);
                Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
                setUserProfile(name);
                setRememberProfile(remember);
                persistUserProfile(name, remember);
                syncProfilesToCloud(updated);
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
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-white to-slate-100 border border-slate-200 flex items-center justify-center text-blue-600 group-hover:scale-110 group-hover:from-slate-900 group-hover:to-black group-hover:text-white group-hover:border-slate-900 transition-all duration-300 shadow-inner">
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
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-white to-slate-100 border border-slate-200 flex items-center justify-center text-violet-600 group-hover:scale-110 group-hover:from-slate-900 group-hover:to-black group-hover:text-white group-hover:border-slate-900 transition-all duration-300 shadow-inner">
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
                                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">KORAUTO</h1>
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
                                className={`p-2 rounded-full hover:bg-slate-100 transition-all ${isSyncing ? 'animate-spin text-blue-500' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Force Sync"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>
                            <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-900 to-black p-[2px] shadow-md hover:shadow-lg transition-all hover:scale-105">
                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-sm font-bold text-blue-600">
                                    {userProfile ? userProfile[0].toUpperCase() : 'U'}
                                </div>
                            </button>

                            {showProfileMenu && (
                                <div className="absolute right-0 top-12 bg-white border border-slate-200 rounded-xl p-2 w-52 shadow-xl z-[60]">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide px-3 py-2">Switch Profile</div>
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {availableProfiles.map(p => (
                                            <button key={p} onClick={() => {
                                                if ((p === 'Admin' || p === 'Robert') && userProfile !== p) {
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
                                    <button onClick={quickAddProfile} className="w-full text-left px-3 py-2.5 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors">
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
                            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}
                                className="hidden md:block bg-white border border-slate-200 text-slate-700 text-sm rounded-full px-3 py-2.5 outline-none focus:ring-2 focus:ring-slate-400/15 focus:border-slate-300 appearance-none cursor-pointer transition-all shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                                <option value="none">No Grouping</option>
                                <option value="status">Group by Status</option>
                                <option value="brand">Group by Brand</option>
                            </select>
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
                                {(['SALES', 'SHIPPED', 'INSPECTIONS', 'AUTOSALLON'] as const).map(cat => {
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

                            <div className="border border-slate-100 rounded-2xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] relative hidden md:block overflow-auto flex-1">
                                <div className="grid text-[10px] xl:text-xs divide-y divide-slate-200 min-w-max"
                                    style={{
                                        gridTemplateColumns: isAdmin ? 'var(--cols-admin)' : 'var(--cols-user)'
                                    }}>
                                    <div className="bg-slate-50 font-medium text-slate-500 grid grid-cols-subgrid sticky top-0 z-30 border-b border-slate-200" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                        <div className="p-1 xl:p-2 flex items-center justify-center cursor-pointer hover:text-slate-700" onClick={() => toggleAll(filteredSales)}>
                                            {selectedIds.size > 0 && selectedIds.size === filteredSales.length ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}
                                        </div>
                                        <div className="p-1 xl:p-2 pl-2 cursor-pointer hover:text-slate-700 flex items-center gap-1" onClick={() => toggleSort('brand')}>
                                            Car Info {sortBy === 'brand' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2 text-center cursor-pointer hover:text-slate-700 flex items-center justify-center gap-1" onClick={() => toggleSort('year')}>
                                            Year {sortBy === 'year' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2 text-center cursor-pointer hover:text-slate-700 flex items-center justify-center gap-1" onClick={() => toggleSort('km')}>
                                            KM {sortBy === 'km' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2.5 cursor-pointer hover:text-slate-700 flex items-center gap-1" onClick={() => toggleSort('plateNumber')}>
                                            Plate/VIN {sortBy === 'plateNumber' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2.5 cursor-pointer hover:text-slate-700 flex items-center gap-1" onClick={() => toggleSort('buyerName')}>
                                            Buyer {sortBy === 'buyerName' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2.5 cursor-pointer hover:text-slate-700 flex items-center gap-1" onClick={() => toggleSort('sellerName')}>
                                            Seller {sortBy === 'sellerName' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2.5 cursor-pointer hover:text-slate-700 flex items-center gap-1" onClick={() => toggleSort('shippingName')}>
                                            Shipping {sortBy === 'shippingName' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        {isAdmin && (
                                            <div className="p-1 xl:p-2.5 text-right cursor-pointer hover:text-slate-700 flex items-center justify-end gap-1" onClick={() => toggleSort('costToBuy')}>
                                                Cost {sortBy === 'costToBuy' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                            </div>
                                        )}
                                        <div className="p-1 xl:p-2.5 text-right cursor-pointer hover:text-slate-700 flex items-center justify-end gap-1" onClick={() => toggleSort('soldPrice')}>
                                            Sold {sortBy === 'soldPrice' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2.5 text-right">Paid</div>
                                        <div className="p-1 xl:p-2.5 text-right">Bank Fee</div>
                                        <div className="p-1 xl:p-2.5 text-right">Tax</div>
                                        {isAdmin && <div className="p-1 xl:p-2.5 text-right text-blue-600">Profit</div>}
                                        <div className="p-1 xl:p-2.5 text-right">Balance</div>
                                        {isAdmin && <div className="p-1 xl:p-2.5 text-center cursor-pointer hover:text-slate-700 flex items-center justify-center gap-1" onClick={() => toggleSort('koreaBalance')}>
                                            Korea {sortBy === 'koreaBalance' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>}
                                        <div className="p-1 xl:p-2.5 text-center cursor-pointer hover:text-slate-700 flex items-center justify-center gap-1" onClick={() => toggleSort('status')}>
                                            Status {sortBy === 'status' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2.5 text-center cursor-pointer hover:text-slate-700 flex items-center justify-center gap-1" onClick={() => toggleSort('soldBy')}>
                                            Sold By {sortBy === 'soldBy' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                        <div className="p-1 xl:p-2.5"></div>
                                    </div>
                                    {/* Render Rows - Simple flat list */}
                                    <Reorder.Group axis="y" values={filteredSales} onReorder={(newOrder) => {
                                        setSales(prev => {
                                            const next = [...prev];
                                            newOrder.forEach((newItem, newIndex) => {
                                                const foundIndex = next.findIndex(x => x.id === newItem.id);
                                                if (foundIndex !== -1) next[foundIndex] = { ...next[foundIndex], sortOrder: newIndex };
                                            });
                                            return next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                        });
                                    }} className="grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16', display: 'grid' }}>
                                        {filteredSales.map(s => (
                                            <SortableSaleItem
                                                key={s.id}
                                                s={s}
                                                userProfile={userProfile}
                                                canViewPrices={canViewPrices}
                                                toggleSelection={toggleSelection}
                                                selectedIds={selectedIds}
                                                openInvoice={openInvoice}
                                                onInlineUpdate={handleInlineUpdate}
                                                onClick={() => {
                                                    if (!isAdmin && s.soldBy !== userProfile) {
                                                        alert("You do not have permission to edit this sale.");
                                                        return;
                                                    }
                                                    openSaleForm(s);
                                                }}
                                                onDelete={handleDeleteSingle}
                                            />
                                        ))}
                                    </Reorder.Group>

                                    {/* Footer Totals */}
                                    <div className="bg-slate-50 font-bold border-t border-slate-200 sticky bottom-0 z-30 grid grid-cols-subgrid" style={{ gridColumn: isAdmin ? 'span 19' : 'span 16' }}>
                                        <div className="p-3 text-right col-span-8 text-slate-600">Totals</div>
                                        {isAdmin && <div className="p-3 text-right font-mono text-slate-700">€{totalCost.toLocaleString()}</div>}
                                        <div className="p-3 text-right font-mono text-emerald-600">€{totalSold.toLocaleString()}</div>
                                        <div className="p-3 text-right font-mono text-slate-500">€{totalPaid.toLocaleString()}</div>
                                        {isAdmin && <>
                                            <div className="p-3 text-right font-mono text-slate-400 text-xs">€{totalBankFee.toLocaleString()}</div>
                                            <div className="p-3 text-right font-mono text-slate-400 text-xs">€{totalServices.toLocaleString()}</div>
                                            <div className="p-3 text-right font-mono text-blue-600">€{totalProfit.toLocaleString()}</div>
                                        </>}
                                        <div className="p-3 col-span-3"></div>
                                    </div>
                                </div>
                            </div>
                            {/* Mobile Card View */}
                            {/* Mobile Compact List View - Swipeable */}
                            <div className="md:hidden flex flex-col flex-1 h-full overflow-hidden relative">
                                <div className="flex flex-col flex-1 overflow-y-auto pb-16 no-scrollbar">
                                    {filteredSales.map(sale => (
                                        <motion.div
                                            key={sale.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="relative border-b border-slate-200"
                                        >
                                            {/* Background Action (Delete) */}
                                            <div className="absolute inset-0 flex items-center justify-end px-4 bg-red-600 overflow-hidden">
                                                <Trash2 className="text-white w-5 h-5" />
                                            </div>

                                            {/* Foreground Card */}
                                            <motion.div
                                                layout
                                                drag="x"
                                                dragDirectionLock
                                                dragConstraints={{ left: 0, right: 0 }}
                                                dragElastic={{ left: 0.8, right: 0 }}
                                                dragSnapToOrigin
                                                onDragEnd={(e, { offset, velocity }) => {
                                                    if (offset.x < -100) {
                                                        const shouldDelete = confirm('Delete this item?');
                                                        if (shouldDelete) {
                                                            handleDeleteSingle(sale.id);
                                                        }
                                                    }
                                                }}
                                                className={`p-2.5 flex items-center gap-2.5 relative z-10 transition-colors`}
                                                onClick={() => {
                                                    if (selectedIds.size > 0) {
                                                        toggleSelection(sale.id);
                                                    } else {
                                                        if (!isAdmin && sale.soldBy !== userProfile) {
                                                            alert("You do not have permission to edit this sale.");
                                                            return;
                                                        }
                                                        openSaleForm(sale);
                                                    }
                                                }}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    toggleSelection(sale.id);
                                                }}
                                                style={{ backgroundColor: selectedIds.has(sale.id) ? '#f5f5f5' : '#ffffff' }}
                                            >
                                                {selectedIds.size > 0 && (
                                                    <div className={`w-5 h-5 min-w-[1.25rem] rounded-full border flex items-center justify-center transition-all ${selectedIds.has(sale.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                                        {selectedIds.has(sale.id) && <CheckSquare className="w-3 h-3 text-white" />}
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <div className="font-bold text-slate-800 text-sm truncate pr-2">{sale.brand} {sale.model}</div>
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${sale.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                                                            (sale.status === 'New' || sale.status === 'In Progress' || sale.status === 'Autosallon') ? 'bg-slate-100 text-blue-600' :
                                                                sale.status === 'Inspection' ? 'bg-amber-50 text-amber-700' :
                                                                    'bg-slate-100 text-slate-500'
                                                            }`}>{sale.status}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-[11px] text-slate-500 mt-0.5">
                                                        <span>{sale.year} • {(sale.km || 0).toLocaleString()} km</span>
                                                        {(isAdmin || sale.soldBy === userProfile) ? (
                                                            <span className={`font-mono font-bold ${calculateBalance(sale) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                                {calculateBalance(sale) > 0 ? `Due: €${calculateBalance(sale).toLocaleString()}` : 'Paid'}
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
                                                </div>
                                            </motion.div>
                                        </motion.div>
                                    ))}
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
                                            <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="Add New Profile" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 md:p-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400" />
                                            <button onClick={handleAddProfile} className="bg-emerald-600 text-white font-bold px-4 rounded-xl hover:bg-emerald-500 transition-colors"><Plus className="w-5 h-5" /></button>
                                        </div>
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
                            <div className="flex-1 overflow-auto p-3 md:p-6">
                                <h2 className="text-2xl font-bold text-slate-900 mb-4 md:mb-6">Invoices</h2>
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
                                                className="bg-white border border-slate-100 rounded-2xl p-4 md:p-5 hover:border-slate-200 transition-all cursor-pointer group shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                                                onClick={() => openInvoice(s, { stopPropagation: () => { } } as any)}
                                            >
                                                <div className="flex justify-between items-start mb-2 md:mb-3">
                                                    <div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); openSaleForm(s, 'invoices'); }}
                                                            className="font-bold text-slate-900 text-lg text-left hover:text-blue-600 transition-colors"
                                                        >
                                                            {s.brand} {s.model}
                                                        </button>
                                                        <div className="text-xs text-slate-500">{s.year} • {(s.km || 0).toLocaleString()} km</div>
                                                    </div>
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${s.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                                                        s.status === 'In Progress' ? 'bg-amber-50 text-amber-700' :
                                                            s.status === 'Shipped' ? 'bg-purple-50 text-purple-700' :
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
                                                            onClick={(e) => { e.stopPropagation(); setContractSale(s); setContractType('deposit'); }}
                                                            className="flex flex-col items-center justify-center p-1.5 md:p-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-500 gap-1 transition-colors border border-slate-200"
                                                        >
                                                            <FileText className="w-4 h-4 text-amber-500" />
                                                            View Deposit
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setContractSale(s); setContractType('full_marreveshje'); }}
                                                            className="flex flex-col items-center justify-center p-1.5 md:p-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-500 gap-1 transition-colors border border-slate-200"
                                                        >
                                                            <FileText className="w-4 h-4 text-blue-500" />
                                                            Marrëveshje
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setContractSale(s); setContractType('full_shitblerje'); }}
                                                            className="flex flex-col items-center justify-center p-1.5 md:p-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-500 gap-1 transition-colors border border-slate-200"
                                                        >
                                                            <FileText className="w-4 h-4 text-indigo-500" />
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
                                        <span className="font-mono text-xl font-bold text-blue-600 leading-none">{selectedIds.size}</span>
                                    </div>

                                    {selectedIds.size === 1 && (
                                        <button
                                            onClick={() => {
                                                const sale = sales.find(s => s.id === Array.from(selectedIds)[0]);
                                                if (sale) { openSaleForm(sale); }
                                            }}
                                            className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 tooltip flex flex-col items-center gap-1 group relative"
                                        >
                                            <Edit className="w-5 h-5 text-blue-400" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-blue-500">Edit</span>
                                        </button>
                                    )}

                                    <button onClick={handleBulkCopy} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                        <Copy className="w-5 h-5 text-emerald-500" />
                                        <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-emerald-500">Copy</span>
                                    </button>

                                    <div className="relative">
                                        <button onClick={() => setShowMoveMenu(!showMoveMenu)} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                            <ArrowRight className="w-5 h-5 text-amber-500" />
                                            <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-amber-500">Move</span>
                                        </button>
                                        {showMoveMenu && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white border border-slate-200 rounded-xl p-2 shadow-xl flex flex-col gap-1 w-32 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                <button onClick={() => { handleBulkMove('In Progress'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Sales</button>
                                                <button onClick={() => { handleBulkMove('Shipped'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Shipped</button>
                                                <button onClick={() => { handleBulkMove('Inspection'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Inspections</button>
                                                <button onClick={() => { handleBulkMove('Autosallon'); setShowMoveMenu(false); }} className="px-3 py-2 text-left text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">Autosallon</button>
                                            </div>
                                        )}
                                    </div>

                                    <button onClick={() => handleBulkMove('Completed')} className="p-3 hover:bg-slate-100 rounded-xl text-slate-700 flex flex-col items-center gap-1 group">
                                        <CheckSquare className="w-5 h-5 text-blue-500" />
                                        <span className="text-[9px] uppercase font-bold text-slate-500 group-hover:text-blue-500">Sold</span>
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
            <AnimatePresence>
                {view === 'sale_form' && (
                    <motion.div
                        className="fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <motion.div
                            className="absolute inset-0 bg-white flex flex-col"
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 24 }}
                            transition={{ duration: 0.25 }}
                        >
                            <button
                                onClick={() => closeSaleForm()}
                                className="absolute top-4 right-4 md:top-6 md:right-6 z-10 h-10 w-10 rounded-full bg-white/90 border border-slate-200 text-slate-600 shadow-sm hover:text-slate-900 hover:border-slate-300 hover:shadow-md transition-all duration-200 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                                aria-label="Close sale form"
                                type="button"
                            >
                                <X className="w-5 h-5 mx-auto" />
                            </button>
                            <div className="flex-1 overflow-hidden flex flex-col px-4 md:px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                                <div className="flex items-center justify-between mb-4 md:mb-6">
                                    <button onClick={() => closeSaleForm()} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors">
                                        <ArrowRight className="w-5 h-5 rotate-180" />
                                        {formReturnView === 'landing' ? 'Back to Menu' : formReturnView === 'invoices' ? 'Back to Invoices' : 'Back to Dashboard'}
                                    </button>
                                    <h2 className="text-2xl font-bold text-slate-900">{editingSale ? 'Edit Sale' : 'New Sale Entry'}</h2>
                                    <div className="w-20" />
                                </div>
                                <div className="flex-1 overflow-hidden bg-white">
                                    <SaleModal
                                        isOpen={true}
                                        inline={true}
                                        onClose={() => closeSaleForm()}
                                        onSave={handleAddSale}
                                        existingSale={editingSale}
                                        defaultStatus={activeCategory === 'INSPECTIONS' ? 'Inspection' : activeCategory === 'AUTOSALLON' ? 'Autosallon' : 'New'}
                                        isAdmin={isAdmin}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Contextual FAB for Inspections/Autosallon */}
            {invoiceSale && <InvoiceModal isOpen={!!invoiceSale} onClose={() => setInvoiceSale(null)} sale={invoiceSale} />}
            {contractSale && <ContractModal sale={contractSale} type={contractType} onClose={() => setContractSale(null)} />}
            {
                showPasswordModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}>
                        <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Enter Admin Password</h3>
                            <div className="relative mb-6">
                                <input
                                    type={isPasswordVisible ? 'text' : 'password'}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pr-12 text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-colors"
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
                                    className="h-4 w-4 accent-blue-600"
                                />
                                Remember me on this device
                            </label>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button onClick={handlePasswordSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-bold transition-colors shadow-sm">Submit</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {view !== 'sale_form' && (
                <button
                    onClick={() => openSaleForm(null)}
                    className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-[60] h-12 w-12 rounded-full border border-slate-200 bg-white/90 text-slate-900 shadow-lg shadow-slate-900/10 hover:shadow-xl hover:border-slate-300 hover:scale-105 transition-all duration-200 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                    aria-label="Add sale"
                    type="button"
                >
                    <Plus className="w-5 h-5 mx-auto" />
                </button>
            )}
        </div >
    );
}
