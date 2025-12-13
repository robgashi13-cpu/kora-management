'use client';

import React, { useState, useEffect } from 'react';
import { X, Paperclip, FileText } from 'lucide-react';
import { CarSale, SaleStatus, PaymentMethod, Attachment } from '@/app/types';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (sale: CarSale) => void;
    existingSale: CarSale | null;
    inline?: boolean;
}

const EMPTY_SALE: Omit<CarSale, 'id' | 'createdAt'> = {
    brand: '', model: '', year: new Date().getFullYear(), km: 0,
    color: '', plateNumber: '', vin: '',
    sellerName: '', buyerName: '',
    shippingName: '', shippingDate: '',
    costToBuy: 0, soldPrice: 0,
    amountPaidCash: 0, amountPaidBank: 0, deposit: 0,
    servicesCost: 30.51, tax: 0,
    includeTransport: false,
    amountPaidToKorea: 0, paidDateToKorea: null, paidDateFromClient: null,
    paymentMethod: 'Bank', status: 'New'
};

const YEARS = Array.from({ length: 26 }, (_, i) => 2000 + i).reverse();
const COLORS = [
    'Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Brown', 'Beige', 'Gold', 'Yellow', 'Orange', 'Purple', 'Other'
];

import ContractModal from './ContractModal';

