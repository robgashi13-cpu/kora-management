'use client';

import React from 'react';
import { CarSale, ContractType } from '@/app/types';
import { applyShitblerjeOverrides } from './shitblerjeOverrides';
import StampImage from './StampImage';

interface ContractDocumentProps {
    sale: CarSale;
    type: ContractType;
    documentRef?: React.Ref<HTMLDivElement>;
    withStamp?: boolean;
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

export default function ContractDocument({ sale, type, documentRef, withStamp = false }: ContractDocumentProps) {
    // Guard against undefined sale
    if (!sale) {
        return (
            <div ref={documentRef} className="bg-white text-black w-[21cm] min-h-[29.7cm] p-8 flex items-center justify-center">
                <p className="text-slate-500">Loading document...</p>
            </div>
        );
    }

    const displaySale = type === 'full_shitblerje' ? applyShitblerjeOverrides(sale) : sale;

    const today = new Date().toLocaleDateString('en-GB');
    const shippingDate = formatDate(displaySale.shippingDate);
    const seller = { name: 'RG SH.P.K.', id: 'Business Nr 810062092', phone: '048181116' };
    const sellerBusinessId = 'NR.Biznesit 810062092';
    const fullSellerName = 'RG SH.P.K';

    const referenceId = (displaySale.invoiceId || displaySale.id || displaySale.vin || '').toString().slice(-8).toUpperCase() || 'N/A';
    const isSinglePage = type === 'deposit' || type === 'full_shitblerje';
    const rootPaddingClass = type === 'deposit'
        ? 'p-[48px] pt-[64px]'
        : type === 'full_shitblerje'
            ? 'p-[1.6cm] pt-[2cm]'
            : 'p-0';
    const rootHeightClass = isSinglePage ? 'h-[29.7cm]' : 'min-h-[29.7cm]';

    return (
        <div
            ref={documentRef}
            data-contract-document
            className={`bg-white text-black w-[21cm] shadow-2xl box-border pdf-root ${rootHeightClass} ${rootPaddingClass}`}
            style={{
                fontFamily: '"Times New Roman", Times, serif',
                fontSize: type === 'deposit' ? '8pt' : type === 'full_shitblerje' ? '8.5pt' : '9pt',
                lineHeight: type === 'deposit' ? 1.25 : type === 'full_shitblerje' ? 1.3 : 1.4,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                boxSizing: 'border-box',
                textRendering: 'optimizeLegibility',
                WebkitFontSmoothing: 'antialiased',
                overflow: isSinglePage ? 'hidden' : 'visible'
            }}
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
                        <div>Nr. Ref: <strong>{referenceId}</strong></div>
                        <div>Data: <strong>{today}</strong></div>
                    </div>

                    {/* Parties Section - Compact */}
                    <div className="grid grid-cols-2 gap-4 mb-2">
                        <div>
                            <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">1. Shitësi:</div>
                            <div className="text-xs space-y-1" style={{ lineHeight: 1.3 }}>
                                <div className="flex flex-wrap gap-2">
                                    <span className="min-w-16 font-semibold">Emri:</span>
                                    <strong className="flex-1 break-words">{seller.name}</strong>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="min-w-16 font-semibold">Nr. personal:</span>
                                    <span className="flex-1 break-words">{seller.id}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="min-w-16 font-semibold">Tel:</span>
                                    <span className="flex-1 break-words">{seller.phone}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">2. Blerësi (Kaparidhënësi):</div>
                            <div className="text-xs space-y-1" style={{ lineHeight: 1.3 }}>
                                <div className="flex flex-wrap gap-2">
                                    <span className="min-w-16 font-semibold">Emri:</span>
                                    <strong className="flex-1 break-words">{safeString(displaySale.buyerName)}</strong>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="min-w-16 font-semibold">Nr. personal:</span>
                                    <span className="flex-1 break-words">{safeString(displaySale.buyerPersonalId)}</span>
                                </div>
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
                            <li>- Marka: {safeString(displaySale.brand)}</li>
                            <li>- Modeli: {safeString(displaySale.model)}</li>
                            <li>- Nr. shasie: {safeString(displaySale.vin)}</li>
                        </ul>
                    </div>

                    {/* Article 2 */}
                    <div className="mb-2">
                        <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 2 – Shuma e Kaparit</div>
                        <p className="text-xs">
                            Blerësi i dorëzon shitësit kaparin si pjesë e pagesës përfundimtare për veturën, e cila kushton <strong>{formatCurrency(displaySale.soldPrice)}€</strong>. Deri ne Prishtine
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

                    {/* Bank Information */}
                    <div className="mb-2 p-2 border border-black rounded">
                        <div className="font-bold text-xs uppercase mb-1 text-center">Të dhënat bankare për pagesë</div>
                        <div className="text-xs space-y-0.5">
                            <div className="flex gap-2">
                                <span className="font-semibold min-w-20">Llogaria:</span>
                                <strong>RG SH.P.K.</strong>
                            </div>
                            <div className="flex gap-2">
                                <span className="font-semibold min-w-20">Banka:</span>
                                <span>TEB Raiffeisen Bank</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="font-semibold min-w-20">IBAN:</span>
                                <strong>XK051501000001004890</strong>
                            </div>
                            <div className="flex gap-2">
                                <span className="font-semibold min-w-20">Nr. Biznesit:</span>
                                <span>810062092</span>
                            </div>
                        </div>
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
                    <div className="signature-section border-t border-black pt-3">
                        <div className="signature-grid">
                            <div className="signature-column">
                                <div className="signature-label">Shitësi (Nënshkrimi)</div>
                                <div className="signature-line-row">
                                    <div className="signature-line" />
                                </div>
                                <div className="signature-name font-bold text-xs">{seller.name}</div>
                            </div>
                            <div className="signature-column">
                                <div className="signature-label">Blerësi (Nënshkrimi)</div>
                                <div className="signature-line-row">
                                    <div className="signature-line" />
                                </div>
                                <div className="signature-name font-bold text-xs break-words">{safeString(displaySale.buyerName)}</div>
                            </div>
                        </div>
                        {withStamp && (
                            <div className="signature-stamp-row">
                                <StampImage className={`signature-stamp ${type === 'deposit' ? 'signature-stamp-deposit' : ''}`} />
                            </div>
                        )}
                    </div>
                </>
            )}

