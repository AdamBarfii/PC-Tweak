import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RotateCcw,
  Shield,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { BackupRecord, SystemRestorePoint } from '@/types/electron';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageLoadingState } from '@/components/common/PageLoadingState';

export const BackupView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';
  const [activeTab, setActiveTab] = useState<'snapshots' | 'restorePoints'>('snapshots');
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [restorePoints, setRestorePoints] = useState<SystemRestorePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPoint, setIsCreatingPoint] = useState(false);
  const [newPointDesc, setNewPointDesc] = useState('PC Tweak Manual Snapshot');
  const [selectedBackupForRollback, setSelectedBackupForRollback] = useState<BackupRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async (isBackgroundSync = false) => {
    if (!isBackgroundSync && backups.length === 0 && restorePoints.length === 0) {
      setIsLoading(true);
    }
    try {
      if (window.electronAPI) {
        const [backupList, rpList] = await Promise.all([
          window.electronAPI.listBackups(),
          window.electronAPI.listRestorePoints(),
        ]);
        setBackups(backupList);
        setRestorePoints(rpList);
      }
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateRestorePoint = async () => {
    if (!newPointDesc.trim()) return;
    setIsCreatingPoint(true);
    setStatusMessage(null);
    try {
      const res = await window.electronAPI?.createRestorePoint(newPointDesc);
      if (res?.success) {
        setStatusMessage({ type: 'success', text: res.message });
        loadData();
      } else {
        setStatusMessage({ type: 'error', text: res?.message || 'Failed to create restore point.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Error executing request' });
    } finally {
      setIsCreatingPoint(false);
    }
  };

  const handleRollback = async (backup: BackupRecord) => {
    setSelectedBackupForRollback(backup);
  };

  const executeRollback = async () => {
    if (!selectedBackupForRollback) return;
    try {
      const res = await window.electronAPI?.restoreBackup(selectedBackupForRollback.id);
      if (res?.success) {
        setStatusMessage({ type: 'success', text: 'Backup rolled back successfully.' });
        loadData();
      } else {
        setStatusMessage({ type: 'error', text: res?.error || 'Failed to restore backup' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Error rolling back' });
    } finally {
      setSelectedBackupForRollback(null);
    }
  };

  if (isLoading) {
    return (
      <PageLoadingState
        title={isRtl ? 'در حال بارگذاری پشتیبان‌ها و نقاط بازیابی...' : 'Loading System Backups & Snapshots...'}
        subtitle={
          isRtl
            ? 'در حال خواندن تاریخچه تغییرات رجیستری و نقاط بازیابی ویندوز...'
            : 'Querying atomic registry snapshots and Windows System Restore points...'
        }
        icon={RotateCcw}
        variant="cards"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Tab Switcher & Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl glass-panel">
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'snapshots'
                ? 'neon-btn-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Atomic Rollback Snapshots</span>
            <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded bg-black/20 dark:bg-white/10">({backups.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('restorePoints')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'restorePoints'
                ? 'neon-btn-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Windows Restore Points</span>
            <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded bg-black/20 dark:bg-white/10">({restorePoints.length})</span>
          </button>
        </div>

        <button
          onClick={() => loadData()}
          disabled={isLoading}
          className="p-2 rounded-xl glass-panel text-muted-foreground hover:text-foreground hover:border-cyan-400/40 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-destructive/10 border-destructive/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[11px] font-semibold underline hover:opacity-80 transition-opacity"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Snapshots Tab */}
      {activeTab === 'snapshots' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl glass-chip text-xs text-muted-foreground">
            Every optimization automatically records an exact pre-modification snapshot of altered registry keys and system states. You can revert any operation instantly below.
          </div>

          {backups.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground space-y-2">
              <RotateCcw className="w-8 h-8 opacity-40" />
              <span className="text-xs">No rollback snapshots recorded yet. Apply a tweak to create one.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-xl glass-panel hover:border-cyan-400/40 transition-all flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{b.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          b.status === 'active'
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {b.status === 'active' ? 'Active' : 'Reverted'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono tabular-nums">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {new Date(b.timestamp).toLocaleString()}
                      </span>
                      <span>{b.snapshots?.length || 0} modified keys/values</span>
                    </div>
                  </div>

                  {b.status === 'active' && (
                    <button
                      onClick={() => handleRollback(b)}
                      className="px-3.5 py-1.5 rounded-lg glass-chip hover:border-cyan-400/40 text-foreground text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3 h-3 text-primary" />
                      Rollback
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Windows Restore Points Tab */}
      {activeTab === 'restorePoints' && (
        <div className="space-y-4">
          {/* Create Restore Point Card */}
          <div className="p-4 rounded-xl glass-panel space-y-3">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Create Windows System Restore Point
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPointDesc}
                onChange={(e) => setNewPointDesc(e.target.value)}
                placeholder="Restore point description..."
                className="flex-1 px-3.5 py-1.5 rounded-lg glass-chip text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400 transition-colors"
              />
              <button
                onClick={handleCreateRestorePoint}
                disabled={isCreatingPoint || !newPointDesc.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg neon-btn-primary text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                {isCreatingPoint ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {isCreatingPoint ? 'Creating...' : 'Create Point'}
              </button>
            </div>
          </div>

          {/* List of Restore Points */}
          {restorePoints.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground space-y-2">
              <Shield className="w-8 h-8 opacity-40" />
              <span className="text-xs">No System Restore Points found on this machine.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {restorePoints.map((rp) => (
                <div
                  key={rp.sequenceNumber}
                  className="p-3.5 rounded-lg bg-card border border-border flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">
                      #{rp.sequenceNumber} - {rp.description}
                    </span>
                    <p className="text-[11px] text-muted-foreground font-mono tabular-nums">{rp.creationTime}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-muted border border-border text-muted-foreground font-mono">
                    {rp.restorePointType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog for Rollback */}
      <ConfirmDialog
        isOpen={Boolean(selectedBackupForRollback)}
        title="Rollback Changes?"
        message={`Are you sure you want to revert all changes made by "${
          selectedBackupForRollback?.title || 'this operation'
        }"? Every modified registry key will be restored to its exact prior state.`}
        confirmLabel="Rollback Now"
        cancelLabel="Cancel"
        isDestructive={false}
        onConfirm={executeRollback}
        onCancel={() => setSelectedBackupForRollback(null)}
      />
    </div>
  );
};
