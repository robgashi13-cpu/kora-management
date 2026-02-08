'use client';

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { X, ArrowLeft, FileText, Eye } from 'lucide-react';
import { CarSale, Attachment } from '@/app/types';
import { motion } from 'framer-motion';
import InvoiceDocument from './InvoiceDocument';
import { generatePdf, openPdfBlob, waitForImages } from './pdfUtils';

interface Props {
    isOpen: boolean;
    sale: CarSale | null;
    onClose: () => void;
    isAdmin?: boolean;
}

const getBankFee = (price: number) => {
    if (price <= 10000) return 20;
    if (price <= 20000) return 50;
    return 100;
};

const calculateBalance = (sale: CarSale) => 
    (sale.soldPrice || 0) - ((sale.amountPaidCash || 0) + (sale.amountPaidBank || 0) + (sale.deposit || 0));

const calculateProfit = (sale: CarSale) => 
    ((sale.soldPrice || 0) - (sale.costToBuy || 0) - getBankFee(sale.soldPrice || 0) - (sale.servicesCost ?? 30.51) - (sale.includeTransport ? 350 : 0));

export default function ViewSaleModal({ isOpen, sale, onClose, isAdmin = false }: Props) {
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [pdfMessage, setPdfMessage] = useState<string | null>(null);

    if (!isOpen || !sale) return null;

    const handleViewPdf = async () => {
        if (!sale || isGeneratingPdf) return;
        setPdfMessage(null);
        setIsGeneratingPdf(true);

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '1024px';
        container.style.zIndex = '-1';
        document.body.appendChild(container);

        const root = createRoot(container);
        try {
            root.render(<InvoiceDocument sale={sale} />);
            await new Promise(resolve => setTimeout(resolve, 300));

            const invoiceElement = container.querySelector('#invoice-content') as HTMLElement | null;
            if (invoiceElement) {
                await waitForImages(invoiceElement);
            }

            const { blob: pdfBlob } = await generatePdf({
                element: invoiceElement || container,
                filename: `Invoice_${sale.vin || sale.id}.pdf`,
                onClone: (clonedDoc) => {
                    const invoiceNode = clonedDoc.querySelector('#invoice-content');
                    clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
                        if (invoiceNode && node.closest('#invoice-content')) {
                            return;
                        }
                        node.remove();
                    });
                }
            });
            const openResult = await openPdfBlob(pdfBlob);
            if (!openResult.opened) {
                setPdfMessage('Popup blocked. The PDF opened in this tab.');
            }
        } catch {
            setPdfMessage('Unable to open PDF right now. Please try again.');
        } finally {
            root.unmount();
            container.remove();
            setIsGeneratingPdf(false);
        }
    };

    const viewFile = (file: Attachment) => {
        if (!file.data) return;
        if (file.type.startsWith('image/')) {
            setPreviewImage(file.data);
        } else {
            fetch(file.data)
                .then(res => res.blob())
                .then(async (blob) => {
                    const openResult = await openPdfBlob(blob);
                    if (!openResult.opened) {
                        alert('Popup blocked. The PDF opened in this tab.');
                    }
                });
        }
    };

    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">{title}</h3>
            {children}
        </div>
    );

    const Field = ({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) => (
        <div className={`flex flex-col gap-0.5 ${className}`}>
            <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{label}</span>
            <span className="text-sm text-slate-800 font-medium">{value || '-'}</span>
        </div>
    );

    const FileList = ({ files, label }: { files: Attachment[] | undefined; label: string }) => (
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 h-full">
            <label className="text-[11px] uppercase text-slate-500 font-bold block mb-2">{label}</label>
            <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto scroll-container">
                {files && files.length > 0 ? (
                    files.map((file, idx) => (
                        <div
                            key={idx}
                            className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-all"
                            onClick={() => viewFile(file)}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                <span className="text-xs text-slate-600 truncate">{file.name}</span>
                            </div>
                            <Eye className="w-3 h-3 text-slate-400" />
                        </div>
                    ))
                ) : (
                    <div className="text-xs text-slate-400 italic py-2">No files attached</div>
                )}
            </div>
        </div>
    );

    return (
        <>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col my-auto overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-700"
                                aria-label="Go back"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">View Sale</h2>
                                <p className="text-xs text-slate-500">Read-only view • {sale.brand} {sale.model}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleViewPdf}
                                disabled={isGeneratingPdf}
                                className="px-3 py-2 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isGeneratingPdf ? 'Preparing PDF...' : 'View PDF'}
                            </button>
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                sale.status === 'Completed' ? 'bg-slate-100 text-slate-900 border border-slate-300' :
                                sale.status === 'In Progress' ? 'bg-slate-100 text-slate-700 border border-slate-300' :
                                sale.status === 'Shipped' ? 'bg-slate-200 text-slate-800 border border-slate-300' :
                                sale.status === 'Cancelled' ? 'bg-slate-200 text-slate-700 border border-slate-300' :
                                'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                                {sale.status}
                            </span>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 scroll-container" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {pdfMessage && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                                {pdfMessage}
                            </div>
                        )}
                        {/* Summary */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Vehicle</div>
                                        <div className="text-lg font-semibold text-slate-900">{sale.brand} {sale.model}</div>
                                        <div className="text-xs text-slate-500 mt-1">VIN: <span className="font-mono">{sale.vin || '-'}</span></div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Sold Price</div>
                                        <div className="text-2xl font-bold text-emerald-600">€{(sale.soldPrice || 0).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Buyer" value={sale.buyerName} />
                                    <Field label="Buyer ID" value={sale.buyerPersonalId} />
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Payment</div>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                                        sale.isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'
                                    }`}>
                                        {sale.isPaid ? 'Paid' : 'Not Paid'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Paid Bank" value={`€${(sale.amountPaidBank || 0).toLocaleString()}`} />
                                    <Field label="Paid Cash" value={`€${(sale.amountPaidCash || 0).toLocaleString()}`} />
                                    <Field label="Deposit" value={`€${(sale.deposit || 0).toLocaleString()}`} />
                                    <Field label="Balance Due" value={
                                        <span className={`font-semibold ${calculateBalance(sale) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                            €{calculateBalance(sale).toLocaleString()}
                                        </span>
                                    } />
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                                <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Logistics</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Shipping Co." value={sale.shippingName} />
                                    <Field label="Shipping Date" value={formatDate(sale.shippingDate)} />
                                    <Field label="Transport" value={sale.includeTransport ? 'Included' : 'Not Included'} />
                                    <Field label="Seller" value={sale.sellerName} />
                                </div>
                                {isAdmin && (
                                    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                        <div className="text-xs uppercase tracking-wide text-emerald-600 font-semibold mb-1">Profit</div>
                                        <div className={`text-xl font-bold ${calculateProfit(sale) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            €{calculateProfit(sale).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Vehicle Details */}
                        <Section title="Vehicle Details">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Field label="Brand" value={sale.brand} />
                                <Field label="Model" value={sale.model} />
                                <Field label="Year" value={sale.year} />
                                <Field label="Color" value={sale.color} />
                                <Field label="KM" value={(sale.km || 0).toLocaleString()} />
                                <Field label="VIN" value={<span className="font-mono text-xs">{sale.vin}</span>} />
                                <Field label="License Plate" value={<span className="font-mono">{sale.plateNumber}</span>} />
                            </div>
                        </Section>

                        {/* Buyer & Logistics */}
                        <Section title="Buyer & Logistics">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <Field label="Buyer Name" value={sale.buyerName} />
                                <Field label="Buyer ID" value={sale.buyerPersonalId} />
                                <Field label="Seller" value={sale.sellerName} />
                                <Field label="Shipping Company" value={sale.shippingName} />
                                <Field label="Shipping Date" value={formatDate(sale.shippingDate)} />
                                <Field label="Transport Included" value={sale.includeTransport ? 'Yes (+€350)' : 'No'} />
                            </div>
                        </Section>

                        {/* Financial Details */}
                        <Section title="Financial Details">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {isAdmin && <Field label="Cost to Buy" value={`€${(sale.costToBuy || 0).toLocaleString()}`} />}
                                <Field label="Sold Price" value={<span className="text-emerald-600 font-bold">€{(sale.soldPrice || 0).toLocaleString()}</span>} />
                                {isAdmin && <Field label="Services Cost" value={`€${(sale.servicesCost ?? 30.51).toLocaleString()}`} />}
                                {isAdmin && <Field label="Tax" value={`€${(sale.tax || 0).toLocaleString()}`} />}
                            </div>

                            {isAdmin && (
                                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Supplier (Korea)</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="Paid to Korea" value={`€${(sale.amountPaidToKorea || 0).toLocaleString()}`} />
                                        <Field label="Paid Date (KR)" value={formatDate(sale.paidDateToKorea)} />
                                    </div>
                                </div>
                            )}
                        </Section>

                        {/* Client Payments */}
                        <Section title="Client Payments">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Field label="Paid Bank" value={`€${(sale.amountPaidBank || 0).toLocaleString()}`} />
                                <Field label="Paid Cash" value={`€${(sale.amountPaidCash || 0).toLocaleString()}`} />
                                <Field label="Deposit" value={`€${(sale.deposit || 0).toLocaleString()}`} />
                                <Field label="Deposit Date" value={formatDate(sale.depositDate)} />
                                <Field label="Full Payment Date" value={formatDate(sale.paidDateFromClient)} />
                            </div>
                        </Section>

                        {/* Attachments */}
                        <Section title="Attachments">
                            <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                                <FileList files={sale.bankReceipts} label="Bank Receipts" />
                                <FileList files={sale.bankInvoices} label="Bank Invoices" />
                                {isAdmin && <FileList files={sale.depositInvoices} label="Deposit Invoices" />}
                            </div>
                        </Section>

                        {/* Notes */}
                        {sale.notes && (
                            <Section title="Notes">
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{sale.notes}</p>
                                </div>
                            </Section>
                        )}

                        {/* Metadata */}
                        <div className="text-xs text-slate-400 flex flex-wrap gap-4 pt-4 border-t border-slate-100">
                            <span>ID: <span className="font-mono">{sale.id.slice(0, 8)}...</span></span>
                            <span>Created: {formatDate(sale.createdAt)}</span>
                            {sale.soldBy && <span>Sold By: {sale.soldBy}</span>}
                            {sale.group && <span>Group: {sale.group}</span>}
                            {sale.invoiceId && <span>Invoice: #{sale.invoiceId}</span>}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </div>

            {/* Image Preview */}
            {previewImage && (
                <div className="fixed inset-0 z-[110] bg-slate-900/70 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
                    <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" />
                    <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 text-white hover:text-slate-100 bg-slate-900/60 p-2 rounded-full">
                        <X className="w-8 h-8" />
                    </button>
                </div>
            )}
        </>
    );
}
