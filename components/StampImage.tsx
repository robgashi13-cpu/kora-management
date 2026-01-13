'use client';

import React from 'react';

type StampImageProps = {
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
};

const STAMP_SRC = '/stamp.jpeg';

export default function StampImage({ className, style, alt = 'Official Stamp' }: StampImageProps) {
  const [src, setSrc] = React.useState<string>(STAMP_SRC);

  React.useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = STAMP_SRC;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = max;
        const colorDiff = max - min;
        if (brightness > 230 && colorDiff < 25) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      if (!cancelled) {
        setSrc(dataUrl);
      }
    };
    return () => {
      cancelled = true;
    };
  }, []);

  return <img src={src} alt={alt} className={className} style={style} />;
}
