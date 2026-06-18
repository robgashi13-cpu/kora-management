/* ============================================================================
 * 🔒 LOCKED FILE — PDF / DOCUMENT ENGINE
 * Restored to the pre-2026-05-30 baseline by user request.
 * DO NOT MODIFY layout, math, calculations, formatting, fonts, sizes, or
 * print/export behavior. UI redesigns, responsive guardrails, and styling
 * sweeps MUST skip this file. Any change requires an explicit user request
 * that names this file directly.
 * ============================================================================ */

export const waitForImages = async (container: HTMLElement, timeoutMs = 8000): Promise<void> => {
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length === 0) return;

  const loadPromises = images.map((img) => {
    const decodeImage = async () => {
      if (typeof img.decode === 'function') {
        await img.decode();
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      return decodeImage();
    }

    return new Promise<void>((resolve, reject) => {
      const onLoad = async () => {
        cleanup();
        try {
          await decodeImage();
          resolve();
        } catch (error) {
          reject(error);
        }
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

export const isIosSafari = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIpadOsDesktop = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
  const isIosDevice = /iP(ad|od|hone)/.test(ua) || isIpadOsDesktop;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIosDevice && isSafari;
};

export const sanitizePdfCloneStyles = (clonedDoc: Document) => {
  const sanitizeCssText = (cssText: string) => cssText
    .replace(/oklch\([^)]*\)/gi, 'rgb(0, 0, 0)')
    .replace(/oklab\([^)]*\)/gi, 'rgb(0, 0, 0)')
    .replace(/lab\([^)]*\)/gi, 'rgb(0, 0, 0)')
    .replace(/color-mix\([^)]*\)/gi, 'rgb(0, 0, 0)')
    .replace(/color\([^)]*\)/gi, 'rgb(0, 0, 0)');

  const styleTags = clonedDoc.querySelectorAll('style');
  styleTags.forEach((styleTag) => {
    if (!styleTag.textContent) return;
    styleTag.textContent = sanitizeCssText(styleTag.textContent);
  });

  clonedDoc.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
    const style = node.getAttribute('style');
    if (!style) return;
    node.setAttribute('style', sanitizeCssText(style));
  });

  Array.from(clonedDoc.styleSheets).forEach((sheet) => {
    try {
      const rules = Array.from(sheet.cssRules || []);
      if (rules.length === 0) return;
      const cssText = rules.map((rule) => rule.cssText).join('\n');
      const sanitized = sanitizeCssText(cssText);
      if (sanitized === cssText) return;
      const styleEl = clonedDoc.createElement('style');
      styleEl.textContent = sanitized;
      const ownerNode = sheet.ownerNode;
      if (ownerNode?.parentNode) {
        ownerNode.parentNode.insertBefore(styleEl, ownerNode.nextSibling);
        ownerNode.parentNode.removeChild(ownerNode);
      } else {
        clonedDoc.head?.appendChild(styleEl);
      }
    } catch {
      // Ignore cross-origin or inaccessible stylesheet rules.
    }
  });
};

export const normalizePdfLayout = (clonedDoc: Document) => {
  clonedDoc.querySelectorAll<HTMLElement>('[data-pdf-scale-wrapper]').forEach((node) => {
    node.style.transform = 'none';
    node.style.transformOrigin = 'top left';
    node.style.width = '100%';
    node.style.height = 'auto';
  });

  clonedDoc.querySelectorAll<HTMLElement>('.pdf-root').forEach((node) => {
    node.style.boxShadow = 'none';
    node.style.margin = '0';
  });

  clonedDoc.querySelectorAll<HTMLElement>('.shadow-2xl,.shadow-xl,.shadow-lg,.shadow-md,.shadow').forEach((node) => {
    node.style.boxShadow = 'none';
  });

  clonedDoc.querySelectorAll<HTMLElement>('.pdf-root').forEach((node) => {
    node.style.textShadow = 'none';
    node.style.filter = 'none';
  });

  clonedDoc.querySelectorAll<HTMLElement>('.pdf-root *').forEach((node) => {
    node.style.textShadow = 'none';
    node.style.textDecoration = 'none';
    node.style.filter = 'none';
    (node.style as unknown as Record<string, string>).webkitFontSmoothing = 'antialiased';
  });

  if (clonedDoc.body) {
    clonedDoc.body.style.backgroundColor = '#ffffff';
  }
};

