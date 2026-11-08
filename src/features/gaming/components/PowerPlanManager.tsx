import React, { useState } from 'react';
import {
  Leaf,
  CheckCircle2,
  Sliders,
  Cpu,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  RefreshCw,
  PlusCircle,
  ToggleLeft,
  ToggleRight,
  HardDrive,
} from 'lucide-react';
import { PowerPlanItem, KeyPowerSettings } from '@/types/electron';

interface PowerPlanManagerProps {
  plans: PowerPlanItem[];
  keySettings: KeyPowerSettings;
  activePlanGuid: string;
  onActivatePlan: (guid: string) => Promise<void>;
  onCreateCustomPlan: () => Promise<void>;
}

export const PowerPlanManager: React.FC<PowerPlanManagerProps> = ({
  plans,
  keySettings,
  activePlanGuid,
  onActivatePlan,
  onCreateCustomPlan,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activatingGuid, setActivatingGuid] = useState<string | null>(null);
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [showAutoSwitchModal, setShowAutoSwitchModal] = useState(false);

  const activePlan = plans.find((p) => p.isActive) || plans.find((p) => p.guid === activePlanGuid) || plans[0];
  const hasCustomPlan = plans.some((p) => p.name.includes('PC Tweak Gaming'));

  const handleActivate = async (guid: string) => {
    setActivatingGuid(guid);
    try {
      await onActivatePlan(guid);
    } finally {
      setActivatingGuid(null);
    }
  };

  const handleCreateCustom = async () => {
    setIsCreatingCustom(true);
    try {
      await onCreateCustomPlan();
    } finally {
      setIsCreatingCustom(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Leaf className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-100">A. Power Plan Manager</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Safe
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage power plans and fine-tune system power settings.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
            {/* Card 1: Current Plan (Large Left Banner) */}
            <div className="lg:col-span-3 rounded-xl p-4 bg-gradient-to-b from-emerald-950/30 to-slate-900/60 border border-emerald-500/30 flex flex-col justify-between relative overflow-hidden">
              <div className="space-y-1 z-10">
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Current Plan</span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Leaf className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-100 truncate" title={activePlan?.name}>
                      {activePlan?.name || 'Balanced'}
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-emerald-500/20 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Power State</span>
                <span className="text-emerald-300 font-mono font-medium">Optimal Clocks</span>
              </div>
            </div>

            {/* Card 2: Available Plans List */}
            <div className="lg:col-span-4 rounded-xl p-4 bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2.5">
                  Available Plans
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {plans.map((plan) => {
                    const isActive = plan.isActive || plan.guid === activePlanGuid;
                    const isBusy = activatingGuid === plan.guid;
                    return (
                      <div
                        key={plan.guid}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                          isActive
                            ? 'bg-blue-500/10 border-blue-500/40 text-blue-200'
                            : 'bg-slate-950/40 border-slate-800/50 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isActive ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                          <span className="text-xs font-medium truncate" title={plan.name}>
                            {plan.name}
                          </span>
                          {isActive && (
                            <span className="text-[10px] text-emerald-400 font-semibold">(Active)</span>
                          )}
                        </div>

                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleActivate(plan.guid)}
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-200 border border-slate-700/60 transition-all cursor-pointer flex-shrink-0"
                          >
                            {isBusy ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Activate'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card 3: Key Settings (Current Real-Time) */}
            <div className="lg:col-span-3 rounded-xl p-4 bg-slate-900/60 border border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2.5">
                Key Settings (Current)
              </span>
              <div className="space-y-2 text-xs">
                {/* Min Processor State */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    Min Processor State
                  </span>
                  <span className="text-slate-200 font-mono font-semibold">
                    {keySettings.minProcessorStateAc}% / {keySettings.minProcessorStateDc}%
                  </span>
                </div>

                {/* Core Parking */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    Core Parking
                  </span>
                  <span className="text-slate-200 font-mono font-semibold">
                    {keySettings.coreParkingText}
                  </span>
                </div>

                {/* USB Selective Suspend */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    USB Selective Suspend
                  </span>
                  <span className={`font-mono font-semibold ${!keySettings.usbSelectiveSuspend ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {keySettings.usbSelectiveSuspend ? 'On (Savings)' : 'Off (Max Perf)'}
                  </span>
                </div>

                {/* PCIe Link State PM */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                    PCIe Link State PM
                  </span>
                  <span className={`font-mono font-semibold ${!keySettings.pcieLinkState ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {keySettings.pcieLinkState ? 'On (Savings)' : 'Off (Max Perf)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4 & 5: Auto-Switch & Custom Plan */}
            <div className="lg:col-span-2 flex flex-col gap-2.5 justify-between">
              {/* Power Plan Auto-Switch */}
              <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-300 block">Power Plan Auto-Switch</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">AC: Balanced | Batt: Saver</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAutoSwitchModal(true)}
                  className="mt-2.5 w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-all cursor-pointer"
                >
                  Configure
                </button>
              </div>

              {/* Custom Plan Creation */}
              <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-blue-200 block">Custom Plan</span>
                  <p className="text-[10px] text-blue-400/80 mt-0.5">PC Tweak Gaming</p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateCustom}
                  disabled={isCreatingCustom}
                  className="mt-2.5 w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isCreatingCustom ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <PlusCircle className="w-3.5 h-3.5" />
                      {hasCustomPlan ? 'Reapply' : 'Create'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto Switch Modal */}
      {showAutoSwitchModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Configure Power Plan Auto-Switch</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automatically switches your power scheme when plugging in or unplugging your laptop charger.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">On AC Power (Plugged in):</label>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200">
                  High Performance / Ultimate
                </div>
              </div>
              <div>
                <label className="text-slate-300 font-semibold block mb-1">On Battery Power:</label>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200">
                  Balanced / Power Saver
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAutoSwitchModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
