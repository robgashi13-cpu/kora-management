import React, { useRef } from 'react';
import { CarSale } from '@/app/types';
import { X, Printer } from 'lucide-react';

interface Props {
    sale: CarSale;
    type: 'deposit' | 'full';
    onClose: () => void;
}

export default function ContractModal({ sale, type, onClose }: Props) {
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        if (!printRef.current) return;
        const content = printRef.current.innerHTML;
        const win = window.open('', '', 'height=800,width=800');
        if (win) {
            win.document.write(`
                <html>
                    <head>
                        <title>Contract_${sale.brand}_${sale.model}</title>
                        <base href="${window.location.origin}/" />
                        <style>
                            @page { size: A4; margin: 2.54cm; }
                            body { 
                                font-family: "Times New Roman", Times, serif; 
                                font-size: 12pt; 
                                line-height: 1.5; 
                                color: #000; 
                                background: white; 
                                margin: 0;
                                padding: 0;
                            }
                            img { max-width: 100%; height: auto; }
                            .contract-logo { height: 60px; display: block; margin: 0 auto 20px auto; }
                            
                            .page-container { width: 100%; max-width: 21cm; margin: 0 auto; }
                            h1 { font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 24pt; text-transform: uppercase; }
                            h2 { font-size: 14pt; font-weight: bold; margin-top: 18pt; margin-bottom: 12pt; }
                            h3 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; }
                            h4 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; text-decoration: underline; }
                            p { margin-bottom: 12pt; text-align: justify; line-height: 1.6; }
                            .header-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 36pt; border-bottom: 2px solid #1e3a8a; padding-bottom: 12pt; }
                            .deposit-title { font-size: 14pt; font-weight: bold; color: #1e3a8a; text-transform: uppercase; }
                            .korauto-title { font-size: 24pt; font-weight: bold; color: #1e3a8a; text-transform: uppercase; letter-spacing: 2px; }
                            
                            .parties-container { display: flex; justify-content: space-between; gap: 24pt; margin-bottom: 24pt; }
                            .party-box { flex: 1; padding: 10px; border: 1px solid transparent; }
                            .party-title { font-weight: bold; margin-bottom: 8pt; color: #1e3a8a; text-decoration: underline; font-size: 13pt; }
                            
                            .blue-header { color: #1e3a8a; font-weight: bold; margin-bottom: 8pt; margin-top: 16pt; font-size: 13pt; border-bottom: 1px solid #1e3a8a; display: inline-block; padding-bottom: 2px; }
                            
                            .info-row { margin-bottom: 6pt; }
                            .label { font-weight: bold; min-width: 100px; display: inline-block; }
                            ul, ol { margin-bottom: 12pt; padding-left: 24pt; }
                            li { margin-bottom: 6pt; text-align: justify; }
                            .car-details { background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 16pt; margin: 12pt 0; border-radius: 4pt; }
                            .car-details div { display: flex; justify-content: space-between; margin-bottom: 6pt; border-bottom: 1px dashed #ced4da; padding-bottom: 4px; }
                            .car-details div:last-child { border-bottom: none; margin-bottom: 0; }
                            .footer { margin-top: 60pt; display: flex; justify-content: space-between; page-break-inside: avoid; }
                            .signature-box { width: 40%; position: relative; height: 100px; }
                            .signature-line { border-top: 1px solid black; margin-top: 80pt; padding-top: 6pt; font-weight: bold; text-align: center; }
                            .highlight { font-weight: bold; color: #000; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
                            th, td { text-align: left; padding: 6pt; border-bottom: 1px solid #eee; }
                            
                            /* Page Break Logic */
                            .page-break { page-break-before: always; }
                            .visual-break { display: none; }
                        </style>
                    </head>
                    <body>
                        <div class="page-container">
                            ${content}
                        </div>
                    </body>
                </html>
            `);
            win.document.close();
            win.focus();
            win.print();
        }
    };

    const today = new Date().toLocaleDateString('en-GB');
    const seller = { name: "ROBERT GASHI", id: "1232189645", phone: "048181116" };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[max(4rem,env(safe-area-inset-top))] bg-black/90 backdrop-blur-md" onClick={onClose}>
            <div className="bg-[#1a1a1a] text-white w-full max-w-5xl h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
                {/* Header Actions */}
                <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#111]">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        {type === 'deposit' ? 'Deposit Agreement Preview' : 'Full Contract Preview'}
                    </h2>
                    <div className="flex gap-3">
                        <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all font-bold shadow-lg shadow-blue-900/20 active:scale-95">
                            <Printer className="w-4 h-4" /> Print / Save PDF
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Document Preview Area */}
                <div className="flex-1 overflow-auto bg-[#525659] p-4 md:p-8 flex justify-center">
                    {/* The "Paper" Scaled for Mobile */}
                    <div className="w-full flex justify-center">
                        <div className="transform scale-[0.45] sm:scale-75 md:scale-100 origin-top h-auto">
                            <div
                                ref={printRef}
                                className="bg-white text-black w-[21cm] min-h-[29.7cm] p-[2.5cm] shadow-2xl"
                                style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', lineHeight: 1.5 }}
                            >
                                {type === 'deposit' && (
                                    <>
                                        {/* Header */}
                                        <div className="text-center mb-8 pb-4 border-b-2 border-black">
                                            <img src="/logo.jpg" className="mx-auto h-16 mb-4" alt="Logo" />
                                            <h1 className="text-2xl font-bold uppercase mb-1">KORAUTO</h1>
                                            <div className="text-lg font-bold uppercase">KONTRATË PËR KAPAR</div>
                                        </div>

                                        {/* Reference and Date */}
                                        <div className="flex justify-between mb-6 text-sm">
                                            <div>Nr. Ref: <strong>{sale.id.slice(0, 8).toUpperCase()}</strong></div>
                                            <div>Data: <strong>{today}</strong></div>
                                        </div>

                                        {/* Parties Section */}
                                        <div className="grid grid-cols-2 gap-8 mb-6">
                                            <div>
                                                <div className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">1. Shitësi:</div>
                                                <div className="space-y-1 text-sm">
                                                    <div><span className="inline-block w-24">Emri:</span> <strong>{seller.name}</strong></div>
                                                    <div><span className="inline-block w-24">Nr. personal:</span> {seller.id}</div>
                                                    <div><span className="inline-block w-24">Tel:</span> {seller.phone}</div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">2. Blerësi (Kaparidhënësi):</div>
                                                <div className="space-y-1 text-sm">
                                                    <div><span className="inline-block w-24">Emri:</span> <strong>{sale.buyerName}</strong></div>
                                                    <div><span className="inline-block w-24">Nr. personal:</span> {sale.buyerPersonalId || "________________"}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Article 1 */}
                                        <div className="mb-4">
                                            <div className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">Neni 1 – Objekti i Kontratës</div>
                                            <p className="text-sm mb-2">
                                                Shitësi pranon të rezervojë dhe shesë veturën me të dhënat më poshtë, ndërsa blerësi jep një shumë kapari si paradhënie për blerje:
                                            </p>
                                            <ul className="list-none text-sm font-bold mb-2">
                                                <li>- Marka: {sale.brand}</li>
                                                <li>- Modeli: {sale.model}</li>
                                                <li>- Nr. shasie: {sale.vin}</li>
                                            </ul>
                                        </div>

                                        {/* Article 2 */}
                                        <div className="mb-4">
                                            <div className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">Neni 2 – Shuma e Kaparit</div>
                                            <p className="text-sm">
                                                Blerësi i dorëzon shitësit shumën prej <strong>{sale.deposit}€</strong> si kapar, që llogaritet si pjesë e pagesës përfundimtare të veturës, e cila kushton <strong>{sale.soldPrice}€</strong>. Deri ne Prishtine
                                            </p>
                                        </div>

                                        {/* Article 3 */}
                                        <div className="mb-4">
                                            <div className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">Neni 3 – Detyrimet e Palëve</div>
                                            <ul className="list-none text-sm">
                                                <li className="mb-1">- Shitësi angazhohet të mos e shesë veturën ndonjë pale tjetër për periudhën prej 7 ditësh nga data e nënshkrimit.</li>
                                                <li>- Blerësi angazhohet ta përfundojë pagesën dhe ta marrë veturën brenda afatit të caktuar</li>
                                            </ul>
                                        </div>

                                        {/* Article 4 */}
                                        <div className="mb-4">
                                            <div className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">Neni 4 – Anulimi i Marrëveshjes</div>
                                            <ul className="list-none text-sm">
                                                <li className="mb-1">- Nëse blerësi heq dorë, kapari nuk kthehet.</li>
                                                <li>- Nëse shitësi heq dorë ose nuk e përmbush marrëveshjen, është i obliguar të kthejë shumën e kaparit.</li>
                                            </ul>
                                        </div>

                                        {/* Article 5 */}
                                        <div className="mb-8">
                                            <div className="font-bold text-sm uppercase mb-2 border-b border-black pb-1">Neni 5 – Dispozita të Përgjithshme</div>
                                            <ul className="list-none text-sm">
                                                <li className="mb-1">- Palët e pranojnë marrëveshjen me vullnet të lirë dhe pa asnjë presion.</li>
                                                <li>- Për çdo kontest eventual, palët pajtohen që të zgjidhet me marrëveshje ose në Gjykatën kompetente në Prishtine.</li>
                                            </ul>
                                        </div>

                                        {/* Signatures */}
                                        <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-black">
                                            <div className="text-center">
                                                <div className="text-sm mb-20">Shitësi (Nënshkrimi)</div>
                                                <div className="border-b border-black mx-4"></div>
                                                <div className="mt-2 font-bold text-sm">{seller.name}</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-sm mb-20">Blerësi (Nënshkrimi)</div>
                                                <div className="border-b border-black mx-4"></div>
                                                <div className="mt-2 font-bold text-sm">{sale.buyerName}</div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {type === 'full' && (
                                    <div className="max-w-2xl mx-auto">
                                        <img src="/logo.jpg" className="contract-logo mx-auto h-16 mb-4" alt="Logo" />
                                        <h1 className="text-xl font-bold uppercase mb-4 text-center">KONTRATË SHITBLERJE</h1>
                                        <div className="font-bold mb-4">Data: {today}</div>

                                        <h2 className="font-bold text-lg mb-4 underline">Marrëveshje për Blerjen e Automjetit</h2>

                                        <div className="section mb-6">
                                            <div className="font-bold mb-2 underline">Palët Kontraktuese:</div>
                                            <ul className="list-disc ml-5 space-y-2">
                                                <li>
                                                    <strong>Z. {seller.name}</strong>, me numër personal {seller.id}, i lindur më 13.06.1996 në Prishtinë, në cilësinë e <strong>Shitësit</strong>
                                                </li>
                                                <li>
                                                    <strong>Z. {sale.buyerName}</strong> ne cilesin e blersit me nr personal <strong>{sale.buyerPersonalId || "________________"}</strong>
                                                </li>
                                            </ul>
                                        </div>

                                        <div className="section mb-6">
                                            <div className="font-bold mb-2 underline">Objekti i Marrëveshjes:</div>
                                            <p className="mb-2">Qëllimi i kësaj marrëveshjeje është ndërmjetësimi dhe realizimi i blerjes së automjetit të mëposhtëm:</p>
                                            <div className="car-details">
                                                <div><span className="label">Marka/Modeli:</span> <span>{sale.brand} {sale.model}</span></div>
                                                <div><span className="label">Numri i shasisë:</span> <span>{sale.vin}</span></div>
                                                <div><span className="label">Viti I prodhimi:</span> <span>{sale.year}</span></div>
                                                <div><span className="label">KM te kaluara:</span> <span>{(sale.km || 0).toLocaleString()}km</span></div>

                                            </div>
                                        </div>

                                        <p className="font-bold mt-4 mb-4">
                                            Z. {seller.name} vepron si shitës, ndërsa {sale.buyerName} si blerës.
                                        </p>

                                        <hr className="mb-6 border-black" />

                                        <h3 className="font-bold text-lg mb-4 underline">Kushtet dhe Termat Kryesore të Marrëveshjes</h3>

                                        <ol className="list-decimal ml-5 space-y-4 mb-8">
                                            <li>
                                                <strong>Pagesa</strong>
                                                <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                    <li>Shuma totale prej {sale.amountPaidBank}€ do të transferohet në llogarinë bankare të RG SH.P.K.</li>
                                                    <li>Një shumë prej {sale.deposit} € do të paguhet në dorë si kapar.</li>
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

                                        <div className="visual-break" style={{ borderBottom: '1px dashed #ccc', margin: '2rem 0', textAlign: 'center', color: '#888', fontSize: '12px' }}>--- PAGE 2 ---</div>
                                        <div className="page-break"></div>

                                        <h3 className="font-bold text-lg mb-4 text-center border-b-2 border-black pb-2">Pjesët e Mbulueshme dhe të Përjashtuara nga Garancia</h3>

                                        <div className="mb-6">
                                            <h4 className="font-bold mb-2 underline">Pjesët e Mbulueshme nga Garancia (Jo Konsumueshme)</h4>
                                            <p className="mb-2 italic">Garancia mbulon vetëm defekte teknike që nuk lidhen me konsumimin normal dhe përfshin pjesët jo të konsumueshme si më poshtë:</p>
                                            <ul className="list-disc ml-5 space-y-1">
                                                <li>Motori (blloku, koka e cilindrit, pistonët, boshtet)</li>
                                                <li>Transmisioni (manual ose automatik, përjashtuar clutch dhe flywheel)</li>
                                                <li>Diferenciali dhe boshtet e fuqisë</li>
                                                <li>ECU, alternatori, starteri</li>
                                                <li>Kompresori i AC, kondensatori, avulluesi</li>
                                                <li>Airbagët, rripat e sigurimit</li>
                                                <li>Struktura e shasisë</li>
                                            </ul>
                                        </div>

                                        <div className="mb-6">
                                            <h4 className="font-bold mb-2 underline">Pjesët Konsumueshme të Përjashtuara nga Garancia</h4>
                                            <p className="mb-2 italic">Të gjitha pjesët e mëposhtme konsiderohen konsumueshme dhe përjashtohen nga garancia:</p>

                                            <ul className="list-disc ml-5 space-y-4">
                                                <li>
                                                    <strong>Debrisi dhe pjesët përreth:</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Disku i debrisit</li>
                                                        <li>Pllaka e presionit</li>
                                                        <li>Rulllia e lirimit (release bearing)</li>
                                                        <li>Flywheel (rrota e masës, DMF)</li>
                                                        <li>Damper pulley / torsional dampers</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Sistemi i Frenimit:</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Diskat e frenave, blloget (pads), këpucët e frenimit</li>
                                                        <li>Lëngu i frenave</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Filtrat & Lëngjet:</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Filtri i vajit, ajrit, kabinës, karburantit</li>
                                                        <li>Vaji i motorit, antifrizi, vaji i transmisionit</li>
                                                        <li>Lëngu i larjes së xhamave</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Suspensioni & Drejtimi:</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Amortizatorët (vaj, vula, konsumim)</li>
                                                        <li>Bushingët, nyjet e topit, lidhëset stabilizuese</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Rrotat & Energjia:</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Velgiat (fellnet), gomat, balancimi, rregullimi i dreitimit</li>
                                                        <li>Bateria 12V, llambat, siguresat</li>
                                                    </ul>
                                                </li>
                                                <li>
                                                    <strong>Të tjera Konsumueshme:</strong>
                                                    <ul className="list-[circle] ml-5 mt-1 text-sm">
                                                        <li>Eshirëset e xhamave, spërkatësit</li>
                                                        <li>Spark plugs, glow plugs</li>
                                                        <li>Rripat (serpentine, timing sipas intervalit të prodhuesit)</li>
                                                        <li>Tubat gome, vulat, garniturat</li>
                                                    </ul>
                                                </li>
                                            </ul>
                                        </div>

                                        <div className="visual-break" style={{ borderBottom: '1px dashed #ccc', margin: '2rem 0', textAlign: 'center', color: '#888', fontSize: '12px' }}>--- PAGE 3 ---</div>
                                        <div className="page-break"></div>

                                        <h3 className="font-bold text-lg mb-4 underline">Kushtet e Garancisë</h3>
                                        <ul className="list-disc ml-5 space-y-2 mb-8">
                                            <li>Garancia mbulon vetëm defekte teknike që nuk lidhen me konsumimin normal.</li>
                                            <li>Për automjetet e përdorura, të gjitha pjesët konsumueshme janë të përjashtuara pa përjashtim.</li>
                                            <li>Mirëmbajtja e rregullt është përgjegjësi e klientit.</li>
                                        </ul>

                                        <p className="font-bold text-center mb-12 uppercase">
                                            Kjo marrëveshje është nënshkruar në mirëbesim të plotë nga të dy palët, duke pranuar të gjitha kushtet.
                                        </p>

                                        <div className="footer mt-16 pt-8 flex justify-between">
                                            <div className="signature-box w-1/3 text-left">
                                                <div className="mb-8 font-bold">Shitësi: {seller.name}</div>
                                                <div className="border-b border-black w-full h-1"></div>
                                            </div>
                                            <div className="signature-box w-1/3 text-right">
                                                <div className="mb-8 font-bold">Blerësi: {sale.buyerName}</div>
                                                <div className="border-b border-black w-full h-1"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