            {type === 'full_marreveshje' && (
                <div className="max-w-2xl mx-auto" style={{ fontSize: '8pt', lineHeight: 1.25 }}>
                    {/* ===== PAGE 1 ===== */}
                    <div className="page-1 relative" style={{ minHeight: '27.7cm', padding: '1.4cm 1.6cm 1.5cm' }}>
                        <img src="/logo.jpg" className="contract-logo mx-auto h-12 mb-2" alt="Logo" />
                        <h1 className="text-sm font-bold uppercase mb-2 text-center" style={{ color: '#000000' }}>MARRËVESHJE INTERNE</h1>
                        <div className="font-bold mb-2" style={{ color: '#000000' }}>Data: {today}</div>
                        <div className="font-bold mb-2" style={{ color: '#000000' }}>Nr. Ref: {referenceId}</div>

                        <h2 className="font-bold text-xs mb-2 underline" style={{ color: '#000000' }}>Marrëveshje për Blerjen e Automjetit</h2>

                        <div className="section mb-3">
                            <div className="font-bold mb-1 underline">Palët Kontraktuese:</div>
                            <ul className="list-disc ml-5 space-y-1">
                                <li>
                                    <strong>{fullSellerName}</strong>, me {sellerBusinessId}, i lindur më 13.06.1996 në Prishtinë, në cilësinë e <strong>Shitësit</strong>
                                </li>
                                <li>
                                    <strong>Z. {safeString(displaySale.buyerName)}</strong> ne cilesin e blersit me nr personal <strong>{safeString(displaySale.buyerPersonalId)}</strong>
                                </li>
                            </ul>
                        </div>

                        <div className="section mb-3">
                            <div className="font-bold mb-1 underline">Objekti i Marrëveshjes:</div>
                            <p className="mb-1">Qëllimi i kësaj marrëveshjeje është ndërmjetësimi dhe realizimi i blerjes së automjetit të mëposhtëm:</p>
                            <div className="car-details">
                                <div><span className="label">Marka/Modeli:</span> <span className="value">{safeString(displaySale.brand)} {safeString(displaySale.model)}</span></div>
                                <div><span className="label">Numri i shasisë:</span> <span className="value">{safeString(displaySale.vin)}</span></div>
                                <div><span className="label">Viti I prodhimi:</span> <span className="value">{safeNumber(displaySale.year)}</span></div>
                                <div><span className="label">KM te kaluara:</span> <span className="value">{formatCurrency(displaySale.km)}km</span></div>
                            </div>
                        </div>

                        <p className="font-bold mt-2 mb-2">
                            {fullSellerName} vepron si shitës, ndërsa {safeString(displaySale.buyerName)} si blerës.
                        </p>

                        <hr className="mb-3 border-black" />

                        <h3 className="font-bold text-xs mb-2 underline">Kushtet dhe Termat Kryesore të Marrëveshjes</h3>

                        <ol className="list-decimal ml-5 space-y-2 mb-4">
                            <li>
                                <strong>Pagesa</strong>
                                <ul className="list-[circle] ml-5 mt-0.5">
                                    <li>Shuma totale për veturën është € {formatCurrency(displaySale.soldPrice)}.</li>
                                </ul>
                            </li>
                            <li>
                                <strong>Nisja dhe Dorëzimi i Automjetit</strong>
                                <ul className="list-[circle] ml-5 mt-0.5">
                                    <li>Automjeti do të niset nga Koreja e Jugut më datë {shippingDate}.</li>
                                    <li>Dorëzimi pritet të realizohet në Portin e Durrësit brenda 35 deri në 45 ditë nga data e nisjes.</li>
                                </ul>
                            </li>
                            <li>
                                <strong>Vonesa në Dorëzim</strong>
                                <ul className="list-[circle] ml-5 mt-0.5">
                                    <li>Në rast se automjeti nuk mbërrin brenda afatit të përcaktuar, ndërmjetësi, Z. Robert Gashi, angazhohet të rimbursojë tërësisht shumën prej € {formatCurrency(displaySale.soldPrice)} brenda 7 ditëve kalendarike.</li>
                                </ul>
                            </li>
                            <li>
                                <strong>Gjendja Teknike e Automjetit</strong>
                                <ul className="list-[circle] ml-5 mt-0.5">
                                    <li>Pas inspektimit në Kosovë, nëse automjeti rezulton me defekte në pjesët e mbuluara nga garancia të cekura në faqen e dytë, përgjegjësia i takon shitësit.</li>
                                </ul>
                            </li>
                            <li>
                                Pas terheqjes se vetures nga terminali doganor ne prishtine ka te drejten e inspektimit dhe verifikimt te gjendjes se vetures per ni afat koher per 7 dite mbas ksaj kohe nuk marim pergjigisi.
                            </li>
                        </ol>

                        {/* Page number */}
                        <div className="absolute bottom-4 left-0 right-0 text-center text-xs" style={{ color: '#666' }}>
                            Faqja 1 nga 3
                        </div>
                    </div>

                    {/* ===== PAGE 2 - Warranty Terms ===== */}
                    <div className="page-2 page-break relative" style={{ minHeight: '27.7cm', padding: '1.4cm 1.6cm 1.5cm' }}>
                        <h2 className="font-bold text-sm mb-3 text-center uppercase" style={{ color: '#000000' }}>Pjesët e Mbulueshme dhe të Përjashtuara nga Garancia</h2>

                        <div className="mb-3">
                            <h3 className="font-bold text-xs mb-1 underline">Pjesët e Mbulueshme nga Garancia (Jo Konsumueshme)</h3>
                            <p className="mb-1">Garancia mbulon vetëm defekte teknike që nuk lidhen me konsumimin normal dhe përfshin pjesët jo të konsumueshme si më poshtë:</p>
                            <ul className="list-disc ml-5 space-y-0.5">
                                <li>Motori (blloku, koka e cilindrit, pistonët, boshtet)</li>
                                <li>Transmisioni (manual ose automatik, përjashtuar clutch dhe flywheel)</li>
                                <li>Diferenciali dhe boshtet e fuqisë</li>
                                <li>ECU, alternatori, starteri</li>
                                <li>Kompresori i AC, kondensatori, avulluesi</li>
                                <li>Airbagët, rripat e sigurimit</li>
                                <li>Struktura e shasisë</li>
                            </ul>
                        </div>

                        <div className="mb-3">
                            <h3 className="font-bold text-xs mb-1 underline">Pjesët Konsumueshme të Përjashtuara nga Garancia</h3>
                            <p className="mb-1">Të gjitha pjesët e mëposhtme konsiderohen konsumueshme dhe përjashtohen nga garancia:</p>

                            <div className="mb-1">
                                <p className="font-bold">Debrisi dhe pjesët përreth:</p>
                                <ul className="list-disc ml-5">
                                    <li>Disku i debrisit</li>
                                    <li>Pllaka e presionit</li>
                                    <li>Rulllja e lirimit (release bearing)</li>
                                    <li>Flywheel (rrota e masës, DMF)</li>
                                    <li>Damper pulley / torsional dampers</li>
                                </ul>
                            </div>

                            <div className="mb-1">
                                <p className="font-bold">Sistemi i Frenimit:</p>
                                <ul className="list-disc ml-5">
                                    <li>Diskat e frenave, blloqet (pads), këpucët e frenimit</li>
                                    <li>Lëngu i frenave</li>
                                </ul>
                            </div>

                            <div className="mb-1">
                                <p className="font-bold">Filtrat & Lëngjet:</p>
                                <ul className="list-disc ml-5">
                                    <li>Filtri i vajit, ajrit, kabinës, karburantit</li>
                                    <li>Vaji i motorit, antifrizi, vaji i transmisionit</li>
                                    <li>Lëngu i larjes së xhamave</li>
                                </ul>
                            </div>

                            <div className="mb-1">
                                <p className="font-bold">Suspensioni & Drejtimi:</p>
                                <ul className="list-disc ml-5">
                                    <li>Amortizatorët (vaj, vula, konsumim)</li>
                                    <li>Bushingët, nyjet e topit, lidhëset stabilizuese</li>
                                </ul>
                            </div>

                            <div className="mb-1">
                                <p className="font-bold">Rrotat & Energjia:</p>
                                <ul className="list-disc ml-5">
                                    <li>Velgjat (fellnet), gomat, balancimi, rregullimi i drejtimit</li>
                                    <li>Bateria 12V, llambat, siguresat</li>
                                </ul>
                            </div>

                            <div className="mb-1">
                                <p className="font-bold">Të tjera Konsumueshme:</p>
                                <ul className="list-disc ml-5">
                                    <li>Fshirëset e xhamave, spërkatësit</li>
                                    <li>Spark plugs, glow plugs</li>
                                    <li>Rripat (serpentine, timing sipas intervalit të prodhuesit)</li>
                                    <li>Tubat gome, vulat, garniturat</li>
                                </ul>
                            </div>
                        </div>

                        <div className="mb-2">
                            <h3 className="font-bold text-xs mb-1 underline">Kushtet e Garancisë</h3>
                            <ul className="list-disc ml-5 space-y-0.5">
                                <li>Garancia mbulon vetëm defekte teknike që nuk lidhen me konsumimin normal.</li>
                                <li>Për automjetet e përdorura, të gjitha pjesët konsumueshme janë të përjashtuara pa përjashtim.</li>
                                <li>Mirëmbajtja e rregullt është përgjegjësi e klientit.</li>
                            </ul>
                        </div>

                        <p className="font-bold text-center mt-3">
                            Kjo marrëveshje është nënshkruar në mirëbesim të plotë nga të dy palët, duke pranuar të gjitha kushtet.
                        </p>

                        {/* Page number */}
                        <div className="absolute bottom-4 left-0 right-0 text-center text-xs" style={{ color: '#666' }}>
                            Faqja 2 nga 3
                        </div>
                    </div>

                    {/* ===== PAGE 3 - Signatures and Final Terms ===== */}
                    <div className="page-3 page-break relative" style={{ minHeight: '27.7cm', padding: '1.4cm 1.6cm 1.5cm' }}>
                        <h2 className="font-bold text-sm mb-3 text-center uppercase" style={{ color: '#000000' }}>DISPOZITAT PËRFUNDIMTARE</h2>

                        <div className="mb-3">
                            <h3 className="font-bold text-xs mb-1 underline">Zgjidhja e Mosmarrëveshjeve:</h3>
                            <p className="mb-1">Palët pajtohen që çdo mosmarrëveshje që mund të lindë nga kjo marrëveshje të zgjidhet fillimisht me negociata të drejtpërdrejta. Nëse nuk arrihet marrëveshje brenda 15 ditëve, mosmarrëveshja i nënshtrohet gjykatës kompetente në Prishtinë.</p>
                        </div>

                        <div className="mb-3">
                            <h3 className="font-bold text-xs mb-1 underline">Modifikimet:</h3>
                            <p>Çdo ndryshim ose shtesë e kësaj marrëveshjeje duhet të bëhet me shkrim dhe të nënshkruhet nga të dy palët.</p>
                        </div>

                        <div className="mb-3">
                            <h3 className="font-bold text-xs mb-1 underline">Ligji i Zbatueshëm:</h3>
                            <p>Kjo marrëveshje rregullohet dhe interpretohet sipas ligjeve të Republikës së Kosovës.</p>
                        </div>

                        <div className="mb-4">
                            <h3 className="font-bold text-xs mb-1 underline">Kopjet:</h3>
                            <p>Kjo marrëveshje është hartuar në dy kopje origjinale, nga një kopje për secilën palë, të cilat kanë fuqi të njëjtë juridike.</p>
                        </div>

                        <p className="font-bold text-center mb-8 uppercase">
                            Kjo marrëveshje është nënshkruar në mirëbesim të plotë nga të dy palët, duke pranuar të gjitha kushtet.
                        </p>

                        <div className="signature-section">
                            <div className="signature-grid">
                                <div className="signature-column">
                                    <div className="signature-label font-bold">Ndërmjetësuesi:</div>
                                    <div className="signature-line-row">
                                        <div className="signature-line" />
                                    </div>
                                    <div className="signature-name text-xs">
                                        <div>{fullSellerName}</div>
                                        <div>(Nënshkrimi dhe Vula)</div>
                                    </div>
                                </div>
                                <div className="signature-column">
                                    <div className="signature-label font-bold">Blerësi:</div>
                                    <div className="signature-line-row">
                                        <div className="signature-line" />
                                    </div>
                                    <div className="signature-name text-xs">
                                        <div className="break-words">{safeString(displaySale.buyerName)}</div>
                                        <div>(Nënshkrimi)</div>
                                    </div>
                                </div>
                            </div>
                            {withStamp && (
                                <div className="signature-stamp-row">
                                    <StampImage className="signature-stamp" />
                                </div>
                            )}
                        </div>

                        <div className="mt-8 text-center text-xs" style={{ color: '#666' }}>
                            <p>Nr. Ref: {referenceId} | Data: {today}</p>
                        </div>

                        {/* Page number */}
                        <div className="absolute bottom-4 left-0 right-0 text-center text-xs" style={{ color: '#666' }}>
                            Faqja 3 nga 3
                        </div>
                    </div>
                </div>
            )}

