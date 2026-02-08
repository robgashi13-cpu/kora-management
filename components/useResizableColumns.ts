'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ColumnWidths {
  [key: string]: number;
}

interface UseResizableColumnsOptions {
  storageKey?: string;
  minWidth?: number;
  maxWidth?: number;
  onWidthsChange?: (widths: ColumnWidths) => void;
  onResizeComplete?: (payload: { columnKey: string; oldWidth: number; newWidth: number; widths: ColumnWidths }) => void;
}

export function useResizableColumns(
  defaultWidths: ColumnWidths,
  options: UseResizableColumnsOptions = {}
) {
  const { storageKey = 'table-column-widths', minWidth = 40, maxWidth = 500, onWidthsChange, onResizeComplete } = options;
  
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          return { ...defaultWidths, ...JSON.parse(stored) };
        } catch {
          return defaultWidths;
        }
      }
    }
    return defaultWidths;
  });

  const isResizing = useRef(false);
  const currentColumn = useRef<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    currentColumn.current = columnKey;
    startX.current = e.clientX;
    startWidth.current = columnWidths[columnKey] || defaultWidths[columnKey] || 100;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths, defaultWidths]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current || !currentColumn.current) return;
    
    const diff = e.clientX - startX.current;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + diff));
    
    setColumnWidths(prev => ({
      ...prev,
      [currentColumn.current!]: newWidth
    }));
  }, [minWidth, maxWidth]);

  const handleMouseUp = useCallback(() => {
    if (isResizing.current) {
      const resizedColumn = currentColumn.current;
      const oldWidth = startWidth.current;
      const newWidth = resizedColumn ? (columnWidths[resizedColumn] || oldWidth) : oldWidth;
      isResizing.current = false;
      currentColumn.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (resizedColumn && newWidth !== oldWidth) {
        onResizeComplete?.({ columnKey: resizedColumn, oldWidth, newWidth, widths: columnWidths });
      }
    }
  }, [columnWidths, onResizeComplete]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify(columnWidths));
      onWidthsChange?.(columnWidths);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [columnWidths, storageKey, onWidthsChange]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const resetWidths = useCallback(() => {
    setColumnWidths(defaultWidths);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey);
    }
  }, [defaultWidths, storageKey]);

  const getColumnStyle = useCallback((columnKey: string) => ({
    width: columnWidths[columnKey] || defaultWidths[columnKey] || 100,
    minWidth: minWidth,
    maxWidth: maxWidth,
  }), [columnWidths, defaultWidths, minWidth, maxWidth]);

  return {
    columnWidths,
    setColumnWidths,
    handleMouseDown,
    getColumnStyle,
    resetWidths
  };
}
