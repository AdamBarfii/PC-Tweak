import React, { useState, useEffect } from 'react';
import {
  FileText,
  X,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Search,
  Check,
  Shield,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HostsReport } from '@/types/electron';

interface HostsViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (text: string, type?: 'success' | 'error' | 'warning') => void;
}

export const HostsViewerModal: React.FC<HostsViewerModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const [report, setReport] = useState<HostsReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'custom' | 'loopback'>('all');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const loadHostsReport = async () => {
    if (!window.electronAPI?.getHostsReport) return;
    setIsLoading(true);
    try {
      const data = await window.electronAPI.getHostsReport();
      setReport(data);
    } catch (err: any) {
      onNotify(`Failed to inspect hosts file: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHostsReport();
      setShowConfirmReset(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleResetDefault = async () => {
    if (!window.electronAPI?.restoreDefaultHosts) return;
    setIsResetting(true);
    try {
      const res = await window.electronAPI.restoreDefaultHosts();
      if (res.success) {
        onNotify(res.message, 'success');
        setShowConfirmReset(false);
        await loadHostsReport();
      } else {
        onNotify(res.error || res.message, 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Failed to reset hosts file', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const filteredEntries = (report?.entries || []).filter((entry) => {
    if (entry.isEmpty) return false;

    if (filterType === 'custom' && !entry.isCustom) return false;
    if (filterType === 'loopback' && !entry.isLoopback) return false;

    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    const rawMatch = entry.raw.toLowerCase().includes(q);
    const domainMatch = entry.domain?.toLowerCase().includes(q);
    const ipMatch = entry.ip?.toLowerCase().includes(q);
    const commentMatch = entry.comment?.toLowerCase().includes(q);

    return rawMatch || domainMatch || ipMatch || commentMatch;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-card-foreground animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">
                  {isRtl ? 'مشاهده و پاکسازی فایل Hosts ویندوز' : 'Windows Hosts File Inspector'}
                </h2>
                {!report?.isWritable && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {isRtl ? 'فقط خواندنی (نیازمند ادمین)' : 'Read-Only (Admin Required)'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
                {report?.filePath || 'C:\\Windows\\System32\\drivers\\etc\\hosts'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Metrics Bar */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-muted/10 border-b border-border text-xs">
          <div className="p-3 rounded-xl bg-background/50 border border-border flex flex-col">
            <span className="text-muted-foreground text-[11px]">
              {isRtl ? 'کل خطوط فایل' : 'Total Lines'}
            </span>
            <span className="text-lg font-bold font-mono text-foreground mt-0.5">
              {report?.totalLines || 0}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-background/50 border border-border flex flex-col">
            <span className="text-muted-foreground text-[11px]">
              {isRtl ? 'نگاشت‌های فعال لوکال' : 'Active Local Mappings'}
            </span>
            <span className="text-lg font-bold font-mono text-blue-500 mt-0.5">
              {report?.loopbackMappingsCount || 0}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-background/50 border border-border flex flex-col">
            <span className="text-muted-foreground text-[11px]">
              {isRtl ? 'ریدایرکت‌های سفارشی' : 'Custom Domain Redirects'}
            </span>
            <span
              className={`text-lg font-bold font-mono mt-0.5 ${
                (report?.customMappingsCount || 0) > 0 ? 'text-amber-500' : 'text-emerald-500'
              }`}
            >
              {report?.customMappingsCount || 0}
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-3 bg-card">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={isRtl ? 'جستجوی دامنه یا IP...' : 'Search domain, IP, or comment...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              {isRtl ? 'همه' : 'All'}
            </button>
            <button
              type="button"
              onClick={() => setFilterType('custom')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterType === 'custom'
                  ? 'bg-amber-500 text-white'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              {isRtl ? 'سفارشی' : 'Custom'}
            </button>
            <button
              type="button"
              onClick={() => setFilterType('loopback')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterType === 'loopback'
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              {isRtl ? 'لوکال' : 'Loopback'}
            </button>
            <button
              type="button"
              onClick={loadHostsReport}
              disabled={isLoading}
              title={isRtl ? 'بارگذاری مجدد' : 'Refresh'}
              className="p-1.5 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Entries Table / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin me-2" />
              <span>{isRtl ? 'در حال بارگذاری فایل Hosts...' : 'Reading hosts file...'}</span>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{isRtl ? 'هیچ رکوردی یافت نشد.' : 'No entries found matching criteria.'}</p>
            </div>
          ) : (
            filteredEntries.map((entry, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  entry.isComment
                    ? 'bg-muted/10 border-border/50 text-muted-foreground'
                    : entry.isCustom
                    ? 'bg-amber-500/5 border-amber-500/20 text-foreground'
                    : 'bg-blue-500/5 border-blue-500/20 text-foreground'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="text-[11px] text-muted-foreground w-8 text-end">
                    #{entry.lineIndex}
                  </span>
                  {entry.isComment ? (
                    <span className="text-xs italic text-muted-foreground truncate">
                      {entry.raw}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 overflow-hidden truncate">
                      <span className="font-bold text-primary font-mono text-xs">{entry.ip}</span>
                      <span className="font-semibold text-foreground text-xs">{entry.domain}</span>
                      {entry.comment && (
                        <span className="text-[11px] text-muted-foreground italic truncate">
                          #{entry.comment}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {entry.isComment ? (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                      Comment
                    </span>
                  ) : entry.isCustom ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                      Redirect
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-500 border border-blue-500/30">
                      Loopback
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Confirmation Banner for Default Restore */}
        {showConfirmReset && (
          <div className="p-4 bg-amber-500/10 border-t border-amber-500/30 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>
                {isRtl
                  ? 'آیا مطمئن هستید؟ از فایل فعلی پشتیبان گرفته می‌شود و فایل Hosts به تنظیمات پیش‌فرض و تمیز مایکروسافت بازنشانی خواهد شد.'
                  : 'Are you sure? A timestamped backup will be created in storage/ and the hosts file will be replaced with clean Microsoft defaults.'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirmReset(false)}
                className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                {isRtl ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleResetDefault}
                disabled={isResetting}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition-colors"
              >
                {isResetting && <RefreshCw className="w-3 h-3 animate-spin" />}
                {isRtl ? 'تأیید و بازنشانی' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            {isRtl
              ? 'تغییرات فایل Hosts بر تفکیک نام دامنه‌های محلی ویندوز اثر فوری می‌گذارد.'
              : 'Changes to hosts take immediate effect and automatically flush DNS cache.'}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowConfirmReset(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isRtl ? 'بازنشانی به پیش‌فرض مایکروسافت' : 'Reset to Windows Default'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
            >
              {isRtl ? 'بستن' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
