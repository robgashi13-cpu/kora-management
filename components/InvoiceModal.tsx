'use client';

import React, { useRef, useState } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { CarSale } from '@/app/types';
import { motion } from 'framer-motion';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sale: CarSale;
}

export default function InvoiceModal({ isOpen, onClose, sale }: Props) {
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
                            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition shadow-lg ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: '#2563eb' }}
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
                    <div className="p-6 md:p-10 print:p-0" id="invoice-content" ref={printRef} style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '9pt' }}>

                        {/* Invoice Header */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mb-8">
                            <div>
                                {/* Company Logo */}
                                <img
                                    src="/logo.jpg"
                                    alt="KORAUTO Logo"
                                    className="h-16 w-auto mb-4"
                                />
                                <h1 className="text-xl font-bold" style={{ color: '#111827' }}>INVOICE</h1>
                                <p className="mt-1" style={{ color: '#6b7280' }}>#{sale.vin?.slice(-6).toUpperCase() || 'N/A'}</p>
                            </div>
                            <div className="md:text-right">
                                <div className="text-base font-bold mb-1">RG SH.P.K</div>
                                <div className="text-sm leading-relaxed" style={{ color: '#6b7280' }}>
                                    Rr. Dardania 191<br />
                                    Owner: Robert Gashi<br />
                                    Phone: +383 48 181 116<br />
                                    Nr Biznesit: 810062092
                                </div>
                            </div>
                        </div>

                        {/* Client Info & Dates */}
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-start gap-6 mb-8 border-t border-b border-gray-100 py-6" style={{ borderColor: '#f3f4f6' }}>
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Bill To</h3>
                                <div className="font-bold text-sm" style={{ color: '#1f2937' }}>{sale.buyerName}</div>
                            </div>
                            <div className="md:text-right">
                                <div className="mb-2">
                                    <span className="text-sm mr-4" style={{ color: '#6b7280' }}>Invoice Date:</span>
                                    <span className="font-medium" style={{ color: '#1f2937' }}>{new Date().toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Line Items */}
                        <table className="w-full mb-8">
                            <thead>
                                <tr className="border-b-2" style={{ borderColor: '#111827' }}>
                                    <th className="text-left py-3 font-bold text-sm uppercase" style={{ color: '#4b5563' }}>Description</th>
                                    <th className="text-right py-3 font-bold text-sm uppercase" style={{ color: '#4b5563' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody style={{ color: '#374151' }}>
                                <tr className="border-b" style={{ borderColor: '#f3f4f6' }}>
                                    <td className="py-4">
                                        <div className="font-bold" style={{ color: '#111827' }}>{sale.year} {sale.brand} {sale.model}</div>
                                        <div className="text-sm" style={{ color: '#6b7280' }}>VIN: {sale.vin} | Color: {sale.color}</div>
                                        <div className="text-sm mt-1" style={{ color: '#6b7280' }}>Mileage: {(sale.km || 0).toLocaleString()} km</div>
                                    </td>
                                    <td className="py-4 text-right font-bold" style={{ color: '#111827' }}>€{((sale.soldPrice || 0) - 200).toLocaleString()}</td>
                                </tr>
                                <tr className="border-b" style={{ borderColor: '#f3f4f6' }}>
                                    <td className="py-4">
                                        <div className="font-bold uppercase" style={{ color: '#111827' }}>SHERBIMET DOGANORE PAGUHEN NGA KLIENTI</div>
                                    </td>
                                    <td className="py-4 text-right font-bold" style={{ color: '#111827' }}></td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Totals */}
                        <div className="w-full md:w-1/2 ml-auto">
                            <div className="flex justify-between py-2" style={{ color: '#4b5563' }}>
                                <span>Subtotal</span>
                                <span>€{((sale.soldPrice || 0) - 200).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between py-2" style={{ color: '#4b5563' }}>
                                <span>Services</span>
                                <span>€169.49</span>
                            </div>
                            <div className="flex justify-between py-2 border-b mb-2" style={{ color: '#4b5563', borderColor: '#e5e7eb' }}>
                                <span>Tax (TVSH 18%)</span>
                                <span>€30.51</span>
                            </div>
                            <div className="flex justify-between py-3 border-t-2" style={{ borderColor: '#111827' }}>
                                <span className="font-bold text-base" style={{ color: '#111827' }}>Grand Total</span>
                                <span className="font-bold text-base" style={{ color: '#111827' }}>€{(sale.soldPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t pt-8 -mx-6 md:-mx-10 px-6 md:px-10 pb-6 mb-[-40px]" style={{ borderColor: '#f3f4f6', backgroundColor: '#f9fafb' }}>
                            <h4 className="font-bold text-sm mb-4 uppercase tracking-wider" style={{ color: '#111827' }}>Payment Details</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm" style={{ color: '#4b5563' }}>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: '#111827' }}>Raiffeisen Bank</div>
                                    <div className="font-mono bg-white p-2 rounded border inline-block" style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}>1501080002435404</div>
                                    <div className="mt-2 text-xs" style={{ color: '#6b7280' }}>Account Holder: RG SH.P.K.</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold mb-1" style={{ color: '#111827' }}>Contact</div>
                                    <div>+383 48 181 116</div>
                                    <div className="mt-4 text-xs" style={{ color: '#9ca3af' }}>Thank you for your business!</div>
                                </div>
                            </div>
                        </div>

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
                padding: 40px; 
            }
            .no-print {
                display: none !important;
            }
        }
      `}</style>
        </div>
    );
}
