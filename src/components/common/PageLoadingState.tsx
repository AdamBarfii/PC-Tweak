import React from 'react';
import { Loader2, Zap, LayoutDashboard, Gamepad2, Wifi, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface PageLoadingStateProps {
  title?: string;
  subtitle?: string;
  icon?: React.ElementType;
  variant?: 'dashboard' | 'checklist' | 'cards' | 'network';
}

export const PageLoadingState: React.FC<PageLoadingStateProps> = ({
  title,
  subtitle,
  icon: Icon = Loader2,
  variant = 'dashboard',
}) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const defaultTitle = isRtl ? 'در حال بارگذاری اطلاعات...' : 'Loading Page Data...';
  const defaultSubtitle = isRtl
    ? 'در حال خواندن وضعیت ویندوز و پارامترهای سیستم...'
    : 'Querying Windows subsystem state and telemetry...';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 select-none animate-in fade-in duration-200 text-foreground">
      {/* Fluent Centered Loader Banner */}
      <div className="p-5 rounded-lg bg-card border border-border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <Icon className="w-5 h-5 animate-pulse" />
            </div>
            <div className="absolute -inset-1 rounded-md border-2 border-primary border-t-transparent animate-spin pointer-events-none" />
          </div>

          <div className="space-y-1 text-center sm:text-start">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 justify-center sm:justify-start">
              <span>{title || defaultTitle}</span>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            </h2>
            <p className="text-xs text-muted-foreground">{subtitle || defaultSubtitle}</p>
          </div>
        </div>

        {/* Windows 11 Fluent Activity Indicator Bar */}
        <div className="w-full sm:w-48 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
        </div>
      </div>

      {/* Shimmer Skeleton Views matching variants */}
      {variant === 'dashboard' && (
        <div className="space-y-6">
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-4 rounded-lg bg-card border border-border space-y-3 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="w-20 h-3 bg-muted rounded" />
                  <div className="w-6 h-6 bg-muted rounded-md" />
                </div>
                <div className="w-16 h-8 bg-muted rounded" />
                <div className="w-full h-8 bg-muted/50 rounded-md" />
              </div>
            ))}
          </div>

          {/* Specs Bar Skeleton */}
          <div className="p-4 rounded-lg bg-card border border-border space-y-3 animate-pulse">
            <div className="w-32 h-4 bg-muted rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3 rounded-md bg-muted/40 border border-border/50 h-20" />
              ))}
            </div>
          </div>

          {/* Dual Bottom Cards Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-card border border-border h-48 animate-pulse" />
            <div className="p-4 rounded-lg bg-card border border-border h-48 animate-pulse" />
          </div>
        </div>
      )}

      {variant === 'checklist' && (
        <div className="space-y-6">
          {/* Header Action Skeleton */}
          <div className="h-20 rounded-lg bg-card border border-border animate-pulse" />

          {/* 3 Group Cards Skeleton */}
          {[1, 2, 3].map((g) => (
            <div
              key={g}
              className="rounded-lg border border-border bg-card overflow-hidden shadow-sm animate-pulse"
            >
              <div className="p-4 flex items-center justify-between border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-muted" />
                  <div className="space-y-1">
                    <div className="w-36 h-3.5 bg-muted rounded" />
                    <div className="w-48 h-2.5 bg-muted/60 rounded" />
                  </div>
                </div>
                <div className="w-14 h-5 bg-muted rounded" />
              </div>
              <div className="p-4 space-y-2.5">
                {[1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="p-3 rounded-md bg-muted/30 border border-border/40 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="w-40 h-3 bg-muted rounded" />
                      <div className="w-64 h-2 bg-muted/60 rounded" />
                    </div>
                    <div className="w-10 h-5 bg-muted rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(variant === 'cards' || variant === 'network') && (
        <div className="space-y-6">
          {/* Sub-nav Skeleton */}
          <div className="h-12 rounded-lg bg-card border border-border animate-pulse" />

          {/* Main Card Skeleton */}
          <div className="p-5 rounded-lg bg-card border border-border h-72 animate-pulse space-y-4">
            <div className="w-48 h-4 bg-muted rounded" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-24 bg-muted/40 rounded-md" />
              <div className="h-24 bg-muted/40 rounded-md" />
              <div className="h-24 bg-muted/40 rounded-md" />
            </div>
            <div className="h-24 bg-muted/20 rounded-md" />
          </div>
        </div>
      )}
    </div>
  );
};
