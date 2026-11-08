import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isLoading?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  colorScheme?: 'primary' | 'blue' | 'red' | 'purple';
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isLoading = false,
  size = 'md',
  ariaLabel,
  className = '',
  colorScheme = 'primary',
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isLoading) return;
    onChange(!checked);
  };

  const isSm = size === 'sm';

  const colorStyles = {
    primary: {
      active: 'bg-primary',
      inactive: 'bg-muted-foreground/30 dark:bg-muted',
      spinner: 'text-primary',
    },
    blue: {
      active: 'bg-blue-600',
      inactive: 'bg-slate-800',
      spinner: 'text-blue-600',
    },
    red: {
      active: 'bg-red-600',
      inactive: 'bg-slate-800',
      spinner: 'text-red-600',
    },
    purple: {
      active: 'bg-purple-600',
      inactive: 'bg-slate-800',
      spinner: 'text-purple-600',
    },
  }[colorScheme];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || (checked ? 'Enabled' : 'Disabled')}
      aria-busy={isLoading}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={`relative inline-flex items-center shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none ${
        isSm ? 'h-5 w-9' : 'h-6 w-11'
      } ${
        checked ? colorStyles.active : colorStyles.inactive
      } ${
        isLoading
          ? 'cursor-wait opacity-80'
          : disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'cursor-pointer'
      } ${className}`}
    >
      <span
        className={`pointer-events-none flex items-center justify-center rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
          isSm ? 'h-4 w-4' : 'h-5 w-5'
        } ${
          isSm
            ? checked ? 'translate-x-4' : 'translate-x-0.5'
            : checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      >
        {isLoading && (
          <Loader2
            className={`animate-spin ${colorStyles.spinner} ${
              isSm ? 'w-2.5 h-2.5' : 'w-3 h-3'
            }`}
          />
        )}
      </span>
    </button>
  );
};