export const downloadPdfBlob = async (
  blob: Blob,
  filename: string
): Promise<{ opened: boolean }> => {
  const blobUrl = URL.createObjectURL(blob);
  let opened = true;

  // Use <a> download on all platforms for consistent behavior
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Small delay before cleanup to ensure download starts
  await new Promise(r => setTimeout(r, 100));
  link.remove();

  // Fallback: if on iOS Safari the <a> download may not work, open in new tab
  if (isIosSafari()) {
    const popup = window.open(blobUrl, '_blank');
    if (!popup) {
      opened = false;
      window.location.href = blobUrl;
    }
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  return { opened };
};

export const sharePdfBlob = async ({
  blob,
  filename,
  title,
  text,
  dialogTitle
}: {
  blob: Blob;
  filename: string;
  title?: string;
  text?: string;
  dialogTitle?: string;
}): Promise<{ shared: boolean; opened: boolean }> => {
  const file = new File([blob], filename, { type: 'application/pdf' });

  const { Capacitor } = await import('@capacitor/core');

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64Data = await blobToBase64(blob);
    const filePath = filename || `invoice_${Date.now()}.pdf`;
    const savedFile = await Filesystem.writeFile({
      path: filePath,
      data: base64Data,
      directory: Directory.Documents
    });

    await Share.share({
      title,
      text,
      files: [savedFile.uri],
      dialogTitle
    });
    return { shared: true, opened: true };
  }

  if (typeof window !== 'undefined' && 'navigator' in window) {
    const nav = window.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData) => boolean;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({
        title,
        text,
        files: [file]
      });
      return { shared: true, opened: true };
    }
  }

  const downloadResult = await downloadPdfBlob(blob, filename);
  return { shared: false, opened: downloadResult.opened };
};

export const generateImageBlobFromElement = async ({
  element,
  onClone,
  quality = 0.95
}: {
  element: HTMLElement;
  onClone?: (clonedDoc: Document) => void;
  quality?: number;
}): Promise<Blob> => {
  await waitForImages(element);
  const html2canvas = (await import('html2canvas')).default;

  const rect = element.getBoundingClientRect();
  const width = Math.max(Math.ceil(rect.width), 1);
  const height = Math.max(Math.ceil(rect.height), element.scrollHeight, 1);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    imageTimeout: 10000,
    width,
    height,
    ...({ letterRendering: true } as any),
    onclone: (clonedDoc: Document) => {
      sanitizePdfCloneStyles(clonedDoc);
      normalizePdfLayout(clonedDoc);
      clonedDoc.querySelectorAll<HTMLElement>('.pdf-root, [data-invoice-document], #invoice-content').forEach((el) => {
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
        el.style.minHeight = 'none';
        el.style.height = 'auto';
      });
      onClone?.(clonedDoc);
    }
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', quality));
  if (!blob) {
    throw new Error('Failed to generate image blob.');
  }
  return blob;
};

export const shareImageBlob = async ({
  blob,
  filename,
  title,
  text,
  dialogTitle
}: {
  blob: Blob;
  filename: string;
  title?: string;
  text?: string;
  dialogTitle?: string;
}): Promise<{ shared: boolean; opened: boolean }> => {
  const file = new File([blob], filename, { type: 'image/png' });
  const { Capacitor } = await import('@capacitor/core');

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64Data = await blobToBase64(blob);
    const filePath = filename || `invoice_${Date.now()}.png`;
    const savedFile = await Filesystem.writeFile({
      path: filePath,
      data: base64Data,
      directory: Directory.Documents
    });

    await Share.share({
      title,
      text,
      files: [savedFile.uri],
      dialogTitle
    });
    return { shared: true, opened: true };
  }

  if (typeof window !== 'undefined' && 'navigator' in window) {
    const nav = window.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData) => boolean;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({
        title,
        text,
        files: [file]
      });
      return { shared: true, opened: true };
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  let opened = true;
  if (isIosSafari()) {
    const popup = window.open(blobUrl, '_blank');
    if (!popup) {
      opened = false;
      window.location.href = blobUrl;
    }
  } else {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  return { shared: false, opened };
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode file.'));
        return;
      }
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Failed to encode file.'));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};

