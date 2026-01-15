'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ColumnWidths {
  [key: string]: number;
}

interface UseResizableColumnsOptions {
  storageKey?: string;
  minWidth?: number;
  maxWidth?: number;
}

export function useResizableColumns(
  defaultWidths: ColumnWidths,
  options: UseResizableColumnsOptions = {}
) {
  const { storageKey = 'table-column-widths', minWidth = 40, maxWidth = 500 } = options;
  
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
      isResizing.current = false;
      currentColumn.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(columnWidths));
      }
    }
  }, [columnWidths, storageKey]);

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
    handleMouseDown,
    getColumnStyle,
    resetWidths,
    isResizing: isResizing.current
  };
}
