/* ============================================================================
 * 🔒 LOCKED FILE — PDF / DOCUMENT ENGINE
 * Restored to the pre-2026-05-30 baseline by user request.
 * DO NOT MODIFY layout, math, calculations, formatting, fonts, sizes, or
 * print/export behavior. UI redesigns, responsive guardrails, and styling
 * sweeps MUST skip this file. Any change requires an explicit user request
 * that names this file directly.
 * ============================================================================ */

'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Printer, Download, Loader2, ArrowLeft } from 'lucide-react';
import { CarSale } from '@/src/types';
import { motion } from 'framer-motion';
import InvoiceDocument from './InvoiceDocument';
import { InvoicePriceSource } from './invoicePricing';
import { generateImageBlobFromElement, generatePdf, isIosSafari, printPdfBlob, shareImageBlob, sharePdfBlob } from './pdfUtils';
import { PdfTemplateEntry } from './PdfTemplateBuilder';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sale: CarSale;
    withDogane?: boolean;
    taxAmount?: number;
    priceSource?: InvoicePriceSource;
    priceValue?: number;
    template?: PdfTemplateEntry;
    onInvoiceCreated?: () => void;
}

export default function InvoiceModal({ isOpen, onClose, sale, withDogane = false, taxAmount, priceSource, priceValue, template, onInvoiceCreated }: Props) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [withStamp, setWithStamp] = useState(false);
    const [editableTax, setEditableTax] = useState<number | undefined>(taxAmount);
    const printRef = useRef<HTMLDivElement>(null);
    const previewWrapRef = useRef<HTMLDivElement>(null);
    const previewDocRef = useRef<HTMLDivElement>(null);
    const [taxOverlay, setTaxOverlay] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

    useEffect(() => { setEditableTax(taxAmount); }, [taxAmount, isOpen]);

    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const trackedRef = useRef(false);

    const buildPdfPreview = useCallback(async () => {
        const element = printRef.current;
        if (!element) return null;
        // Sync any free-text edits made in the visible preview into the PDF source element
        const liveDoc = previewDocRef.current?.querySelector('#invoice-content');
        const pdfDoc = element;
        if (liveDoc && pdfDoc) {
            try { pdfDoc.innerHTML = (liveDoc as HTMLElement).innerHTML; } catch {}
        }
        setIsGeneratingPreview(true);
        try {
            const filename = `Invoice_${sale.vin || 'unnamed'}.pdf`;
            const result = await generatePdf({
                element,
                filename,
                singlePage: true,
                editableText: false,
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
            if (!trackedRef.current) { trackedRef.current = true; onInvoiceCreated?.(); }
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
            trackedRef.current = false;
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
    }, [isOpen, withStamp, editableTax, priceSource, priceValue, buildPdfPreview]);

    useEffect(() => {
        return () => {
            setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        };
    }, []);

    // Position editable Doganë input over the matching summary row in the live HTML preview
    useLayoutEffect(() => {
        if (!isOpen || !withDogane) { setTaxOverlay(null); return; }
        const measure = () => {
            const wrap = previewWrapRef.current;
            const doc = previewDocRef.current;
            if (!wrap || !doc) return;
            const rows = doc.querySelectorAll('.invoice-summary-row');
            let amountSpan: HTMLElement | null = null;
            rows.forEach((r) => {
                const el = r as HTMLElement;
                if (el.textContent && el.textContent.includes('Doganë')) {
                    const spans = el.querySelectorAll('span');
                    if (spans.length >= 2) amountSpan = spans[spans.length - 1] as HTMLElement;
                }
            });
            if (!amountSpan) { setTaxOverlay(null); return; }
            const wrapRect = wrap.getBoundingClientRect();
            const cellRect = (amountSpan as HTMLElement).getBoundingClientRect();
            setTaxOverlay({
                top: cellRect.top - wrapRect.top + wrap.scrollTop,
                left: cellRect.left - wrapRect.left + wrap.scrollLeft - 4,
                width: Math.max(cellRect.width + 8, 90),
                height: cellRect.height + 4,
            });
        };
        measure();
        const ro = new ResizeObserver(measure);
        if (previewWrapRef.current) ro.observe(previewWrapRef.current);
        if (previewDocRef.current) ro.observe(previewDocRef.current);
        window.addEventListener('resize', measure);
        return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
    }, [isOpen, withDogane, editableTax, withStamp, priceSource, priceValue, sale]);

    const handlePrint = async () => {
        const blob = pdfBlob ?? await buildPdfPreview();
        if (!blob) return;
        const printResult = await printPdfBlob(blob);
        if (!printResult.opened) {
            setStatusMessage('Popup blocked. We opened the PDF in this tab so you can print it.');
        }
    };

    const handleDownload = async (format: 'pdf' | 'image' = 'pdf') => {
        try {
            setIsDownloading(true);
            setStatusMessage(null);
            const element = printRef.current;

            if (format === 'image' && element) {
                const imageBlob = await generateImageBlobFromElement({
                    element,
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

                const imageResult = await shareImageBlob({
                    blob: imageBlob,
                    filename: `Invoice_${sale.vin || 'unnamed'}.png`,
                    title: `Invoice - ${sale.brand} ${sale.model}`,
                    text: `Invoice for ${sale.vin}`,
                    dialogTitle: 'Download or Share Invoice Image'
                });

                if (!imageResult.opened) {
                    setStatusMessage('Popup blocked. We opened the invoice image in this tab so you can save it.');
                }
                return;
            }

            const blob = pdfBlob ?? await buildPdfPreview();
            if (!blob) return;
            const shareResult = await sharePdfBlob({
                blob,
                filename: `Invoice_${sale.vin || 'unnamed'}.pdf`,
                title: `Invoice - ${sale.brand} ${sale.model}`,
                text: `Invoice for ${sale.vin}`,
                dialogTitle: isIosSafari() ? 'Download or Share Invoice PDF' : 'Download or Share Invoice'
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
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
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
                        {withDogane && (
                            <label className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700">
                                <span>Doganë €</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editableTax ?? ''}
                                    onChange={(e) => setEditableTax(e.target.value === '' ? undefined : Number(e.target.value))}
                                    className="w-20 h-6 px-1.5 text-[11px] text-right border border-slate-200 rounded outline-none focus:border-slate-400"
                                />
                            </label>
                        )}
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
                            onClick={() => handleDownload('pdf')}
                            disabled={isDownloading}
                            className={`flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition shadow-sm text-[11px] font-semibold ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            {isDownloading ? 'Saving...' : 'PDF'}
                        </button>
                        <button
                            onClick={() => handleDownload('image')}
                            disabled={isDownloading}
                            className={`flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md border border-slate-200 hover:bg-slate-200 transition shadow-sm text-[11px] font-semibold ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Download className="w-3 h-3" />
                            Image
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
                        <div
                            ref={previewWrapRef}
                            className="bg-white w-full rounded-xl shadow-2xl overflow-auto relative"
                            style={{ maxWidth: '210mm' }}
                        >
                            <div
                                ref={previewDocRef}
                                contentEditable
                                suppressContentEditableWarning
                                spellCheck={false}
                                onBlur={() => buildPdfPreview()}
                                style={{ outline: 'none' }}
                                title="Click any text to edit. Changes are saved into the PDF when you click outside."
                            >
                                <InvoiceDocument
                                    template={template}
                                    sale={sale}
                                    withDogane={withDogane}
                                    withStamp={withStamp}
                                    taxAmount={editableTax}
                                    priceSource={priceSource}
                                    priceValue={priceValue}
                                />
                            </div>
                            {withDogane && taxOverlay && (
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editableTax ?? ''}
                                    onChange={(e) => setEditableTax(e.target.value === '' ? undefined : Number(e.target.value))}
                                    className="absolute z-10 bg-yellow-50 border border-yellow-400 rounded text-right font-bold outline-none focus:border-yellow-600 focus:ring-2 focus:ring-yellow-300"
                                    style={{
                                        top: taxOverlay.top,
                                        left: taxOverlay.left,
                                        width: taxOverlay.width,
                                        height: taxOverlay.height,
                                        fontSize: '0.9rem',
                                        padding: '0 4px',
                                        color: '#000',
                                    }}
                                    aria-label="Edit Doganë tax"
                                />
                            )}
                        </div>
                    </div>
                    {isGeneratingPreview && (
                        <div className="absolute top-2 right-4 text-xs text-slate-500 flex items-center gap-1 bg-white/80 px-2 py-1 rounded shadow">
                            <Loader2 className="w-3 h-3 animate-spin" /> Updating PDF…
                        </div>
                    )}
                    {/* Hidden offscreen render dedicated to PDF generation */}
                    <div className="fixed left-0 top-0 -z-10 opacity-0 pointer-events-none" aria-hidden="true">
                        <InvoiceDocument
                            template={template}
                            sale={sale}
                            withDogane={withDogane}
                            withStamp={withStamp}
                            taxAmount={editableTax}
                            priceSource={priceSource}
                            priceValue={priceValue}
                            ref={printRef}
                        />
                    </div>
                </div>
            </motion.div>

            <style>{`
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
