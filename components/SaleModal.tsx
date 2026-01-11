'use client';

import React, { useState, useEffect } from 'react';
import { X, Paperclip, FileText, ChevronDown } from 'lucide-react';
import { CarSale, SaleStatus, Attachment, ContractType } from '@/app/types';
import { motion } from 'framer-motion';
import { openPdfBlob } from './pdfUtils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (sale: CarSale) => void;
    existingSale: CarSale | null;
    inline?: boolean;
    defaultStatus?: SaleStatus;
    isAdmin?: boolean;
    availableProfiles?: { id: string; label: string }[];
    hideHeader?: boolean;
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
    paymentMethod: 'Bank', status: 'New',
    isPaid: false,
    soldBy: ''
};

const YEARS = Array.from({ length: 26 }, (_, i) => 2000 + i).reverse();
const COLORS = [
    'Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Brown', 'Beige', 'Gold', 'Yellow', 'Orange', 'Purple', 'Other'
];

import EditablePreviewModal from './EditablePreviewModal';

export default function SaleModal({ isOpen, onClose, onSave, existingSale, inline = false, defaultStatus = 'New', isAdmin = false, availableProfiles = [], hideHeader = false }: Props) {
    const [formData, setFormData] = useState<Partial<CarSale>>({ ...EMPTY_SALE, status: defaultStatus });
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [contractType, setContractType] = useState<ContractType | null>(null);
    const [showDocumentMenu, setShowDocumentMenu] = useState(false);
    const [showInvoice, setShowInvoice] = useState(false);
    const [showDoganeSelection, setShowDoganeSelection] = useState(false);
    const [invoiceWithDogane, setInvoiceWithDogane] = useState(false);

    const resolveSellerSelection = (sale: CarSale | null) => {
        const candidates = [sale?.soldBy, sale?.sellerName]
            .filter((value): value is string => Boolean(value))
            .map(value => value.trim())
            .filter(Boolean);

        const match = availableProfiles.find(profile => candidates.includes(profile.id))
            || availableProfiles.find(profile => candidates.includes(profile.label))
            || availableProfiles.find(profile => candidates.some(candidate =>
                profile.id.toLowerCase() === candidate.toLowerCase()
                || profile.label.toLowerCase() === candidate.toLowerCase()
            ));

        return {
            soldBy: match?.id || candidates[0] || '',
            sellerName: match?.label || sale?.sellerName || candidates[0] || ''
        };
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

            const resolvedSeller = resolveSellerSelection(migratedSale);
            setFormData({
                ...migratedSale,
                ...resolvedSeller
            });
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
                    .then(async (blob) => {
                        const openResult = await openPdfBlob(blob);
                        if (!openResult.opened) {
                            alert('Popup blocked. The PDF opened in this tab so you can save or share it.');
                        }
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

    const handleSellerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value;
        const selectedProfile = availableProfiles.find(profile => profile.id === selectedId);
        setFormData(prev => ({
            ...prev,
            sellerName: selectedProfile?.label || selectedId,
            soldBy: selectedId
        }));
    };

    const handlePaidToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({
            ...prev,
            isPaid: e.target.checked
        }));
    };

    const handlePreviewSaveToSale = (updates: Partial<CarSale>) => {
        setFormData(prev => ({
            ...prev,
            ...updates
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
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 border-dashed hover:border-slate-200 transition-colors h-full flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <label className="text-[11px] uppercase text-slate-500 font-bold block">
                    {label}
                    <span className="normal-case text-[10px] font-semibold text-slate-400 ml-1">(Optional)</span>
                </label>
                <label className="cursor-pointer text-slate-500 hover:text-slate-400 transition-colors bg-slate-500/10 hover:bg-slate-800/20 px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Add
                    <input type="file" className="hidden" multiple accept="image/*,.pdf" onChange={(e) => handleFileChange(e, field)} />
                </label>
            </div>

            <div className="flex-1 flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                {files && files.length > 0 ? (
                    files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 group cursor-pointer hover:bg-slate-50 transition-all" onClick={() => viewFile(file)}>
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors flex-shrink-0" />
                                <span className="text-xs text-slate-600 truncate group-hover:text-slate-900 transition-colors">{file.name}</span>
                            </div>
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(field, idx); }} className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors ml-1"><X className="w-3 h-3" /></button>
                        </div>
                    ))
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-1 min-h-[60px]">
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
            className={`${inline ? 'w-full h-full flex flex-col bg-white min-h-0' : 'bg-white border border-slate-200 w-[min(98vw,96rem)] max-w-[96rem] rounded-2xl shadow-2xl relative flex flex-col max-h-[calc(100vh-6rem)] min-h-0'}`}
        >
            {!hideHeader && (
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900">{existingSale ? 'Edit Sale' : 'New Car Sale'}</h2>
                    {!inline && (
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            )}

            <div
                className="flex-1 overflow-y-auto no-scrollbar flex flex-col pt-2 min-h-0"
            >
                <form
                    onSubmit={handleSubmit}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                    className="px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-10 lg:pb-12 flex flex-col gap-8 md:gap-10"
                >
                    <Section title="Vehicle Details" description="Core vehicle information for this sale.">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
                            <Input label="Brand" name="brand" value={formData.brand} onChange={handleChange} required />
                            <Input label="Model" name="model" value={formData.model} onChange={handleChange} required />
                            <Select label="Year" name="year" value={formData.year} onChange={handleChange}>
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </Select>
                            <Select label="Color" name="color" value={formData.color} onChange={handleChange}>
                                <option value="">Select</option>
                                {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                            <Input label="KM" name="km" value={formData.km ? formData.km.toLocaleString() : ''} onChange={handleKmChange} placeholder="0" />
                            <Input label="VIN" name="vin" value={formData.vin} onChange={handleChange} />
                            <Input label="License Plate" name="plateNumber" value={formData.plateNumber} onChange={handleChange} />
                        </div>
                    </Section>

                    <Section title="Buyer & Logistics" description="Who is purchasing the vehicle and shipping details.">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                            <Input label="Buyer Name" name="buyerName" value={formData.buyerName} onChange={handleChange} required />
                            <Input label="Buyer Personal ID" name="buyerPersonalId" value={formData.buyerPersonalId || ''} onChange={handleChange} />
                            <Select label="Seller Name" name="sellerName" value={formData.soldBy || formData.sellerName || ''} onChange={handleSellerChange}>
                                <option value="">Select Seller</option>
                                {availableProfiles.map(profile => (
                                    <option key={profile.id} value={profile.id}>{profile.label}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            <Input label="Shipping Company" name="shippingName" value={formData.shippingName} onChange={handleChange} />
                            <DateInput label="Shipping Date" name="shippingDate" value={formData.shippingDate ? String(formData.shippingDate).split('T')[0] : ''} onChange={handleChange} />
                        </div>
                    </Section>

                    <Section title="Financials" description="Costs, payments, and status for this sale.">
                        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-1'} gap-4 md:gap-6`}>
                            {isAdmin && (
                                <Input label="Cost to Buy (€)" name="costToBuy" type="number" value={formData.costToBuy || ''} onChange={handleChange} />
                            )}
                            <Input label="Sold Price (€)" name="soldPrice" type="number" value={formData.soldPrice || ''} onChange={handleChange} required className="font-bold text-emerald-700 border-emerald-200" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[15px] font-semibold text-slate-700 ml-0.5 flex items-center gap-1 leading-5">
                                    Paid?
                                    <span className="text-xs font-medium text-slate-400">(Optional)</span>
                                </label>
                                <label className={`flex items-center justify-center gap-2 cursor-pointer h-[52px] rounded-xl border transition-all ${formData.isPaid ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-200'}`}>
                                    <input
                                        type="checkbox"
                                        name="isPaid"
                                        checked={formData.isPaid ?? false}
                                        onChange={handlePaidToggle}
                                        className="hidden"
                                    />
                                    <span className="text-sm font-bold uppercase">{formData.isPaid ? 'Paid' : 'Not Paid'}</span>
                                </label>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[15px] font-semibold text-slate-700 ml-0.5 flex items-center gap-1 leading-5">
                                    Transport
                                    <span className="text-xs font-medium text-slate-400">(Optional)</span>
                                </label>
                                <label className={`flex items-center gap-2 cursor-pointer p-3 rounded-xl border transition-all justify-center select-none h-[52px] ${formData.includeTransport ? 'bg-slate-900 border-slate-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-200'}`}>
                                    <input type="checkbox" name="includeTransport" checked={formData.includeTransport || false} onChange={(e) => { const c = e.target.checked; setFormData(p => ({ ...p, includeTransport: c, soldPrice: (p.soldPrice || 0) + (c ? 350 : -350) })); }} className="hidden" />
                                    <span className="text-xs font-bold uppercase">{formData.includeTransport ? 'Transport: Yes' : 'Transport: No'}</span>
                                </label>
                            </div>
                        </div>

                        {isAdmin && (
                            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Supplier (Korea)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <Input label="Paid to Korea (€)" name="amountPaidToKorea" type="number" value={formData.amountPaidToKorea || ''} onChange={handleChange} />
                                    <DateInput label="Paid Date (KR)" name="paidDateToKorea" value={formData.paidDateToKorea ? String(formData.paidDateToKorea).split('T')[0] : ''} onChange={handleChange} />
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Client Payments</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
                                <Input label="Paid Bank (€)" name="amountPaidBank" type="number" value={formData.amountPaidBank || ''} onChange={handleChange} />
                                <Input label="Paid Cash (€)" name="amountPaidCash" type="number" value={formData.amountPaidCash || ''} onChange={handleChange} />
                                <Input label="Deposit (€)" name="deposit" type="number" value={formData.deposit || ''} onChange={handleChange} />
                                <DateInput label="Dep. Date" name="depositDate" value={formData.depositDate ? String(formData.depositDate).split('T')[0] : ''} onChange={handleChange} />
                                <div className="col-span-1 sm:col-span-2 xl:col-span-3">
                                    <DateInput label="Full Payment Date" name="paidDateFromClient" value={formData.paidDateFromClient ? String(formData.paidDateFromClient).split('T')[0] : ''} onChange={handleChange} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:gap-6">
                            <Select label="Status" name="status" value={formData.status} onChange={handleChange}>
                                <option value="New">New</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Shipped">Shipped</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                            </Select>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                            <span className="text-sm text-slate-500 font-bold uppercase tracking-wide">Balance Due</span>
                            <span className={`text-2xl font-mono font-bold ${(formData.soldPrice! - ((formData.amountPaidBank || 0) + (formData.amountPaidCash || 0) + (formData.deposit || 0))) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                €{(formData.soldPrice! - ((formData.amountPaidBank || 0) + (formData.amountPaidCash || 0) + (formData.deposit || 0))).toLocaleString()}
                            </span>
                        </div>
                    </Section>

                    <Section title="Attachments" description="Attach receipts and invoices for this sale.">
                        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 md:gap-5`}>
                            <FileList files={formData.bankReceipts} field="bankReceipts" label="Bank Receipts" />
                            <FileList files={formData.bankInvoices} field="bankInvoices" label="Bank Invoices" />
                            {isAdmin && <FileList files={formData.depositInvoices} field="depositInvoices" label="Deposit Invoices" />}
                        </div>
                    </Section>

                    <Section title="Documents" description="Generate contracts and invoices from this sale.">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <div className="text-sm font-semibold text-slate-700">Documents</div>
                                <p className="text-sm text-slate-500">Deposit, Shitblerje, Marrëveshje, or Invoice.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDocumentMenu(true)}
                                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold shadow-sm hover:bg-slate-800 transition-all w-full sm:w-auto justify-center"
                            >
                                <FileText className="w-4 h-4" />
                                Documents
                            </button>
                        </div>
                    </Section>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-auto">
                        <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold transition-all">Cancel</button>
                        <button type="submit" className="px-8 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-sm active:scale-95 transition-all w-full md:w-auto">
                            {existingSale ? 'Update Sale' : 'Create Sale'}
                        </button>
                    </div>
                </form>
            </div>
        </motion.div>
    );

    const previewOverlay = previewImage && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-center justify-center p-4" onClick={closePreview}>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" />
            <button onClick={closePreview} className="absolute top-6 right-6 text-white hover:text-slate-100 bg-slate-900/60 p-2 rounded-full"><X className="w-8 h-8" /></button>
        </div>
    );

    const documentMenu = showDocumentMenu && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 backdrop-blur-sm p-4" onClick={() => setShowDocumentMenu(false)}>
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h4 className="text-base font-bold text-slate-900">Which document do you want?</h4>
                        <p className="text-sm text-slate-500">Select a document to generate.</p>
                    </div>
                    <button type="button" onClick={() => setShowDocumentMenu(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    <button
                        type="button"
                        onClick={() => { setContractType('deposit'); setShowDocumentMenu(false); }}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-slate-300 hover:bg-slate-50/40 transition"
                    >
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Deposit Contract</div>
                            <div className="text-xs text-slate-500">Marrëveshje për Kapar</div>
                        </div>
                        <FileText className="w-4 h-4 text-slate-700" />
                    </button>
                    <button
                        type="button"
                        onClick={() => { setContractType('full_shitblerje'); setShowDocumentMenu(false); }}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-slate-400 hover:bg-slate-50/40 transition"
                    >
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Shitblerje Contract</div>
                            <div className="text-xs text-slate-500">Full Contract</div>
                        </div>
                        <FileText className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                        type="button"
                        onClick={() => { setContractType('full_marreveshje'); setShowDocumentMenu(false); }}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-slate-400 hover:bg-slate-50/40 transition"
                    >
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Marrëveshje Contract</div>
                            <div className="text-xs text-slate-500">Full Contract</div>
                        </div>
                        <FileText className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowDoganeSelection(true); setShowDocumentMenu(false); }}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40 transition"
                    >
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Invoice</div>
                            <div className="text-xs text-slate-500">Preview & download invoice</div>
                        </div>
                        <FileText className="w-4 h-4 text-emerald-500" />
                    </button>
                </div>
            </div>
        </div>
    );

    const doganeSelectionModal = showDoganeSelection && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/30 backdrop-blur-sm p-4" onClick={() => setShowDoganeSelection(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h4 className="text-base font-bold text-slate-900">Fatura</h4>
                        <p className="text-sm text-slate-500">Me Doganë apo pa Doganë?</p>
                    </div>
                    <button type="button" onClick={() => setShowDoganeSelection(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => { setInvoiceWithDogane(false); setShowInvoice(true); setShowDoganeSelection(false); }}
                        className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-4 text-center hover:border-slate-400 hover:bg-slate-50 transition"
                    >
                        <div className="text-sm font-bold text-slate-900">Pa Doganë</div>
                        <div className="text-xs text-slate-500">Default</div>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setInvoiceWithDogane(true); setShowInvoice(true); setShowDoganeSelection(false); }}
                        className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-200 px-4 py-4 text-center hover:border-emerald-400 hover:bg-emerald-50 transition"
                    >
                        <div className="text-sm font-bold text-emerald-700">Me Doganë</div>
                        <div className="text-xs text-emerald-600">Përfshirë doganën</div>
                    </button>
                </div>
            </div>
        </div>
    );

    if (inline) {
        return (
            <div className="w-full h-full relative p-0 overflow-hidden flex flex-col">
                {previewOverlay}
                {Content}
                {documentMenu}
                {doganeSelectionModal}
                {showInvoice && (
                    <EditablePreviewModal
                        isOpen={showInvoice}
                        onClose={() => setShowInvoice(false)}
                        sale={formData as CarSale}
                        documentType="invoice"
                        withDogane={invoiceWithDogane}
                        onSaveToSale={handlePreviewSaveToSale}
                    />
                )}
                {contractType && (
                    <EditablePreviewModal
                        isOpen={!!contractType}
                        onClose={() => setContractType(null)}
                        sale={formData as CarSale}
                        documentType={contractType}
                        onSaveToSale={handlePreviewSaveToSale}
                    />
                )}
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(3rem,env(safe-area-inset-top))]"
            onClick={handleBackdropClick}
        >
            <div className="absolute inset-0 bg-slate-900/60" />
            {previewOverlay}
            {Content}
            {documentMenu}
            {doganeSelectionModal}
            {showInvoice && (
                <EditablePreviewModal
                    isOpen={showInvoice}
                    onClose={() => setShowInvoice(false)}
                    sale={formData as CarSale}
                    documentType="invoice"
                    withDogane={invoiceWithDogane}
                    onSaveToSale={handlePreviewSaveToSale}
                />
            )}
            {contractType && (
                <EditablePreviewModal
                    isOpen={!!contractType}
                    onClose={() => setContractType(null)}
                    sale={formData as CarSale}
                    documentType={contractType}
                    onSaveToSale={handlePreviewSaveToSale}
                />
            )}
        </div>
    );
}

const Section = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <div className="w-full rounded-2xl border border-slate-100 bg-white/90 p-5 md:p-7 shadow-[0_1px_3px_rgba(15,23,42,0.06)] space-y-7">
        <div className="space-y-2 border-b border-slate-100 pb-5">
            <h3 className="text-lg md:text-xl font-bold text-slate-900 tracking-wide">{title}</h3>
            {description && <p className="text-sm md:text-[15px] text-slate-500 leading-relaxed">{description}</p>}
        </div>
        <div className="space-y-5">
            {children}
        </div>
    </div>
);

const Input = ({ label, className = "", required, ...props }: any) => (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
        <label className="text-[15px] font-semibold text-slate-700 ml-0.5 flex items-center gap-1 leading-5">
            {label}
            {!required && <span className="text-xs font-medium text-slate-400">(Optional)</span>}
        </label>
        <input
            className="bg-white border border-slate-200 hover:border-slate-200 focus:border-slate-400 rounded-xl px-4 text-base text-slate-900 leading-6 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all placeholder:text-slate-400 w-full h-[52px]"
            required={required}
            {...props}
        />
    </div>
);

const Select = ({ label, children, required, ...props }: any) => (
    <div className="flex flex-col gap-1.5 text-left w-full">
        <label className="text-[15px] font-semibold text-slate-700 ml-0.5 flex items-center gap-1 leading-5">
            {label}
            {!required && <span className="text-xs font-medium text-slate-400">(Optional)</span>}
        </label>
        <div className="relative w-full">
            <select
                className="appearance-none bg-white border border-slate-200 hover:border-slate-200 focus:border-slate-400 rounded-xl px-4 text-base text-slate-900 leading-6 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all w-full h-[52px] cursor-pointer"
                required={required}
                {...props}
            >
                {children}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                <ChevronDown className="h-5 w-5" />
            </div>
        </div>
    </div>
);

const DateInput = ({ label, required, ...props }: any) => (
    <div className="flex flex-col gap-1.5 w-full">
        <label className="text-[15px] font-semibold text-slate-700 ml-0.5 flex items-center gap-1 leading-5">
            {label}
            {!required && <span className="text-xs font-medium text-slate-400">(Optional)</span>}
        </label>
        <input
            type="date"
            className="bg-white border border-slate-200 hover:border-slate-200 focus:border-slate-400 rounded-xl px-4 text-base text-slate-900 leading-6 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all placeholder:text-slate-400 w-full h-[52px] cursor-pointer"
            required={required}
            {...props}
        />
    </div>
);