export default function SaleModal({ isOpen, onClose, onSave, existingSale, inline = false }: Props) {
    const [formData, setFormData] = useState<Partial<CarSale>>(EMPTY_SALE);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('Vehicle');
    const [contractType, setContractType] = useState<'deposit' | 'full' | null>(null);

    // Swipe Logic
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const tabs = ['Vehicle', 'Logistics', 'Financials', 'Docs', 'Contracts'];

    const minSwipeDistance = 50;

    const onSwipeLeft = () => {
        const currIdx = tabs.indexOf(activeTab);
        if (currIdx < tabs.length - 1) setActiveTab(tabs[currIdx + 1]);
    };

    const onSwipeRight = () => {
        const currIdx = tabs.indexOf(activeTab);
        if (currIdx > 0) setActiveTab(tabs[currIdx - 1]);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        if (isLeftSwipe) onSwipeLeft();
        if (isRightSwipe) onSwipeRight();
    };

    useEffect(() => {
        if (existingSale) {
            // Migration logic: Ensure arrays exist if legacy singulars exist
            const migratedSale = { ...existingSale };
            if (migratedSale.bankReceipt && (!migratedSale.bankReceipts || migratedSale.bankReceipts.length === 0)) {
                migratedSale.bankReceipts = [migratedSale.bankReceipt];
            }
            if (migratedSale.bankInvoice && (!migratedSale.bankInvoices || migratedSale.bankInvoices.length === 0)) {
                migratedSale.bankInvoices = [migratedSale.bankInvoice];
            }
            // Ensure arrays are initialized
            if (!migratedSale.bankReceipts) migratedSale.bankReceipts = [];
            if (!migratedSale.bankInvoices) migratedSale.bankInvoices = [];
            if (!migratedSale.depositInvoices) migratedSale.depositInvoices = [];

            setFormData(migratedSale);
        } else {
            setFormData({
                ...EMPTY_SALE,
                bankReceipts: [],
                bankInvoices: [],
                depositInvoices: []
            });
        }
    }, [existingSale, isOpen]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'bankReceipts' | 'bankInvoices' | 'depositInvoices') => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const newAttachments: Attachment[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.size > 10 * 1024 * 1024) { // Increased limit to 10MB
                    alert(`File ${file.name} is too large. Max 10MB allowed.`);
                    continue;
                }

                await new Promise<void>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        newAttachments.push({
                            name: file.name,
                            data: reader.result as string,
                            type: file.type,
                            size: file.size
                        });
                        resolve();
                    };
                    reader.readAsDataURL(file);
                });
            }

            setFormData(prev => ({
                ...prev,
                [field]: [...(prev[field] || []), ...newAttachments]
            }));
        }
    };

    const removeFile = (field: 'bankReceipts' | 'bankInvoices' | 'depositInvoices', index: number) => {
        setFormData(prev => ({
            ...prev,
            [field]: prev[field]?.filter((_, i) => i !== index) || []
        }));
    };

    const viewFile = (file: Attachment) => {
        if (!file.data) return;

        // Check if it's an image
        if (file.type.startsWith('image/')) {
            setPreviewImage(file.data); // data is already a data URL
        } else {
            // PDF or other - open in new tab via Blob
            try {
                // Determine MIME type (fallback to pdf if unknown)
                const mimeType = file.type || 'application/pdf';
                // Data is likely "data:application/pdf;base64,....."
                // We need to strip the prefix to get pure base64 if we use atob, OR just use fetch on the data URL.
                // Fetching the data URL is cleaner.
                fetch(file.data)
                    .then(res => res.blob())
                    .then(blob => {
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                    });
            } catch (e) {
                console.error("Error viewing file", e);
                alert("Could not open file preview.");
            }
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const sale: CarSale = {
            ...formData as CarSale,
            id: existingSale?.id || crypto.randomUUID(),
            createdAt: existingSale?.createdAt || new Date().toISOString(),
        };
        onSave(sale);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
    };

    // Close preview handler
    const closePreview = (e: React.MouseEvent) => {
        e.stopPropagation();
        setPreviewImage(null);
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && !inline) {
            onClose();
        }
    };

    // Helper for KM formatting
    const handleKmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Strip non-numeric
        const val = e.target.value.replace(/[^0-9]/g, '');
        setFormData(prev => ({ ...prev, km: val === '' ? 0 : Number(val) }));
    };

    // Helper component for file list
    const FileList = ({ files, field, label }: { files: Attachment[] | undefined, field: 'bankReceipts' | 'bankInvoices' | 'depositInvoices', label: string }) => (
        <div className="bg-[#252628]/50 p-3 rounded-xl border border-white/10 border-dashed hover:border-white/20 transition-colors h-full flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] uppercase text-gray-500 font-bold block">{label}</label>
                <label className="cursor-pointer text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Add
                    <input type="file" className="hidden" multiple accept="image/*,.pdf" onChange={(e) => handleFileChange(e, field)} />
                </label>
            </div>

            <div className="flex-1 flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                {files && files.length > 0 ? (
                    files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-[#1a1a1a] p-2 rounded-lg border border-white/5 group cursor-pointer hover:bg-white/5 transition-all" onClick={() => viewFile(file)}>
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                                <span className="text-xs text-gray-300 truncate group-hover:text-white transition-colors">{file.name}</span>
                            </div>
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(field, idx); }} className="text-gray-600 hover:text-red-400 p-1 rounded transition-colors ml-1"><X className="w-3 h-3" /></button>
                        </div>
                    ))
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-1 min-h-[60px]">
                        <span className="text-xs italic">No files attached</span>
                    </div>
                )}
            </div>
        </div>
    );

    if (!isOpen && !inline) return null;

    const Content = (
        <motion.div
            initial={inline ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className={`${inline ? 'w-full h-full flex flex-col bg-[#1a1a1a]' : 'bg-[#1a1a1a] border border-white/10 w-full max-w-4xl rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh]'}`}
        >
            <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-xl font-bold text-white">{existingSale ? 'Edit Sale' : 'New Car Sale'}</h2>
                {!inline && (
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            <div className="flex bg-[#111] border-b border-white/5 mx-6 mt-4 p-1 rounded-lg overflow-x-auto no-scrollbar shrink-0">
                {['Vehicle', 'Logistics', 'Financials', 'Docs', 'Contracts'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 min-w-[80px] py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap px-2 ${activeTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div
                className="flex-1 overflow-y-auto no-scrollbar flex flex-col"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <form
                    onSubmit={handleSubmit}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                    className="p-6 flex flex-col gap-6"
                >
                    <AnimatePresence mode="wait">
                        {activeTab === 'Vehicle' && (
                            <motion.div key="vehicle" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Brand" name="brand" value={formData.brand} onChange={handleChange} required />
                                    <Input label="Model" name="model" value={formData.model} onChange={handleChange} required />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">Year</label>
                                        <select name="year" value={formData.year} onChange={handleChange} className="bg-[#252628] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500">
                                            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">Color</label>
                                        <select name="color" value={formData.color} onChange={handleChange} className="bg-[#252628] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500">
                                            <option value="">Select</option>
                                            {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <Input label="KM" name="km" value={formData.km ? formData.km.toLocaleString() : ''} onChange={handleKmChange} placeholder="0" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="VIN" name="vin" value={formData.vin} onChange={handleChange} />
                                    <Input label="License Plate" name="plateNumber" value={formData.plateNumber} onChange={handleChange} />
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'Logistics' && (
                            <motion.div key="logistics" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Buyer Name" name="buyerName" value={formData.buyerName} onChange={handleChange} required />
                                    <Input label="Buyer Personal ID" name="buyerPersonalId" value={formData.buyerPersonalId || ''} onChange={handleChange} />
                                </div>
                                <Input label="Seller Name" name="sellerName" value={formData.sellerName} onChange={handleChange} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Shipping Company" name="shippingName" value={formData.shippingName} onChange={handleChange} />
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">Shipping Date</label>
                                        <input type="date" name="shippingDate" value={formData.shippingDate ? String(formData.shippingDate).split('T')[0] : ''} onChange={handleChange} className="bg-[#252628] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none" />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'Financials' && (
                            <motion.div key="financials" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input label="Cost to Buy (€)" name="costToBuy" type="number" value={formData.costToBuy || ''} onChange={handleChange} />
                                    <Input label="Sold Price (€)" name="soldPrice" type="number" value={formData.soldPrice || ''} onChange={handleChange} required className="bg-[#252628] font-bold text-green-400 border-green-500/30" />
                                </div>

                                {/* Korea/Supplier Payments */}
                                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/5">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase">Supplier (Korea)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <Input label="Paid to Korea (€)" name="amountPaidToKorea" type="number" value={formData.amountPaidToKorea || ''} onChange={handleChange} />
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">Paid Date (KR)</label>
                                            <input type="date" name="paidDateToKorea" value={formData.paidDateToKorea ? String(formData.paidDateToKorea).split('T')[0] : ''} onChange={handleChange} className="bg-[#252628] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none w-full h-[46px]" />
                                        </div>
                                    </div>
                                </div>

                                {/* Client Payments */}
                                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/5">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase">Client Payments</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Input label="Paid Bank (€)" name="amountPaidBank" type="number" value={formData.amountPaidBank || ''} onChange={handleChange} />
                                        <Input label="Paid Cash (€)" name="amountPaidCash" type="number" value={formData.amountPaidCash || ''} onChange={handleChange} />
                                        <Input label="Deposit (€)" name="deposit" type="number" value={formData.deposit || ''} onChange={handleChange} />
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">Dep. Date</label>
                                            <input type="date" name="depositDate" value={formData.depositDate ? String(formData.depositDate).split('T')[0] : ''} onChange={handleChange} className="bg-[#252628] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none w-full h-[46px]" />
                                        </div>
                                        <div className="col-span-1 sm:col-span-2">
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">Full Payment Date</label>
                                                <input type="date" name="paidDateFromClient" value={formData.paidDateFromClient ? String(formData.paidDateFromClient).split('T')[0] : ''} onChange={handleChange} className="bg-[#252628] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none w-full h-[46px]" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">Status</label>
                                        <select name="status" value={formData.status} onChange={handleChange} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none">
                                            <option value="New">New</option>
                                            <option value="In Progress">In Progress</option>
                                            <option value="Shipped">Shipped</option>
                                            <option value="Completed">Completed</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase text-gray-500 font-bold ml-1 opacity-0">Transport</label>
                                        <label className={`flex items-center gap-2 cursor-pointer p-3 rounded-lg border transition-all justify-center select-none h-[46px] ${formData.includeTransport ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#1a1a1a] border-white/10 text-gray-400'}`}>
                                            <input type="checkbox" name="includeTransport" checked={formData.includeTransport || false} onChange={(e) => { const c = e.target.checked; setFormData(p => ({ ...p, includeTransport: c, soldPrice: (p.soldPrice || 0) + (c ? 350 : -350) })); }} className="hidden" />
                                            <span className="text-xs font-bold uppercase">{formData.includeTransport ? 'Transport: Yes' : 'Transport: No'}</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex justify-between items-center">
                                    <span className="text-sm text-gray-400 font-bold uppercase">Balance Due</span>
                                    <span className={`text-xl font-mono font-bold ${(formData.soldPrice! - ((formData.amountPaidBank || 0) + (formData.amountPaidCash || 0) + (formData.deposit || 0))) > 0 ? 'text-red-400' : 'text-green-500'}`}>
                                        €{(formData.soldPrice! - ((formData.amountPaidBank || 0) + (formData.amountPaidCash || 0) + (formData.deposit || 0))).toLocaleString()}
                                    </span>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'Docs' && (
                            <motion.div key="docs" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-4 h-full">
                                <FileList files={formData.bankReceipts} field="bankReceipts" label="Bank Receipts" />
                                <FileList files={formData.bankInvoices} field="bankInvoices" label="Bank Invoices" />
                                <FileList files={formData.depositInvoices} field="depositInvoices" label="Deposit Invoices" />
                            </motion.div>
                        )}


                        {activeTab === 'Contracts' && (
                            <motion.div key="contracts" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-6 h-full justify-center items-center p-8">
                                <div className="text-center space-y-2 mb-4">
                                    <h3 className="text-xl font-bold text-white">Generate Documents</h3>
                                    <p className="text-gray-400 text-sm">Create printable contracts automatically filled with sale details.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                                    <button type="button" onClick={() => setContractType('deposit')} className="flex flex-col items-center gap-4 p-6 bg-[#252628] border border-white/10 hover:border-blue-500 hover:bg-white/5 rounded-2xl transition-all group">
                                        <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                                            <FileText className="w-8 h-8" />
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-lg text-white">Deposit Agreement</div>
                                            <div className="text-xs text-gray-500 mt-1">Marrëveshje për Kapar</div>
                                        </div>
                                    </button>

                                    <button type="button" onClick={() => setContractType('full')} className="flex flex-col items-center gap-4 p-6 bg-[#252628] border border-white/10 hover:border-purple-500 hover:bg-white/5 rounded-2xl transition-all group">
                                        <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                                            <FileText className="w-8 h-8" />
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-lg text-white">Full Contract</div>
                                            <div className="text-xs text-gray-500 mt-1">Marrëveshje Interne</div>
                                        </div>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-auto">
                        <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 font-bold transition-all">Cancel</button>
                        <button type="submit" className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-xl shadow-blue-900/20 active:scale-95 transition-all w-full md:w-auto">
                            {existingSale ? 'Update Sale' : 'Create Sale'}
                        </button>
                    </div>
                </form>
            </div>
        </motion.div>
    );

    const previewOverlay = previewImage && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4" onClick={closePreview}>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" />
            <button onClick={closePreview} className="absolute top-6 right-6 text-white hover:text-gray-300 bg-black/50 p-2 rounded-full"><X className="w-8 h-8" /></button>
        </div>
    );

    if (inline) {
        return (
            <div className="w-full h-full relative p-4 overflow-hidden flex flex-col">
                {previewOverlay}
                {Content}
                {contractType && <ContractModal sale={formData as CarSale} type={contractType} onClose={() => setContractType(null)} />}
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(3rem,env(safe-area-inset-top))]"
            onClick={handleBackdropClick}
        >
            <div className="absolute inset-0 bg-black/80" />
            {previewOverlay}
            {Content}
            {contractType && <ContractModal sale={formData as CarSale} type={contractType} onClose={() => setContractType(null)} />}
        </div>
    );
}

const Input = ({ label, className = "", ...props }: any) => (

    <div className={`flex flex-col gap-1 ${className}`}>
        <label className="text-[10px] uppercase text-gray-500 font-bold ml-1">{label}</label>
        <input
            className="bg-[#252628] border border-white/10 hover:border-white/20 rounded-lg p-3 text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-gray-700 w-full h-[46px]"
            {...props}
        />
    </div>
);
