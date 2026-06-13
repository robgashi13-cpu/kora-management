'use client';

import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  primary: 'kx-btn-primary',
  secondary: 'kx-btn-secondary',
  ghost: 'kx-btn-ghost',
  danger: 'kx-btn-danger',
};

const sizeClass: Record<Size, string> = {
  sm: 'kx-btn-sm',
  md: 'kx-btn-md',
  lg: 'kx-btn-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }, ref) => {
    const cls = ['kx-btn', variantClass[variant], sizeClass[size], className].filter(Boolean).join(' ');
    return <button ref={ref} type={type} className={cls} {...rest} />;
  }
);
Button.displayName = 'Button';

export default Button;
