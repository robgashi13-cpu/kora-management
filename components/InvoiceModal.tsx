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
        const element = document.getElementById('invoice-content');
        if (!element) return;

        try {
            setIsDownloading(true);
            const opt = {
                margin: 0,
                filename: `Invoice_${sale.vin}.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
            };

            // @ts-ignore
            const html2pdf = (await import('html2pdf.js')).default;



            if (!Capacitor.isNativePlatform()) {
                // Web: Download directly
                await html2pdf().set(opt).from(element).save();
            } else {
                // Native: Save to filesystem and share
                const pdfBase64 = await html2pdf().set(opt).from(element).outputPdf('datauristring');
                const fileName = `Invoice_${sale.vin}_${Date.now()}.pdf`;
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

        } catch (error) {
            console.error('Download failed:', error);
            alert('Could not download/share invoice. Please try again.');
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
            >
                {/* Toolbar - Hidden when printing */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl print:hidden">
                    <h2 className="text-lg font-bold text-gray-800">Invoice Review</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition shadow-lg ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isDownloading ? 'Saving...' : 'Download PDF'}
                        </button>
                        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition">
                            <Printer className="w-4 h-4" /> Print
                        </button>

                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 pointer-events-auto cursor-pointer relative z-50">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Invoice Content */}
                <div className="p-4 md:p-12 overflow-y-auto print:p-0 print:overflow-visible" id="invoice-content">

                    {/* Invoice Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
                        <div>
                            {/* Company Logo */}
                            <img src="/logo_new.jpg" alt="KORAUTO Logo" className="h-16 w-auto mb-4" />
                            <h1 className="text-4xl font-bold text-gray-900">INVOICE</h1>
                            <p className="text-gray-500 mt-2">#{sale.vin?.slice(-6).toUpperCase() || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold mb-1">RG SH.P.K</div>
                            <div className="text-gray-500 text-sm leading-relaxed">
                                Rr. Dardania 191<br />
                                Owner: Robert Gashi<br />
                                Phone: +383 48 181 116<br />
                                Nr Biznesit: 810062092
                            </div>
                        </div>
                    </div>

                    {/* Client Info & Dates */}
                    <div className="flex flex-col md:flex-row justify-between mb-8 border-t border-b border-gray-100 py-6 gap-4">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bill To</h3>
                            <div className="font-bold text-lg text-gray-800">{sale.buyerName}</div>
                        </div>
                        <div className="text-right">
                            <div className="mb-2">
                                <span className="text-gray-500 text-sm mr-4">Invoice Date:</span>
                                <span className="font-medium text-gray-800">{new Date().toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <table className="w-full mb-8">
                        <thead>
                            <tr className="border-b-2 border-gray-900">
                                <th className="text-left py-3 font-bold text-sm uppercase text-gray-600">Description</th>
                                <th className="text-right py-3 font-bold text-sm uppercase text-gray-600">Total</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-700">
                            <tr className="border-b border-gray-100">
                                <td className="py-4">
                                    <div className="font-bold text-gray-900">{sale.year} {sale.brand} {sale.model}</div>
                                    <div className="text-sm text-gray-500">VIN: {sale.vin} | Color: {sale.color}</div>
                                    <div className="text-sm text-gray-500 mt-1">Mileage: {(sale.km || 0).toLocaleString()} km</div>
                                </td>
                                <td className="py-4 text-right font-bold text-gray-900">€{((sale.soldPrice || 0) - 200).toLocaleString()}</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-4">
                                    <div className="font-bold text-gray-900 uppercase">SHERBIMET DOGANORE PAGUHEN NGA KLIENTI</div>
                                </td>
                                <td className="py-4 text-right font-bold text-gray-900"></td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div className="w-full md:w-1/2 ml-auto">
                        <div className="flex justify-between py-2 text-gray-600">
                            <span>Subtotal</span>
                            <span>€{((sale.soldPrice || 0) - 200).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between py-2 text-gray-600">
                            <span>Services</span>
                            <span>€169.49</span>
                        </div>
                        <div className="flex justify-between py-2 text-gray-600 border-b border-gray-200 mb-2">
                            <span>Tax (TVSH 18%)</span>
                            <span>€30.51</span>
                        </div>
                        <div className="flex justify-between py-3 border-t-2 border-gray-900">
                            <span className="font-bold text-lg text-gray-900">Grand Total</span>
                            <span className="font-bold text-lg text-gray-900">€{(sale.soldPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>


                    {/* Payment Breakdown Removed */}



                    {/* Footer */}
                    <div className="border-t border-gray-100 pt-8 bg-gray-50/50 -mx-12 px-12 pb-8 mb-[-48px]">
                        <h4 className="font-bold text-sm mb-4 text-gray-900 uppercase tracking-wider">Payment Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-gray-600">
                            <div>
                                <div className="font-bold text-gray-900 mb-1">Raiffeisen Bank</div>
                                <div className="font-mono bg-white p-2 rounded border border-gray-200 inline-block">1501080002435404</div>
                                <div className="mt-2 text-xs text-gray-500">Account Holder: RG SH.P.K.</div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-gray-900 mb-1">Contact</div>
                                <div>+383 48 181 116</div>
                                <div className="mt-4 text-xs text-gray-400">Thank you for your business!</div>
                            </div>
                        </div>
                    </div>

                </div >
            </motion.div >

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
        </div >
    );
}
