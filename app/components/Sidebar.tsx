'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Clock,
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Settings,
  Shield,
  FilePlus2,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  BarChart2,
  AlertTriangle,
} from 'lucide-react';
import { NeonCrownIcon } from './NeonCrownIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { NotificationsBell } from './NotificationsBell';
import { useRouter } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();
  const { t, direction, language, setLanguage } = useLanguage();
  const { logout, user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const isRtl = direction === 'rtl';

  const canUseAi = user?.role === 'super_admin' || user?.package === 'gold';
  const canUseExcel = user?.role === 'super_admin' || (user?.package === 'gold' && (user?.role === 'shop_owner' || user?.role === 'warehouse'));
  const canSeeDashboard = user?.role === 'super_admin' || user?.role === 'shop_owner';
  const canUsePos = user?.role === 'super_admin' || user?.role === 'shop_owner' || user?.role === 'cashier';
  const canUseInventory = user?.role === 'super_admin' || user?.role === 'shop_owner' || user?.role === 'warehouse';
  const canSeeInvoices = user?.role === 'super_admin' || user?.role === 'shop_owner' || user?.role === 'cashier';
  const canSeeSystemAdmin = user?.role === 'super_admin';
  const canSeeStoreAdmin = user?.role === 'shop_owner' || user?.role === 'super_admin';
  const canSeeOnlineOrders = canSeeStoreAdmin || user?.role === 'cashier';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('sidebar-collapsed') === 'true';
    setCollapsed(saved);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', String(next));
    }
  };

  const items = [
    ...(canSeeDashboard ? [{ href: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard }] : []),
    ...(canUseAi
      ? [
          {
            href: '/dashboard?ai=1',
            label: t('ai.title'),
            icon: MessageCircle,
            onClick: () => {
              try {
                localStorage.setItem('crown-open-ai', 'true');
              } catch {
                // ignore
              }
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('crown:open-ai'));
              }
            },
            glow: true,
          },
        ]
      : []),
    ...(canUsePos ? [{ href: '/pos', label: t('nav.pos'), icon: ShoppingCart }] : []),
    ...(canUsePos ? [{ href: '/store-admin/reports', label: t('nav.reports'), icon: BarChart2 }] : []),
    ...(canUseInventory ? [{ href: '/inventory', label: t('nav.inventory'), icon: Package }] : []),
    ...(canUseInventory ? [{ href: '/store-admin/inventory/slow-moving', label: t('nav.slowMoving'), icon: AlertTriangle }] : []),
    ...(canUseInventory ? [{ href: '/manual-entry', label: t('nav.manualEntry'), icon: FilePlus2 }] : []),
    ...(canUseExcel ? [{ href: '/excel-import', label: t('nav.excelImport'), icon: FileSpreadsheet }] : []),
    ...(canSeeInvoices ? [{ href: '/invoices', label: t('nav.invoices'), icon: FileText }] : []),
    { href: '/settings', label: t('nav.settings'), icon: Settings },
    ...(canSeeOnlineOrders ? [{ href: '/store-admin/orders', label: t('nav.onlineOrders'), icon: ShoppingBag }] : []),
    ...(canSeeStoreAdmin || canSeeOnlineOrders ? [{ href: '/store-admin/notifications', label: t('nav.notifications'), icon: Bell }] : []),
    ...(canSeeStoreAdmin ? [{ href: '/store-admin/domains', label: t('nav.storeAdmin'), icon: Shield }] : []),
    ...(canSeeSystemAdmin ? [{ href: '/admin', label: t('nav.admin'), icon: Shield }] : []),
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`md:hidden fixed top-4 ${isRtl ? 'right-4' : 'left-4'} z-50 h-10 w-10 rounded-xl bg-cyan-600 text-white shadow-[0_0_16px_rgba(0,243,255,0.4)] flex items-center justify-center`}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 ${isRtl ? 'right-0' : 'left-0'} z-50 h-full bg-[#0a0f18] border-cyan-500/40 flex flex-col justify-between transition-transform duration-300 md:static md:translate-x-0 ${
          collapsed ? 'md:w-20' : 'md:w-64'
        } w-64 ${isRtl ? 'border-l' : 'border-r'} ${
          open ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Cluster */}
          <div className={`border-b border-cyan-500/20 ${collapsed ? 'px-4 py-6' : 'px-6 py-6'}`}>
            <div className={`flex ${collapsed ? 'justify-center' : 'items-start gap-3'}`}>
              <div className="h-10 w-10 rounded-xl border border-cyan-500/30 bg-black/30 flex items-center justify-center shadow-[0_0_18px_rgba(0,243,255,0.22)]">
                <NeonCrownIcon size={24} />
              </div>

              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="leading-none">
                    <div className="text-[12px] font-black tracking-[0.28em] uppercase text-fuchsia-200">
                      CROWN <span className="text-slate-100">SERVICES</span>
                    </div>
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {/* Live Clock + Notifications Bell */}
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-black/25 px-3 py-1.5 shadow-[0_0_14px_rgba(0,243,255,0.12)]">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-50" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-300 shadow-[0_0_10px_rgba(0,243,255,0.65)]" />
                        </span>
                        <Clock className="h-3.5 w-3.5 text-cyan-300" />
                        <span className="font-mono text-xs text-cyan-200">
                          {now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        </div>
                        {canSeeOnlineOrders && <NotificationsBell />}
                      </div>

                      {/* Language Switcher */}
                      <div className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-black/25 p-1 shadow-[0_0_14px_rgba(0,243,255,0.10)]">
                        <button
                          type="button"
                          onClick={() => setLanguage('ar')}
                          className={`px-3 py-1 rounded-full text-[11px] font-extrabold transition ${
                            language === 'ar' ? 'bg-cyan-400 text-black' : 'text-cyan-100 hover:bg-white/5'
                          }`}
                        >
                          AR
                        </button>
                        <button
                          type="button"
                          onClick={() => setLanguage('en')}
                          className={`px-3 py-1 rounded-full text-[11px] font-extrabold transition ${
                            language === 'en' ? 'bg-cyan-400 text-black' : 'text-cyan-100 hover:bg-white/5'
                          }`}
                        >
                          EN
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-3 hidden md:flex items-center justify-between">
            <button
              onClick={toggleCollapsed}
              className="h-9 w-9 rounded-lg border border-cyan-500/30 text-cyan-300 flex items-center justify-center"
              aria-label="Toggle sidebar size"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <nav className="px-4 py-4 space-y-2">
            {items.map(({ href, label, icon: Icon, onClick, glow }: any) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => {
                    onClick?.();
                    setOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                    glow
                      ? 'bg-fuchsia-500/10 border border-fuchsia-500/40 text-fuchsia-200 shadow-[0_0_16px_rgba(236,72,153,0.35)] hover:bg-fuchsia-500/10'
                      : active
                      ? 'bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 shadow-[0_0_14px_rgba(0,243,255,0.35)]'
                      : 'text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${glow ? 'text-fuchsia-300' : 'text-cyan-300'}`} />
                  {!collapsed && <span className="text-sm font-semibold">{label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="px-4 pb-6 space-y-3">
          <button
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 transition border border-cyan-500/20"
          >
            <LogOut className="h-5 w-5 text-cyan-300" />
            {!collapsed && <span className="text-sm font-semibold">{t('nav.logout')}</span>}
          </button>
          {!collapsed && (
            <div className="text-xs text-slate-500 text-center">
              Crown Services — By Ahmed 2025
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

