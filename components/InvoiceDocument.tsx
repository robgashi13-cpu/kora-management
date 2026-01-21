'use client';

import React from 'react';
import { CarSale } from '@/app/types';
import { applyShitblerjeOverrides } from './shitblerjeOverrides';
import StampImage from './StampImage';

export interface InvoiceDocumentProps {
    sale: CarSale;
    withDogane?: boolean;
    withStamp?: boolean;
    titleLabel?: string;
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

const InvoiceDocument = React.forwardRef<HTMLDivElement, InvoiceDocumentProps>(({ sale, withDogane = false, withStamp = false, titleLabel = 'INVOICE', renderField }, ref) => {
    const displaySale = applyShitblerjeOverrides(sale);
    function renderText<K extends keyof CarSale>(
        fieldKey: K,
        fallback: React.ReactNode = '',
        options?: FieldRenderOptions
    ) {
        if (renderField) {
            return renderField(fieldKey, displaySale[fieldKey], options);
        }
        const value = displaySale[fieldKey];
        if (value === undefined || value === null || value === '') {
            return fallback;
        }
        if (options?.formatValue) {
            return options.formatValue(value);
        }
        return String(value);
    }

    const renderCurrency = <K extends keyof CarSale>(
        fieldKey: K,
        amount: number,
        options?: FieldRenderOptions
    ) => {
        if (renderField) {
            return renderField(fieldKey, displaySale[fieldKey], options);
        }
        return `€${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const soldPriceValue = Number(displaySale.soldPrice || 0);
    const referenceId = (displaySale.invoiceId || displaySale.id || displaySale.vin || '').toString().slice(-8).toUpperCase() || 'N/A';

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
                <div className="invoice-header-left">
                    <img
                        src="/logo.jpg"
                        alt="KORAUTO Logo"
                        style={{ height: '56px', width: 'auto' }}
                    />
                    <div className="invoice-title">
                        <div className="invoice-title-label">{titleLabel}</div>
                        <div className="invoice-title-meta">Ref: {referenceId}</div>
                        <div className="invoice-title-meta">VIN: {renderText('vin', 'N/A')}</div>
                    </div>
                </div>
                <div className="invoice-header-right">
                    <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>RG SH.P.K</div>
                    <div style={{ color: '#000000', fontSize: '0.825rem', lineHeight: 1.55 }}>
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
                    <h3 className="invoice-section-title">Bill To</h3>
                    <div style={{ color: '#000000', fontSize: '0.95rem', fontWeight: 700, wordBreak: 'break-word' }}>
                        {renderText('buyerName')}
                    </div>
                    <div style={{ color: '#000000', fontSize: '0.85rem' }}>
                        {renderText('buyerPersonalId')}
                    </div>
                </div>
                <div className="invoice-client-right">
                    <div className="invoice-meta-line">
                        <span>Invoice Date</span>
                        <span>{new Date().toLocaleDateString()}</span>
                    </div>
                    <div className="invoice-meta-line">
                        <span>Reference</span>
                        <span style={{ fontWeight: 700 }}>{referenceId}</span>
                    </div>
                </div>
            </div>

            {/* Line Items */}
            <table className="invoice-table">
                <thead>
                    <tr>
                        <th style={{ color: '#000000', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', padding: '10px 0', textAlign: 'left' }}>Description</th>
                        <th style={{ color: '#000000', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', padding: '10px 0', textAlign: 'right' }}>Sold Price</th>
                    </tr>
                </thead>
                <tbody style={{ color: '#000000' }}>
                    <tr>
                        <td style={{ padding: '14px 0' }}>
                            <div style={{ color: '#000000', fontWeight: 700 }}>
                                {renderText('year', '', { formatValue: (value) => String(value) })}{' '}
                                {renderText('brand')}{' '}
                                {renderText('model')}
                                {withDogane ? ' ME DOGANË' : ''}
                            </div>
                            <div className="invoice-subline">
                                <span>VIN: {renderText('vin', '', { className: 'font-mono break-all' })}</span>
                                <span>Color: {renderText('color')}</span>
                                <span>Plate: {renderText('plateNumber', '—')}</span>
                            </div>
                            <div className="invoice-subline">
                                Mileage: {renderText('km', '0', { formatValue: (value) => Number(value || 0).toLocaleString() })} km
                            </div>
                        </td>
                        <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 700, color: '#000000' }}>
                            {renderCurrency('soldPrice', soldPriceValue, {
                                formatValue: (value) => `€${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            })}
                        </td>
                    </tr>
                    {!withDogane && (
                        <tr>
                            <td style={{ padding: '10px 0' }}>
                                <div style={{ color: '#000000', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem' }}>SHERBIMET DOGANORE PAGUHEN NGA KLIENTI</div>
                            </td>
                            <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: '#000000' }}></td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Footer */}
            <div className="invoice-footer" style={{ borderColor: '#000000', backgroundColor: '#ffffff' }}>
                <h4 className="invoice-section-title">Payment Details</h4>
                <div className="invoice-footer-grid" style={{ color: '#000000', fontSize: '0.85rem' }}>
                    <div>
                        <div style={{ color: '#000000', fontWeight: 700, marginBottom: '6px' }}>Raiffeisen Bank</div>
                        <div className="invoice-bank-chip">1501080002435404</div>
                        <div style={{ color: '#000000', fontSize: '0.75rem', marginTop: '8px' }}>Account Holder: RG SH.P.K.</div>
                    </div>
                    <div className="invoice-footer-right">
                        <div style={{ color: '#000000', fontWeight: 700, marginBottom: '6px' }}>Contact</div>
                        <div>+383 48 181 116</div>
                        <div style={{ color: '#000000', fontSize: '0.75rem', marginTop: '16px' }}>Thank you for your business!</div>
                    </div>
                </div>
            </div>

            {/* Stamp Section - Only shown when withStamp is true */}
            {
                withStamp && (
                    <div className="invoice-signature">
                        <div className="invoice-signature-line" />
                        <StampImage className="invoice-stamp" />
                    </div>
                )
            }

            <style>{`
                .invoice-root {
                    padding: 48px;
                }

                .invoice-header {
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                    align-items: flex-start;
                    margin-bottom: 16px;
                    break-inside: avoid;
                }

                .invoice-header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }

                .invoice-title {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .invoice-title-label {
                    font-size: 1.1rem;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                }

                .invoice-title-meta {
                    font-size: 0.8rem;
                    color: #000000;
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
                    margin-bottom: 16px;
                    padding: 12px 0 10px;
                    border-top: 1px solid;
                    border-bottom: 1px solid;
                    break-inside: avoid;
                }

                .invoice-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 16px;
                    break-inside: avoid;
                    table-layout: fixed;
                }

                .invoice-table thead tr {
                    border-bottom: 1px solid #000000;
                }

                .invoice-table tbody tr {
                    border-bottom: 1px solid #000000;
                }

                .invoice-subline {
                    color: #000000;
                    font-size: 0.8rem;
                    display: flex;
                    flex-wrap: wrap;
                    column-gap: 16px;
                    row-gap: 4px;
                    margin-top: 4px;
                }

                .invoice-section-title {
                    color: #000000;
                    font-size: 0.75rem;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    margin-bottom: 10px;
                }

                .invoice-meta-line {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    font-size: 0.85rem;
                    color: #000000;
                }

                .invoice-footer {
                    border-top: 1px solid;
                    padding: 16px 18px 12px;
                    margin-top: 16px;
                    break-inside: avoid;
                }

                .invoice-footer-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                }

                .invoice-bank-chip {
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                    background-color: #ffffff;
                    padding: 6px 10px;
                    border-radius: 8px;
                    border: 1px solid #000000;
                    display: inline-block;
                }

                .invoice-signature {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    margin-top: 24px;
                    gap: 12px;
                }

                .invoice-signature-line {
                    width: 220px;
                    border-bottom: 1px solid #000000;
                }

                .invoice-stamp {
                    width: 220px;
                    height: 220px;
                    object-fit: contain;
                    margin-top: -122px;
                }

                @media (min-width: 768px) {
                    .invoice-root {
                        padding: 26px;
                    }

                    .invoice-header {
                        flex-direction: row;
                        justify-content: space-between;
                        align-items: flex-start;
                    }

                    .invoice-header-right,
                    .invoice-client-right,
                    .invoice-footer-right {
                        text-align: right;
                    }

                    .invoice-client {
                        grid-template-columns: 1fr auto;
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
