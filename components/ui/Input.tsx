'use client';

import React from 'react';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...rest }, ref) => (
    <input ref={ref} className={`kx-input ${className}`} {...rest} />
  )
);
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...rest }, ref) => (
    <select ref={ref} className={`kx-select ${className}`} {...rest} />
  )
);
Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...rest }, ref) => (
    <textarea ref={ref} className={`kx-textarea ${className}`} {...rest} />
  )
);
Textarea.displayName = 'Textarea';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className = '', ...rest }) => (
  <label className={`kx-label ${className}`} {...rest} />
);

export default Input;