export const openPdfBlob = async (blob: Blob): Promise<{ opened: boolean }> => {
  const blobUrl = URL.createObjectURL(blob);
  let opened = true;

  const popup = window.open(blobUrl, '_blank');
  if (!popup) {
    opened = false;
    window.location.href = blobUrl;
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  return { opened };
};

export const printPdfBlob = async (blob: Blob): Promise<{ opened: boolean }> => {
  if (isIosSafari()) {
    return openPdfBlob(blob);
  }

  const blobUrl = URL.createObjectURL(blob);
  let opened = true;
  const popup = window.open(blobUrl, '_blank');
  if (!popup) {
    opened = false;
    window.location.href = blobUrl;
  } else {
    const triggerPrint = () => {
      try {
        popup.focus();
        popup.print();
      } catch {
        // Ignore print errors.
      }
    };
    popup.addEventListener('load', () => {
      setTimeout(triggerPrint, 300);
    });
    setTimeout(triggerPrint, 1500);
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  return { opened };
};

type PdfGenerationOptions = {
  element: HTMLElement;
  filename: string;
  onClone?: (clonedDoc: Document) => void;
  pagebreakMode?: Array<'css' | 'legacy' | 'avoid-all' | 'avoid'>;
  editableText?: boolean;
  /** When true, captures only the actual content height — no forced A4 min-height, avoids blank trailing pages */
  compact?: boolean;
  /** When true, uses single-canvas capture sized to exact content — guarantees 1 page, pixel-perfect match to preview */
  singlePage?: boolean;
};

const trimCanvasBottomWhitespace = (canvas: HTMLCanvasElement, paddingPx = 12): HTMLCanvasElement => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const whiteThreshold = 248;
  const alphaThreshold = 10;

  let lastVisibleRow = height - 1;
  let foundContent = false;

  for (let y = height - 1; y >= 0; y -= 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const index = rowOffset + (x * 4);
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (a > alphaThreshold && (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold)) {
        lastVisibleRow = y;
        foundContent = true;
        break;
      }
    }

    if (foundContent) break;
  }

  if (!foundContent) return canvas;

  const trimmedHeight = Math.min(height, Math.max(1, lastVisibleRow + 1 + paddingPx));
  if (trimmedHeight >= height) return canvas;

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = width;
  trimmedCanvas.height = trimmedHeight;

  const trimmedContext = trimmedCanvas.getContext('2d');
  if (!trimmedContext) return canvas;

  trimmedContext.fillStyle = '#ffffff';
  trimmedContext.fillRect(0, 0, width, trimmedHeight);
  trimmedContext.drawImage(canvas, 0, 0, width, trimmedHeight, 0, 0, width, trimmedHeight);

  return trimmedCanvas;
};

const emitPdfGenerated = (blob: Blob, filename: string, element: HTMLElement) => {
  try {
    if (typeof window === 'undefined') return;
    const docType =
      element.matches('[data-invoice-document]') || element.matches('#invoice-content') || element.matches('.invoice-root')
        ? (filename.toLowerCase().includes('pre-invoice') || filename.toLowerCase().includes('preinvoice') ? 'PRE_INVOICE' : 'INVOICE')
        : element.matches('[data-contract-document][data-contract-type="deposit"]')
        ? 'CONTRACT_DEPOSIT'
        : element.matches('[data-contract-document][data-contract-type="full_marreveshje"]')
        ? 'CONTRACT_MARREVESHJE'
        : element.matches('[data-contract-document][data-contract-type="full_shitblerje"]')
        ? 'CONTRACT_SHITBLERJE'
        : element.matches('[data-contract-document]')
        ? 'CONTRACT'
        : 'PDF';
    const saleId = element.getAttribute('data-sale-id') || element.closest('[data-sale-id]')?.getAttribute('data-sale-id') || null;
    window.dispatchEvent(new CustomEvent('pdf-generated', {
      detail: { blob, filename, docType, saleId, size: blob.size, generatedAt: new Date().toISOString() }
    }));
  } catch (e) {
    // best-effort, never break PDF generation
    console.warn('pdf-generated dispatch failed', e);
  }
};

