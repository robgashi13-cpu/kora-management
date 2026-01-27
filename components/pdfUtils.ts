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
  const isIos = /iP(ad|od|hone)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
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
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
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
};

export const generatePdf = async ({
  element,
  filename,
  onClone,
  pagebreakMode
}: PdfGenerationOptions): Promise<{ pdf: any; blob: Blob; filename: string }> => {
  await waitForImages(element);

  const rect = element.getBoundingClientRect();
  const renderWidth = Math.ceil(rect.width || element.scrollWidth || element.offsetWidth || 0);
  const renderHeight = Math.ceil(rect.height || element.scrollHeight || element.offsetHeight || 0);

  // @ts-ignore
  const html2pdf = (await import('html2pdf.js')).default;
  const opt = {
    margin: 0,
    filename,
    image: { type: 'jpeg' as const, quality: 0.92 },
    html2canvas: {
      scale: 3,
      ...(renderWidth > 0 && renderHeight > 0
        ? {
            width: renderWidth,
            height: renderHeight,
            windowWidth: renderWidth,
            windowHeight: renderHeight
          }
        : {}),
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 10000,
      onclone: (clonedDoc: Document) => {
        sanitizePdfCloneStyles(clonedDoc);
        normalizePdfLayout(clonedDoc);
        onClone?.(clonedDoc);
      }
    },
    jsPDF: {
      unit: 'mm' as const,
      format: 'a4' as const,
      orientation: 'portrait' as const,
      compress: true,
      putOnlyUsedFonts: true
    },
    pagebreak: { mode: pagebreakMode ?? ['css', 'legacy', 'avoid-all'] }
  };

  const fieldData = collectPdfTextFields(element);
  const pdf = await html2pdf().set(opt).from(element).toPdf().get('pdf');
  if (typeof pdf.viewerPreferences === 'function') {
    pdf.viewerPreferences({
      PrintScaling: 'None',
      PickTrayByPDFSize: true
    });
  }
  addPdfFormFields(pdf, fieldData);
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
