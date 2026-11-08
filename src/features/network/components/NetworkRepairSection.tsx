import React, { useState } from 'react';
import {
  Wrench,
  RotateCcw,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  Check,
  AlertOctagon,
  Power,
  Flame,
  Globe,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from 'lucide-react';
import { NetworkAdapterInfo } from '@/types/electron';

interface RepairToolDefinition {
  id: string;
  name: string;
  description: string;
  consequences: string;
  risk: 'safe' | 'moderate' | 'advanced';
  flags: {
    admin: boolean;
    reboot: boolean;
    disconnects: boolean;
  };
}

const repairTools: RepairToolDefinition[] = [
  {
    id: 'flush_dns',
    name: 'Flush DNS Resolver Cache',
    description: 'Clears the local Windows DNS resolver cache to eliminate poisoned, stale, or cached domain records.',
    consequences: 'Safe. Does not interrupt your network or drop existing connections.',
    risk: 'safe',
    flags: { admin: false, reboot: false, disconnects: false },
  },
  {
    id: 'renew_ip',
    name: 'Renew IP Address (DHCP Lease)',
    description: 'Releases and requests a fresh IPv4 lease from your local router or default gateway.',
    consequences: 'Briefly disconnects internet for 2-3 seconds while negotiating a new DHCP IP address.',
    risk: 'moderate',
    flags: { admin: true, reboot: false, disconnects: true },
  },
  {
    id: 'restart_adapter',
    name: 'Restart Network Adapter',
    description: 'Power-cycles the physical network adapter to clear driver FIFO stalls and hardware buffer locks.',
    consequences: 'Disconnects all active network traffic for 3-5 seconds while the driver reloads.',
    risk: 'moderate',
    flags: { admin: true, reboot: false, disconnects: true },
  },
  {
    id: 'reset_winsock',
    name: 'Reset Winsock Catalog',
    description: 'Reconstructs the Windows Sockets (Winsock) API database to recover from corrupted LSP protocol hooks.',
    consequences: 'Requires a computer restart immediately after execution to rebuild the socket catalog.',
    risk: 'moderate',
    flags: { admin: true, reboot: true, disconnects: false },
  },
  {
    id: 'reset_tcpip',
    name: 'Reset TCP/IP Protocol Stack',
    description: 'Rewrites and resets the Windows TCP/IP networking stack back to clean Microsoft factory defaults.',
    consequences: 'Removes all custom IP configuration and static routing. Requires a computer restart.',
    risk: 'advanced',
    flags: { admin: true, reboot: true, disconnects: true },
  },
  {
    id: 'reset_firewall',
    name: 'Reset Windows Defender Firewall Rules',
    description: 'Restores default factory firewall policies, clearing broken or conflicting inbound/outbound rules.',
    consequences: 'Any custom game or application firewall rules will need to be re-allowed upon launch.',
    risk: 'moderate',
    flags: { admin: true, reboot: false, disconnects: false },
  },
];

interface NetworkRepairSectionProps {
  adapter: NetworkAdapterInfo | null;
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
}

export const NetworkRepairSection: React.FC<NetworkRepairSectionProps> = ({ adapter, onNotify }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [executingToolId, setExecutingToolId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<RepairToolDefinition | null>(null);

  const handleToolClick = (tool: RepairToolDefinition) => {
    // Direct run for safe tools with no disconnect or reboot
    if (tool.risk === 'safe' && !tool.flags.disconnects && !tool.flags.reboot) {
      executeTool(tool);
    } else {
      // Require explicit confirmation for disconnects and reboots
      setConfirmModal(tool);
    }
  };

  const executeTool = async (tool: RepairToolDefinition) => {
    if (!window.electronAPI?.executeNetworkRepair) return;
    setExecutingToolId(tool.id);
    setConfirmModal(null);

    try {
      const res = await window.electronAPI.executeNetworkRepair({
        actionId: tool.id,
        adapterName: adapter?.name,
      });

      if (res.success) {
        onNotify(res.message, res.requiresReboot ? 'warning' : 'success');
      } else {
        onNotify(res.error || res.message || 'Tool execution failed.', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Execution error', 'error');
    } finally {
      setExecutingToolId(null);
    }
  };

  const handleOpenRecoveryFolder = async () => {
    if (!window.electronAPI?.openNetworkRecoveryFolder) return;
    try {
      const res = await window.electronAPI.openNetworkRecoveryFolder();
      if (res.success) {
        onNotify(`Safe Mode recovery script ready in: ${res.path}`, 'success');
      } else {
        onNotify(res.error || 'Failed to open recovery folder', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Recovery failed', 'error');
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg backdrop-blur-md overflow-hidden text-card-foreground transition-all">
      {/* Explicit Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-amber-500/50 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 text-card-foreground">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-500">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-foreground">Confirm Repair Action</h3>
                <p className="text-xs font-semibold text-amber-500 font-mono">
                  {confirmModal.name}
                </p>
                <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
                  {confirmModal.consequences}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border text-[11px] text-muted-foreground space-y-1">
              <div>
                <strong className="text-foreground">Target Adapter:</strong>{' '}
                <span className="font-mono text-primary">{adapter?.name || 'All Adapters'}</span>
              </div>
              {confirmModal.flags.reboot && (
                <div className="text-amber-500 font-semibold flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> System reboot will be required.
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeTool(confirmModal)}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-foreground">Repair & Recovery Tools</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-500">
                Recovery
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reset network protocols, repair corrupted Winsock catalogs, flush DNS, and restart network stack.
            </p>
          </div>
        </div>

        <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-border space-y-4 animate-in fade-in duration-150">
          {/* Emergency Safe Mode Recovery Banner */}
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary">Safe Mode Emergency Script</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-primary/20 text-primary font-mono">
                  Network-Recovery.bat
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Pre-generated batch script to restore DHCP, reset Winsock, and flush DNS even if Windows GUI loses connectivity.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenRecoveryFolder}
              className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 transition-colors cursor-pointer self-end sm:self-auto"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Open Recovery Folder
            </button>
          </div>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {repairTools.map((tool) => {
              const isExecuting = executingToolId === tool.id;

              return (
                <div
                  key={tool.id}
                  className="p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-all flex flex-col justify-between gap-3 text-card-foreground"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">{tool.name}</span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            tool.risk === 'safe'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : tool.risk === 'moderate'
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : 'bg-destructive/10 text-destructive border border-destructive/20'
                          }`}
                        >
                          {tool.risk.toUpperCase()}
                        </span>
                        {tool.flags.reboot && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Reboot
                          </span>
                        )}
                        {tool.flags.disconnects && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Brief Drop
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{tool.description}</p>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/60">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {tool.flags.admin ? 'Requires Administrator' : 'Standard User'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToolClick(tool)}
                      disabled={isExecuting}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {isExecuting ? (
                        <>
                          <span className="inline-block w-3 h-3 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                          Running...
                        </>
                      ) : (
                        'Run Repair'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
