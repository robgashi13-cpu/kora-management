'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CarSale, SaleStatus } from '@/app/types';
import { RECOVERED_SALES } from './RecoveredData';
import { Plus, Search, FileText, Settings, Upload, Download, RefreshCw, Smartphone, Trash2, Copy, Scissors, ArrowRight, CheckSquare, Square, Edit, Move, X, Clipboard, GripVertical, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';

// ... (props interface etc)

import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import SaleModal from './SaleModal';
import InvoiceModal from './InvoiceModal';
import ProfileSelector from './ProfileSelector';
import AiAssistant from './AiAssistant';
import { chatWithData, processImportedData } from '@/services/openaiService';
import { createSupabaseClient, syncSalesWithSupabase, syncTransactionsWithSupabase } from '@/services/supabaseService';

const SortableSaleItem = ({ s, toggleSelection, selectedIds, openInvoice }: any) => {
    const controls = useDragControls();

    return (
        <Reorder.Item value={s} dragListener={false} dragControls={controls} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-5 relative group shadow-lg hover:border-blue-500/30 transition-colors touch-none">
            {/* Drag Handle - The Grip */}
            <div className="absolute top-5 right-4 text-gray-600 cursor-grab active:cursor-grabbing hover:text-white touch-none p-2 hover:bg-white/5 rounded-lg transition-colors z-20" onPointerDown={(e) => controls.start(e)}>
                <GripVertical className="w-6 h-6" />
            </div>

            <div className="absolute top-4 left-4 z-10">
                <button onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }} className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedIds.has(s.id) ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/20 text-transparent hover:border-white/40'} `}>
                    <CheckSquare className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="flex justify-between mb-4 pl-8 pr-12">
                <div className="font-bold text-lg">{s.brand} {s.model}</div>
                <button onClick={(e) => openInvoice(s, e)} className="text-blue-400 hover:text-blue-300"><FileText className="w-5 h-5" /></button>
            </div>
            <div className="text-sm text-gray-400 space-y-2 pl-8">
                <div className="flex justify-between"><span>VIN</span><span className="font-mono">{s.vin}</span></div>
                <div className="flex justify-between"><span>Buyer</span><span>{s.buyerName}</span></div>
                <div className="flex justify-between pt-2 border-t border-white/5 mt-2"><span className="text-white font-bold text-lg">€{(s.soldPrice || 0).toLocaleString()}</span></div>
            </div>

            <div className="absolute bottom-4 right-4">
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${((s.soldPrice || 0) - ((s.amountPaidCash || 0) + (s.amountPaidBank || 0) + (s.deposit || 0))) > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'} `}>
                    Bal: €{((s.soldPrice || 0) - ((s.amountPaidCash || 0) + (s.amountPaidBank || 0) + (s.deposit || 0))).toLocaleString()}
                </span>
            </div>
        </Reorder.Item>
    );
};

const INITIAL_SALES: CarSale[] = [];

