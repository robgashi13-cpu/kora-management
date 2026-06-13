'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnOverlay?: boolean;
}

const sizeWidth = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="kx-modal-overlay"
      onClick={() => { if (closeOnOverlay) onClose(); }}
    >
      <div
        className={`kx-modal ${sizeWidth[size]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="kx-modal-header">
            <div className="kx-modal-title">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="kx-btn kx-btn-ghost kx-btn-sm !p-2 !h-8 !w-8"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="kx-modal-body">{children}</div>
        {footer && <div className="kx-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
