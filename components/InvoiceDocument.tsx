'use client';

import React from 'react';
import { CarSale } from '@/app/types';

export interface InvoiceDocumentProps {
    sale: CarSale;
    withDogane?: boolean;
    renderField?: (
        fieldKey: keyof CarSale,
        value: CarSale[keyof CarSale],
        options?: FieldRenderOptions
    ) => React.ReactNode;
}

type FieldRenderOptions = {
    className?: string;
    formatValue?: (value: CarSale[keyof CarSale]) => string;
};

const InvoiceDocument = React.forwardRef<HTMLDivElement, InvoiceDocumentProps>(({ sale, withDogane = false, renderField }, ref) => {
    const renderText = <K extends keyof CarSale>(
        fieldKey: K,
        fallback: React.ReactNode = '',
        options?: FieldRenderOptions
    ) => {
        if (renderField) {
            return renderField(fieldKey, sale[fieldKey], options);
        }
        const value = sale[fieldKey];
        if (value === undefined || value === null || value === '') {
            return fallback;
        }
        if (options?.formatValue) {
            return options.formatValue(value);
        }
        return String(value);
    };

    const renderCurrency = <K extends keyof CarSale>(
        fieldKey: K,
        amount: number,
        options?: FieldRenderOptions
    ) => {
        if (renderField) {
            return renderField(fieldKey, sale[fieldKey], options);
        }
        return `€${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const soldPriceValue = Number(sale.soldPrice || 0);
    const amountPaidBankValue = Number(sale.amountPaidBank || 0);
    const referenceId = (sale.invoiceId || sale.id || sale.vin || '').toString().slice(-8).toUpperCase() || 'N/A';

    return (
        <div
            className="pdf-root invoice-root"
            id="invoice-content"
            ref={ref}
            style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                fontSize: '10pt',
                lineHeight: 1.45,
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: '210mm',
                minHeight: '297mm',
                height: 'auto',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                textRendering: 'optimizeLegibility',
                WebkitFontSmoothing: 'antialiased'
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
                    <h1 style={{ color: '#000000', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.02em' }}>INVOICE</h1>
                    <p style={{ color: '#000000', marginTop: '4px' }}>Ref: {referenceId}</p>
                    <p style={{ color: '#000000', marginTop: '2px' }}>VIN: {renderText('vin', 'N/A')}</p>
                </div>
                <div className="invoice-header-right">
                    <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>RG SH.P.K</div>
                    <div style={{ color: '#000000', fontSize: '0.875rem', lineHeight: 1.6 }}>
                        Rr. Dardania 191<br />
                        Owner: Robert Gashi<br />
                        Phone: +383 48 181 116<br />
                        Nr Biznesit: 810062092
                    </div>
                </div>
            </div>

            {/* Client Info & Dates */}
            <div className="invoice-client" style={{ borderColor: '#000000' }}>
                <div>
                    <h3 style={{ color: '#000000', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Bill To</h3>
                    <div style={{ color: '#000000', fontSize: '0.875rem', fontWeight: 700, wordBreak: 'break-word' }}>
                        {renderText('buyerName')}
                    </div>
                </div>
                <div className="invoice-client-right">
                    <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#000000', fontSize: '0.875rem', marginRight: '16px' }}>Invoice Date:</span>
                        <span style={{ color: '#000000', fontWeight: 500 }}>{new Date().toLocaleDateString()}</span>
                    </div>
                    <div>
                        <span style={{ color: '#000000', fontSize: '0.875rem', marginRight: '16px' }}>Reference:</span>
                        <span style={{ color: '#000000', fontWeight: 700 }}>{referenceId}</span>
                    </div>
                </div>
            </div>

            {/* Line Items */}
            <table className="invoice-table">
                <thead>
                    <tr style={{ borderBottom: '2px solid #000000' }}>
                        <th style={{ color: '#000000', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', padding: '8px 0', textAlign: 'left' }}>Description</th>
                        <th style={{ color: '#000000', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', padding: '8px 0', textAlign: 'right' }}>Total</th>
                    </tr>
                </thead>
                <tbody style={{ color: '#000000' }}>
                    <tr style={{ borderBottom: '1px solid #000000' }}>
                        <td style={{ padding: '12px 0' }}>
                            <div style={{ color: '#000000', fontWeight: 700 }}>
                                {renderText('year', '', { formatValue: (value) => String(value) })}{' '}
                                {renderText('brand')}{' '}
                                {renderText('model')}
                                {withDogane ? ' ME DOGANË' : ''}
                            </div>
                            <div style={{ color: '#000000', fontSize: '0.875rem', display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '4px' }}>
                                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', wordBreak: 'break-all' }}>
                                    VIN: {renderText('vin', '', { className: 'font-mono break-all' })}
                                </span>
                                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>Color: {renderText('color')}</span>
                            </div>
                            <div style={{ color: '#000000', fontSize: '0.875rem', marginTop: '4px', display: 'flex', flexWrap: 'wrap', columnGap: '8px' }}>
                                Mileage: {renderText('km', '0', { formatValue: (value) => Number(value || 0).toLocaleString() })} km
                            </div>
                        </td>
                        <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: '#000000' }}>€{(soldPriceValue - 200).toLocaleString()}</td>
                    </tr>
                    {!withDogane && (
                        <tr style={{ borderBottom: '1px solid #000000' }}>
                            <td style={{ padding: '12px 0' }}>
                                <div style={{ color: '#000000', fontWeight: 700, textTransform: 'uppercase' }}>SHERBIMET DOGANORE PAGUHEN NGA KLIENTI</div>
                            </td>
                            <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: '#000000' }}></td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Totals */}
            <div className="invoice-summary">
                <div style={{ color: '#000000', display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>Subtotal</span>
                    <span>€{(soldPriceValue - 200).toLocaleString()}</span>
                </div>
                <div style={{ color: '#000000', display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span>Services</span>
                    <span>€169.49</span>
                </div>
                <div style={{ color: '#000000', display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #000000', marginBottom: '8px' }}>
                    <span>Tax (TVSH 18%)</span>
                    <span>€30.51</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #000000' }}>
                    <span style={{ color: '#000000', fontWeight: 700, fontSize: '1rem' }}>Grand Total</span>
                    <span style={{ color: '#000000', fontWeight: 700, fontSize: '1rem' }}>
                        {renderCurrency('soldPrice', soldPriceValue, {
                            formatValue: (value) => `€${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        })}
                    </span>
                </div>
            </div>

            {/* Footer */}
            <div className="invoice-footer" style={{ borderColor: '#000000', backgroundColor: '#ffffff' }}>
                <h4 style={{ color: '#000000', fontWeight: 700, fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Payment Details</h4>
                <div className="invoice-footer-grid" style={{ color: '#000000', fontSize: '0.875rem' }}>
                    <div>
                        <div style={{ color: '#000000', fontWeight: 700, marginBottom: '4px' }}>Raiffeisen Bank</div>
                        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', backgroundColor: '#ffffff', padding: '8px', borderRadius: '6px', border: '1px solid #000000', display: 'inline-block' }}>1501080002435404</div>
                        <div style={{ color: '#000000', fontSize: '0.75rem', marginTop: '8px' }}>Account Holder: RG SH.P.K.</div>
                        {amountPaidBankValue > 0 && (
                            <div style={{ color: '#000000', fontWeight: 700, fontSize: '0.875rem' }}>
                                {renderCurrency('amountPaidBank', amountPaidBankValue, {
                                    formatValue: (value) => `€${Number(value || 0).toLocaleString()}`
                                })}
                            </div>
                        )}
                    </div>
                    <div className="invoice-footer-right">
                        <div style={{ color: '#000000', fontWeight: 700, marginBottom: '4px' }}>Contact</div>
                        <div>+383 48 181 116</div>
                        <div style={{ color: '#000000', fontSize: '0.75rem', marginTop: '16px' }}>Thank you for your business!</div>
                    </div>
                </div>
            </div>

            <style>{`
                .invoice-root {
                    padding: 18px;
                }

                .invoice-header {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 20px;
                    align-items: flex-start;
                    margin-bottom: 18px;
                    break-inside: avoid;
                }

                .invoice-header > div,
                .invoice-client > div,
                .invoice-footer-grid > div {
                    min-width: 0;
                }

                .invoice-client {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 20px;
                    align-items: flex-start;
                    margin-bottom: 18px;
                    padding: 12px 0;
                    border-top: 1px solid;
                    border-bottom: 1px solid;
                    break-inside: avoid;
                }

                .invoice-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 18px;
                    break-inside: avoid;
                    table-layout: fixed;
                }

                .invoice-summary {
                    width: 100%;
                    margin-left: auto;
                    break-inside: avoid;
                }

                .invoice-footer {
                    border-top: 1px solid;
                    padding: 18px 18px 12px;
                    margin-top: 18px;
                    break-inside: avoid;
                }

                .invoice-footer-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 32px;
                }

                @media (min-width: 768px) {
                    .invoice-root {
                        padding: 24px;
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
                        padding-left: 24px;
                        padding-right: 24px;
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
                    word-break: break-word;
                }
                #invoice-content tr {
                    break-inside: avoid;
                    page-break-inside: avoid;
                }
                #invoice-content,
                #invoice-content * {
                    color: #000000 !important;
                    text-shadow: none !important;
                    text-decoration: none !important;
                    filter: none !important;
                }
            `}</style>
        </div>
    );
});

InvoiceDocument.displayName = 'InvoiceDocument';

export default InvoiceDocument;
