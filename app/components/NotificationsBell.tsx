'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest, useAuth } from '../contexts/AuthContext';

interface Notification {
  id: number;
  type: string;
  source?: string;
  title_ar?: string | null;
  title_en?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  is_read: number;
  meta?: { orderId?: number; invoiceId?: number; saleId?: number; publicCode?: string };
  created_at: string;
}

export function NotificationsBell() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; orderId?: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      try {
        const res = await apiRequest('/notifications/unread-count');
        const n = Number(res?.count ?? 0) || 0;
        if (n > prevCountRef.current && prevCountRef.current > 0) {
          setToast({ msg: language === 'ar' ? 'نشاط جديد!' : 'New activity!' });
          setTimeout(() => setToast(null), 4000);
        }
        prevCountRef.current = n;
        setUnreadCount(n);
      } catch {
        // ignore
      }
    };
    void poll();
    const t = setInterval(poll, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user, language]);

  useEffect(() => {
    if (!user || !open) return;
    setLoadError(false);
    apiRequest('/notifications?limit=10')
        .then((res: any) => {
          const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
          setNotifications(items);
          if (res?.ok === false) setLoadError(true);
        })
        .catch(() => {
          setNotifications([]);
          setLoadError(true);
        });
  }, [user, open]);

  const markRead = async (id: number, navTo?: string) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      prevCountRef.current = Math.max(0, prevCountRef.current - 1);
      if (navTo) {
        router.push(navTo);
        setOpen(false);
      }
    } catch {
      // ignore
    }
  };

  const title = (n: Notification) => (language === 'ar' ? n.title_ar || n.title_en : n.title_en || n.title_ar) || '';
  const body = (n: Notification) => (language === 'ar' ? n.body_ar || n.body_en : n.body_en || n.body_ar) || '';
  const meta = (n: Notification): { orderId?: number; invoiceId?: number; saleId?: number } => {
    const m = n.meta;
    if (typeof m === 'object' && m) {
      return {
        orderId: m.orderId != null ? Number(m.orderId) : undefined,
        invoiceId: m.invoiceId != null ? Number(m.invoiceId) : (m.saleId != null ? Number(m.saleId) : undefined),
      };
    }
    if (typeof m === 'string') try { const p = JSON.parse(m); return { orderId: p?.orderId, invoiceId: p?.invoiceId ?? p?.saleId }; } catch { return {}; }
    return {};
  };

  const getNavLink = (n: Notification): string | null => {
    const { orderId, invoiceId } = meta(n);
    if (orderId) return `/store-admin/orders?focus=${orderId}`;
    if (invoiceId) return `/invoices?focus=${invoiceId}&source=${n.source === 'online' ? 'online' : 'pos'}`;
    return null;
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative p-2 rounded-xl border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 transition"
          aria-label={language === 'ar' ? 'الإشعارات' : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              className="absolute top-full mt-2 right-0 z-50 w-80 max-h-80 overflow-y-auto rounded-xl border border-cyan-500/25 bg-[#0a0f18] shadow-[0_0_24px_rgba(34,211,238,0.2)]"
              dir={language === 'ar' ? 'rtl' : 'ltr'}
            >
              <div className="px-4 py-3 border-b border-cyan-500/15 text-sm font-bold text-cyan-100">
                {language === 'ar' ? 'الإشعارات' : 'Notifications'}
              </div>
              <div className="max-h-64 overflow-y-auto">
                <Link
                  href="/store-admin/notifications"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-xs text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/5 border-b border-cyan-500/10"
                >
                  {language === 'ar' ? 'عرض كل الإشعارات' : 'View all notifications'}
                </Link>
                {loadError ? (
                  <div className="px-4 py-6 text-amber-300 text-sm text-center">
                    {language === 'ar' ? 'فشل تحميل الإشعارات' : 'Failed to load notifications'}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-6 text-slate-400 text-sm text-center">
                    {language === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`w-full text-start px-4 py-3 border-b border-cyan-500/10 hover:bg-cyan-500/5 transition ${
                        n.is_read ? 'text-slate-400' : 'text-slate-100 bg-cyan-500/5'
                      }`}
                    >
                      <button
                        onClick={() => markRead(n.id, getNavLink(n) || undefined)}
                        className="w-full text-start"
                      >
                        <div className="text-sm font-semibold">{title(n)}</div>
                        {body(n) ? <div className="text-xs text-slate-500 mt-1">{body(n)}</div> : null}
                        <div className="text-xs text-slate-500 mt-1">
                          {new Date(n.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                        </div>
                      </button>
                      {getNavLink(n) && (
                        <Link
                          href={getNavLink(n)!}
                          onClick={() => { setOpen(false); }}
                          className="mt-2 inline-block text-xs text-cyan-300 hover:text-cyan-200 underline"
                        >
                          {meta(n).orderId
                            ? (language === 'ar' ? 'عرض الطلب' : 'View order')
                            : (language === 'ar' ? 'عرض الفاتورة' : 'View invoice')}
                        </Link>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-500/25 bg-black/90 backdrop-blur text-cyan-100 text-sm shadow-[0_0_24px_rgba(34,211,238,0.25)]">
          <span>{toast.msg}</span>
          <button
            onClick={() => {
              router.push('/store-admin/notifications');
              setToast(null);
            }}
            className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
          >
            {language === 'ar' ? 'فتح' : 'Open'}
          </button>
        </div>
      )}
    </>
  );
}
