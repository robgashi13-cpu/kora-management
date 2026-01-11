'use client';

import React from 'react';
import { CarSale } from '@/app/types';

export interface InvoiceDocumentProps {
    sale: CarSale;
    withDogane?: boolean;
}

const InvoiceDocument = React.forwardRef<HTMLDivElement, InvoiceDocumentProps>(({ sale, withDogane = false }, ref) => {
    return (
        <div
            className="p-5 md:p-8 print:p-0"
            id="invoice-content"
            ref={ref}
            style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                fontSize: '9pt',
                lineHeight: 1.4,
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: '210mm',
                minHeight: '297mm',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word'
            }}
        >

            {/* Invoice Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mb-6">
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
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-start gap-6 mb-6 border-t border-b border-gray-100 py-4" style={{ borderColor: '#f3f4f6' }}>
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
            <table className="w-full mb-6">
                <thead>
                    <tr className="border-b-2" style={{ borderColor: '#111827' }}>
                        <th className="text-left py-2 font-bold text-sm uppercase" style={{ color: '#4b5563' }}>Description</th>
                        <th className="text-right py-2 font-bold text-sm uppercase" style={{ color: '#4b5563' }}>Total</th>
                    </tr>
                </thead>
                <tbody style={{ color: '#374151' }}>
                    <tr className="border-b" style={{ borderColor: '#f3f4f6' }}>
                        <td className="py-3">
                            <div className="font-bold" style={{ color: '#111827' }}>
                                {sale.year} {sale.brand} {sale.model}{withDogane ? ' ME DOGANË' : ''}
                            </div>
                            <div className="text-sm" style={{ color: '#6b7280' }}>VIN: {sale.vin} | Color: {sale.color}</div>
                            <div className="text-sm mt-1" style={{ color: '#6b7280' }}>Mileage: {(sale.km || 0).toLocaleString()} km</div>
                        </td>
                        <td className="py-3 text-right font-bold" style={{ color: '#111827' }}>€{((sale.soldPrice || 0) - 200).toLocaleString()}</td>
                    </tr>
                    {!withDogane && (
                        <tr className="border-b" style={{ borderColor: '#f3f4f6' }}>
                            <td className="py-3">
                                <div className="font-bold uppercase" style={{ color: '#111827' }}>SHERBIMET DOGANORE PAGUHEN NGA KLIENTI</div>
                            </td>
                            <td className="py-3 text-right font-bold" style={{ color: '#111827' }}></td>
                        </tr>
                    )}
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
            <div className="border-t pt-6 mt-6 px-5 md:px-8 pb-4" style={{ borderColor: '#f3f4f6', backgroundColor: '#f9fafb' }}>
                <h4 className="font-bold text-sm mb-4 uppercase tracking-wider" style={{ color: '#111827' }}>Payment Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm" style={{ color: '#4b5563' }}>
                    <div>
                        <div className="font-bold mb-1" style={{ color: '#111827' }}>Raiffeisen Bank</div>
                        <div className="font-mono bg-white p-2 rounded border inline-block" style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}>1501080002435404</div>
                        <div className="mt-2 text-xs" style={{ color: '#6b7280' }}>Account Holder: RG SH.P.K.</div>
                        <div className="mt-3 text-xs uppercase tracking-wide" style={{ color: '#9ca3af' }}>Paid in Bank</div>
                        <div className="font-bold text-sm" style={{ color: '#111827' }}>€{(sale.amountPaidBank || 0).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                        <div className="font-bold mb-1" style={{ color: '#111827' }}>Contact</div>
                        <div>+383 48 181 116</div>
                        <div className="mt-4 text-xs" style={{ color: '#9ca3af' }}>Thank you for your business!</div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                #invoice-content *,
                #invoice-content {
                    box-sizing: border-box;
                }
                #invoice-content table {
                    width: 100%;
                    border-collapse: collapse;
                }
                #invoice-content th,
                #invoice-content td {
                    vertical-align: top;
                }
            `}</style>
        </div>
    );
});

InvoiceDocument.displayName = 'InvoiceDocument';

export default InvoiceDocument;
