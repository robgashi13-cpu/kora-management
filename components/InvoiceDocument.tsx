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
            className="pdf-root invoice-root"
            id="invoice-content"
            ref={ref}
            style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
                fontSize: '9.5pt',
                lineHeight: 1.5,
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: '210mm',
                minHeight: '297mm',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word'
            }}
        >

            {/* Invoice Header */}
            <div className="invoice-header">
                <div>
                    {/* Company Logo */}
                    <img
                        src="/logo.jpg"
                        alt="KORAUTO Logo"
                        style={{ height: '64px', width: 'auto', marginBottom: '16px' }}
                    />
                    <h1 style={{ color: '#111827', fontSize: '1.25rem', fontWeight: 700 }}>INVOICE</h1>
                    <p style={{ color: '#6b7280', marginTop: '4px' }}>#{sale.vin?.slice(-6).toUpperCase() || 'N/A'}</p>
                </div>
                <div className="invoice-header-right">
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>RG SH.P.K</div>
                    <div style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.6 }}>
                        Rr. Dardania 191<br />
                        Owner: Robert Gashi<br />
                        Phone: +383 48 181 116<br />
                        Nr Biznesit: 810062092
                    </div>
                </div>
            </div>

            {/* Client Info & Dates */}
            <div className="invoice-client" style={{ borderColor: '#f3f4f6' }}>
                <div>
                    <h3 style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Bill To</h3>
                    <div style={{ color: '#1f2937', fontSize: '0.875rem', fontWeight: 700, wordBreak: 'break-word' }}>{sale.buyerName}</div>
                </div>
                <div className="invoice-client-right">
                    <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.875rem', marginRight: '16px' }}>Invoice Date:</span>
                        <span style={{ color: '#1f2937', fontWeight: 500 }}>{new Date().toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            {/* Line Items */}
            <table className="invoice-table">
                <thead>
                    <tr style={{ borderBottom: '2px solid #111827' }}>
                        <th style={{ color: '#4b5563', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', padding: '8px 0', textAlign: 'left' }}>Description</th>
                        <th style={{ color: '#4b5563', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', padding: '8px 0', textAlign: 'right' }}>Total</th>
                    </tr>
                </thead>
                <tbody style={{ color: '#374151' }}>
                    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 0' }}>
                            <div style={{ color: '#111827', fontWeight: 700 }}>
                                {sale.year} {sale.brand} {sale.model}{withDogane ? ' ME DOGANË' : ''}
                            </div>
                            <div style={{ color: '#6b7280', fontSize: '0.875rem', display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '4px' }}>
                                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', wordBreak: 'break-all' }}>VIN: {sale.vin}</span>
                                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>Color: {sale.color}</span>
                            </div>
                            <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '4px', display: 'flex', flexWrap: 'wrap', columnGap: '8px' }}>Mileage: {(sale.km || 0).toLocaleString()} km</div>
                        </td>
                        <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: '#111827' }}>€{((sale.soldPrice || 0) - 200).toLocaleString()}</td>
                    </tr>
                    {!withDogane && (
                        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px 0' }}>
                                <div style={{ color: '#111827', fontWeight: 700, textTransform: 'uppercase' }}>SHERBIMET DOGANORE PAGUHEN NGA KLIENTI</div>
                            </td>
                            <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: '#111827' }}></td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Totals */}
            <div className="invoice-summary">
                <div style={{ color: '#4b5563', display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>Subtotal</span>
                    <span>€{((sale.soldPrice || 0) - 200).toLocaleString()}</span>
                </div>
                <div style={{ color: '#4b5563', display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>Services</span>
                    <span>€169.49</span>
                </div>
                <div style={{ color: '#4b5563', display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb', marginBottom: '8px' }}>
                    <span>Tax (TVSH 18%)</span>
                    <span>€30.51</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #111827' }}>
                    <span style={{ color: '#111827', fontWeight: 700, fontSize: '1rem' }}>Grand Total</span>
                    <span style={{ color: '#111827', fontWeight: 700, fontSize: '1rem' }}>€{(sale.soldPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>

            {/* Footer */}
            <div className="invoice-footer" style={{ borderColor: '#f3f4f6', backgroundColor: '#f9fafb' }}>
                <h4 style={{ color: '#111827', fontWeight: 700, fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Payment Details</h4>
                <div className="invoice-footer-grid" style={{ color: '#4b5563', fontSize: '0.875rem' }}>
                    <div>
                        <div style={{ color: '#111827', fontWeight: 700, marginBottom: '4px' }}>Raiffeisen Bank</div>
                        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', backgroundColor: '#ffffff', padding: '8px', borderRadius: '6px', border: '1px solid #e5e7eb', display: 'inline-block' }}>1501080002435404</div>
                        <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '8px' }}>Account Holder: RG SH.P.K.</div>
                        <div style={{ color: '#111827', fontWeight: 700, fontSize: '0.875rem' }}>€{(sale.amountPaidBank || 0).toLocaleString()}</div>
                    </div>
                    <div className="invoice-footer-right">
                        <div style={{ color: '#111827', fontWeight: 700, marginBottom: '4px' }}>Contact</div>
                        <div>+383 48 181 116</div>
                        <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '16px' }}>Thank you for your business!</div>
                    </div>
                </div>
            </div>

            <style>{`
                .invoice-root {
                    padding: 20px;
                }

                .invoice-header {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                    align-items: flex-start;
                    margin-bottom: 24px;
                }

                .invoice-client {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                    align-items: flex-start;
                    margin-bottom: 24px;
                    padding: 16px 0;
                    border-top: 1px solid;
                    border-bottom: 1px solid;
                }

                .invoice-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 24px;
                }

                .invoice-summary {
                    width: 100%;
                    margin-left: auto;
                }

                .invoice-footer {
                    border-top: 1px solid;
                    padding: 24px 20px 16px;
                    margin-top: 24px;
                }

                .invoice-footer-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 32px;
                }

                @media (min-width: 768px) {
                    .invoice-root {
                        padding: 32px;
                    }

                    .invoice-header {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }

                    .invoice-header-right,
                    .invoice-client-right,
                    .invoice-footer-right {
                        text-align: right;
                    }

                    .invoice-client {
                        grid-template-columns: 1fr auto;
                    }

                    .invoice-summary {
                        width: 50%;
                    }

                    .invoice-footer {
                        padding-left: 32px;
                        padding-right: 32px;
                    }

                    .invoice-footer-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media print {
                    .invoice-root {
                        padding: 0;
                    }
                }

                #invoice-content *,
                #invoice-content {
                    box-sizing: border-box;
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
