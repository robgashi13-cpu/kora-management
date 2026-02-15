'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, ArrowLeft, Eye } from 'lucide-react';
import ViewSaleModal from './ViewSaleModal';
import { CarSale, ShitblerjeOverrides, ContractType } from '@/app/types';
import { motion } from 'framer-motion';
import EditablePreviewModal from './EditablePreviewModal';
import InvoiceModal from './InvoiceModal';
import InvoicePriceModal from './InvoicePriceModal';
import { InvoicePriceSource, resolveInvoicePriceValue } from './invoicePricing';
import { PDF_TEMPLATE_DEFINITIONS, PdfTemplateMap } from './PdfTemplateBuilder';

interface Props {
    isOpen: boolean;
    sale: CarSale | null;
    onClose: () => void;
    onSave: (overrides: ShitblerjeOverrides) => Promise<void>;
    pdfTemplates?: PdfTemplateMap;
}

const YEARS = Array.from({ length: 26 }, (_, i) => 2000 + i).reverse();
const COLORS = [
    'Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Brown', 'Beige', 'Gold', 'Yellow', 'Orange', 'Purple', 'Other'
];

export default function EditShitblerjeModal({ isOpen, sale, onClose, onSave, pdfTemplates }: Props) {
    const [formData, setFormData] = useState<ShitblerjeOverrides>({});
    const [isSaving, setIsSaving] = useState(false);
    const [draftState, setDraftState] = useState<{ status: 'idle' | 'saving' | 'saved'; savedAt?: string }>({ status: 'idle' });
    const [showDocumentMenu, setShowDocumentMenu] = useState(false);
    const [contractType, setContractType] = useState<ContractType | null>(null);
    const [showInvoice, setShowInvoice] = useState(false);
    const [showDoganeSelection, setShowDoganeSelection] = useState(false);
    const [invoiceWithDogane, setInvoiceWithDogane] = useState(false);
    const [invoiceTaxAmount, setInvoiceTaxAmount] = useState<number | undefined>(undefined);
    const [invoicePriceSource, setInvoicePriceSource] = useState<InvoicePriceSource | null>(null);
    const [showInvoicePriceModal, setShowInvoicePriceModal] = useState(false);
    const [showTaxPrompt, setShowTaxPrompt] = useState(false);
    const [taxInputValue, setTaxInputValue] = useState('');
    const [taxInputError, setTaxInputError] = useState<string | null>(null);
    const [showViewSale, setShowViewSale] = useState(false);
    const hasInitializedFormRef = useRef(false);
    const hasRestoredDraftRef = useRef(false);
    const autosaveTimerRef = useRef<number | null>(null);

    const draftStorageKey = useMemo(() => {
        if (!sale) return '';
        return `sale_draft:shitblerje:edit:${sale.id}`;
    }, [sale]);

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
        if (!isOpen || !baseValues || hasInitializedFormRef.current) return;
        setFormData(baseValues);
        hasInitializedFormRef.current = true;
        setDraftState({ status: 'idle' });
    }, [isOpen, baseValues]);

    useEffect(() => {
        if (isOpen) return;
        hasInitializedFormRef.current = false;
        hasRestoredDraftRef.current = false;
        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !draftStorageKey || hasRestoredDraftRef.current || typeof window === 'undefined') return;
        hasRestoredDraftRef.current = true;
        const raw = window.localStorage.getItem(draftStorageKey);
        if (!raw) return;
        try {
            const draft = JSON.parse(raw) as { data: ShitblerjeOverrides; updatedAt?: string };
            if (draft?.data) {
                setFormData(prev => ({ ...prev, ...draft.data }));
                setDraftState({ status: 'saved', savedAt: draft.updatedAt });
            }
        } catch (error) {
            console.warn('Failed to restore shitblerje draft', error);
        }
    }, [draftStorageKey, isOpen]);

    useEffect(() => {
        if (!isOpen || !draftStorageKey || typeof window === 'undefined' || !hasInitializedFormRef.current) return;
        setDraftState(prev => ({ ...prev, status: 'saving' }));

        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
        }

        autosaveTimerRef.current = window.setTimeout(() => {
            const savedAt = new Date().toISOString();
            window.localStorage.setItem(draftStorageKey, JSON.stringify({ data: formData, updatedAt: savedAt }));
            setDraftState({ status: 'saved', savedAt });
        }, 500);

        return () => {
            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [draftStorageKey, formData, isOpen]);

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
            if (typeof window !== 'undefined' && draftStorageKey) {
                window.localStorage.removeItem(draftStorageKey);
            }
            setDraftState({ status: 'idle' });
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
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-700"
                                aria-label="Go back"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Edit Shitblerje</h2>
                                <p className="text-xs text-slate-500">Only affects Shitblerje + Invoice PDFs.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowViewSale(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors"
                            >
                                <Eye className="w-4 h-4" />
                                <span className="hidden sm:inline">View Sale</span>
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <form 
                        onSubmit={handleSubmit} 
                        className="p-5 space-y-5 overflow-y-auto flex-1 scroll-container"
                        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
                    >
                        {/* Buyer Info Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Buyer Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input label="Buyer Name" name="buyerName" value={formData.buyerName ?? ''} onChange={handleChange} required />
                                <Input label="Buyer Personal ID" name="buyerPersonalId" value={formData.buyerPersonalId ?? ''} onChange={handleChange} />
                            </div>
                        </div>

                        {/* Vehicle Info Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Vehicle Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input label="Brand" name="brand" value={formData.brand ?? ''} onChange={handleChange} required />
                                <Input label="Model" name="model" value={formData.model ?? ''} onChange={handleChange} required />
                                <Select label="Year" name="year" value={formData.year ?? new Date().getFullYear()} onChange={handleNumberChange}>
                                    {YEARS.map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </Select>
                                <Select label="Color" name="color" value={formData.color ?? ''} onChange={handleChange}>
                                    <option value="">Select</option>
                                    {COLORS.map(color => (
                                        <option key={color} value={color}>{color}</option>
                                    ))}
                                </Select>
                                <Input label="KM" name="km" type="number" value={formData.km ?? 0} onChange={handleNumberChange} />
                                <Input label="VIN" name="vin" value={formData.vin ?? ''} onChange={handleChange} />
                                <Input label="License Plate" name="plateNumber" value={formData.plateNumber ?? ''} onChange={handleChange} />
                                <Input label="Sold Price (€)" name="soldPrice" type="number" value={formData.soldPrice ?? 0} onChange={handleNumberChange} required />
                            </div>
                        </div>

                        {/* Documents Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Documents</h3>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <p className="text-sm text-slate-500">{PDF_TEMPLATE_DEFINITIONS.map((item) => pdfTemplates?.[item.id]?.title || item.label).join(', ')}.</p>
                                <button
                                    type="button"
                                    onClick={() => setShowDocumentMenu(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold shadow-sm hover:bg-slate-800 transition-all"
                                >
                                    <FileText className="w-4 h-4" />
                                    Documents
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2 border-t border-slate-100">
                            <div className="text-xs font-medium text-slate-500 sm:mr-auto sm:self-center">
                                {draftState.status === 'saving' && 'Saving draft...'}
                                {draftState.status === 'saved' && `Draft saved${draftState.savedAt ? ` • ${new Date(draftState.savedAt).toLocaleTimeString()}` : ''}`}
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                            >
                                {isSaving ? 'Saving...' : 'Save Shitblerje'}
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
                                    <div className="text-sm font-semibold text-slate-900">{pdfTemplates?.deposit?.title || 'Deposit Contract'}</div>
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
                                    <div className="text-sm font-semibold text-slate-900">{pdfTemplates?.full_shitblerje?.title || 'Shitblerje Contract'}</div>
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
                                    <div className="text-sm font-semibold text-slate-900">{pdfTemplates?.full_marreveshje?.title || 'Marrëveshje Contract'}</div>
                                    <div className="text-xs text-slate-500">Full Contract</div>
                                </div>
                                <FileText className="w-4 h-4 text-slate-600" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setInvoicePriceSource(null);
                                    setShowInvoicePriceModal(true);
                                    setShowDocumentMenu(false);
                                }}
                                className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40 transition"
                            >
                                <div>
                                    <div className="text-sm font-semibold text-slate-900">{pdfTemplates?.invoice?.title || 'Invoice'}</div>
                                    <div className="text-xs text-slate-500">Preview & download invoice</div>
                                </div>
                                <FileText className="w-4 h-4 text-emerald-500" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <InvoicePriceModal
                isOpen={showInvoicePriceModal}
                sale={previewSale}
                onSelect={(source) => {
                    setInvoicePriceSource(source);
                    setShowInvoicePriceModal(false);
                    setShowDoganeSelection(true);
                }}
                onCancel={() => {
                    setInvoicePriceSource(null);
                    setShowInvoicePriceModal(false);
                }}
            />

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
                                onClick={() => {
                                    setInvoiceWithDogane(false);
                                    setInvoiceTaxAmount(undefined);
                                    setShowInvoice(true);
                                    setShowDoganeSelection(false);
                                }}
                                className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-4 text-center hover:border-slate-400 hover:bg-slate-50 transition"
                            >
                                <div className="text-sm font-bold text-slate-900">Pa Doganë</div>
                                <div className="text-xs text-slate-500">Default</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTaxInputValue('');
                                    setTaxInputError(null);
                                    setShowTaxPrompt(true);
                                    setShowDoganeSelection(false);
                                }}
                                className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-200 px-4 py-4 text-center hover:border-emerald-400 hover:bg-emerald-50 transition"
                            >
                                <div className="text-sm font-bold text-emerald-700">Me Doganë</div>
                                <div className="text-xs text-emerald-600">Përfshirë doganën</div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTaxPrompt && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4" onClick={() => setShowTaxPrompt(false)}>
                    <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h4 className="text-base font-bold text-slate-900">Enter Tax Price</h4>
                                <p className="text-sm text-slate-500">Numbers only, no negatives.</p>
                            </div>
                            <button type="button" onClick={() => setShowTaxPrompt(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-2">
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={taxInputValue}
                                onChange={(e) => {
                                    setTaxInputValue(e.target.value);
                                    if (taxInputError) setTaxInputError(null);
                                }}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/40"
                                placeholder="e.g. 1000"
                            />
                            {taxInputError && <p className="text-xs text-red-600">{taxInputError}</p>}
                        </div>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowTaxPrompt(false)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const trimmed = taxInputValue.trim();
                                    if (!trimmed) {
                                        setInvoiceTaxAmount(undefined);
                                        setInvoiceWithDogane(true);
                                        setShowInvoice(true);
                                        setShowTaxPrompt(false);
                                        return;
                                    }
                                    const parsed = Number(trimmed);
                                    if (Number.isNaN(parsed) || parsed < 0) {
                                        setTaxInputError('Enter a valid non-negative number.');
                                        return;
                                    }
                                    setInvoiceTaxAmount(parsed);
                                    setInvoiceWithDogane(true);
                                    setShowInvoice(true);
                                    setShowTaxPrompt(false);
                                }}
                                className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                            >
                                Continue
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
                    onSaveToSale={() => {}}
                    templates={pdfTemplates}
                />
            )}

            {/* Invoice Modal */}
            {showInvoice && (
                <InvoiceModal
                    isOpen={showInvoice}
                    onClose={() => setShowInvoice(false)}
                    sale={previewSale}
                    withDogane={invoiceWithDogane}
                    taxAmount={invoiceTaxAmount}
                    priceSource={invoicePriceSource || 'sold'}
                    priceValue={resolveInvoicePriceValue(previewSale, invoicePriceSource || 'sold')}
                    template={pdfTemplates?.invoice}
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
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
        <label className="text-[13px] font-semibold text-slate-700 flex items-center gap-1">
            {label}
            {!required && <span className="text-[11px] font-medium text-slate-400">(Optional)</span>}
        </label>
        <input
            className="bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-xl px-3 text-sm text-slate-900 leading-6 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all placeholder:text-slate-400 w-full h-10"
            required={required}
            {...props}
        />
    </div>
);

const Select = ({ label, children, required, ...props }: any) => (
    <div className="flex flex-col gap-1.5 w-full">
        <label className="text-[13px] font-semibold text-slate-700 flex items-center gap-1">
            {label}
            {!required && <span className="text-[11px] font-medium text-slate-400">(Optional)</span>}
        </label>
        <select
            className="bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-xl px-3 text-sm text-slate-900 leading-6 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all w-full h-10 cursor-pointer"
            required={required}
            {...props}
        >
            {children}
        </select>
    </div>
);
