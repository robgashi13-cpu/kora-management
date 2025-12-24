'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, Loader2, X } from 'lucide-react';

interface InlineEditableCellProps {
  value: string | number | undefined;
  onSave: (newValue: string | number) => void;
  type?: 'text' | 'number' | 'date';
  prefix?: string;
  suffix?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  formatDisplay?: (value: string | number | undefined) => string;
}

export default function InlineEditableCell({
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

  const clearSaveTimer = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(String(value ?? ''));
  }, [value]);

  useEffect(() => () => clearSaveTimer(), []);

  const handleStartEdit = () => {
    if (disabled) return;
    setEditValue(String(value ?? ''));
    setSaveState('idle');
    setIsEditing(true);
  };

  const handleSave = async () => {
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
      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 1600);
    }
  };

  const handleCancel = () => {
    setEditValue(String(value ?? ''));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const displayValue = formatDisplay 
    ? formatDisplay(value) 
    : value !== undefined && value !== null && value !== '' 
      ? `${prefix}${type === 'number' ? Number(value).toLocaleString() : value}${suffix}` 
      : placeholder;

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type={type === 'number' ? 'number' : 'text'}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(handleSave, 150)}
          className="inline-editable-input text-sm min-w-[60px] max-w-[120px]"
          disabled={isSaving}
        />
        {isSaving && (
          <span className="inline-flex items-center text-[10px] text-slate-500 gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving
          </span>
        )}
        <button
          onClick={handleSave} 
          className="p-0.5 rounded text-green-600 hover:bg-green-100 transition-colors"
          disabled={isSaving}
        >
          <Check className="w-3 h-3" />
        </button>
        <button 
          onClick={handleCancel} 
          className="p-0.5 rounded text-red-500 hover:bg-red-100 transition-colors"
          disabled={isSaving}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span
        onClick={handleStartEdit}
        className={`inline-editable ${disabled ? 'cursor-default opacity-60' : ''} ${className}`}
        title={disabled ? 'View only' : 'Click to edit'}
      >
        {displayValue}
      </span>
      {saveState !== 'idle' && (
        <span
          className={`text-[10px] font-semibold ${saveState === 'success' ? 'text-emerald-600' : 'text-red-500'}`}
          aria-live="polite"
        >
          {saveState === 'success' ? 'Saved' : 'Failed'}
        </span>
      )}
    </span>
  );
}
