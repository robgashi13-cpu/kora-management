'use client';

import React from 'react';

type Variant = 'default' | 'flat' | 'muted';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantClass: Record<Variant, string> = {
  default: 'kx-card',
  flat: 'kx-card-flat',
  muted: 'kx-card-muted',
};

const paddingClass = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  hover = false,
  padding = 'md',
  className = '',
  children,
  ...rest
}) => {
  const cls = [
    variantClass[variant],
    hover ? 'kx-hover' : '',
    paddingClass[padding],
    className,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div className={`flex items-center justify-between mb-3 ${className}`} {...rest} />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className = '', ...rest }) => (
  // eslint-disable-next-line jsx-a11y/heading-has-content
  <h3 className={`kx-section-title ${className}`} {...rest} />
);

export default Card;
