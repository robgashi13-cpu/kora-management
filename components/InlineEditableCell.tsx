'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(String(value ?? ''));
  }, [value]);

  const handleStartEdit = () => {
    if (disabled) return;
    setEditValue(String(value ?? ''));
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newValue = type === 'number' ? parseFloat(editValue) || 0 : editValue;
      await onSave(newValue);
      setIsEditing(false);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setIsSaving(false);
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
    <span
      onClick={handleStartEdit}
      className={`inline-editable ${disabled ? 'cursor-default opacity-60' : ''} ${className}`}
      title={disabled ? 'View only' : 'Click to edit'}
    >
      {displayValue}
    </span>
  );
}
