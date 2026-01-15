'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, FileText, ArrowLeft, Eye } from 'lucide-react';
import ViewSaleModal from './ViewSaleModal';
import { CarSale, ShitblerjeOverrides, ContractType } from '@/app/types';
import { motion } from 'framer-motion';
import EditablePreviewModal from './EditablePreviewModal';


interface Props {
    isOpen: boolean;
    sale: CarSale | null;
    onClose: () => void;
    onSave: (overrides: ShitblerjeOverrides) => Promise<void>;
}

const YEARS = Array.from({ length: 26 }, (_, i) => 2000 + i).reverse();
const COLORS = [
    'Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Brown', 'Beige', 'Gold', 'Yellow', 'Orange', 'Purple', 'Other'
];

export default function EditShitblerjeModal({ isOpen, sale, onClose, onSave }: Props) {
    const [formData, setFormData] = useState<ShitblerjeOverrides>({});
    const [isSaving, setIsSaving] = useState(false);
    const [showDocumentMenu, setShowDocumentMenu] = useState(false);
    const [contractType, setContractType] = useState<ContractType | 'invoice' | null>(null);
    const [showDoganeSelection, setShowDoganeSelection] = useState(false);
    const [invoiceWithDogane, setInvoiceWithDogane] = useState(false);
    const [showViewSale, setShowViewSale] = useState(false);

    const baseValues = useMemo(() => {
        if (!sale) return null;
        return {
            brand: sale.shitblerjeOverrides?.brand ?? sale.brand ?? '',
            model: sale.shitblerjeOverrides?.model ?? sale.model ?? '',
            year: sale.shitblerjeOverrides?.year ?? sale.year ?? new Date().getFullYear(),
            km: sale.shitblerjeOverrides?.km ?? sale.km ?? 0,
            color: sale.shitblerjeOverrides?.color ?? sale.color ?? '',
            plateNumber: sale.shitblerjeOverrides?.plateNumber ?? sale.plateNumber ?? '',
            vin: sale.shitblerjeOverrides?.vin ?? sale.vin ?? '',
            soldPrice: sale.shitblerjeOverrides?.soldPrice ?? sale.soldPrice ?? 0,
            buyerName: sale.shitblerjeOverrides?.buyerName ?? sale.buyerName ?? '',
            buyerPersonalId: sale.shitblerjeOverrides?.buyerPersonalId ?? sale.buyerPersonalId ?? ''
        };
    }, [sale]);

    useEffect(() => {
        if (isOpen && baseValues) {
            setFormData(baseValues);
        }
    }, [isOpen, baseValues]);

    if (!isOpen || !sale) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const numericValue = value === '' ? 0 : Number(value);
        setFormData(prev => ({
            ...prev,
            [name]: Number.isNaN(numericValue) ? 0 : numericValue
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({
                ...formData,
                year: Number(formData.year || 0),
                km: Number(formData.km || 0),
                soldPrice: Number(formData.soldPrice || 0)
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Create a merged sale object for document generation
    const previewSale: CarSale = {
        ...sale,
        brand: formData.brand ?? sale.brand,
        model: formData.model ?? sale.model,
        year: formData.year ?? sale.year,
        km: formData.km ?? sale.km,
        color: formData.color ?? sale.color,
        plateNumber: formData.plateNumber ?? sale.plateNumber,
        vin: formData.vin ?? sale.vin,
        soldPrice: formData.soldPrice ?? sale.soldPrice,
        buyerName: formData.buyerName ?? sale.buyerName,
        buyerPersonalId: formData.buyerPersonalId ?? sale.buyerPersonalId
    };

    return (
        <>
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col my-auto overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
                                aria-label="Go back"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                            <div>
                                <h2 className="text-base font-bold text-slate-900 leading-tight">Edit Shitblerje</h2>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">PDF Overrides Only</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowViewSale(true)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline uppercase">View</span>
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                aria-label="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <form
                        onSubmit={handleSubmit}
                        className="p-4 space-y-4 overflow-y-auto flex-1 no-scrollbar"
                        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
                    >
                        {/* Car Details Section */}
                        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-4">
                            <div className="border-b border-slate-100 pb-2">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Car Details</h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Input label="Brand" name="brand" value={formData.brand ?? ''} onChange={handleChange} required />
                                <Input label="Model" name="model" value={formData.model ?? ''} onChange={handleChange} required />
                                <Select label="Year" name="year" value={formData.year ?? new Date().getFullYear()} onChange={handleNumberChange}>
                                    {YEARS.map(year => <option key={year} value={year}>{year}</option>)}
                                </Select>
                                <Select label="Color" name="color" value={formData.color ?? ''} onChange={handleChange}>
                                    <option value="">Select</option>
                                    {COLORS.map(color => <option key={color} value={color}>{color}</option>)}
                                </Select>
                                <Input label="KM" type="number" name="km" value={formData.km ?? 0} onChange={handleNumberChange} />
                                <Input label="Plate" name="plateNumber" value={formData.plateNumber ?? ''} onChange={handleChange} />
                                <div className="col-span-2">
                                    <Input label="VIN" name="vin" value={formData.vin ?? ''} onChange={handleChange} />
                                </div>
                            </div>
                        </div>

                        {/* Financials & Buyer Section */}
                        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-4">
                            <div className="border-b border-slate-100 pb-2">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Financials & Buyer</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Buyer Name" name="buyerName" value={formData.buyerName ?? ''} onChange={handleChange} required />
                                <Input label="Buyer Personal ID" name="buyerPersonalId" value={formData.buyerPersonalId ?? ''} onChange={handleChange} />
                                <div className="md:col-span-2">
                                    <Input label="Sold Price (€)" name="soldPrice" type="number" value={formData.soldPrice ?? 0} onChange={handleNumberChange} required className="font-bold text-slate-900" />
                                </div>
                            </div>
                        </div>

                        {/* Documents Section */}
                        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">Reports</div>
                                    <p className="text-[10px] text-slate-500 uppercase mt-0.5">Generate Contracts & Invoices</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowDocumentMenu(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-bold shadow-sm hover:bg-slate-800 transition-all uppercase"
                                >
                                    <FileText className="w-3.5 h-3.5" />
                                    Documents
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors uppercase"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-8 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-60 transition-colors shadow-sm uppercase"
                            >
                                {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>

            {/* Document Selection Menu */}
            {showDocumentMenu && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/30 backdrop-blur-sm p-4" onClick={() => setShowDocumentMenu(false)}>
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
            )}

            {/* Dogane Selection Modal */}
            {showDoganeSelection && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/30 backdrop-blur-sm p-4" onClick={() => setShowDoganeSelection(false)}>
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
                                onClick={() => { setInvoiceWithDogane(false); setContractType('invoice'); setShowDoganeSelection(false); }}
                                className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-4 text-center hover:border-slate-400 hover:bg-slate-50 transition"
                            >
                                <div className="text-sm font-bold text-slate-900">Pa Doganë</div>
                                <div className="text-xs text-slate-500">Default</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setInvoiceWithDogane(true); setContractType('invoice'); setShowDoganeSelection(false); }}
                                className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-200 px-4 py-4 text-center hover:border-emerald-400 hover:bg-emerald-50 transition"
                            >
                                <div className="text-sm font-bold text-emerald-700">Me Doganë</div>
                                <div className="text-xs text-emerald-600">Përfshirë doganën</div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Contract Preview Modal */}
            {contractType && (
                <EditablePreviewModal
                    isOpen={!!contractType}
                    sale={previewSale}
                    documentType={contractType}
                    onClose={() => setContractType(null)}
                    onSaveToSale={(updates) => {
                        setFormData(prev => ({
                            ...prev,
                            ...updates
                        }));
                    }}
                />
            )}



            {/* View Sale Modal */}
            {showViewSale && sale && (
                <ViewSaleModal
                    isOpen={showViewSale}
                    sale={sale}
                    onClose={() => setShowViewSale(false)}
                    isAdmin={false}
                />
            )}
        </>
    );
}

const Input = ({ label, className = '', required, ...props }: any) => (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight ml-0.5">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
            className="bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-500 rounded-lg px-2.5 text-xs text-slate-900 h-9 outline-none transition-all placeholder:text-slate-400 w-full shadow-sm"
            required={required}
            {...props}
        />
    </div>
);

const Select = ({ label, children, required, ...props }: any) => (
    <div className="flex flex-col gap-1 w-full">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight ml-0.5">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <select
            className="bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-500 rounded-lg px-2.5 text-xs text-slate-900 h-9 outline-none transition-all w-full cursor-pointer shadow-sm"
            required={required}
            {...props}
        >
            {children}
        </select>
    </div>
);
