import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImpactLevel } from '@/types/electron';
import { ShieldCheck, Info, AlertTriangle, Flame } from 'lucide-react';

interface ImpactBadgeProps {
  impact: ImpactLevel;
}

export const ImpactBadge: React.FC<ImpactBadgeProps> = ({ impact }) => {
  const { t } = useTranslation();

  const configs: Record<
    ImpactLevel,
    { labelKey: string; color: string; border: string; icon: React.ElementType }
  > = {
    safe: {
      labelKey: 'common.safe',
      color: 'bg-emerald-500/15 text-emerald-400',
      border: 'border-emerald-500/30',
      icon: ShieldCheck,
    },
    moderate: {
      labelKey: 'common.moderate',
      color: 'bg-blue-500/15 text-blue-400',
      border: 'border-blue-500/30',
      icon: Info,
    },
    advanced: {
      labelKey: 'common.advanced',
      color: 'bg-amber-500/15 text-amber-400',
      border: 'border-amber-500/30',
      icon: AlertTriangle,
    },
    extreme: {
      labelKey: 'common.extreme',
      color: 'bg-red-500/15 text-red-400',
      border: 'border-red-500/30',
      icon: Flame,
    },
  };

  const current = configs[impact] || configs.safe;
  const Icon = current.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${current.color} ${current.border}`}
    >
      <Icon className="w-3 h-3" />
      {t(current.labelKey)}
    </span>
  );
};
