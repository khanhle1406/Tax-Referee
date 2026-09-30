'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  Scale,
  AlertTriangle,
  BookmarkCheck,
  CheckCheck,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Info,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { SystemNotification } from '@/lib/schemas';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface NotificationCenterViewProps {
  onOpenPolicyModal?: (tab?: string) => void;
  onNavigateView?: (view: string) => void;
  onUnreadChange?: (unreadCount: number) => void;
}

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({
  onOpenPolicyModal,
  onNavigateView,
  onUnreadChange
}) => {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCrawling, setIsCrawling] = useState<boolean>(false);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        onUnreadChange?.(data.unreadCount || 0);
      }
    } catch (e) {
      console.error('Lỗi tải thông báo:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markAllRead' })
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        onUnreadChange?.(0);
        toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
      }
    } catch (e) {
      toast.error('Không thể đánh dấu đã đọc');
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', id })
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      const remainingUnread = notifications.filter((n) => !n.isRead && n.id !== id).length;
      onUnreadChange?.(remainingUnread);
    } catch (e) {
      console.error('Lỗi đánh dấu đã đọc:', e);
    }
  };

  const handleCrawlNow = async () => {
    setIsCrawling(true);
    toast.info('Đang kích hoạt crawler quét các cổng: vanban.chinhphu.vn, mof.gov.vn, gdt.gov.vn...');
    try {
      const res = await fetch('/api/legal-updates', { method: 'POST' });
      const data = await res.json();
      if ((data.found || 0) === 0) {
        toast.info('Tất cả quy chế thuế hiện hành đã được đồng bộ chuẩn mực. Hiện chưa phát hiện văn bản sửa đổi mới.');
      } else {
        toast.success(`Đã quét xong: phát hiện ${data.found} văn bản pháp lý mới.`);
      }
      await loadNotifications();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể kết nối nguồn cào');
    } finally {
      setIsCrawling(false);
    }
  };

  const handleNotificationClick = (item: SystemNotification) => {
    void handleMarkSingleRead(item.id);
    if (!item.link) return;

    if (item.link.startsWith('policy-viewer:')) {
      const targetTab = item.link.split(':')[1];
      onOpenPolicyModal?.(targetTab);
    } else if (item.link === 'reports') {
      onNavigateView?.('reports');
    } else if (item.link === 'inbox') {
      onNavigateView?.('inbox');
    }
  };

  const filtered = notifications.filter((n) => {
    if (filterType === 'ALL') return true;
    return n.type === filterType;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fcfcfc] overflow-hidden select-none">
      {/* Top Header */}
      <div className="px-8 py-6 border-b border-slate-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-900 text-white rounded-xl shadow-xs">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Trung tâm Thông báo & Giám sát Pháp lý
                </h1>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="px-2 py-0.5 text-xs font-mono">
                    {unreadCount} mới
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cập nhật tức thời văn bản pháp luật cào từ Cổng Chính phủ (vanban.chinhphu.vn), Bộ Tài chính, TCT và rủi ro vận hành.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Webhook Realtime: Active</span>
          </div>

          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 text-xs font-medium cursor-pointer shadow-xs transition"
          >
            <CheckCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>Đọc tất cả</span>
          </button>

          <button
            type="button"
            onClick={handleCrawlNow}
            disabled={isCrawling}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-medium cursor-pointer shadow-xs transition"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isCrawling ? 'animate-spin' : ''}`} />
            <span>{isCrawling ? 'Đang quét...' : 'Cào & Quét luật mới'}</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'ALL', label: 'Tất cả thông báo', count: notifications.length },
            { id: 'LEGAL_UPDATE', label: 'Luật & Nghị định mới', count: notifications.filter((n) => n.type === 'LEGAL_UPDATE').length },
            { id: 'INVOICE_RISK', label: 'Giám sát rủi ro', count: notifications.filter((n) => n.type === 'INVOICE_RISK').length },
            { id: 'PRECEDENT', label: 'Tiền lệ duyệt', count: notifications.filter((n) => n.type === 'PRECEDENT').length }
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterType(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                filterType === pill.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{pill.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterType === pill.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {pill.count}
              </span>
            </button>
          ))}
        </div>

        {/* List of Notifications */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Đang tải danh sách thông báo...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 rounded-2xl border border-dashed border-slate-200 bg-white text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Bell className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Không có thông báo nào trong danh mục này</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Bấm nút "Cào & Quét luật mới" phía trên để hệ thống tự động quét các văn bản pháp luật mới nhất.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const isLegal = item.type === 'LEGAL_UPDATE';
              const isRisk = item.type === 'INVOICE_RISK';
              const isPrecedent = item.type === 'PRECEDENT';
              const isSafeRisk = isRisk && (item.metadata?.zone === 'SAFE_GREEN' || item.message.toLowerCase().includes('an toàn'));

              return (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs flex items-start gap-4 ${
                    item.isRead
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-indigo-50/30 border-indigo-200/80 hover:border-indigo-300'
                  }`}
                >
                  {/* Icon */}
                  <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                    isLegal
                      ? 'bg-blue-100 text-blue-800'
                      : isSafeRisk
                      ? 'bg-emerald-100 text-emerald-800'
                      : isRisk
                      ? 'bg-amber-100 text-amber-800'
                      : isPrecedent
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-800'
                  }`}>
                    {isLegal && <Scale className="w-4 h-4" />}
                    {isSafeRisk && <ShieldCheck className="w-4 h-4" />}
                    {isRisk && !isSafeRisk && <ShieldAlert className="w-4 h-4" />}
                    {isPrecedent && <BookmarkCheck className="w-4 h-4" />}
                    {!isLegal && !isRisk && !isPrecedent && <Info className="w-4 h-4" />}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-xs tracking-tight ${
                          item.isRead ? 'text-slate-900' : 'text-slate-950 font-bold'
                        }`}>
                          {item.title}
                        </span>
                        {!item.isRead && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(item.createdAt).toLocaleString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit'
                          })}
                        </span>
                        <Badge variant="outline" className={`text-[10px] font-medium border ${
                          isLegal
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : isSafeRisk
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : isRisk
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : isPrecedent
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-50 text-slate-800 border-slate-200'
                        }`}>
                          {isLegal ? 'Luật mới' : isSafeRisk ? 'An toàn' : isRisk ? 'Cảnh báo' : isPrecedent ? 'Tiền lệ' : 'Hệ thống'}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {item.message}
                    </p>

                    {item.link && (
                      <div className="pt-1 flex items-center gap-1 text-[11px] font-medium text-slate-900 hover:underline">
                        <span>
                          {item.link.startsWith('policy-viewer')
                            ? 'Mở xem chi tiết quy chế & đối chiếu văn bản'
                            : item.link === 'reports'
                            ? 'Xem phân tích chỉ số rủi ro K'
                            : 'Mở chi tiết'}
                        </span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
