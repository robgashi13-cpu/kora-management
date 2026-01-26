'use client';

import React, { useRef, useState } from 'react';
import { X, Printer, Download, Loader2, ArrowLeft } from 'lucide-react';
import { CarSale } from '@/app/types';
import { motion } from 'framer-motion';
import InvoiceDocument from './InvoiceDocument';
import { InvoicePriceSource } from './invoicePricing';
import { addPdfFormFields, collectPdfTextFields, normalizePdfLayout, sanitizePdfCloneStyles, sharePdfBlob, waitForImages } from './pdfUtils';

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

    const handlePrint = () => {
        handleDownload();
    };

    const handleDownload = async () => {
        const element = printRef.current;
        if (!element) return;

        try {
            setIsDownloading(true);
            setStatusMessage(null);

            // Wait for any UI updates to settle
            await new Promise(resolve => setTimeout(resolve, 500));

            const opt = {
                margin: 0,
                filename: `Invoice_${sale.vin || 'unnamed'}.pdf`,
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

            // @ts-ignore
            const html2pdf = (await import('html2pdf.js')).default;

            await waitForImages(element);

            const fieldData = collectPdfTextFields(element);
            const pdf = await html2pdf().set(opt).from(element).toPdf().get('pdf');
            addPdfFormFields(pdf, fieldData);

            const pdfBlob = pdf.output('blob');
            const shareResult = await sharePdfBlob({
                blob: pdfBlob,
                filename: opt.filename,
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
                        <button onClick={handlePrint} className="flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white rounded-md hover:bg-gray-700 transition text-[11px] font-semibold" style={{ backgroundColor: '#111827' }}>
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
                <div className="flex-1 overflow-auto scroll-container print:overflow-visible">
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