export const generatePdf = async ({
  element,
  filename,
  onClone,
  pagebreakMode,
  editableText = true,
  compact = false,
  singlePage = false
}: PdfGenerationOptions): Promise<{ pdf: any; blob: Blob; filename: string }> => {
  await waitForImages(element);

  // --- Invoice single-page path: html2canvas + jsPDF, no multi-page logic ---
  if (singlePage) {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    const isLockedDepositPage = element.matches('[data-contract-document][data-contract-type="deposit"]');
    const isLockedContractPage = isLockedDepositPage || element.matches('[data-contract-document][data-contract-type="full_marreveshje"]') || element.matches('[data-contract-document][data-contract-type="full_shitblerje"]');
    const isInvoicePage = element.matches('#invoice-content') || element.matches('.invoice-root');
    const isLockedPage = isLockedContractPage || isInvoicePage;
    const a4WidthPx = Math.round((210 / 25.4) * 96);
    const a4HeightPx = Math.round((297 / 25.4) * 96);
    const captureScale = isLockedPage ? 4 : 2;

    // --- Multi-page locked contract path (e.g. Marrëveshje Interne with page-1/2/3) ---
    const innerPageEls = isLockedContractPage
      ? Array.from(element.querySelectorAll<HTMLElement>('.page-1, .page-2, .page-3, .page-4, .page-5'))
      : [];
    if (isLockedContractPage && innerPageEls.length > 1) {
      const A4_W = 210;
      const A4_H = 297;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        precision: 16,
      });

      for (let i = 0; i < innerPageEls.length; i++) {
        const pageEl = innerPageEls[i];
        const pageCanvas = await html2canvas(pageEl, {
          scale: captureScale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          imageTimeout: 10000,
          width: a4WidthPx,
          height: a4HeightPx,
          windowWidth: a4WidthPx,
          windowHeight: a4HeightPx,
          allowTaint: false,
          ...({ letterRendering: true } as any),
          onclone: (clonedDoc: Document) => {
            sanitizePdfCloneStyles(clonedDoc);
            normalizePdfLayout(clonedDoc);
            clonedDoc.querySelectorAll<HTMLElement>('[data-contract-document]').forEach((el) => {
              el.style.width = '210mm';
              el.style.minWidth = '210mm';
              el.style.maxWidth = '210mm';
              el.style.height = 'auto';
              el.style.minHeight = '0';
              el.style.maxHeight = 'none';
              el.style.overflow = 'visible';
              el.style.margin = '0';
              el.style.boxSizing = 'border-box';
            });
            clonedDoc.querySelectorAll<HTMLElement>('.page-1, .page-2, .page-3, .page-4, .page-5').forEach((el) => {
              el.style.width = '210mm';
              el.style.minWidth = '210mm';
              el.style.maxWidth = '210mm';
              el.style.height = '297mm';
              el.style.minHeight = '297mm';
              el.style.maxHeight = '297mm';
              el.style.overflow = 'hidden';
              el.style.boxSizing = 'border-box';
              el.style.pageBreakBefore = 'auto';
              el.style.breakBefore = 'auto';
            });
            onClone?.(clonedDoc);
          }
        });

        const imgData = pageCanvas.toDataURL('image/png', 1.0);
        if (i > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(imgData, 'PNG', 0, 0, A4_W, A4_H, undefined, 'SLOW');
      }

      if (typeof pdf.viewerPreferences === 'function') {
        pdf.viewerPreferences({
          PrintScaling: 'None',
          PickTrayByPDFSize: true
        });
      }
      const blob = pdf.output('blob');
      emitPdfGenerated(blob, filename, element);
      return { pdf, blob, filename };
    }

    const rect = element.getBoundingClientRect();
    const width = isLockedPage
      ? a4WidthPx
      : Math.max(Math.ceil(rect.width), 1);
    const height = isLockedPage
      ? a4HeightPx
      : Math.max(Math.ceil(rect.height), element.scrollHeight, 1);

    const canvas = await html2canvas(element, {
      scale: captureScale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 10000,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      allowTaint: false,
      ...({ letterRendering: true } as any),
      onclone: (clonedDoc: Document) => {
        sanitizePdfCloneStyles(clonedDoc);
        normalizePdfLayout(clonedDoc);
        clonedDoc.querySelectorAll<HTMLElement>('.pdf-root, [data-invoice-document], #invoice-content, [data-contract-document]').forEach((el) => {
          const isElLocked = el.matches('[data-contract-document][data-contract-type="deposit"]') || el.matches('[data-contract-document][data-contract-type="full_marreveshje"]') || el.matches('[data-contract-document][data-contract-type="full_shitblerje"]') || el.matches('#invoice-content') || el.matches('.invoice-root');
          if (isElLocked) {
            el.style.width = '210mm';
            el.style.minWidth = '210mm';
            el.style.maxWidth = '210mm';
            el.style.height = '297mm';
            el.style.minHeight = '297mm';
            el.style.maxHeight = '297mm';
            el.style.overflow = 'hidden';
            el.style.margin = '0';
            el.style.boxSizing = 'border-box';
            return;
          }

          el.style.overflow = 'visible';
          el.style.maxHeight = 'none';
          el.style.minHeight = '0';
          el.style.height = 'auto';
        });
        onClone?.(clonedDoc);
      }
    });

    const outputCanvas = isLockedPage ? canvas : trimCanvasBottomWhitespace(canvas);
    const imgData = outputCanvas.toDataURL('image/png', 1.0);

    // A4 dimensions in mm
    const A4_W = 210;
    const A4_H = 297;
    const PAGE_INSET_MM = 1.5;
    const CONTENT_W = A4_W - (PAGE_INSET_MM * 2);
    const CONTENT_H = A4_H - (PAGE_INSET_MM * 2);

    // Calculate aspect-ratio-preserving dimensions
    const contentAspect = outputCanvas.width / outputCanvas.height;
    const a4Aspect = CONTENT_W / CONTENT_H;

    let imgW: number, imgH: number;
    if (contentAspect >= a4Aspect) {
      // Content is wider relative to A4 — fit to width
      imgW = CONTENT_W;
      imgH = CONTENT_W / contentAspect;
    } else {
      // Content is taller relative to A4 — fit to height
      imgH = CONTENT_H;
      imgW = CONTENT_H * contentAspect;
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
      precision: 16,
    });

    if (isLockedPage) {
      pdf.addImage(imgData, 'PNG', 0, 0, A4_W, A4_H, undefined, 'SLOW');
    } else {
      const offsetX = (A4_W - imgW) / 2;
      pdf.addImage(imgData, 'PNG', offsetX, PAGE_INSET_MM, imgW, imgH, undefined, 'FAST');
    }
    if (typeof pdf.viewerPreferences === 'function') {
      pdf.viewerPreferences({
        PrintScaling: 'None',
        PickTrayByPDFSize: true
      });
    }

    const blob = pdf.output('blob');
    emitPdfGenerated(blob, filename, element);
    return { pdf, blob, filename };
  }

  // --- Standard multi-page path (contracts, etc.) ---
  const editableFieldData = editableText === false ? null : collectPdfTextFields(element);

  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const BASE_DPI = 96;
  const mmToPx = (mm: number) => (mm / 25.4) * BASE_DPI;
  const fallbackWidthPx = Math.round(mmToPx(A4_WIDTH_MM));
  const fallbackHeightPx = Math.round(mmToPx(A4_HEIGHT_MM));

  const rect = element.getBoundingClientRect();
  const renderWidth = Math.max(
    fallbackWidthPx,
    Math.round(rect.width || element.scrollWidth || element.offsetWidth || 0)
  );
  const fullHeight = Math.max(
    element.scrollHeight || 0,
    element.offsetHeight || 0,
    Math.round(rect.height || 0)
  );
  const compactHeight = fullHeight || fallbackHeightPx;
  const compactOverflowPx = Math.max(0, compactHeight - fallbackHeightPx);
  const renderHeight = compact
    ? (compactOverflowPx > 0 && compactOverflowPx <= 24 ? fallbackHeightPx : compactHeight)
    : Math.max(fallbackHeightPx, fullHeight);

  // @ts-ignore
  const html2pdf = (await import('html2pdf.js')).default;
  const opt = {
    margin: 0,
    filename,
    image: { type: 'jpeg' as const, quality: 0.92 },
    html2canvas: {
      scale: 2,
      width: renderWidth,
      height: renderHeight,
      windowWidth: renderWidth,
      windowHeight: renderHeight,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 10000,
      onclone: (clonedDoc: Document) => {
        sanitizePdfCloneStyles(clonedDoc);
        normalizePdfLayout(clonedDoc);
        clonedDoc.querySelectorAll<HTMLElement>('.pdf-root, [data-contract-document], [data-invoice-document]').forEach((el) => {
          el.style.overflow = 'visible';
          el.style.maxHeight = 'none';
          el.style.height = 'auto';
        });
        onClone?.(clonedDoc);
      }
    },
    jsPDF: {
      unit: 'mm' as const,
      format: 'a4' as const,
      orientation: 'portrait' as const,
      compress: true,
      putOnlyUsedFonts: true,
      precision: 16
    },
    pagebreak: { mode: pagebreakMode ?? ['css', 'legacy', 'avoid-all'] }
  };

  const pdf = await html2pdf().set(opt).from(element).toPdf().get('pdf');
  if (editableFieldData) {
    addPdfFormFields(pdf, editableFieldData);
  }
  if (typeof pdf.viewerPreferences === 'function') {
    pdf.viewerPreferences({
      PrintScaling: 'None',
      PickTrayByPDFSize: true
    });
  }
  const blob = pdf.output('blob');
  return { pdf, blob, filename };
};

type PdfFieldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfTextField = {
  pageIndex: number;
  rect: PdfFieldRect;
  value: string;
  fontSize: number;
  isMultiline: boolean;
};

type PdfPageRect = {
  width: number;
  height: number;
};

export const collectPdfTextFields = (container: HTMLElement): { fields: PdfTextField[]; pageRects: PdfPageRect[] } => {
  const pageElements = Array.from(container.querySelectorAll<HTMLElement>('.pdf-page'));
  const pages = pageElements.length > 0 ? pageElements : [container];
  const fields: PdfTextField[] = [];
  const pageRects: PdfPageRect[] = pages.map((page) => {
    const rect = page.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

  pages.forEach((page, pageIndex) => {
    const pageRect = page.getBoundingClientRect();
    const walker = document.createTreeWalker(
      page,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          const parent = (node as Text).parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('[data-no-pdf-field="true"]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const value = textNode.textContent?.trim();
      if (!value) continue;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const rect = range.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) continue;
      const parent = textNode.parentElement;
      if (!parent) continue;
      const fontSize = Number.parseFloat(window.getComputedStyle(parent).fontSize || '12');
      const isMultiline = rect.height > fontSize * 1.35;
      fields.push({
        pageIndex,
        rect: {
          x: rect.left - pageRect.left,
          y: rect.top - pageRect.top,
          width: rect.width,
          height: rect.height
        },
        value,
        fontSize,
        isMultiline
      });
    }
  });

  return { fields, pageRects };
};

export const addPdfFormFields = (
  pdf: any,
  fieldData: { fields: PdfTextField[]; pageRects: PdfPageRect[] }
) => {
  const TextField = pdf.AcroFormTextField || pdf.AcroForm?.TextField;
  if (!TextField) {
    return pdf;
  }
  const getPageWidth = () => pdf.internal.pageSize.getWidth();
  const getPageHeight = () => pdf.internal.pageSize.getHeight();
  const totalPages = typeof pdf.getNumberOfPages === 'function'
    ? pdf.getNumberOfPages()
    : pdf.internal.getNumberOfPages();

  fieldData.fields.forEach((field, index) => {
    const targetPage = Math.min(field.pageIndex + 1, totalPages);
    pdf.setPage(targetPage);
    const pageRect = fieldData.pageRects[field.pageIndex] ?? fieldData.pageRects[0];
    if (!pageRect) return;
    const pageWidth = getPageWidth();
    const pageHeight = getPageHeight();
    const scaleX = pageWidth / pageRect.width;
    const scaleY = pageHeight / pageRect.height;
    const width = Math.max(4, field.rect.width * scaleX);
    const height = Math.max(4, field.rect.height * scaleY);
    const x = field.rect.x * scaleX;
    const y = pageHeight - (field.rect.y + field.rect.height) * scaleY;

    const textField = new TextField();
    textField.fieldName = `field_${field.pageIndex}_${index}`;
    textField.value = field.value;
    textField.x = x;
    textField.y = y;
    textField.width = width;
    textField.height = height;
    textField.multiline = field.isMultiline;
    textField.fontSize = Math.max(6, Math.min(16, field.fontSize * scaleY));
    pdf.addField(textField);
  });

  return pdf;
};
