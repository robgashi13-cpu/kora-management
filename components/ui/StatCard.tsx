'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  delta?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, delta, className = '' }) => {
  return (
    <div className={`kx-stat kx-fade-up ${className}`}>
      <div className="min-w-0">
        <div className="kx-stat-label truncate">{label}</div>
        <div className="kx-stat-value">{value}</div>
        {delta != null && <div className="kx-stat-delta">{delta}</div>}
      </div>
      {Icon ? (
        <div className="kx-stat-icon">
          <Icon size={18} strokeWidth={1.75} />
        </div>
      ) : null}
    </div>
  );
};

export default StatCard;
