import React, { useRef, useState, useCallback } from 'react';
import { CarSale, ContractType } from '@/app/types';
import { X, Printer, Loader2, Download, AlertCircle } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

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

const safeNumber = (value: number | undefined | null, fallback = 0): number => {
    if (value === undefined || value === null || isNaN(Number(value))) return fallback;
    return Number(value);
};

const formatCurrency = (value: number | undefined | null): string => {
    return safeNumber(value).toLocaleString();
};

const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return '________________';
    try {
        return new Date(dateString).toLocaleDateString('en-GB');
    } catch {
        return '________________';
    }
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

const waitForImages = async (container: HTMLElement, timeoutMs = 8000): Promise<void> => {
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length === 0) return;

    const loadPromises = images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const onLoad = () => {
                cleanup();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error('Image failed to load'));
            };
            const cleanup = () => {
                img.removeEventListener('load', onLoad);
                img.removeEventListener('error', onError);
            };
            img.addEventListener('load', onLoad);
            img.addEventListener('error', onError);
        });
    });

    await Promise.race([
        Promise.all(loadPromises),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Image load timeout')), timeoutMs)),
    ]);
};

const isIosSafari = (): boolean => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    const isIos = /iP(ad|od|hone)/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    return isIos && isSafari;
};

export default function ContractModal({ sale, type, onClose }: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Validate contract data
    const validation = type === 'deposit' ? validateDepositContract(sale) : { valid: true, missingFields: [] };

    const handleDownload = useCallback(async () => {
        // Prevent double-click
        if (isDownloading) return;
        
        const element = printRef.current;
        if (!element) {
            setError('Document preview not ready. Please try again.');
            return;
        }

        // Validate before generating
        if (!validation.valid) {
            setError(`Missing required fields: ${validation.missingFields.join(', ')}`);
            return;
        }

        try {
            setIsDownloading(true);
            setError(null);
            
            const safeBrand = safeString(sale.brand, 'Unknown');
            const safeModel = safeString(sale.model, 'Car');
            const safeVin = safeString(sale.vin, 'N/A');
            
            const opt = {
                margin: 0,
                filename: `Contract_${safeBrand}_${safeModel}.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: {
                    scale: 4,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false
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

            if (!Capacitor.isNativePlatform()) {
                if (type === 'deposit') {
                    await waitForImages(element);
                }

                if (type === 'deposit' && isIosSafari()) {
                    const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
                    const blobUrl = URL.createObjectURL(pdfBlob);
                    const popup = window.open(blobUrl, '_blank');
                    if (!popup) {
                        window.location.href = blobUrl;
                    }
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                } else {
                    // Desktop/Web browser - direct save
                    await html2pdf().set(opt).from(element).save();
                }
            } else {
                // Native mobile (iOS/Android) - use Capacitor filesystem
                const pdfBase64 = await html2pdf().set(opt).from(element).outputPdf('datauristring');
                const fileName = `Contract_${safeBrand}_${safeModel}_${Date.now()}.pdf`;
                const base64Data = pdfBase64.split(',')[1];

                if (!base64Data) {
                    throw new Error('Failed to generate PDF data');
                }

                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Documents,
                });

                await Share.share({
                    title: `Contract - ${safeBrand} ${safeModel}`,
                    text: `Contract for ${safeVin}`,
                    url: savedFile.uri,
                    dialogTitle: 'Download or Share Contract'
                });
            }
        } catch (error) {
            console.error('Download failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            setError(`Could not generate PDF: ${errorMessage}. Please try again.`);
        } finally {
            setIsDownloading(false);
        }
    }, [isDownloading, sale, validation]);

    const handlePrint = () => {
        handleDownload();
    };

    // Safe data extraction with fallbacks
    const today = new Date().toLocaleDateString('en-GB');
    const shippingDate = formatDate(sale.shippingDate);
    const seller = { name: "RG SH.P.K.", id: "Business Nr 810062092", phone: "048181116" };
    const sellerBusinessId = "NR.Biznesit 810062092";
    const fullSellerName = "RG SH.P.K";
    
    // Safe ID for reference
    const saleRefId = sale.id ? sale.id.slice(0, 8).toUpperCase() : crypto.randomUUID().slice(0, 8).toUpperCase();
    
    const contractPreviewTitle = type === 'deposit'
        ? 'Deposit Agreement Preview'
        : type === 'full_marreveshje'
            ? 'Full Contract Preview - Marrëveshje'
            : 'Full Contract Preview - Shitblerje';
    const isDeposit = type === 'deposit';

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
                        <div className="flex gap-3">
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading || !validation.valid}
                                className="flex items-center gap-2 px-6 py-2 bg-black text-white rounded-lg hover:bg-slate-900 transition-all font-bold shadow-lg shadow-black/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                                {isDownloading ? 'Generating PDF...' : 'Download PDF'}
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
                </div>

                {/* Document Preview Area */}
                <div className="flex-1 overflow-auto bg-slate-100 p-4 md:p-8 flex justify-center">
                    {/* The "Paper" Scaled for Mobile */}
                    <div className="w-full flex justify-center">
                        <div className="transform scale-[0.45] sm:scale-75 md:scale-100 origin-top h-auto">
                            <div
                                ref={printRef}
                                className={`bg-white text-black w-[21cm] shadow-2xl ${type === 'deposit' ? 'h-[29.7cm] p-[1.2cm]' : type === 'full_shitblerje' ? 'h-[29.7cm] p-[1.5cm]' : 'min-h-[29.7cm] p-[2cm]'}`}
                                style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: type === 'deposit' ? '8pt' : type === 'full_shitblerje' ? '8.5pt' : '9pt', lineHeight: type === 'deposit' ? 1.25 : type === 'full_shitblerje' ? 1.3 : 1.4, overflow: 'hidden' }}
                            >
                                {type === 'deposit' && (
                                    <>
                                        {/* Header - Compact */}
                                        <div className="text-center mb-2 pb-1 border-b" style={{ borderColor: '#000000' }}>
                                            <img src="/logo.jpg" className="mx-auto h-10 mb-1" alt="Logo" />
                                            <h1 className="text-sm font-bold uppercase" style={{ color: '#000000' }}>KORAUTO</h1>
                                            <div className="text-xs font-bold uppercase" style={{ color: '#000000' }}>KONTRATË PËR KAPAR</div>
                                        </div>

                                        {/* Reference and Date */}
                                        <div className="flex justify-between mb-2 text-xs">
                                            <div>Nr. Ref: <strong>{saleRefId}</strong></div>
                                            <div>Data: <strong>{today}</strong></div>
                                        </div>

                                        {/* Parties Section - Compact */}
                                        <div className="grid grid-cols-2 gap-4 mb-2">
                                            <div>
                                                <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">1. Shitësi:</div>
                                                <div className="text-xs" style={{ lineHeight: 1.3 }}>
                                                    <div><span className="inline-block w-16">Emri:</span> <strong>{seller.name}</strong></div>
                                                    <div><span className="inline-block w-16">Nr. personal:</span> {seller.id}</div>
                                                    <div><span className="inline-block w-16">Tel:</span> {seller.phone}</div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">2. Blerësi (Kaparidhënësi):</div>
                                                <div className="text-xs" style={{ lineHeight: 1.3 }}>
                                                    <div><span className="inline-block w-16">Emri:</span> <strong>{safeString(sale.buyerName)}</strong></div>
                                                    <div><span className="inline-block w-16">Nr. personal:</span> {safeString(sale.buyerPersonalId)}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Article 1 */}
                                        <div className="mb-2">
                                            <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 1 – Objekti i Kontratës</div>
                                            <p className="text-xs mb-1">
                                                Shitësi pranon të rezervojë dhe shesë veturën me të dhënat më poshtë, ndërsa blerësi jep një shumë kapari si paradhënie për blerje:
                                            </p>
                                            <ul className="list-none text-xs font-bold" style={{ lineHeight: 1.4 }}>
                                                <li>- Marka: {safeString(sale.brand)}</li>
                                                <li>- Modeli: {safeString(sale.model)}</li>
                                                <li>- Nr. shasie: {safeString(sale.vin)}</li>
                                            </ul>
                                        </div>

                                        {/* Article 2 */}
                                        <div className="mb-2">
                                            <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 2 – Shuma e Kaparit</div>
                                            <p className="text-xs">
                                                Blerësi i dorëzon shitësit shumën prej <strong>{formatCurrency(sale.deposit)}€</strong> si kapar, që llogaritet si pjesë e pagesës përfundimtare të veturës, e cila kushton <strong>{formatCurrency(sale.soldPrice)}€</strong>. Deri ne Prishtine
                                            </p>
                                        </div>

                                        {/* Article 3 */}
                                        <div className="mb-2">
                                            <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 3 – Detyrimet e Palëve</div>
                                            <ul className="list-none text-xs" style={{ lineHeight: 1.4 }}>
                                                <li>- Shitësi angazhohet të mos e shesë veturën ndonjë pale tjetër për periudhën prej 7 ditësh nga data e nënshkrimit.</li>
                                                <li>- Blerësi angazhohet ta përfundojë pagesën dhe ta marrë veturën brenda afatit të caktuar</li>
                                            </ul>
                                        </div>

                                        {/* Article 4 */}
                                        <div className="mb-2">
                                            <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 4 – Anulimi i Marrëveshjes</div>
                                            <ul className="list-none text-xs" style={{ lineHeight: 1.4 }}>
                                                <li>- Nëse blerësi heq dorë, kapari nuk kthehet.</li>
                                                <li>- Nëse shitësi heq dorë ose nuk e përmbush marrëveshjen, është i obliguar të kthejë shumën e kaparit.</li>
                                            </ul>
                                        </div>

                                        {/* Article 5 */}
                                        <div className="mb-3">
                                            <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 5 – Dispozita të Përgjithshme</div>
                                            <ul className="list-none text-xs" style={{ lineHeight: 1.4 }}>
                                                <li>- Palët e pranojnë marrëveshjen me vullnet të lirë dhe pa asnjë presion.</li>
                                                <li>- Për çdo kontest eventual, palët pajtohen që të zgjidhet me marrëveshje ose në Gjykatën kompetente në Prishtine.</li>
                                            </ul>
                                        </div>

                                        {/* Signatures - Compact */}
                                        <div className="grid grid-cols-2 gap-8 mt-4 pt-3 border-t border-black">
                                            <div className="text-center">
                                                <div className="text-xs mb-8">Shitësi (Nënshkrimi)</div>
                                                <div className="border-b border-black mx-4"></div>
                                                <div className="mt-1 font-bold text-xs">{seller.name}</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xs mb-8">Blerësi (Nënshkrimi)</div>
                                                <div className="border-b border-black mx-4"></div>
                                                <div className="mt-1 font-bold text-xs">{safeString(sale.buyerName)}</div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {type === 'full_marreveshje' && (
                                    <div className="max-w-2xl mx-auto">
                                        {/* ===== PAGE 1 ===== */}
                                        <div className="page-1" style={{ minHeight: '27.7cm', paddingBottom: '1cm' }}>
                                            <img src="/logo.jpg" className="contract-logo mx-auto h-16 mb-4" alt="Logo" />
                                            <h1 className="text-base font-bold uppercase mb-4 text-center" style={{ color: '#000000' }}>MARRËVESHJE INTERNE</h1>
                                            <div className="font-bold mb-4" style={{ color: '#000000' }}>Data: {today}</div>

                                            <h2 className="font-bold text-sm mb-4 underline" style={{ color: '#000000' }}>Marrëveshje për Blerjen e Automjetit</h2>

                                            <div className="section mb-6">
                                                <div className="font-bold mb-2 underline">Palët Kontraktuese:</div>
                                                <ul className="list-disc ml-5 space-y-2">
                                                    <li>
                                                        <strong>{fullSellerName}</strong>, me {sellerBusinessId}, i lindur më 13.06.1996 në Prishtinë, në cilësinë e <strong>Shitësit</strong>
                                                    </li>
                                                    <li>
                                                        <strong>Z. {safeString(sale.buyerName)}</strong> ne cilesin e blersit me nr personal <strong>{safeString(sale.buyerPersonalId)}</strong>
                                                    </li>
                                                </ul>
                                            </div>

                                            <div className="section mb-6">
                                                <div className="font-bold mb-2 underline">Objekti i Marrëveshjes:</div>
                                                <p className="mb-2">Qëllimi i kësaj marrëveshjeje është ndërmjetësimi dhe realizimi i blerjes së automjetit të mëposhtëm:</p>
                                                <div className="car-details">
                                                    <div><span className="label">Marka/Modeli:</span> <span>{safeString(sale.brand)} {safeString(sale.model)}</span></div>
                                                    <div><span className="label">Numri i shasisë:</span> <span>{safeString(sale.vin)}</span></div>
                                                    <div><span className="label">Viti I prodhimi:</span> <span>{safeNumber(sale.year)}</span></div>
                                                    <div><span className="label">KM te kaluara:</span> <span>{formatCurrency(sale.km)}km</span></div>
                                                </div>
                                            </div>

                                            <p className="font-bold mt-4 mb-4">
                                                {fullSellerName} vepron si shitës, ndërsa {safeString(sale.buyerName)} si blerës.
                                            </p>

                                            <hr className="mb-6 border-black" />

                                            <h3 className="font-bold text-sm mb-4 underline">Kushtet dhe Termat Kryesore të Marrëveshjes</h3>

                                            <ol className="list-decimal ml-5 space-y-4 mb-8">
                                                <li>
                                                    <strong>Pagesa</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Shuma totale prej € {formatCurrency(sale.amountPaidBank)} do të transferohet në llogarinë bankare të RG SH.P.K</li>
                                                        <li>Një shumë prej € {formatCurrency(sale.deposit)} do të paguhet në dorë si kapar.</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Nisja dhe Dorëzimi i Automjetit</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Automjeti do të niset nga Koreja e Jugut më datë {shippingDate}.</li>
                                                        <li>Dorëzimi pritet të realizohet në Portin e Durrësit brenda 35 deri në 45 ditë nga data e nisjes.</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Vonesa në Dorëzim</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Në rast se automjeti nuk mbërrin brenda afatit të përcaktuar, ndërmjetësi, Z. Robert Gashi, angazhohet të rimbursojë tërësisht shumën prej € {formatCurrency(sale.soldPrice)} brenda 7 ditëve kalendarike.</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Gjendja Teknike e Automjetit</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Pas inspektimit në Kosovë, nëse automjeti rezulton me defekte në pjesët e mbuluara nga garancia të cekura në faqen e dytë, përgjegjësia i takon shitësit.</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    Pas terheqjes se vetures nga terminali doganor ne prishtine ka te drejten e inspektimit dhe verifikimt te gjendjes se vetures per ni afat koher per 7 dite mbas ksaj kohe nuk marim pergjigisi.
                                                </li>
                                            </ol>
                                        </div>

                                        {/* ===== PAGE 2 - Warranty Terms ===== */}
                                        <div className="page-2 page-break" style={{ minHeight: '29.7cm', paddingTop: '2cm', paddingBottom: '1cm' }}>
                                            <h2 className="font-bold text-base mb-6 text-center uppercase" style={{ color: '#000000' }}>KUSHTET E GARANCISË</h2>
                                            
                                            <div className="mb-6">
                                                <h3 className="font-bold text-sm mb-3 underline">Pjesët e Mbuluara nga Garancia:</h3>
                                                <ul className="list-disc ml-5 space-y-2 text-sm">
                                                    <li>Motori (blloku i motorit, kokat e cilindrave, pistona, segmentet)</li>
                                                    <li>Kutia e shpejtësisë (ingranazhet, sinkronizuesit, kushineta)</li>
                                                    <li>Sistemi i ftohjes (radiatori, pompa e ujit, termostati)</li>
                                                    <li>Sistemi elektrik (alternatori, starteri, sensora kryesorë)</li>
                                                    <li>Sistemi i frenave (disqet, kllapsat, cilindrat)</li>
                                                    <li>Sistemi i drejtimit (pompa hidraulike, timoneria)</li>
                                                </ul>
                                            </div>

                                            <div className="mb-6">
                                                <h3 className="font-bold text-sm mb-3 underline">Pjesët që NUK Mbulohen nga Garancia:</h3>
                                                <ul className="list-disc ml-5 space-y-2 text-sm">
                                                    <li>Konsumatorët (llamba, siguresa, rrypa, filtra)</li>
                                                    <li>Dëmtimet nga aksidentet ose përdorimi i gabuar</li>
                                                    <li>Mirëmbajtja e rregullt (vaji, filtrat, antifrizi)</li>
                                                    <li>Pjesët kozmetike (llamarina, xhama, tapiseri)</li>
                                                    <li>Sistemi i klimatizimit (në raste të rrjedhjes së gazit)</li>
                                                </ul>
                                            </div>

                                            <div className="mb-6">
                                                <h3 className="font-bold text-sm mb-3 underline">Kushtet për Aktivizimin e Garancisë:</h3>
                                                <ol className="list-decimal ml-5 space-y-2 text-sm">
                                                    <li>Automjeti duhet të inspektohet brenda 7 ditëve nga marrja</li>
                                                    <li>Raportimi i defektit duhet bërë me shkrim brenda 48 orëve</li>
                                                    <li>Diagnoza duhet të kryhet në servis të autorizuar</li>
                                                    <li>Shitësi ka të drejtë të verifikojë defektin para riparimit</li>
                                                    <li>Riparimi kryhet në servisin e përzgjedhur nga shitësi</li>
                                                </ol>
                                            </div>

                                            <div className="mb-6">
                                                <h3 className="font-bold text-sm mb-3 underline">Kohëzgjatja e Garancisë:</h3>
                                                <p className="text-sm">Garancia vlen për një periudhë prej <strong>3 (tre) muajsh</strong> ose <strong>5,000 km</strong> (cilido që vjen i pari) nga data e dorëzimit të automjetit.</p>
                                            </div>

                                            <div className="mt-8 p-4 border border-black">
                                                <p className="text-sm font-bold text-center">VËREJTJE: Çdo riparim i kryer pa miratimin e shitësit e anulon garancin.</p>
                                            </div>
                                        </div>

                                        {/* ===== PAGE 3 - Signatures and Final Terms ===== */}
                                        <div className="page-3 page-break" style={{ minHeight: '29.7cm', paddingTop: '2cm' }}>
                                            <h2 className="font-bold text-base mb-6 text-center uppercase" style={{ color: '#000000' }}>DISPOZITAT PËRFUNDIMTARE</h2>

                                            <div className="mb-6">
                                                <h3 className="font-bold text-sm mb-3 underline">Zgjidhja e Mosmarrëveshjeve:</h3>
                                                <p className="text-sm mb-2">Palët pajtohen që çdo mosmarrëveshje që mund të lindë nga kjo marrëveshje të zgjidhet fillimisht me negociata të drejtpërdrejta. Nëse nuk arrihet marrëveshje brenda 15 ditëve, mosmarrëveshja i nënshtrohet gjykatës kompetente në Prishtinë.</p>
                                            </div>

                                            <div className="mb-6">
                                                <h3 className="font-bold text-sm mb-3 underline">Modifikimet:</h3>
                                                <p className="text-sm">Çdo ndryshim ose shtesë e kësaj marrëveshjeje duhet të bëhet me shkrim dhe të nënshkruhet nga të dy palët.</p>
                                            </div>

                                            <div className="mb-6">
                                                <h3 className="font-bold text-sm mb-3 underline">Ligji i Zbatueshëm:</h3>
                                                <p className="text-sm">Kjo marrëveshje rregullohet dhe interpretohet sipas ligjeve të Republikës së Kosovës.</p>
                                            </div>

                                            <div className="mb-8">
                                                <h3 className="font-bold text-sm mb-3 underline">Kopjet:</h3>
                                                <p className="text-sm">Kjo marrëveshje është hartuar në dy kopje origjinale, nga një kopje për secilën palë, të cilat kanë fuqi të njëjtë juridike.</p>
                                            </div>

                                            <p className="font-bold text-center mb-16 uppercase">
                                                Kjo marrëveshje është nënshkruar në mirëbesim të plotë nga të dy palët, duke pranuar të gjitha kushtet.
                                            </p>

                                            <div className="footer mt-20 pt-8 flex justify-between">
                                                <div className="signature-box w-2/5 text-left">
                                                    <div className="mb-2 font-bold">Ndërmjetësuesi:</div>
                                                    <div className="mb-16">{fullSellerName}</div>
                                                    <div className="border-b border-black w-full"></div>
                                                    <div className="mt-2 text-sm">(Nënshkrimi dhe Vula)</div>
                                                </div>
                                                <div className="signature-box w-2/5 text-right">
                                                    <div className="mb-2 font-bold">Blerësi:</div>
                                                    <div className="mb-16">{safeString(sale.buyerName)}</div>
                                                    <div className="border-b border-black w-full"></div>
                                                    <div className="mt-2 text-sm">(Nënshkrimi)</div>
                                                </div>
                                            </div>

                                            <div className="mt-16 text-center text-xs" style={{ color: '#666' }}>
                                                <p>Nr. Ref: {saleRefId} | Data: {today}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {type === 'full_shitblerje' && (
                                    <div className="max-w-2xl mx-auto" style={{ fontSize: '8.5pt', lineHeight: 1.3 }}>
                                        <img src="/logo.jpg" className="mx-auto h-12 mb-2" alt="Logo" />
                                        <h1 className="text-sm font-bold uppercase mb-2 text-center" style={{ color: '#000000' }}>KONTRATË SHITBLERJE</h1>
                                        <div className="font-bold mb-2 text-xs" style={{ color: '#000000' }}>Data: {today}</div>

                                        <h2 className="font-bold text-xs mb-2 underline" style={{ color: '#000000' }}>Marrëveshje për Blerjen e Automjetit</h2>

                                        <div className="section mb-3">
                                            <div className="font-bold mb-1 underline text-xs">Palët Kontraktuese:</div>
                                            <ul className="list-disc ml-4 text-xs" style={{ lineHeight: 1.4 }}>
                                                <li className="mb-1">
                                                    <strong>{fullSellerName}</strong>, me {sellerBusinessId}, i lindur më 13.06.1996 në Prishtinë, në cilësinë e <strong>Shitësit</strong>
                                                </li>
                                                <li>
                                                    <strong>Z. {safeString(sale.buyerName)}</strong> ne cilesin e blersit me nr personal <strong>{safeString(sale.buyerPersonalId)}</strong>
                                                </li>
                                            </ul>
                                        </div>

                                        <div className="section mb-3">
                                            <div className="font-bold mb-1 underline text-xs">Objekti i Marrëveshjes:</div>
                                            <p className="mb-1 text-xs">Qëllimi i kësaj marrëveshjeje është ndërmjetësimi dhe realizimi i blerjes së automjetit të mëposhtëm:</p>
                                            <div className="car-details text-xs" style={{ padding: '8pt', margin: '6pt 0' }}>
                                                <div><span className="label">Marka/Modeli:</span> <span>{safeString(sale.brand)} {safeString(sale.model)}</span></div>
                                                <div><span className="label">Numri i shasisë:</span> <span>{safeString(sale.vin)}</span></div>
                                                <div><span className="label">Viti I prodhimi:</span> <span>{safeNumber(sale.year)}</span></div>
                                                <div><span className="label">KM te kaluara:</span> <span>{formatCurrency(sale.km)}km</span></div>
                                            </div>
                                        </div>

                                        <p className="font-bold mt-2 mb-2 text-xs">
                                            {fullSellerName} vepron si shitës, ndërsa {safeString(sale.buyerName)} si blerës.
                                        </p>

                                        <hr className="mb-3 border-black" />

                                        <h3 className="font-bold text-xs mb-2 underline">Kushtet dhe Termat Kryesore të Marrëveshjes</h3>

                                        <ol className="list-decimal ml-4 text-xs mb-4" style={{ lineHeight: 1.4 }}>
                                            <li className="mb-2">
                                                <strong>Pagesa</strong>
                                                <ul className="list-[circle] ml-4 mt-0.5">
                                                    <li>Shuma totale prej € {formatCurrency(sale.amountPaidBank)} do të transferohet në llogarinë bankare të RG SH.P.K</li>
                                                    <li>Një shumë prej € {formatCurrency(sale.deposit)} do të paguhet në dorë si kapar.</li>
                                                </ul>
                                            </li>
                                            <li className="mb-2">
                                                <strong>Nisja dhe Dorëzimi i Automjetit</strong>
                                                <ul className="list-[circle] ml-4 mt-0.5">
                                                    <li>AUTOMJETI DORËZOHET NË DATËN: {shippingDate}</li>
                                                </ul>
                                            </li>
                                            <li className="mb-2">
                                                <strong>Gjendja Teknike e Automjetit</strong>
                                                <ul className="list-[circle] ml-4 mt-0.5">
                                                    <li>Pas inspektimit në Kosovë, nëse automjeti rezulton me defekte në pjesët e mbuluara nga garancia të cekura në faqen e dytë, përgjegjësia i takon shitësit.</li>
                                                </ul>
                                            </li>
                                            <li>
                                                Pas terheqjes se vetures nga terminali doganor ne prishtine ka te drejten e inspektimit dhe verifikimt te gjendjes se vetures per ni afat koher per 7 dite mbas ksaj kohe nuk marim pergjigisi.
                                            </li>
                                        </ol>

                                        <div className="mt-6 pt-4 flex justify-between">
                                            <div className="w-1/2 text-left pr-4">
                                                <div className="font-bold text-xs mb-1">RG SH.P.K.</div>
                                                <div className="text-xs mb-6">Owner: Robert Gashi</div>
                                                <div className="border-b border-black w-4/5"></div>
                                            </div>
                                            <div className="w-1/2 text-right pl-4">
                                                <div className="font-bold text-xs mb-1">Blerësi</div>
                                                <div className="text-xs mb-6">{safeString(sale.buyerName)}</div>
                                                <div className="border-b border-black w-4/5 ml-auto"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div >

            <style jsx>{`
                .contract-logo { height: 60px; display: block; margin: 0 auto 20px auto; }
                .party-title { font-weight: bold; margin-bottom: 8pt; color: #1e3a8a; text-decoration: underline; font-size: 11pt; }
                .blue-header { color: #1e3a8a; font-weight: bold; margin-bottom: 8pt; margin-top: 16pt; font-size: 11pt; border-bottom: 1px solid #1e3a8a; display: inline-block; padding-bottom: 2px; }
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
