'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({ 
  className, 
  variant = 'rectangular',
  animation = 'pulse',
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      style={style}
      className={cn(
        'bg-white/5 rounded',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4 w-full',
        animation === 'pulse' && 'animate-pulse',
        animation === 'wave' && 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
        className
      )}
      {...props}
    />
  );
}

// Table Row Skeleton for the sales grid
export function TableRowSkeleton({ columns = 17 }: { columns?: number }) {
  return (
    <div className="contents animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="px-2 py-3 border-r border-white/5 flex items-center">
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

// Dashboard Loading Skeleton
export function DashboardSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-[#111111] text-gray-100">
      {/* Header Skeleton */}
      <header className="bg-[#111111]/80 backdrop-blur-xl border-b border-white/5 px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="hidden md:flex gap-2">
              <Skeleton className="h-10 w-24 rounded-xl" />
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="w-8 h-8 rounded-full" />
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <Skeleton className="h-10 w-80 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>
      </header>

      {/* Category Tabs Skeleton */}
      <div className="px-3 py-2 border-b border-white/5 flex gap-2 overflow-x-auto">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-xl flex-shrink-0" />
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="flex-1 overflow-hidden p-3">
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 h-full overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[repeat(17,1fr)] bg-[#151515] border-b border-white/10">
            {Array.from({ length: 17 }).map((_, i) => (
              <div key={i} className="px-2 py-3 border-r border-white/5">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
          
          {/* Table Rows */}
          <div className="divide-y divide-white/5">
            {Array.from({ length: 8 }).map((_, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-[repeat(17,1fr)]" style={{ animationDelay: `${rowIdx * 100}ms` }}>
                {Array.from({ length: 17 }).map((_, colIdx) => (
                  <div key={colIdx} className="px-2 py-4 border-r border-white/5">
                    <Skeleton 
                      className="h-4" 
                      style={{ width: `${60 + Math.random() * 30}%` }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Card Skeleton for landing page
export function CardSkeleton() {
  return (
    <div className="flex-1 bg-[#1a1a1a] border border-white/10 p-12 rounded-3xl animate-pulse">
      <div className="flex flex-col items-center gap-6">
        <Skeleton className="w-24 h-24 rounded-full" />
        <div className="space-y-2 text-center w-full">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    </div>
  );
}
