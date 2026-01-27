import React, { useRef, useState, useCallback, useEffect } from 'react';
import { CarSale, ContractType } from '@/app/types';
import { X, Printer, Loader2, AlertCircle } from 'lucide-react';
import ContractDocument from './ContractDocument';
import { generatePdf, printPdfBlob, sharePdfBlob } from './pdfUtils';

interface Props {
    sale: CarSale;
    type: ContractType;
    onClose: () => void;
}

// Helper function to safely format values with fallbacks
const safeString = (value: string | undefined | null, fallback = '________________'): string => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value);
};

// Validate required fields for deposit contract
const validateDepositContract = (sale: CarSale): { valid: boolean; missingFields: string[] } => {
    const missingFields: string[] = [];

    if (!sale.brand) missingFields.push('Brand');
    if (!sale.model) missingFields.push('Model');
    if (!sale.vin) missingFields.push('VIN');
    if (!sale.buyerName) missingFields.push('Buyer Name');
    if (!sale.soldPrice) missingFields.push('Sold Price');
    if (!sale.deposit) missingFields.push('Deposit Amount');

    return {
        valid: missingFields.length === 0,
        missingFields
    };
};

export default function ContractModal({ sale, type, onClose }: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [withStamp, setWithStamp] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

    // Validate contract data
    const validation = type === 'deposit' ? validateDepositContract(sale) : { valid: true, missingFields: [] };

    const buildPdfPreview = useCallback(async () => {
        const element = printRef.current;
        if (!element) {
            setError('Document preview not ready. Please try again.');
            return null;
        }

        // Validate before generating
        if (!validation.valid) {
            setError(`Missing required fields: ${validation.missingFields.join(', ')}`);
            return null;
        }

        setIsGeneratingPreview(true);
        try {
            setError(null);
            setStatusMessage(null);

            const safeBrand = safeString(sale.brand, 'Unknown');
            const safeModel = safeString(sale.model, 'Car');
            const result = await generatePdf({
                element,
                filename: `Contract_${safeBrand}_${safeModel}.pdf`
            });
            setPdfBlob(result.blob);
            setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return URL.createObjectURL(result.blob);
            });
            return result.blob;
        } catch (error) {
            console.error('Download failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            setError(`Could not generate PDF: ${errorMessage}. Please try again.`);
            return null;
        } finally {
            setIsGeneratingPreview(false);
        }
    }, [sale, validation]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (validation.valid) {
                buildPdfPreview();
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [buildPdfPreview, validation.valid, withStamp, type]);

    useEffect(() => {
        return () => {
            setPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        };
    }, []);

    const handleDownload = useCallback(async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        setStatusMessage(null);
        try {
            const blob = pdfBlob ?? await buildPdfPreview();
            if (!blob) return;
            const safeBrand = safeString(sale.brand, 'Unknown');
            const safeModel = safeString(sale.model, 'Car');
            const safeVin = safeString(sale.vin, 'N/A');
            const shareResult = await sharePdfBlob({
                blob,
                filename: `Contract_${safeBrand}_${safeModel}.pdf`,
                title: `Contract - ${safeBrand} ${safeModel}`,
                text: `Contract for ${safeVin}`,
                dialogTitle: 'Download or Share Contract'
            });
            if (!shareResult.opened) {
                setStatusMessage('Popup blocked. The PDF opened in this tab so you can save or share it.');
            }
        } finally {
            setIsDownloading(false);
        }
    }, [buildPdfPreview, isDownloading, pdfBlob, sale.brand, sale.model, sale.vin]);

    const handlePrint = async () => {
        const blob = pdfBlob ?? await buildPdfPreview();
        if (!blob) return;
        const printResult = await printPdfBlob(blob);
        if (!printResult.opened) {
            setStatusMessage('Popup blocked. The PDF opened in this tab so you can print it.');
        }
    };

    const contractPreviewTitle = type === 'deposit'
        ? 'Deposit Agreement Preview'
        : type === 'full_marreveshje'
            ? 'Full Contract Preview - Marrëveshje'
            : 'Full Contract Preview - Shitblerje';
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[max(4rem,env(safe-area-inset-top))] bg-slate-900/40 backdrop-blur-md" onClick={onClose}>
            <div className="bg-white text-slate-900 w-full max-w-5xl h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
                {/* Header Actions */}
                <div className="flex flex-col border-b border-slate-200 bg-slate-50">
                    <div className="flex justify-between items-center p-4">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-black"></span>
                            {contractPreviewTitle}
                        </h2>
                        <div className="flex flex-wrap gap-2">
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
                                disabled={isDownloading || !validation.valid}
                                className="flex items-center gap-1 px-2.5 py-1 bg-black text-white rounded-md hover:bg-slate-900 transition-all font-semibold text-[11px] shadow-sm shadow-black/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
                                {isDownloading ? 'Generating...' : 'Download'}
                            </button>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                    
                    {/* Error/Warning Banner */}
                    {(error || !validation.valid) && (
                        <div className={`px-4 py-3 flex items-center gap-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>
                        {error || `Missing required fields: ${validation.missingFields.join(', ')}. Please fill them in before generating.`}
                    </span>
                </div>
            )}
            {statusMessage && (
                <div className="px-4 py-3 flex items-center gap-2 text-sm bg-amber-50 text-amber-700">
                    {statusMessage}
                </div>
            )}
        </div>

                {/* Document Preview Area */}
                <div className="flex-1 overflow-auto bg-slate-100 p-4 md:p-8 flex justify-center relative">
                    <div className="w-full flex justify-center">
                        <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden">
                            {isGeneratingPreview ? (
                                <div className="flex items-center justify-center h-[70vh] text-slate-500 text-sm gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Generating preview...
                                </div>
                            ) : pdfUrl ? (
                                <iframe
                                    title="Contract PDF Preview"
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
                        <ContractDocument sale={sale} type={type} documentRef={printRef} withStamp={withStamp} />
                    </div>
                </div>
            </div >

            <style jsx>{`
                .contract-logo { height: 60px; display: block; margin: 0 auto 20px auto; }
                .party-title { font-weight: bold; margin-bottom: 8pt; color: #0f172a; text-decoration: underline; font-size: 11pt; }
                .blue-header { color: #0f172a; font-weight: bold; margin-bottom: 8pt; margin-top: 16pt; font-size: 11pt; border-bottom: 1px solid #0f172a; display: inline-block; padding-bottom: 2px; }
                .label { font-weight: bold; min-width: 100px; display: inline-block; }
                .car-details { background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 16pt; margin: 12pt 0; border-radius: 4pt; }
                .car-details div { display: flex; justify-content: space-between; margin-bottom: 6pt; border-bottom: 1px dashed #ced4da; padding-bottom: 4px; }
                .car-details div:last-child { border-bottom: none; margin-bottom: 0; }
                .signature-box { width: 40%; position: relative; height: 100px; }
                .signature-line { border-top: 1px solid black; margin-top: 80pt; padding-top: 6pt; font-weight: bold; text-align: center; }
                
                @media print {
                    .page-break { page-break-before: always; }
                    .visual-break { display: none; }
                }
            `}</style>
        </div >
    );
}