export default function Dashboard() {
    const [sales, setSales] = useState<CarSale[]>([]);
    const [view, setView] = useState<'dashboard' | 'invoices' | 'settings'>('dashboard');
    const [activeCategory, setActiveCategory] = useState<'SALES' | 'SHIPPED' | 'INSPECTIONS' | 'AUTOSALLON'>('SALES');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSale, setEditingSale] = useState<CarSale | null>(null);
    const [invoiceSale, setInvoiceSale] = useState<CarSale | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [importStatus, setImportStatus] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [userProfile, setUserProfile] = useState('');
    const [availableProfiles, setAvailableProfiles] = useState<string[]>([]);
    const [newProfileName, setNewProfileName] = useState('');
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [syncError, setSyncError] = useState<string>('');
    const [pullY, setPullY] = useState(0);
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
            await performAutoSync(supabaseUrl, supabaseKey, userProfile);
            setTimeout(() => {
                setIsRefreshing(false);
                setPullY(0);
            }, 500);
        } else {
            setPullY(0);
        }
        setTouchStartY(0);
    };

    // Password Modal State
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [pendingProfile, setPendingProfile] = useState('');

    const handlePasswordSubmit = () => {
        if (passwordInput === 'Robertoo1396$') {
            setUserProfile(pendingProfile);
            Preferences.set({ key: 'user_profile', value: pendingProfile });
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
                const client = createSupabaseClient(supabaseUrl, supabaseKey);
                await syncSalesWithSupabase(client, newSales, userProfile);
            }
        } catch (e) { console.error("Save failed", e); }
    };

    useEffect(() => {
        const loadTx = async () => {
            const { value } = await Preferences.get({ key: 'bank_transactions' });
            if (value) { try { setTransactions(JSON.parse(value)); } catch (e) { console.error(e) } }
        };
        loadTx();
    }, []);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());


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
        if (!confirm(`Delete ${selectedIds.size} items ? `)) return;
        const newSales = sales.filter(s => !selectedIds.has(s.id));
        await updateSalesAndSave(newSales);
        setSelectedIds(new Set());
    };

    const handleBulkMove = async (status: SaleStatus) => {
        const newSales = sales.map(s => selectedIds.has(s.id) ? { ...s, status } : s);
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

    const handleAddProfile = async () => {
        if (!newProfileName.trim()) return;
        const updated = [...availableProfiles, newProfileName.trim()];
        setAvailableProfiles(updated);
        setUserProfile(newProfileName.trim());
        setNewProfileName('');
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
        await Preferences.set({ key: 'user_profile', value: newProfileName.trim() });
    };

    const quickAddProfile = async () => {
        const name = prompt("Enter new profile name:");
        if (name && name.trim()) {
            const updated = [...availableProfiles, name.trim()];
            setAvailableProfiles(updated);
            setUserProfile(name.trim());
            await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
            await Preferences.set({ key: 'user_profile', value: name.trim() });
            setShowProfileMenu(false);
        }
    };

    const handleDeleteProfile = async (name: string) => {
        const updated = availableProfiles.filter(p => p !== name);
        setAvailableProfiles(updated);
        if (userProfile === name) setUserProfile('');
        await Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
    };

    // Real-time Subscription
    useEffect(() => {
        if (!supabaseUrl || !supabaseKey) return;
        const client = createSupabaseClient(supabaseUrl, supabaseKey);

        console.log("Subscribing to realtime changes...");
        const channel = client
            .channel('public:sales')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, (payload) => {
                console.log('Realtime Change:', payload);
                // Trigger auto-sync to pull latest data and merge
                // We pass undefined for sales to force a fresh read from Persistence to avoid stale closure state
                performAutoSync(supabaseUrl, supabaseKey, userProfile);
            })
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [supabaseUrl, supabaseKey, userProfile, sales.length]); // Dep on sales.length to update closure if needed? Actually performAutoSync uses args.
    // Better: use a ref for current sales if we want to avoid re-subscribing constantly?
    // Actually, recreating subscription on sales change is bad.
    // performAutoSync arg 'currentLocalSales' should be fresh. 
    // BUT 'sales' in the closure is stale if not in dep array.
    // If we put 'sales' in dep array, we re-sub on every edit. 
    // SOLUTION: Use a Ref for sales, or just rely on 'performAutoSync' reading from Preferences/Local?
    // performAutoSync takes 'currentLocalSales' as ARG. 
    // Let's modify performAutoSync to accept optional sales, or read from state. 
    // For now, let's just re-subscribe. It's not too expensive if infrequent.
    // actually, let's NOT include sales in dep array and inside on(...) read from a ref?
    // Or just pass empty array? performAutoSync fetches remote. Merging might need local.
    // Let's stick to simple re-sub for now or...
    // WAIT. performAutoSync merges. It needs local data.
    // We can use `useRef` to hold latest sales.


    const isModalOpenRef = React.useRef(isModalOpen);
    useEffect(() => { isModalOpenRef.current = isModalOpen; }, [isModalOpen]);

    useEffect(() => {
        const loadSettings = async () => {
            // Enforce New Credentials provided by user
            const NEW_URL = "https://zqsofkosyepcaealphbu.supabase.co";
            const NEW_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxc29ma29zeWVwY2FlYWxwaGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDc5NzgsImV4cCI6MjA4MDg4Mzk3OH0.QaVhZ8vTDwvSrQ0lp_tw5Uximi_yvliOISHvySke0H0";

            setSupabaseUrl(NEW_URL);
            setSupabaseKey(NEW_KEY);
            await Preferences.set({ key: 'supabase_url', value: NEW_URL });
            await Preferences.set({ key: 'supabase_key', value: NEW_KEY });

            const { value: key } = await Preferences.get({ key: 'openai_api_key' });
            if (key) setApiKey(key);

            // Ensure Profile exists for sync
            // Always start with empty profile to show Netflix-style selector
            setUserProfile('');

            let { value: profiles } = await Preferences.get({ key: 'available_profiles' });
            if (profiles) {
                setAvailableProfiles(JSON.parse(profiles));
            } else {
                const defaults = ["Admin"];
                setAvailableProfiles(defaults);
                await Preferences.set({ key: 'available_profiles', value: JSON.stringify(defaults) });
            }
        };

        const loadSales = async () => {
            try {
                // 1. Load Local Data First for Immediate Display
                let currentSales = INITIAL_SALES;
                const { value } = await Preferences.get({ key: 'car_sales_data' });
                if (value) {
                    currentSales = JSON.parse(value);
                } else {
                    const saved = localStorage.getItem('car_sales_data');
                    if (saved) currentSales = JSON.parse(saved);
                }
                setSales(currentSales.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));

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
            await loadSettings();
            await loadSales();
        };
        initApp();

        // Auto-sync on focus
        const onFocus = async () => {
            // Prevent sync if user is editing
            if (isModalOpenRef.current) return;

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

            // Sync Sales
            const salesRes = await syncSalesWithSupabase(client, localSalesToSync, profile.trim());
            if (salesRes.success && salesRes.data) {
                console.log("Sales Sync Success:", salesRes.data.length);
                setSales(salesRes.data.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
                await Preferences.set({ key: 'car_sales_data', value: JSON.stringify(salesRes.data) });
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

    const handleAddSale = (sale: CarSale) => {
        const newSales = editingSale
            ? sales.map(s => s.id === sale.id ? { ...sale, lastEditedBy: userProfile } : s)
            : [...sales, { ...sale, soldBy: userProfile }]; // Attributed to current user
        updateSalesAndSave(newSales);
        setIsModalOpen(false);
        setEditingSale(null);
    };

    const saveSettings = async () => {
        await Preferences.set({ key: 'openai_api_key', value: apiKey.trim() });
        await Preferences.set({ key: 'supabase_url', value: supabaseUrl.trim() });
        await Preferences.set({ key: 'supabase_key', value: supabaseKey.trim() });
        await Preferences.set({ key: 'user_profile', value: userProfile.trim() });
        alert('Settings Saved!');
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this sale?')) { updateSalesAndSave(sales.filter(s => s.id !== id)); }
    };

    const handleDeleteAll = async () => {
        if (confirm('DANGER: Are you sure you want to delete ALL sales data? This cannot be undone.')) {
            if (confirm('Please confirm again: DELETE ALL DATA?')) {
                updateSalesAndSave([]);
                try {
                    await Preferences.remove({ key: 'car_sales_data' });
                    localStorage.removeItem('car_sales_data');
                    alert('All data has been deleted.');
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

    const handleOneClickImport = async () => {
        if (!confirm(`Import ${RECOVERED_SALES.length} recovered cars ? `)) return;

        // Basic mapping for recovered data
        const mapped = RECOVERED_SALES.map(s => ({
            ...s,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            soldBy: 'Admin', // Default to Admin for recovered data
            paymentMethod: 'Cash' as any,
            amountPaidBank: 0,
            deposit: 0,
            servicesCost: 0,
            tax: 0,
            includeTransport: false,
            // Ensure numbers
            costToBuy: Number(s.costToBuy),
            soldPrice: Number(s.soldPrice),
            amountPaidCash: Number(s.amountPaidCash),
            year: Number(s.year),
            km: Number(s.km)
        })) as unknown as CarSale[];

        // Filter duplicates by VIN
        const currentVins = new Set(sales.map(s => s.vin));
        const newSales = mapped.filter(s => !currentVins.has(s.vin));

        if (newSales.length === 0) {
            alert('All recovered cars are already in your database!');
            return;
        }

        await updateSalesAndSave([...sales, ...newSales]);
        alert(`Successfully imported ${newSales.length} cars!`);
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
                                        if (data.settings.userProfile) { setUserProfile(data.settings.userProfile); await Preferences.set({ key: 'user_profile', value: data.settings.userProfile }); }
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

    const filteredSales = sales.filter(s => {
        // Visibility Rule: Non-Admins cannot see Admin's sales
        if (userProfile !== 'Admin' && s.soldBy === 'Admin') return false;

        // Category Filter
        if (activeCategory === 'SHIPPED' && s.status !== 'Shipped') return false;
        if (activeCategory === 'INSPECTIONS' && s.status !== 'Inspection') return false;
        if (activeCategory === 'AUTOSALLON' && s.status !== 'Autosallon') return false;
        if (activeCategory === 'SALES' && ['Shipped', 'Inspection', 'Autosallon'].includes(s.status)) return false;

        const term = searchTerm.toLowerCase().trim();
        if (!term) return true;
        return JSON.stringify(s).toLowerCase().includes(term);
    });

    const getBankFee = (price: number) => {
        if (price <= 10000) return 20;
        if (price <= 20000) return 50;
        return 100;
    };
    const calculateBalance = (sale: CarSale) => (sale.soldPrice || 0) - ((sale.amountPaidCash || 0) + (sale.amountPaidBank || 0) + (sale.deposit || 0));
    const calculateProfit = (sale: CarSale) => ((sale.soldPrice || 0) - (sale.costToBuy || 0) - getBankFee(sale.soldPrice || 0) - (sale.servicesCost ?? 30.51) - (sale.includeTransport ? 350 : 0));

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

    if (!userProfile) {
        return <ProfileSelector
            profiles={availableProfiles}
            onSelect={(p) => {
                setUserProfile(p);
                // Also trigger sync or anything needed
            }}
            onAdd={(name) => {
                const updated = [...availableProfiles, name];
                setAvailableProfiles(updated);
                Preferences.set({ key: 'available_profiles', value: JSON.stringify(updated) });
                setUserProfile(name);
            }}
        />;
    }

    return (
        <div className="h-screen flex flex-col bg-[#111111] text-gray-100 font-sans">
            {importStatus && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center">
                    <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-2xl flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <p>{importStatus}</p>
                    </div>
                </div>
            )}

            {/* Global Sync Error Toast */}
            {syncError && (
                <div className="fixed top-20 right-4 z-[90] bg-red-950/90 border border-red-500/50 text-white p-4 rounded-xl shadow-2xl max-w-md backdrop-blur-md">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            <strong className="text-red-200 text-sm">Sync Issues Detected</strong>
                        </div>
                        <button onClick={() => setSyncError('')} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4 text-red-200" /></button>
                    </div>
                    <p className="text-xs font-mono text-gray-300 break-words leading-relaxed">{syncError}</p>
                </div>
            )}

            <header className="bg-[#111111]/80 backdrop-blur-xl border-b border-white/5 p-4 pt-[calc(env(safe-area-inset-top)+2rem)] sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <img src="/logo_new.jpg" alt="Korauto Logo" className="w-10 h-10 rounded-xl object-cover shadow-[0_0_15px_rgba(37,99,235,0.5)]" />
                            <div>
                                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">KORAUTO</h1>
                            </div>
                        </div>
                        <div className="hidden md:flex bg-[#1a1a1a] p-1 rounded-xl border border-white/10">
                            {['dashboard', 'invoices', 'settings'].map((tab) => (
                                <button key={tab} onClick={() => setView(tab as any)} className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${view === tab ? 'bg-[#252525] text-white shadow-inner' : 'text-gray-500 hover:text-gray-300'} `}>
                                    <span className="capitalize">{tab}</span>
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 p-[1px] shadow-lg hover:shadow-cyan-500/50 transition-shadow">
                                <div className="w-full h-full rounded-full bg-[#111111] flex items-center justify-center text-xs font-bold text-gray-300">
                                    {userProfile ? userProfile[0].toUpperCase() : 'U'}
                                </div>
                            </button>

                            {showProfileMenu && (
                                <div className="absolute right-0 top-12 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 w-48 shadow-2xl z-[60] animate-in fade-in slide-in-from-top-2">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold px-2 py-1 mb-1">Switch Profile</div>
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {availableProfiles.map(p => (
                                            <button key={p} onClick={() => {
                                                if (p === 'Admin' && userProfile !== 'Admin') {
                                                    setPendingProfile(p);
                                                    setPasswordInput('');
                                                    setIsPasswordVisible(false);
                                                    setShowPasswordModal(true);
                                                    return;
                                                }
                                                setUserProfile(p);
                                                Preferences.set({ key: 'user_profile', value: p });
                                                setShowProfileMenu(false);
                                                performAutoSync(supabaseUrl, supabaseKey, p);
                                            }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${userProfile === p ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/5'} `}>
                                                <span>{p}</span>
                                                {userProfile === p && <CheckSquare className="w-3 h-3" />}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="h-px bg-white/10 my-2" />
                                    <button onClick={quickAddProfile} className="w-full text-left px-3 py-2 text-green-400 hover:bg-white/5 rounded-lg flex items-center gap-2 text-sm font-bold transition-colors">
                                        <Plus className="w-4 h-4" /> Add Profile
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                        <div className="relative group w-full md:w-auto">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input placeholder="Search..." className="bg-[#1a1a1a] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm w-full md:w-80 shadow-inner focus:outline-none focus:border-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto justify-end items-center">
                            {/* Grouping Dropdown */}
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value as any)}
                                className="bg-[#1a1a1a] border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                            >
                                <option value="none">No Grouping</option>
                                <option value="status">Group by Status</option>
                                <option value="brand">Group by Brand</option>
                            </select>

                            <button onClick={() => { setEditingSale(null); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] active:scale-95">
                                <Plus className="w-4 h-4" /> Add Sale
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden bg-[#0a0a0a] p-4 md:p-8 flex flex-col relative">
                {/* Floating Action Button for Add Sale */}
                <button
                    onClick={() => { setEditingSale(null); setIsModalOpen(true); }}
                    className="md:hidden fixed bottom-6 right-6 z-[60] bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.5)] transition-all hover:scale-110 active:scale-95 flex items-center justify-center"
                >
                    <Plus className="w-6 h-6" />
                </button>

                {view === 'dashboard' ? (<>
                    {/* Sub-Tabs for Dashboard Categories */}
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                        {(['SALES', 'SHIPPED', 'INSPECTIONS', 'AUTOSALLON'] as const).map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-6 py-3 rounded-xl font-bold text-sm tracking-wide transition-all whitespace-nowrap ${activeCategory === cat
                                    ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                                    : 'bg-[#1a1a1a] text-gray-400 hover:bg-white/5 border border-white/5'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    <div className="border border-white/5 rounded-xl bg-[#161616] shadow-2xl relative hidden md:block overflow-auto flex-1">
                        <div className="grid text-sm divide-y divide-white/5 min-w-max"
                            style={{
                                gridTemplateColumns: userProfile === 'Admin'
                                    ? "40px 250px 100px 100px 120px 150px 150px 150px 120px 120px 120px 120px 120px 110px 110px 100px 100px 100px"
                                    : "40px 250px 100px 100px 120px 150px 150px 150px 120px 120px 110px 100px 100px 100px"
                            }}>
                            <div className="bg-[#1f2023] font-medium text-gray-400 grid grid-cols-subgrid sticky top-0 z-30 shadow-md" style={{ gridColumn: userProfile === 'Admin' ? 'span 18' : 'span 14' }}>
                                <div className="p-3 flex items-center justify-center cursor-pointer hover:text-white" onClick={() => toggleAll(filteredSales)}>
                                    {selectedIds.size > 0 && selectedIds.size === filteredSales.length ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}
                                </div>
                                <div className="p-3 pl-2">Car Info</div> <div className="p-3 text-center">Year</div> <div className="p-3 text-center">KM</div> <div className="p-3">Plate/VIN</div>
                                <div className="p-3">Buyer</div> <div className="p-3">Seller</div> <div className="p-3">Shipping</div>
                                {userProfile === 'Admin' && <div className="p-3 text-right">Cost</div>}
                                <div className="p-3 text-right">Sold</div> <div className="p-3 text-right">Paid</div>
                                {userProfile === 'Admin' && <><div className="p-3 text-right">Bank Fee</div> <div className="p-3 text-right">Tax</div> <div className="p-3 text-right text-blue-400">Profit</div></>}
                                <div className="p-3 text-right">Balance</div> <div className="p-3 text-center">Status</div> <div className="p-3 text-center">Sold By</div> <div className="p-3"></div>
                            </div>
                            {filteredSales.map(sale => (
                                <div key={sale.id} className={`grid grid-cols-subgrid hover:bg-white/5 border-b border-white/5 items-center ${selectedIds.has(sale.id) ? 'bg-blue-900/10' : ''} `}
                                    onClick={() => { setEditingSale(sale); setIsModalOpen(true); }}
                                    style={{ gridColumn: userProfile === 'Admin' ? 'span 18' : 'span 14' }}>
                                    <div className="p-3 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); toggleSelection(sale.id); }}>
                                        {selectedIds.has(sale.id) ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-gray-600 hover:text-gray-400" />}
                                    </div>
                                    <div className="p-3 pl-2 font-medium text-white">{sale.brand} {sale.model} <div className="text-xs text-gray-500">{sale.color}</div></div>
                                    <div className="p-3 text-center text-gray-400">{sale.year}</div>
                                    <div className="p-3 text-center text-gray-400">{(sale.km || 0).toLocaleString()}</div>
                                    <div className="p-3 text-xs text-gray-300"><div>{sale.plateNumber}</div><div className="truncate w-20" title={sale.vin}>{sale.vin ? sale.vin.slice(-6) : ''}</div></div>
                                    <div className="p-3 text-gray-300">{sale.buyerName}</div>
                                    <div className="p-3 text-gray-400">{sale.sellerName}</div>
                                    <div className="p-3 text-xs"> <div className="text-blue-400">{sale.shippingName}</div> <div>{sale.shippingDate}</div> </div>

                                    {userProfile === 'Admin' && <div className="p-3 text-right font-mono text-gray-400">€{(sale.costToBuy || 0).toLocaleString()}</div>}

                                    <div className="p-3 text-right font-mono text-white">€{(sale.soldPrice || 0).toLocaleString()}</div>
                                    <div className="p-3 text-right font-mono text-gray-400">€{((sale.amountPaidCash || 0) + (sale.amountPaidBank || 0) + (sale.deposit || 0)).toLocaleString()}</div>

                                    {userProfile === 'Admin' && <>
                                        <div className="p-3 text-right text-xs font-mono text-gray-500">€{getBankFee(sale.soldPrice || 0)}</div>
                                        <div className="p-3 text-right text-xs font-mono text-gray-500">€{(sale.servicesCost ?? 30.51)}</div>
                                        <div className={`p-3 text-right font-mono font-bold ${calculateProfit(sale) > 0 ? 'text-blue-500' : 'text-red-500'} `}>€{calculateProfit(sale).toLocaleString()}</div>
                                    </>}

                                    <div className={`p-3 text-right font-mono font-bold ${calculateBalance(sale) > 0 ? 'text-red-500' : 'text-gray-600'} `}>€{calculateBalance(sale).toLocaleString()}</div>
                                    <div className="p-3 text-center"><span className="px-2 py-1 rounded-full text-xs bg-gray-800 text-gray-300">{sale.status}</span></div>
                                    <div className="p-3 text-center text-xs text-gray-500 uppercase">{sale.soldBy || '-'}</div>
                                    <div className="p-3 flex gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); openInvoice(sale, e); }} className="p-1 text-blue-400 hover:bg-blue-500/20 rounded"><FileText className="w-4 h-4" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(sale.id, e); }} className="p-1 text-red-400 hover:bg-red-500/20 rounded"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                            {/* Footer Totals */}
                            <div className="bg-[#1a1a1a] font-bold border-t border-white/10 sticky bottom-0 z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] grid grid-cols-subgrid" style={{ gridColumn: userProfile === 'Admin' ? 'span 17' : 'span 13' }}>
                                <div className="p-3 text-right col-span-8">Totals</div>
                                {userProfile === 'Admin' && <div className="p-3 text-right font-mono text-white">€{totalCost.toLocaleString()}</div>}
                                <div className="p-3 text-right font-mono text-green-400">€{totalSold.toLocaleString()}</div>
                                <div className="p-3 text-right font-mono text-gray-300">€{totalPaid.toLocaleString()}</div>
                                {userProfile === 'Admin' && <>
                                    <div className="p-3 text-right font-mono text-gray-500 text-xs">€{totalBankFee.toLocaleString()}</div>
                                    <div className="p-3 text-right font-mono text-gray-500 text-xs">€{totalServices.toLocaleString()}</div>
                                    <div className="p-3 text-right font-mono text-blue-400">€{totalProfit.toLocaleString()}</div>
                                </>}
                                <div className="p-3 col-span-3"></div>
                            </div>
                        </div>
                    </div>
                    {/* Mobile Card View */}
                    <div className="md:hidden flex flex-col gap-4 overflow-auto flex-1 pb-20">
                        {filteredSales.map(sale => (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={sale.id}
                                className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 flex flex-col gap-3 active:scale-[0.98] transition-transform"
                                onClick={() => { setEditingSale(sale); setIsModalOpen(true); }}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-bold text-white text-lg">{sale.brand} {sale.model}</div>
                                        <div className="text-sm text-gray-500">{sale.year} • {(sale.km || 0).toLocaleString()} km</div>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${sale.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                                        sale.status === 'New' ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-gray-700 text-gray-300'
                                        } `}>{sale.status}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 mt-2 bg-black/20 p-2 rounded-lg">
                                    <div>VIN: <span className="text-gray-300 font-mono">{sale.vin.slice(-6)}...</span></div>
                                    <div className="text-right">Buyer: <span className="text-gray-300">{sale.buyerName}</span></div>
                                    <div className="col-span-2 flex justify-between pt-2 mt-2 border-t border-white/5">
                                        <span>Sold By: <span className="text-blue-400">{sale.soldBy || 'Admin'}</span></span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center pt-2 border-t border-white/5 h-12">
                                    {userProfile === 'Admin' ? (
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500 uppercase">Profit</span>
                                            <span className={`font-bold font-mono ${calculateProfit(sale) > 0 ? 'text-blue-400' : 'text-red-400'} `}>
                                                €{calculateProfit(sale).toLocaleString()}
                                            </span>
                                        </div>
                                    ) : <div />}

                                    <div className="flex flex-col text-right">
                                        <span className="text-[10px] text-gray-500 uppercase">Balance</span>
                                        <span className={`font-bold font-mono ${calculateBalance(sale) > 0 ? 'text-red-400' : 'text-green-400'} `}>
                                            €{calculateBalance(sale).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </>) : view === 'settings' ? (
                    <div className="max-w-xl mx-auto bg-[#1a1a1a] p-6 rounded-2xl border border-white/10">
                        <h2 className="text-xl font-bold mb-4">Settings</h2>
                        <div className="space-y-4">
                            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="OpenAI API Key" className="w-full bg-black border border-white/10 rounded-xl p-3" />

                            <div className="space-y-2">
                                <label className="text-sm text-gray-400">User Profile</label>
                                <div className="flex gap-2">
                                    <select value={userProfile} onChange={e => {
                                        setUserProfile(e.target.value);
                                        Preferences.set({ key: 'user_profile', value: e.target.value });
                                    }} className="flex-1 bg-black border border-white/10 rounded-xl p-3 text-white appearance-none">
                                        <option value="">Select Profile</option>
                                        {availableProfiles.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                    <button onClick={() => handleDeleteProfile(userProfile)} disabled={!userProfile} className="p-3 bg-red-500/20 text-red-400 rounded-xl disabled:opacity-50"><Trash2 className="w-5 h-5" /></button>
                                </div>
                                <div className="flex gap-2">
                                    <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="Add New Profile" className="flex-1 bg-black border border-white/10 rounded-xl p-3" />
                                    <button onClick={handleAddProfile} className="bg-green-600 text-white font-bold px-4 rounded-xl"><Plus className="w-5 h-5" /></button>
                                </div>
                            </div>

                            <input value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="Supabase URL" className="w-full bg-black border border-white/10 rounded-xl p-3" />
                            <input type="password" value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)} placeholder="Supabase Key" className="w-full bg-black border border-white/10 rounded-xl p-3" />

                            <div className="h-px bg-white/10 my-4" />
                            <button onClick={handleOneClickImport} className="w-full bg-blue-600/20 text-blue-400 font-bold py-3 rounded-xl border border-blue-500/30 flex items-center justify-center gap-2 mb-4">
                                <Download className="w-5 h-5" /> Import Recovered Sales ({RECOVERED_SALES.length})
                            </button>

                            <button onClick={saveSettings} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Save Settings</button>
                            <div className="h-px bg-white/10 my-4" />
                            <button onClick={handleDeleteAll} className="w-full border border-red-500/30 text-red-500 py-3 rounded-xl">Delete All Data</button>
                        </div>
                    </div>
                ) : (
                    <div
                        className="flex-1 overflow-auto relative"
                        ref={scrollContainerRef}
                        onTouchStart={handlePullTouchStart}
                        onTouchMove={handlePullTouchMove}
                        onTouchEnd={handlePullTouchEnd}
                    >
                        {/* Pull Refresh Indicator */}
                        <div className="absolute left-0 right-0 flex justify-center items-center pointer-events-none transition-transform" style={{ top: -50, transform: `translateY(${pullY}px)` }}>
                            <div className="bg-[#1a1a1a] rounded-full p-2 shadow-lg border border-white/10">
                                <RefreshCw className={`w-5 h-5 text-blue-400 ${isRefreshing ? 'animate-spin' : ''} ${pullY > 60 ? 'rotate-180' : ''} transition-transform`} />
                            </div>
                        </div>
                        <div style={{ transform: `translateY(${pullY}px)`, transition: isRefreshing ? 'transform 0.2s' : 'none' }}>
                            {Object.entries(groupedSales).map(([groupTitle, groupItems]) => (
                                <div key={groupTitle} className="mb-8">
                                    {groupBy !== 'none' && (
                                        <h2 className="text-xl font-bold mb-4 text-blue-400 pl-2 border-l-4 border-blue-500">{groupTitle} <span className="text-gray-500 text-sm font-normal">({groupItems.length})</span></h2>
                                    )}
                                    {groupBy === 'none' ? (
                                        <Reorder.Group axis="y" values={filteredSales} onReorder={(newOrder) => {
                                            const reordered = newOrder.map((item, index) => ({ ...item, sortOrder: index }));
                                            // Update local sorting
                                            setSales(prev => {
                                                const next = [...prev];
                                                newOrder.forEach((newItem, newIndex) => {
                                                    const foundIndex = next.findIndex(x => x.id === newItem.id);
                                                    if (foundIndex !== -1) next[foundIndex] = { ...next[foundIndex], sortOrder: newIndex };
                                                });
                                                return next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                            });
                                        }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {filteredSales.map(s => (
                                                <SortableSaleItem key={s.id} s={s} toggleSelection={toggleSelection} selectedIds={selectedIds} openInvoice={openInvoice} />
                                            ))}
                                        </Reorder.Group>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {groupItems.map(s => (
                                                <div key={s.id} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-5 relative group">
                                                    <div className="absolute top-4 left-4 z-10">
                                                        <button onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }} className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedIds.has(s.id) ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/20 text-transparent hover:border-white/40'} `}>
                                                            <CheckSquare className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="flex justify-between mb-4 pl-8">
                                                        <div className="font-bold">{s.brand} {s.model}</div>
                                                        <button onClick={(e) => openInvoice(s, e)} className="text-blue-400 hover:text-blue-300"><FileText className="w-5 h-5" /></button>
                                                    </div>
                                                    <div className="text-sm text-gray-400 space-y-2 pl-8">
                                                        <div className="flex justify-between"><span>VIN</span><span>{s.vin}</span></div>
                                                        <div className="flex justify-between"><span>Buyer</span><span>{s.buyerName}</span></div>
                                                        <div className="flex justify-between pt-2 border-t border-white/5"><span className="text-white font-bold">€{(s.soldPrice || 0).toLocaleString()}</span></div>
                                                    </div>
                                                    {/* Balance Badge */}
                                                    <div className="absolute bottom-4 right-4">
                                                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${((s.soldPrice || 0) - ((s.amountPaidCash || 0) + (s.amountPaidBank || 0) + (s.deposit || 0))) > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'} `}>
                                                            Bal: €{((s.soldPrice || 0) - ((s.amountPaidCash || 0) + (s.amountPaidBank || 0) + (s.deposit || 0))).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Floating Bulk Action Bar */}
                <AnimatePresence>
                    {selectedIds.size > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.8)] rounded-2xl p-2 flex items-center gap-2 z-50 backdrop-blur-xl"
                        >
                            <div className="px-4 text-xs font-bold text-gray-400 border-r border-white/10 mr-2 flex items-center gap-2">
                                <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px]">{selectedIds.size}</span>
                                Selected
                            </div>

                            {selectedIds.size === 1 && (
                                <button
                                    onClick={() => {
                                        const sale = sales.find(s => s.id === Array.from(selectedIds)[0]);
                                        if (sale) { setEditingSale(sale); setIsModalOpen(true); }
                                    }}
                                    className="p-3 hover:bg-white/10 rounded-xl text-white tooltip flex flex-col items-center gap-1 group relative"
                                >
                                    <Edit className="w-5 h-5 text-blue-400" />
                                    <span className="text-[9px] uppercase font-bold text-gray-500 group-hover:text-blue-300">Edit</span>
                                </button>
                            )}

                            <button onClick={handleBulkCopy} className="p-3 hover:bg-white/10 rounded-xl text-white flex flex-col items-center gap-1 group">
                                <Copy className="w-5 h-5 text-green-400" />
                                <span className="text-[9px] uppercase font-bold text-gray-500 group-hover:text-green-300">Copy</span>
                            </button>

                            <button onClick={() => handleBulkMove('Shipped')} className="p-3 hover:bg-white/10 rounded-xl text-white flex flex-col items-center gap-1 group">
                                <ArrowRight className="w-5 h-5 text-yellow-400" />
                                <span className="text-[9px] uppercase font-bold text-gray-500 group-hover:text-yellow-300">Move</span>
                            </button>

                            <button onClick={handleBulkDelete} className="p-3 hover:bg-white/10 rounded-xl text-white flex flex-col items-center gap-1 group">
                                <Trash2 className="w-5 h-5 text-red-500" />
                                <span className="text-[9px] uppercase font-bold text-gray-500 group-hover:text-red-300">Delete</span>
                            </button>

                            <div className="w-px h-8 bg-white/10 mx-1" />

                            <button onClick={() => setSelectedIds(new Set())} className="p-3 hover:bg-white/10 rounded-xl text-gray-500">
                                <X className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {isModalOpen && <SaleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleAddSale} existingSale={editingSale} />}
            {invoiceSale && <InvoiceModal isOpen={!!invoiceSale} onClose={() => setInvoiceSale(null)} sale={invoiceSale} />}
            {
                showPasswordModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}>
                        <div className="bg-[#1a1a1a] border border-white/10 p-6 rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                            <h3 className="text-lg font-bold text-white mb-4">Enter Admin Password</h3>
                            <div className="relative mb-6">
                                <input
                                    type={isPasswordVisible ? 'text' : 'password'}
                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-3 pr-12 text-white outline-none focus:border-blue-500 transition-colors"
                                    placeholder="Password"
                                    value={passwordInput}
                                    onChange={e => setPasswordInput(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                                />
                                <button
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                                >
                                    {isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">Cancel</button>
                                <button onClick={handlePasswordSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-bold transition-colors shadow-lg shadow-blue-900/20">Submit</button>
                            </div>
                        </div>
                    </div>
                )
            }
            <AiAssistant data={sales} apiKey={apiKey} />
        </div >
    );
}
