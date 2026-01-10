'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Check, Loader2, X } from 'lucide-react';

interface InlineEditableCellProps {
  value: string | number | undefined;
  onSave: (newValue: string | number) => Promise<void> | void;
  type?: 'text' | 'number' | 'date';
  prefix?: string;
  suffix?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  formatDisplay?: (value: string | number | undefined) => string;
}

const InlineEditableCell = memo(function InlineEditableCell({
  value,
  onSave,
  type = 'text',
  prefix = '',
  suffix = '',
  className = '',
  placeholder = '-',
  disabled = false,
  formatDisplay
}: InlineEditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ''));
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'success' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(String(value ?? ''));
    }
  }, [value, isEditing]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  const handleStartEdit = useCallback(() => {
    if (disabled || isSaving) return;
    setEditValue(String(value ?? ''));
    setSaveState('idle');
    setIsEditing(true);
  }, [disabled, isSaving, value]);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    
    try {
      const newValue = type === 'number' ? parseFloat(editValue) || 0 : editValue;
      await onSave(newValue);
      setIsEditing(false);
      setSaveState('success');
    } catch (e) {
      console.error('Save failed:', e);
      setSaveState('error');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 1200);
    }
  }, [editValue, onSave, type, clearSaveTimer]);

  const handleCancel = useCallback(() => {
    setEditValue(String(value ?? ''));
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Tab') {
      handleSave();
    }
  }, [handleSave, handleCancel]);

  const handleBlur = useCallback(() => {
    if (!isSavingRef.current) {
      handleSave();
    }
  }, [handleSave]);

  const displayValue = formatDisplay 
    ? formatDisplay(value) 
    : value !== undefined && value !== null && value !== '' 
      ? `${prefix}${type === 'number' ? Number(value).toLocaleString() : value}${suffix}` 
      : placeholder;

  return (
    <span
      ref={containerRef}
      className={`inline-cell-wrapper ${isEditing ? 'inline-cell-editing' : ''} ${isSaving ? 'inline-cell-saving-state' : ''}`}
    >
      {isEditing ? (
        <span className="inline-cell-edit-container">
          <input
            ref={inputRef}
            type={type === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="inline-cell-input"
            disabled={isSaving}
            step={type === 'number' ? 'any' : undefined}
          />
          <span className="inline-cell-actions">
            {isSaving && (
              <span className="inline-cell-saving">
                <Loader2 className="w-3 h-3 animate-spin" />
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="inline-cell-btn inline-cell-btn-save"
              disabled={isSaving}
              aria-label="Save"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-cell-btn inline-cell-btn-cancel"
              disabled={isSaving}
              aria-label="Cancel"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </span>
      ) : (
        <span className="inline-cell-display-wrapper">
          <span
            onClick={handleStartEdit}
            className={`inline-cell-display ${disabled ? 'inline-cell-disabled' : ''} ${className}`}
            title={disabled ? 'View only' : 'Click to edit'}
          >
            {displayValue}
          </span>
          {saveState === 'success' && (
            <span className="inline-cell-feedback inline-cell-feedback-success">
              <Check className="w-2.5 h-2.5" />
            </span>
          )}
          {saveState === 'error' && (
            <span className="inline-cell-feedback inline-cell-feedback-error">!</span>
          )}
        </span>
      )}
    </span>
  );
});

export default InlineEditableCell;
