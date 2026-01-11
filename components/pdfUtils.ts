export const waitForImages = async (container: HTMLElement, timeoutMs = 8000): Promise<void> => {
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length === 0) return;

  const loadPromises = images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        cleanup();
        resolve();
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

const sanitizePdfColorFunctions = (value: string) => value
  .replace(/oklch\([^)]*\)/gi, 'rgb(0, 0, 0)')
  .replace(/oklab\([^)]*\)/gi, 'rgb(0, 0, 0)')
  .replace(/lab\([^)]*\)/gi, 'rgb(0, 0, 0)')
  .replace(/color-mix\([^)]*\)/gi, 'rgb(0, 0, 0)')
  .replace(/color\([^)]*\)/gi, 'rgb(0, 0, 0)');

export const sanitizePdfCloneStyles = (clonedDoc: Document) => {
  const styleTags = clonedDoc.querySelectorAll('style');
  styleTags.forEach((styleTag) => {
    if (!styleTag.textContent) return;
    styleTag.textContent = sanitizePdfColorFunctions(styleTag.textContent);
  });

  clonedDoc.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
    const inlineStyle = node.getAttribute('style');
    if (!inlineStyle) return;
    const sanitized = sanitizePdfColorFunctions(inlineStyle);
    if (sanitized !== inlineStyle) {
      node.setAttribute('style', sanitized);
    }
  });
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
