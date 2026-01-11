'use client';

import React, { useRef, useState } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { CarSale } from '@/app/types';
import { motion } from 'framer-motion';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import InvoiceDocument from './InvoiceDocument';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sale: CarSale;
    withDogane?: boolean;
}

export default function InvoiceModal({ isOpen, onClose, sale, withDogane = false }: Props) {
    const [isDownloading, setIsDownloading] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        handleDownload();
    };

    const handleDownload = async () => {
        const element = printRef.current;
        if (!element) return;

        try {
            setIsDownloading(true);

            // Wait for any UI updates to settle
            await new Promise(resolve => setTimeout(resolve, 500));

            const opt = {
                margin: 5,
                filename: `Invoice_${sale.vin || 'unnamed'}.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: {
                    scale: 4,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                },
                jsPDF: {
                    unit: 'mm' as const,
                    format: 'a4' as const,
                    orientation: 'portrait' as const,
                    compress: true,
                    putOnlyUsedFonts: true
                }
            };

            // @ts-ignore
            const html2pdf = (await import('html2pdf.js')).default;

            const pdf = html2pdf().set(opt).from(element);

            if (!Capacitor.isNativePlatform()) {
                await pdf.save();
            } else {
                const pdfBase64 = await pdf.outputPdf('datauristring');
                const fileName = `Invoice_${sale.vin || Date.now()}.pdf`;
                const base64Data = pdfBase64.split(',')[1];

                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Documents,
                });

                await Share.share({
                    title: `Invoice - ${sale.brand} ${sale.model}`,
                    text: `Invoice for ${sale.vin}`,
                    url: savedFile.uri,
                    dialogTitle: 'Download or Share Invoice'
                });
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pt-[max(4rem,env(safe-area-inset-top))] print:p-0">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md print:hidden" onClick={onClose} />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white text-black w-full max-w-3xl rounded-xl shadow-2xl relative flex flex-col max-h-[90vh] print:max-w-none print:max-h-none print:shadow-none print:rounded-none"
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
            >
                {/* Toolbar - Hidden when printing */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl print:hidden">
                    <h2 className="text-lg font-bold text-gray-800">Invoice Review</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className={`flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition shadow-lg ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isDownloading ? 'Saving...' : 'Download PDF'}
                        </button>
                        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition" style={{ backgroundColor: '#111827' }}>
                            <Printer className="w-4 h-4" /> Print
                        </button>

                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 pointer-events-auto cursor-pointer relative z-50">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Invoice Content Area */}
                <div className="flex-1 overflow-y-auto print:overflow-visible">
                    <InvoiceDocument sale={sale} withDogane={withDogane} ref={printRef} />
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