            {type === 'full_shitblerje' && (
                <div className="max-w-2xl mx-auto" style={{ fontSize: '8.5pt', lineHeight: 1.3 }}>
                    <img src="/logo.jpg" className="mx-auto h-12 mb-2" alt="Logo" />
                    <h1 className="text-sm font-bold uppercase mb-2 text-center" style={{ color: '#000000' }}>KONTRATË SHITBLERJE</h1>
                    <div className="font-bold mb-2 text-xs" style={{ color: '#000000' }}>Data: {today}</div>
                    <div className="font-bold mb-2 text-xs" style={{ color: '#000000' }}>Nr. Ref: {referenceId}</div>

                    <h2 className="font-bold text-xs mb-2 underline" style={{ color: '#000000' }}>Marrëveshje për Blerjen e Automjetit</h2>

                    <div className="section mb-3">
                        <div className="font-bold mb-1 underline text-xs">Palët Kontraktuese:</div>
                        <ul className="list-disc ml-4 text-xs" style={{ lineHeight: 1.4 }}>
                            <li className="mb-1">
                                <strong>{fullSellerName}</strong>, me {sellerBusinessId}, i lindur më 13.06.1996 në Prishtinë, në cilësinë e <strong>Shitësit</strong>
                            </li>
                            <li>
                                <strong>Z. {safeString(displaySale.buyerName)}</strong> ne cilesin e blersit me nr personal <strong>{safeString(displaySale.buyerPersonalId)}</strong>
                            </li>
                        </ul>
                    </div>

                    <div className="section mb-3">
                        <div className="font-bold mb-1 underline text-xs">Objekti i Marrëveshjes:</div>
                        <p className="mb-1 text-xs">Qëllimi i kësaj marrëveshjeje është ndërmjetësimi dhe realizimi i blerjes së automjetit të mëposhtëm:</p>
                        <div className="car-details text-xs" style={{ padding: '8pt', margin: '6pt 0' }}>
                            <div><span className="label">Marka/Modeli:</span> <span className="value">{safeString(displaySale.brand)} {safeString(displaySale.model)}</span></div>
                            <div><span className="label">Numri i shasisë:</span> <span className="value">{safeString(displaySale.vin)}</span></div>
                            <div><span className="label">Viti I prodhimi:</span> <span className="value">{safeNumber(displaySale.year)}</span></div>
                            <div><span className="label">KM te kaluara:</span> <span className="value">{formatCurrency(displaySale.km)}km</span></div>
                        </div>
                    </div>

                    <p className="font-bold mt-2 mb-2 text-xs">
                        {fullSellerName} vepron si shitës, ndërsa {safeString(displaySale.buyerName)} si blerës.
                    </p>

                    <hr className="mb-3 border-black" />

                    <h3 className="font-bold text-xs mb-2 underline">Kushtet dhe Termat Kryesore të Marrëveshjes</h3>

                    <ol className="list-decimal ml-4 text-xs mb-4" style={{ lineHeight: 1.4 }}>
                        <li className="mb-2">
                            <strong>Pagesa</strong>
                            <ul className="list-[circle] ml-4 mt-0.5">
                                <li>Shuma totale për veturën është € {formatCurrency(displaySale.soldPrice)}.</li>
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

                    <div className="signature-section">
                        <div className="signature-grid">
                            <div className="signature-column">
                                <div className="signature-label font-bold text-xs">RG SH.P.K.</div>
                                <div className="signature-line-row">
                                    <div className="signature-line" />
                                </div>
                                <div className="signature-name text-xs">Owner: Robert Gashi</div>
                            </div>
                            <div className="signature-column">
                                <div className="signature-label font-bold text-xs">Blerësi</div>
                                <div className="signature-line-row">
                                    <div className="signature-line" />
                                </div>
                                <div className="signature-name text-xs break-words">{safeString(displaySale.buyerName)}</div>
                            </div>
                        </div>
                        {withStamp && (
                            <div className="signature-stamp-row">
                                <StampImage className="signature-stamp" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
                .contract-logo { height: 60px; display: block; margin: 0 auto 20px auto; }
                .party-title { font-weight: bold; margin-bottom: 8pt; color: #0f172a; text-decoration: underline; font-size: 11pt; }
                .blue-header { color: #0f172a; font-weight: bold; margin-bottom: 8pt; margin-top: 16pt; font-size: 11pt; border-bottom: 1px solid #0f172a; display: inline-block; padding-bottom: 2px; }
                .label { font-weight: bold; min-width: 100px; display: inline-block; }
                .car-details { background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 16pt; margin: 12pt 0; border-radius: 4pt; }
                .car-details div { display: grid; grid-template-columns: minmax(100px, 35%) minmax(0, 1fr); column-gap: 8pt; row-gap: 4pt; align-items: start; margin-bottom: 6pt; border-bottom: 1px dashed #ced4da; padding-bottom: 4px; }
                .car-details .value { text-align: right; word-break: break-word; overflow-wrap: anywhere; }
                .car-details div:last-child { border-bottom: none; margin-bottom: 0; }
                .signature-section { margin-top: 72px; position: relative; }
                .signature-grid { display: flex; gap: 16.9mm; width: 175.7mm; margin: 0 auto; }
                .signature-column { width: 79.4mm; display: flex; flex-direction: column; align-items: flex-start; text-align: left; }
                .signature-label { line-height: 20px; }
                .signature-line-row { position: relative; margin-top: 24px; }
                .signature-line { width: 63.5mm; border-bottom: 1px solid #000; height: 0; }
                .signature-name { margin-top: 16px; line-height: 20px; }
                .signature-stamp-row {
                    position: absolute;
                    top: -17.5mm;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    justify-content: flex-start;
                    width: 175.7mm;
                    margin: 0;
                }
                .signature-stamp { width: 58mm; height: 58mm; object-fit: contain; margin-left: 31.8mm; }
                .signature-stamp-deposit { margin-left: -10.6mm; }
                .pdf-root,
                .pdf-root * {
                    text-shadow: none;
                    text-decoration: none;
                    filter: none;
                }

                @media print {
                    .page-break { page-break-before: always; }
                    .visual-break { display: none; }
                }
            `}</style>
        </div>
    );
}
