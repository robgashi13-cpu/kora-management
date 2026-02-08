'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Printer, Download, Loader2, ArrowLeft } from 'lucide-react';
import { CarSale } from '@/app/types';
import { motion } from 'framer-motion';
import InvoiceDocument from './InvoiceDocument';
import { InvoicePriceSource } from './invoicePricing';
import { generatePdf, printPdfBlob, sharePdfBlob } from './pdfUtils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sale: CarSale;
    withDogane?: boolean;
    taxAmount?: number;
    priceSource?: InvoicePriceSource;
    priceValue?: number;
}

export default function InvoiceModal({ isOpen, onClose, sale, withDogane = false, taxAmount, priceSource, priceValue }: Props) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [withStamp, setWithStamp] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

    const buildPdfPreview = useCallback(async () => {
        const element = printRef.current;
        if (!element) return null;
        setIsGeneratingPreview(true);
        try {
            const filename = `Invoice_${sale.vin || 'unnamed'}.pdf`;
            const result = await generatePdf({
                element,
                filename,
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
            setPdfBlob(result.blob);
            setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return URL.createObjectURL(result.blob);
            });
            return result.blob;
        } catch (error) {
            console.error('PDF preview failed:', error);
            setStatusMessage('Unable to generate PDF preview. Please try again.');
            return null;
        } finally {
            setIsGeneratingPreview(false);
        }
    }, [sale]);

    useEffect(() => {
        if (!isOpen) {
            setPdfBlob(null);
            setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
            return;
        }
        const timer = setTimeout(() => {
            buildPdfPreview();
        }, 150);
        return () => clearTimeout(timer);
    }, [isOpen, withStamp, taxAmount, priceSource, priceValue, buildPdfPreview]);

    useEffect(() => {
        return () => {
            setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        };
    }, []);

    const handlePrint = async () => {
        const blob = pdfBlob ?? await buildPdfPreview();
        if (!blob) return;
        const printResult = await printPdfBlob(blob);
        if (!printResult.opened) {
            setStatusMessage('Popup blocked. We opened the PDF in this tab so you can print it.');
        }
    };

    const handleDownload = async () => {
        try {
            setIsDownloading(true);
            setStatusMessage(null);
            const blob = pdfBlob ?? await buildPdfPreview();
            if (!blob) return;
            const shareResult = await sharePdfBlob({
                blob,
                filename: `Invoice_${sale.vin || 'unnamed'}.pdf`,
                title: `Invoice - ${sale.brand} ${sale.model}`,
                text: `Invoice for ${sale.vin}`,
                dialogTitle: 'Download or Share Invoice'
            });
            if (!shareResult.opened) {
                setStatusMessage('Popup blocked. We opened the PDF in this tab so you can save or share it.');
            }

        } catch (error: any) {
            console.error('Download failed:', error);
            alert(`Download failed: ${error?.message || 'Check connection'}. Please try again.`);
        } finally {
            setIsDownloading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pt-[max(4rem,env(safe-area-inset-top))] print:p-0">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md print:hidden" onClick={onClose} />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white text-black w-full max-w-3xl rounded-xl shadow-2xl relative flex flex-col max-h-[90vh] print:max-w-none print:max-h-none print:shadow-none print:rounded-none"
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl print:hidden">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-700"
                            aria-label="Go back"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold text-gray-800">Invoice Review</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setWithStamp(prev => !prev)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all font-semibold text-[11px] ${
                                withStamp
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                            aria-pressed={withStamp}
                        >
                            <span>Stamp</span>
                            <span className="text-[10px] font-medium">{withStamp ? 'On' : 'Off'}</span>
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className={`flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition shadow-sm text-[11px] font-semibold ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            {isDownloading ? 'Saving...' : 'Download'}
                        </button>
                        <button onClick={handlePrint} className="flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white rounded-md hover:bg-gray-700 transition text-[11px] font-semibold" style={{ backgroundColor: '#000000' }}>
                            <Printer className="w-3 h-3" /> Print
                        </button>

                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 pointer-events-auto cursor-pointer relative z-50">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {statusMessage && (
                    <div className="px-4 py-2 bg-amber-50 text-amber-700 text-sm flex items-center gap-2 print:hidden">
                        {statusMessage}
                    </div>
                )}

                {/* Invoice Content Area */}
                <div className="flex-1 overflow-auto scroll-container print:overflow-visible relative">
                    <div className="flex justify-center bg-slate-100 p-4 md:p-8">
                        <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden">
                            {isGeneratingPreview ? (
                                <div className="flex items-center justify-center h-[70vh] text-slate-500 text-sm gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Generating preview...
                                </div>
                            ) : pdfUrl ? (
                                <iframe
                                    title="Invoice PDF Preview"
                                    src={pdfUrl}
                                    className="w-full h-[70vh] border-0"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[70vh] text-slate-500 text-sm">
                                    Preview unavailable.
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="absolute -left-[9999px] top-0 opacity-0 pointer-events-none" aria-hidden="true">
                        <InvoiceDocument
                            sale={sale}
                            withDogane={withDogane}
                            withStamp={withStamp}
                            taxAmount={taxAmount}
                            priceSource={priceSource}
                            priceValue={priceValue}
                            ref={printRef}
                        />
                    </div>
                </div>
            </motion.div>

            <style jsx global>{`
        @media print {
            body * {
                visibility: hidden;
            }
            #invoice-content, #invoice-content * {
                visibility: visible;
            }
            #invoice-content {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 24px;
                font-size: 8.5pt;
            }
            .no-print {
                display: none !important;
            }
        }
      `}</style>
        </div>
    );
}
