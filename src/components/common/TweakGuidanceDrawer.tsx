import React from 'react';
import { Target, Search, AlertCircle, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TweakGuidance } from '@/data/tweakGuidance';

interface TweakGuidanceDrawerProps {
  guidance: TweakGuidance;
}

export const TweakGuidanceDrawer: React.FC<TweakGuidanceDrawerProps> = ({ guidance }) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const whenToEnable = isRtl ? guidance.whenToEnableFa : guidance.whenToEnable;
  const whatItAffects = isRtl ? guidance.whatItAffectsFa : guidance.whatItAffects;
  const sideEffects = isRtl ? guidance.sideEffectsFa : guidance.sideEffects;
  const magnitude = isRtl ? guidance.impactMagnitudeFa : guidance.impactMagnitude;

  const getMagnitudeColor = (m: TweakGuidance['impactMagnitude']) => {
    switch (m) {
      case 'Significant':
      case 'System-Wide':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'Noticeable':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'Subtle':
      default:
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="mt-3 p-3.5 rounded-xl bg-muted/40 border border-border space-y-3 text-xs animate-in fade-in duration-200 text-card-foreground">
      {/* Top Bar: Impact Magnitude Badge */}
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-primary" />
          <span className="font-bold text-foreground text-xs">
            {isRtl ? 'راهنمای هوشمند و ارزیابی اثرگذاری' : 'Guidance & Impact Analysis'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {isRtl ? 'میزان اثر:' : 'Impact Magnitude:'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getMagnitudeColor(
              guidance.impactMagnitude
            )}`}
          >
            {magnitude}
          </span>
        </div>
      </div>

      {/* When to enable */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-semibold text-foreground text-[11px]">
          <Target className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>{isRtl ? 'چه زمانی این گزینه را فعال کنیم؟' : 'When to enable this?'}</span>
        </div>
        <p className="text-[11px] text-muted-foreground ps-5 leading-relaxed">
          {whenToEnable}
        </p>
      </div>

      {/* What it affects */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-semibold text-foreground text-[11px]">
          <Search className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span>{isRtl ? 'دقیقاً چه چیزی را تحت تأثیر قرار می‌دهد؟' : 'What does it affect?'}</span>
        </div>
        <p className="text-[11px] text-muted-foreground ps-5 leading-relaxed">
          {whatItAffects}
        </p>
      </div>

      {/* Side effects / Considerations */}
      {sideEffects && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-semibold text-foreground text-[11px]">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>{isRtl ? 'عوارض جانبی یا موارد قابل توجه:' : 'Side effects & trade-offs:'}</span>
          </div>
          <p className="text-[11px] text-muted-foreground ps-5 leading-relaxed">
            {sideEffects}
          </p>
        </div>
      )}
    </div>
  );
};
