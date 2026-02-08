'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Download, Printer, Loader2, Save, RotateCcw, AlertCircle, Check, ArrowLeft } from 'lucide-react';
import { CarSale, ContractType } from '@/app/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import InvoiceDocument from './InvoiceDocument';
import ContractDocument from './ContractDocument';
import StampImage from './StampImage';
import { applyShitblerjeOverrides } from './shitblerjeOverrides';
import { downloadPdfBlob, normalizePdfLayout, sanitizePdfCloneStyles, waitForImages } from './pdfUtils';
import { InvoicePriceSource } from './invoicePricing';

interface EditablePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: CarSale;
  documentType: 'invoice' | 'deposit' | 'full_marreveshje' | 'full_shitblerje';
  onSaveToSale?: (updatedFields: Partial<CarSale>) => void;
  withDogane?: boolean;
  showBankOnly?: boolean;
  taxAmount?: number;
  priceSource?: InvoicePriceSource;
  priceValue?: number;
}

export default function EditablePreviewModal({
  isOpen,
  onClose,
  sale,
  documentType,
  onSaveToSale,
  withDogane = false,
  showBankOnly = false,
  taxAmount,
  priceSource,
  priceValue
}: EditablePreviewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, string | number>>({});
  const [activeEdit, setActiveEdit] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withStamp, setWithStamp] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Initialize editable fields from sale
  useEffect(() => {
    if (isOpen) {
      setEditedFields({
        buyerName: sale.buyerName || '',
        buyerPersonalId: sale.buyerPersonalId || '',
        brand: sale.brand || '',
        model: sale.model || '',
        year: sale.year || new Date().getFullYear(),
        vin: sale.vin || '',
        plateNumber: sale.plateNumber || '',
        km: sale.km || 0,
        color: sale.color || '',
        soldPrice: sale.soldPrice || 0,
        deposit: sale.deposit || 0,
        amountPaidBank: sale.amountPaidBank || 0,
        amountPaidCash: sale.amountPaidCash || 0,
        sellerName: sale.sellerName || '',
        shippingName: sale.shippingName || '',
        shippingDate: sale.shippingDate || '',
      });
      setError(null);
    }
  }, [isOpen, sale]);

  useEffect(() => {
    if (isOpen) {
      setWithStamp(false);
    }
  }, [isOpen, documentType]);

  const getValue = useCallback((key: string) => {
    return editedFields[key] !== undefined ? editedFields[key] : (sale as any)[key];
  }, [editedFields, sale]);

  const handleFieldChange = useCallback((key: string, value: string | number) => {
    setEditedFields(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setEditedFields({
      buyerName: sale.buyerName || '',
      buyerPersonalId: sale.buyerPersonalId || '',
      brand: sale.brand || '',
      model: sale.model || '',
      year: sale.year || new Date().getFullYear(),
      vin: sale.vin || '',
      plateNumber: sale.plateNumber || '',
      km: sale.km || 0,
      color: sale.color || '',
      soldPrice: sale.soldPrice || 0,
      deposit: sale.deposit || 0,
      amountPaidBank: sale.amountPaidBank || 0,
      amountPaidCash: sale.amountPaidCash || 0,
      sellerName: sale.sellerName || '',
      shippingName: sale.shippingName || '',
      shippingDate: sale.shippingDate || '',
    });
  }, [sale]);

  const handleSaveToSale = useCallback(() => {
    if (onSaveToSale) {
      const updates: Partial<CarSale> = {};
      Object.entries(editedFields).forEach(([key, value]) => {
        if ((sale as any)[key] !== value) {
          (updates as any)[key] = value;
        }
      });
      if (Object.keys(updates).length > 0) {
        onSaveToSale(updates);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);
      }
    }
  }, [editedFields, sale, onSaveToSale]);

  const handleDownload = async () => {
    const element = printRef.current;
    if (!element) return;

    try {
      setIsDownloading(true);
      setError(null);
      setStatusMessage(null);

      await new Promise(resolve => setTimeout(resolve, 300));

      const missingFields: string[] = [];
      const requireValue = (key: string, label: string) => {
        const value = getValue(key);
        if (value === undefined || value === null || value === '') {
          missingFields.push(label);
        }
      };
      requireValue('buyerName', 'Buyer Name');
      if (documentType !== 'invoice') {
        requireValue('buyerPersonalId', 'Buyer ID');
      }
      requireValue('brand', 'Brand');
      requireValue('model', 'Model');
      requireValue('vin', 'VIN');
      if (documentType !== 'invoice') {
        requireValue('soldPrice', 'Sold Price');
      }
      if (documentType === 'deposit') {
        requireValue('deposit', 'Deposit Amount');
      }
      if (missingFields.length > 0) {
        setError(`Missing required fields: ${missingFields.join(', ')}`);
        return;
      }

      const opt = {
        margin: 0,
        filename: `${documentType}_${getValue('vin') || 'doc'}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.92 },
        html2canvas: {
          scale: 4,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 10000,
          onclone: (clonedDoc: Document) => {
            sanitizePdfCloneStyles(clonedDoc);
            normalizePdfLayout(clonedDoc);
          }
        },
        jsPDF: {
          unit: 'mm' as const,
          format: 'a4' as const,
          orientation: 'portrait' as const,
          compress: true,
          putOnlyUsedFonts: true
        },
        pagebreak: { mode: ['css', 'legacy', 'avoid-all'] as const }
      };

      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;

      await waitForImages(element);

      if (!Capacitor.isNativePlatform()) {
        const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
        const downloadResult = await downloadPdfBlob(pdfBlob, opt.filename);
        if (!downloadResult.opened) {
          setStatusMessage('Popup blocked. The PDF opened in this tab so you can save or share it.');
        }
      } else {
        const pdfBase64 = await html2pdf().set(opt).from(element).outputPdf('datauristring');
        const fileName = `${documentType}_${getValue('vin') || Date.now()}.pdf`;
        const base64Data = pdfBase64.split(',')[1];

        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
        });

        await Share.share({
          title: `${documentType} - ${getValue('brand')} ${getValue('model')}`,
          text: `Document for ${getValue('vin')}`,
          url: savedFile.uri,
          dialogTitle: 'Download or Share Document'
        });
      }
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(`Download failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    handleDownload();
  };

  const formatCurrency = (val: string | number | undefined | null, fractionDigits = 0): string => {
    if (val === undefined || val === null) return '0';
    const num = typeof val === 'string' ? parseFloat(val) || 0 : (typeof val === 'number' ? val : 0);
    return num.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  };


  // Editable inline field component
  const isInvoice = documentType === 'invoice';
  const canToggleStamp = true;

  const EditableField = ({
    fieldKey,
    className = '',
    prefix = '',
    suffix = '',
    type = 'text'
  }: {
    fieldKey: string;
    className?: string;
    prefix?: string;
    suffix?: string;
    type?: 'text' | 'number' | 'currency' | 'date';
  }) => {
    const value = getValue(fieldKey);
    const isActive = activeEdit === fieldKey;

    const displayValue = type === 'currency'
      ? `${prefix}${formatCurrency(value, isInvoice ? 2 : 2)}${suffix}` // Ensure consistent formatting
      : `${prefix}${value ?? ''}${suffix}`;

    if (isActive) {
      return (
        <input
          type={type === 'currency' || type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => handleFieldChange(fieldKey, type === 'currency' || type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          onBlur={() => setActiveEdit(null)}
          onKeyDown={(e) => e.key === 'Enter' && setActiveEdit(null)}
          autoFocus
          className={`editable-preview-input ${className}`}
          style={{
            background: 'rgba(0, 0, 0, 0.08)',
            border: '1px solid #000000',
            borderRadius: '3px',
            padding: '1px 4px',
            outline: 'none',
            font: 'inherit',
            minWidth: '60px',
            maxWidth: '100%',
            width: '100%'
          }}
        />
      );
    }

    return (
      <span
        onClick={() => !isDownloading && setActiveEdit(fieldKey)}
        className={`editable-preview-field ${className}`}
        style={{
          cursor: isDownloading ? 'text' : 'pointer',
          borderBottom: isDownloading ? 'none' : '1px dashed transparent',
          transition: 'all 0.15s ease',
          display: 'inline-block',
          maxWidth: '100%',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          whiteSpace: 'normal',
          minWidth: isDownloading ? 'auto' : '20px',
          verticalAlign: 'baseline',
          color: 'inherit'
        }}
        title={isDownloading ? undefined : "Click to edit"}
      >
        {displayValue || (isInvoice ? '' : '________________')}
      </span>
    );
  };

  const sourceSale = useMemo(() => {
    if (documentType === 'full_shitblerje') {
      return applyShitblerjeOverrides(sale);
    }
    return sale;
  }, [sale, documentType]);

  const previewSale = useMemo(() => ({
    ...sourceSale,
    ...editedFields
  }), [sourceSale, editedFields]);

  type InvoiceFieldConfig = {
    type: 'number' | 'currency' | 'text' | 'date';
    prefix?: string;
    className?: string;
  };

  const invoiceFieldConfig = useMemo<Partial<Record<keyof CarSale, InvoiceFieldConfig>>>(
    () => ({
      year: { type: 'number' },
      km: { type: 'number' },
      soldPrice: { type: 'currency', prefix: '€' },
      deposit: { type: 'currency', prefix: '€' },
      amountPaidBank: { type: 'currency', prefix: '€' },
      amountPaidCash: { type: 'currency', prefix: '€' },
      shippingDate: { type: 'date' }
    }),
    []
  );

  const renderInvoiceField = useCallback(
    (fieldKey: keyof CarSale, _value: CarSale[keyof CarSale], options?: { className?: string, type?: 'text' | 'number' | 'currency' | 'date' }) => {
      const config = invoiceFieldConfig[fieldKey as keyof typeof invoiceFieldConfig];
      const className = [config?.className, options?.className].filter(Boolean).join(' ');
      const type = options?.type || config?.type || 'text';

      return (
        <EditableField
          fieldKey={String(fieldKey)}
          type={type}
          prefix={config?.prefix ?? ''}
          className={className}
        />
      );
    },
    [invoiceFieldConfig]
  );

  if (!isOpen) return null;

  // Guard against undefined sale
  if (!sale) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50">
        <div className="bg-white rounded-lg p-6">
          <p className="text-slate-500">Loading document...</p>
        </div>
      </div>
    );
  }

  const documentTitle = documentType === 'invoice'
    ? 'Invoice'
    : documentType === 'deposit'
      ? 'Deposit Contract'
      : documentType === 'full_marreveshje'
        ? 'Full Contract - Marrëveshje'
        : 'Full Contract - Shitblerje';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pt-[max(4rem,env(safe-area-inset-top))] bg-slate-900/50 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-5xl h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex justify-between items-center p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-700"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
              <h2 className="text-lg font-bold text-slate-800">
                Preview & Edit {documentTitle}
              </h2>
              <span className="text-xs bg-slate-50 text-slate-900 px-2 py-1 rounded-full font-medium">
                Click any value to edit
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {onSaveToSale && (
                <button
                  onClick={handleSaveToSale}
                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-500 transition-all font-semibold text-[11px] shadow-sm"
                >
                  {showSaveSuccess ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                  {showSaveSuccess ? 'Saved!' : 'Save to Sale'}
                </button>
              )}
              {canToggleStamp && (
                <button
                  type="button"
                  onClick={() => setWithStamp(prev => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all font-semibold text-[11px] ${withStamp
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  aria-pressed={withStamp}
                >
                  <span>Stamp</span>
                  <span className="text-[10px] font-medium">{withStamp ? 'On' : 'Off'}</span>
                </button>
              )}
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-all font-semibold text-[11px]"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-all font-semibold text-[11px] shadow-sm shadow-black/10 disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {isDownloading ? 'Generating...' : 'Download'}
              </button>
              <button
                onClick={handlePrint}
                disabled={isDownloading}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-all font-semibold text-[11px] shadow-sm disabled:opacity-50"
              >
                <Printer className="w-3 h-3" />
                Print
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-50 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {statusMessage && (
            <div className="px-4 py-2 bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
              {statusMessage}
            </div>
          )}
        </div>

        {/* Document Preview */}
        <div className="flex-1 overflow-auto scroll-container bg-slate-100 p-4 md:p-8">
          <div className="flex justify-center">
            {documentType === 'invoice' ? (
              <InvoiceDocument
                sale={previewSale}
                withDogane={withDogane}
                withStamp={withStamp}
                showBankOnly={showBankOnly}
                taxAmount={taxAmount}
                priceSource={priceSource}
                priceValue={priceValue}
                ref={printRef}
                renderField={renderInvoiceField}
              />
            ) : (
              <ContractDocument
                sale={previewSale}
                type={documentType as any}
                withStamp={withStamp}
                documentRef={printRef}
              />
            )}
          </div>
        </div>
      </motion.div>

      <style jsx global>{`
        .editable-preview-field:hover {
          background-color: rgba(0, 0, 0, 0.08);
          border-bottom: 1px dashed #000000 !important;
        }
        @media print {
            body > *:not(.pdf-root) {
                display: none !important;
            }
            .pdf-root {
                display: block !important;
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                box-shadow: none !important;
                z-index: 9999 !important;
                background: white !important;
                overflow: visible !important; /* Ensure content flows */
                height: auto !important;
                min-height: 100vh !important;
            }
            /* Hide the modal UI elements specifically */
            [role="dialog"] > div:first-child, /* Backdrop */
            button, /* All buttons */
            .overflow-y-auto, /* Scroll containers */
            header /* Headers */ {
                display: none !important;
            }
            
            /* Ensure page breaks work */
            .page-break {
                page-break-before: always !important;
                break-before: page !important;
                margin-top: 0 !important;
            }
        }
      `}</style>
    </div>
  );
}
