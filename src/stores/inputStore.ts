import { create } from 'zustand';
import type { OptimizerState, OptimizerTweakItem } from '@/types/electron';
import { useUIStore } from '@/stores/uiStore';

export interface AutoRevertState {
  tweakId: string;
  tweakName: string;
  tweakNameFa: string;
  secondsRemaining: number;
}

export interface InputStoreState {
  optimizerState: OptimizerState | null;
  isLoading: boolean;
  activeTweakIdInProgress: string | null;
  autoRevertDialog: AutoRevertState | null;
  healthAlert: { message: string; messageFa: string } | null;

  // Actions
  loadOptimizerState: () => Promise<void>;
  toggleTweak: (tweakId: string) => Promise<void>;
  revertTweak: (tweakId: string) => Promise<void>;
  confirmAutoRevertKeep: () => void;
  triggerAutoRevertNow: () => Promise<void>;
  undoAll: () => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
  openDisplaySettings: () => Promise<void>;
}

let autoRevertTimer: NodeJS.Timeout | null = null;

export const useInputStore = create<InputStoreState>((set, get) => ({
  optimizerState: null,
  isLoading: true,
  activeTweakIdInProgress: null,
  autoRevertDialog: null,
  healthAlert: null,

  loadOptimizerState: async () => {
    // Only show full loading skeleton if state is not already preloaded
    if (!get().optimizerState) {
      set({ isLoading: true });
    }
    try {
      if (window.electronAPI?.getOptimizerState) {
        const state = await window.electronAPI.getOptimizerState();
        set({ optimizerState: state });
      }
    } catch {}
    set({ isLoading: false });
  },

  toggleTweak: async (tweakId: string) => {
    const { optimizerState } = get();
    if (!optimizerState) return;

    const tweak = optimizerState.tweaks.find((t) => t.id === tweakId);
    if (!tweak || tweak.isInfoOnly || tweak.blockedReason) return;

    set({ activeTweakIdInProgress: tweakId });

    if (tweak.isApplied) {
      // Revert action
      if (window.electronAPI?.revertOptimizerTweak) {
        await window.electronAPI.revertOptimizerTweak(tweakId);
      }
      await get().loadOptimizerState();
      useUIStore.getState().notifyTweakChanged();
      set({ activeTweakIdInProgress: null });
      return;
    }

    // Apply action
    if (window.electronAPI?.applyOptimizerTweak) {
      const res = await window.electronAPI.applyOptimizerTweak(tweakId);
      await get().loadOptimizerState();
      useUIStore.getState().notifyTweakChanged();

      if (res.success && !res.requiresReboot && tweak.risk !== 'safe') {
        // Trigger 15-second Test & Auto-Revert Modal (Rule 1)
        if (autoRevertTimer) {
          clearInterval(autoRevertTimer);
        }

        set({
          autoRevertDialog: {
            tweakId,
            tweakName: tweak.name,
            tweakNameFa: tweak.nameFa,
            secondsRemaining: 15,
          },
        });

        autoRevertTimer = setInterval(async () => {
          const currentDialog = get().autoRevertDialog;
          if (!currentDialog) {
            if (autoRevertTimer) clearInterval(autoRevertTimer);
            return;
          }

          if (currentDialog.secondsRemaining <= 1) {
            if (autoRevertTimer) clearInterval(autoRevertTimer);
            // Time expired -> automatic rollback
            await get().triggerAutoRevertNow();
          } else {
            set({
              autoRevertDialog: {
                ...currentDialog,
                secondsRemaining: currentDialog.secondsRemaining - 1,
              },
            });
          }
        }, 1000);

        // Run silent 3-second input health check (Rule 3)
        if (window.electronAPI?.runSilentHealthCheck) {
          window.electronAPI.runSilentHealthCheck().then((health) => {
            if (!health.passed) {
              get().triggerAutoRevertNow();
              set({
                healthAlert: {
                  message: `Input degradation detected (${health.reason || 'Input stream dropped >30%'}). Tweak automatically reverted.`,
                  messageFa: `افت در عملکرد ورودی شناسایی شد (${health.reason || 'کاهش بیش از ۳۰٪ در تبادل سیگنال'}). تنظیم خودکار بازگردانده شد.`,
                },
              });
            }
          });
        }
      }
    }

    set({ activeTweakIdInProgress: null });
  },

  revertTweak: async (tweakId: string) => {
    set({ activeTweakIdInProgress: tweakId });
    if (window.electronAPI?.revertOptimizerTweak) {
      await window.electronAPI.revertOptimizerTweak(tweakId);
      await get().loadOptimizerState();
      useUIStore.getState().notifyTweakChanged();
    }
    set({ activeTweakIdInProgress: null });
  },

  confirmAutoRevertKeep: () => {
    if (autoRevertTimer) {
      clearInterval(autoRevertTimer);
      autoRevertTimer = null;
    }
    set({ autoRevertDialog: null });
  },

  triggerAutoRevertNow: async () => {
    if (autoRevertTimer) {
      clearInterval(autoRevertTimer);
      autoRevertTimer = null;
    }
    const dialog = get().autoRevertDialog;
    if (dialog && window.electronAPI?.revertOptimizerTweak) {
      await window.electronAPI.revertOptimizerTweak(dialog.tweakId);
      await get().loadOptimizerState();
      useUIStore.getState().notifyTweakChanged();
    }
    set({ autoRevertDialog: null });
  },

  undoAll: async () => {
    set({ isLoading: true });
    if (window.electronAPI?.undoAllOptimizer) {
      const res = await window.electronAPI.undoAllOptimizer();
      await get().loadOptimizerState();
      useUIStore.getState().notifyTweakChanged();
      set({ isLoading: false });
      return res.success;
    }
    set({ isLoading: false });
    return false;
  },

  resetToDefaults: async () => {
    set({ isLoading: true });
    if (window.electronAPI?.resetOptimizerDefaults) {
      const res = await window.electronAPI.resetOptimizerDefaults();
      await get().loadOptimizerState();
      useUIStore.getState().notifyTweakChanged();
      set({ isLoading: false });
      return res.success;
    }
    set({ isLoading: false });
    return false;
  },

  openDisplaySettings: async () => {
    if (window.electronAPI?.openDisplaySettings) {
      await window.electronAPI.openDisplaySettings();
    }
  },
}));
