'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Download, Printer, Loader2, Save, RotateCcw, AlertCircle, Check } from 'lucide-react';
import { CarSale } from '@/app/types';
import { motion } from 'framer-motion';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import InvoiceDocument from './InvoiceDocument';
import StampImage from './StampImage';
import { applyShitblerjeOverrides } from './shitblerjeOverrides';
import { downloadPdfBlob, normalizePdfLayout, sanitizePdfCloneStyles, waitForImages } from './pdfUtils';

interface EditablePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: CarSale;
  documentType: 'invoice' | 'deposit' | 'full_marreveshje' | 'full_shitblerje';
  onSaveToSale?: (updatedFields: Partial<CarSale>) => void;
  withDogane?: boolean;
}

export default function EditablePreviewModal({
  isOpen,
  onClose,
  sale,
  documentType,
  onSaveToSale,
  withDogane = false
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
          scale: 3,
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
    type?: 'text' | 'number' | 'currency';
  }) => {
    const value = getValue(fieldKey);
    const isActive = activeEdit === fieldKey;
    
    const displayValue = type === 'currency' 
      ? `${prefix}${formatCurrency(value, isInvoice ? 2 : 0)}${suffix}`
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
            background: 'rgba(59, 130, 246, 0.1)', 
            border: '1px solid #3b82f6',
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
        onClick={() => setActiveEdit(fieldKey)}
        className={`editable-preview-field ${className}`}
        style={{
          cursor: 'pointer',
          borderBottom: isInvoice ? 'none' : '1px dashed #94a3b8',
          transition: 'all 0.15s ease',
          display: 'inline-block',
          maxWidth: '100%',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          whiteSpace: 'normal',
        }}
        title="Click to edit"
      >
        {displayValue || (isInvoice ? '' : '-')}
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
    type: 'number' | 'currency' | 'text';
    prefix?: string;
    className?: string;
  };

  const invoiceFieldConfig = useMemo<Partial<Record<keyof CarSale, InvoiceFieldConfig>>>(
    () => ({
      year: { type: 'number' },
      km: { type: 'number' },
      soldPrice: { type: 'currency', prefix: '€' },
      amountPaidBank: { type: 'currency', prefix: '€' }
    }),
    []
  );

  const renderInvoiceField = useCallback(
    (fieldKey: keyof CarSale, _value: CarSale[keyof CarSale], options?: { className?: string }) => {
      const config = invoiceFieldConfig[fieldKey as keyof typeof invoiceFieldConfig];
      const className = [config?.className, options?.className].filter(Boolean).join(' ');
      return (
        <EditableField
          fieldKey={String(fieldKey)}
          type={config?.type ?? 'text'}
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

  const today = new Date().toLocaleDateString('en-GB');
  const seller = { name: "RG SH.P.K.", id: "Business Nr 810062092", phone: "048181116" };
  const sellerBusinessId = "NR.Biznesit 810062092";
  const fullSellerName = "RG SH.P.K";
  
  const referenceId = (sourceSale.invoiceId || sourceSale.id || sourceSale.vin || '').toString().slice(-8).toUpperCase() || 'N/A';
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
                ref={printRef}
                renderField={renderInvoiceField}
              />
            ) : (
              <div
                ref={printRef}
                className={`bg-white w-[21cm] ${documentType === 'full_marreveshje' ? 'min-h-[29.7cm]' : 'h-[29.7cm]'} shadow-2xl p-[48px] pdf-root box-border`}
                style={{
                  fontFamily: 'Georgia, "Times New Roman", Times, serif',
                  fontSize: '10pt',
                  lineHeight: 1.45,
                  boxSizing: 'border-box',
                  textRendering: 'optimizeLegibility',
                  WebkitFontSmoothing: 'antialiased',
                  overflow: documentType === 'full_marreveshje' ? 'visible' : 'hidden'
                }}
              >
              {documentType === 'deposit' ? (
                  /* Deposit Contract Template */
                  <>
                    <div className="text-center mb-3 pb-2 border-b border-black">
                      <img src="/logo.jpg" className="mx-auto h-12 mb-2" alt="Logo" />
                      <h1 className="text-base font-bold uppercase">KORAUTO</h1>
                      <div className="text-xs font-bold uppercase">KONTRATË PËR KAPAR</div>
                    </div>

                    <div className="flex justify-between mb-3 text-xs">
                      <div>Nr. Ref: <strong>{referenceId}</strong></div>
                      <div>Data: <strong>{today}</strong></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">1. Shitësi:</div>
                        <div className="text-xs space-y-1" style={{ lineHeight: 1.4 }}>
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
                        <div className="text-xs space-y-1" style={{ lineHeight: 1.4 }}>
                          <div className="flex flex-wrap gap-2">
                            <span className="min-w-16 font-semibold">Emri:</span>
                            <strong className="flex-1 break-words"><EditableField fieldKey="buyerName" /></strong>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="min-w-16 font-semibold">Nr. personal:</span>
                            <span className="flex-1 break-words"><EditableField fieldKey="buyerPersonalId" /></span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 1 – Objekti i Kontratës</div>
                      <p className="text-xs mb-1">
                        Shitësi pranon të rezervojë dhe shesë veturën me të dhënat më poshtë, ndërsa blerësi jep një shumë kapari si paradhënie për blerje:
                      </p>
                      <ul className="list-none text-xs font-bold" style={{ lineHeight: 1.5 }}>
                        <li>- Marka: <EditableField fieldKey="brand" /></li>
                        <li>- Modeli: <EditableField fieldKey="model" /></li>
                        <li>- Nr. shasie: <EditableField fieldKey="vin" /></li>
                      </ul>
                    </div>

                    <div className="mb-3">
                      <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 2 – Shuma e Kaparit</div>
                      <p className="text-xs">
                        Blerësi i dorëzon shitësit shumën prej <strong>€<EditableField fieldKey="deposit" type="currency" /></strong> si kapar, që llogaritet si pjesë e pagesës përfundimtare të veturës, e cila kushton <strong>€<EditableField fieldKey="soldPrice" type="currency" /></strong>. Deri ne Prishtine
                      </p>
                    </div>

                    <div className="mb-3">
                      <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 3 – Detyrimet e Palëve</div>
                      <ul className="list-none text-xs" style={{ lineHeight: 1.5 }}>
                        <li>- Shitësi angazhohet të mos e shesë veturën ndonjë pale tjetër për periudhën prej 7 ditësh nga data e nënshkrimit.</li>
                        <li>- Blerësi angazhohet ta përfundojë pagesën dhe ta marrë veturën brenda afatit të caktuar</li>
                      </ul>
                    </div>

                    <div className="mb-3">
                      <div className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">Neni 4 – Anulimi i Marrëveshjes</div>
                      <ul className="list-none text-xs" style={{ lineHeight: 1.5 }}>
                        <li>- Nëse blerësi heq dorë, kapari nuk kthehet.</li>
                        <li>- Nëse shitësi heq dorë ose nuk e përmbush marrëveshjen, është i obliguar të kthejë shumën e kaparit.</li>
                      </ul>
                    </div>

                    <div className="signature-section border-t border-black pt-3">
                      <div className="signature-grid">
                        <div className="signature-column">
                          <div className="signature-label text-xs uppercase font-bold text-gray-600">Shitësi</div>
                          <div className="signature-line-row">
                            <div className="signature-line" />
                          </div>
                          <div className="signature-name text-sm">{seller.name}</div>
                        </div>
                        <div className="signature-column">
                          <div className="signature-label text-xs uppercase font-bold text-gray-600">Blerësi</div>
                          <div className="signature-line-row">
                            <div className="signature-line" />
                          </div>
                          <div className="signature-name text-sm break-words">{getValue('buyerName') || '________________'}</div>
                        </div>
                      </div>
                      {withStamp && (
                        <div className="signature-stamp-row">
                          <StampImage className="signature-stamp" />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {documentType === 'full_marreveshje' && (
                      <div className="max-w-2xl mx-auto text-[8pt] leading-[1.25]">
                        <div className="pdf-page relative">
                          <img src="/logo.jpg" className="contract-logo mx-auto h-12 mb-2" alt="Logo" />
                          <h1 className="text-sm font-bold uppercase mb-2 text-center">MARRËVESHJE INTERNE</h1>
                          <div className="font-bold mb-2">Data: {today}</div>

                          <h2 className="font-bold text-xs mb-2 underline">Marrëveshje për Blerjen e Automjetit</h2>

                          <div className="section mb-3">
                            <div className="font-bold mb-1 underline">Palët Kontraktuese:</div>
                            <ul className="list-disc ml-5 space-y-1">
                              <li>
                                <strong>{fullSellerName}</strong>, me {sellerBusinessId}, i lindur më 13.06.1996 në Prishtinë, në cilësinë e <strong>Shitësit</strong>
                              </li>
                              <li>
                                <strong>Z. <EditableField fieldKey="buyerName" /></strong> ne cilesin e blersit me nr personal <strong><EditableField fieldKey="buyerPersonalId" /></strong>
                              </li>
                            </ul>
                          </div>

                          <div className="section mb-3">
                            <div className="font-bold mb-1 underline">Objekti i Marrëveshjes:</div>
                            <p className="mb-1">Qëllimi i kësaj marrëveshjeje është ndërmjetësimi dhe realizimi i blerjes së automjetit të mëposhtëm:</p>
                          <div className="car-details">
                            <div><span className="label">Marka/Modeli:</span> <span className="value"><EditableField fieldKey="brand" /> <EditableField fieldKey="model" /></span></div>
                            <div><span className="label">Numri i shasisë:</span> <span className="value"><EditableField fieldKey="vin" className="break-all" /></span></div>
                            <div><span className="label">Viti I prodhimi:</span> <span className="value"><EditableField fieldKey="year" type="number" /></span></div>
                            <div><span className="label">KM te kaluara:</span> <span className="value"><EditableField fieldKey="km" type="number" /> km</span></div>
                          </div>
                        </div>

                          <p className="font-bold mt-2 mb-2">
                            {fullSellerName} vepron si shitës, ndërsa <EditableField fieldKey="buyerName" /> si blerës.
                          </p>

                          <hr className="mb-3 border-black" />

                          <h3 className="font-bold text-xs mb-2 underline">Kushtet dhe Termat Kryesore të Marrëveshjes</h3>

                          <ol className="list-decimal ml-5 space-y-2 mb-4">
                            <li>
                              <strong>Pagesa</strong>
                              <ul className="list-[circle] ml-5 mt-0.5">
                                <li>Shuma totale prej € <EditableField fieldKey="amountPaidBank" type="currency" /> do të transferohet në llogarinë bankare të RG SH.P.K</li>
                                <li>Një shumë prej € <EditableField fieldKey="deposit" type="currency" /> do të paguhet në dorë si kapar.</li>
                              </ul>
                            </li>
                            <li>
                              <strong>Nisja dhe Dorëzimi i Automjetit</strong>
                              <ul className="list-[circle] ml-5 mt-0.5">
                                <li>Automjeti do të niset nga Koreja e Jugut më datë <EditableField fieldKey="shippingDate" />.</li>
                                <li>Dorëzimi pritet të realizohet në Portin e Durrësit brenda 35 deri në 45 ditë nga data e nisjes.</li>
                              </ul>
                            </li>
                            <li>
                              <strong>Vonesa në Dorëzim</strong>
                              <ul className="list-[circle] ml-5 mt-0.5">
                                <li>Në rast se automjeti nuk mbërrin brenda afatit të përcaktuar, ndërmjetësi, Z. Robert Gashi, angazhohet të rimbursojë tërësisht shumën prej € <EditableField fieldKey="soldPrice" type="currency" /> brenda 7 ditëve kalendarike.</li>
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

                          <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-500">
                            Faqja 1 nga 3
                          </div>
                        </div>

                        <div className="pdf-page page-break relative">
                          <h2 className="font-bold text-sm mb-3 text-center uppercase">Pjesët e Mbulueshme dhe të Përjashtuara nga Garancia</h2>

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

                          <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-500">
                            Faqja 2 nga 3
                          </div>
                        </div>

                        <div className="pdf-page page-break relative">
                          <h2 className="font-bold text-sm mb-3 text-center uppercase">DISPOZITAT PËRFUNDIMTARE</h2>

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
                                  <div className="break-words"><EditableField fieldKey="buyerName" /></div>
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

                          <div className="mt-8 text-center text-xs text-slate-500">
                            <p>Nr. Ref: {referenceId} | Data: {today}</p>
                          </div>

                          <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-500">
                            Faqja 3 nga 3
                          </div>
                        </div>
                      </div>
                    )}

                    {documentType === 'full_shitblerje' && (
                      <div className="max-w-2xl mx-auto text-[8.5pt] leading-[1.3]">
                        <div className="pdf-page relative">
                          <img src="/logo.jpg" className="mx-auto h-12 mb-2" alt="Logo" />
                          <h1 className="text-sm font-bold uppercase mb-2 text-center">KONTRATË SHITBLERJE</h1>
                          <div className="font-bold mb-2 text-xs">Data: {today}</div>
                          <div className="font-bold mb-2 text-xs">Nr. Ref: {referenceId}</div>

                          <h2 className="font-bold text-xs mb-2 underline">Marrëveshje për Blerjen e Automjetit</h2>

                          <div className="section mb-3">
                            <div className="font-bold mb-1 underline text-xs">Palët Kontraktuese:</div>
                            <ul className="list-disc ml-4 text-xs leading-[1.4]">
                              <li className="mb-1">
                                <strong>{fullSellerName}</strong>, me {sellerBusinessId}, i lindur më 13.06.1996 në Prishtinë, në cilësinë e <strong>Shitësit</strong>
                              </li>
                              <li>
                                <strong>Z. <EditableField fieldKey="buyerName" /></strong> ne cilesin e blersit me nr personal <strong><EditableField fieldKey="buyerPersonalId" /></strong>
                              </li>
                            </ul>
                          </div>

                          <div className="section mb-3">
                            <div className="font-bold mb-1 underline text-xs">Objekti i Marrëveshjes:</div>
                            <p className="mb-1 text-xs">Qëllimi i kësaj marrëveshjeje është ndërmjetësimi dhe realizimi i blerjes së automjetit të mëposhtëm:</p>
                          <div className="car-details text-xs">
                            <div><span className="label">Marka/Modeli:</span> <span className="value"><EditableField fieldKey="brand" /> <EditableField fieldKey="model" /></span></div>
                            <div><span className="label">Numri i shasisë:</span> <span className="value"><EditableField fieldKey="vin" className="break-all" /></span></div>
                            <div><span className="label">Viti I prodhimi:</span> <span className="value"><EditableField fieldKey="year" type="number" /></span></div>
                            <div><span className="label">KM te kaluara:</span> <span className="value"><EditableField fieldKey="km" type="number" /> km</span></div>
                          </div>
                        </div>

                          <p className="font-bold mt-2 mb-2 text-xs">
                            {fullSellerName} vepron si shitës, ndërsa <EditableField fieldKey="buyerName" /> si blerës.
                          </p>

                          <hr className="mb-3 border-black" />

                          <h3 className="font-bold text-xs mb-2 underline">Kushtet dhe Termat Kryesore të Marrëveshjes</h3>

                          <ol className="list-decimal ml-4 text-xs mb-4 leading-[1.4]">
                            <li className="mb-2">
                              <strong>Pagesa</strong>
                              <ul className="list-[circle] ml-4 mt-0.5">
                                <li>Shuma totale prej € <EditableField fieldKey="amountPaidBank" type="currency" /> do të transferohet në llogarinë bankare të RG SH.P.K</li>
                                <li>Një shumë prej € <EditableField fieldKey="deposit" type="currency" /> do të paguhet në dorë si kapar.</li>
                              </ul>
                            </li>
                            <li className="mb-2">
                              <strong>Nisja dhe Dorëzimi i Automjetit</strong>
                              <ul className="list-[circle] ml-4 mt-0.5">
                                <li>AUTOMJETI DORËZOHET NË DATËN: <EditableField fieldKey="shippingDate" /></li>
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
                                <div className="signature-name text-xs break-words"><EditableField fieldKey="buyerName" /></div>
                              </div>
                            </div>
                            {withStamp && (
                              <div className="signature-stamp-row">
                                <StampImage className="signature-stamp" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <style jsx global>{`
        .editable-preview-field:hover {
          background-color: rgba(59, 130, 246, 0.1);
          border-bottom-color: #3b82f6;
        }
        .pdf-page {
          min-height: 27.7cm;
          padding: 1.4cm 1.6cm 1.5cm;
          position: relative;
          box-sizing: border-box;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .page-break {
          page-break-before: always;
          break-before: page;
        }
        .car-details {
          background-color: #f8f9fa;
          border: 1px solid #e9ecef;
          padding: 12pt;
          margin: 10pt 0;
          border-radius: 4pt;
        }
        .car-details div {
          display: grid;
          grid-template-columns: minmax(100px, 35%) minmax(0, 1fr);
          column-gap: 8pt;
          row-gap: 4pt;
          align-items: start;
          margin-bottom: 6pt;
          border-bottom: 1px dashed #ced4da;
          padding-bottom: 4px;
        }
        .car-details .value {
          text-align: right;
          word-break: break-word;
          overflow-wrap: anywhere;
        }
        .car-details div:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }
        .signature-section {
          margin-top: 72px;
          position: relative;
        }
        .signature-grid {
          display: flex;
          gap: 64px;
          width: 664px;
          margin: 0 auto;
        }
        .signature-column {
          width: 300px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
        }
        .signature-label {
          line-height: 20px;
        }
        .signature-line-row {
          position: relative;
          margin-top: 24px;
        }
        .signature-line {
          width: 240px;
          border-bottom: 1px solid #000;
          height: 0;
        }
        .signature-name {
          margin-top: 16px;
          line-height: 20px;
        }
        .signature-stamp-row {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          justify-content: flex-start;
          width: 664px;
          margin: 0;
        }
        .signature-stamp {
          width: 220px;
          height: 220px;
          object-fit: contain;
          margin-left: calc((240px - 220px) / 2 + 12px);
        }
        .label {
          font-weight: bold;
          min-width: 100px;
          display: inline-block;
        }
        table, tr, td, th {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        @media print {
          .page-break {
            page-break-before: always;
            break-before: page;
          }
        }
      `}</style>
    </div>
  );
}
