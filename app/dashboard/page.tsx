'use client';

import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Package, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest, useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { Sidebar } from '../components/Sidebar';
import { AIAssistant } from '../components/AIAssistant';

interface DashboardStats {
  monthlyRevenue: number;
  totalProducts: number;
  lowStockCount: number;
}

interface AnalyticsSummary {
  ok: boolean;
  pos: { total: number; count: number };
  online: { total: number; count: number };
  combined: { total: number; count: number };
}

interface TimeseriesPoint {
  date: string;
  total: number;
  count: number;
}

interface ChartData {
  date: string;
  revenue: number;
  transactions?: number;
  profit?: number;
}

interface LowStockProduct {
  id: number;
  name_en: string;
  name_ar: string;
  stock_quantity: number;
  min_stock_level: number;
  category_name_en?: string;
  category_name_ar?: string;
}

interface RecentProduct {
  id: number;
  name_en: string;
  name_ar: string;
  stock_quantity: number;
  sell_price: number;
}

export default function DashboardPage() {
  const { t, language, direction } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const { format } = useCurrency();
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    monthlyRevenue: 0,
    totalProducts: 0,
    lowStockCount: 0,
  });
  const [salesChartData, setSalesChartData] = useState<ChartData[]>([]);
  const [profitChartData, setProfitChartData] = useState<ChartData[]>([]);
  const [onlineStats, setOnlineStats] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
  const [operationsCount, setOperationsCount] = useState(0);
  const [onlineChartData, setOnlineChartData] = useState<TimeseriesPoint[]>([]);
  const [deadSlowStats, setDeadSlowStats] = useState<{ deadCount: number; slowCount: number; deadValue: number; slowValue: number } | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('crown:last-excel-import');
      if (!raw) return;
      localStorage.removeItem('crown:last-excel-import');
      const payload = JSON.parse(raw);
      if (!payload?.ok) return;

      const imported = Number(payload.importedCount || 0);
      const skipped = Number(payload.skippedCount || 0);
      const fileName = String(payload.fileName || '').trim();

      const msg =
        language === 'ar'
          ? `اكتمل الاستيراد: تمت إضافة ${imported} منتج${skipped ? ` (تم تخطي ${skipped})` : ''}${fileName ? ` — ${fileName}` : ''}`
          : `Import complete: added ${imported} products${skipped ? ` (skipped ${skipped})` : ''}${fileName ? ` — ${fileName}` : ''}`;

      setImportNotice(msg);
      window.setTimeout(() => setImportNotice(null), 6000);
    } catch {
      // ignore
    }
  }, [language]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const [statsData, salesData, profitData, lowStockData, recentData, summaryRes, onlineTimeseriesRes, slowMovingRes] = await Promise.all([
        apiRequest('/dashboard/stats'),
        apiRequest('/dashboard/sales-chart?days=30'),
        apiRequest('/dashboard/profit-chart?days=30'),
        apiRequest('/products/low-stock'),
        apiRequest('/products'),
        apiRequest(`/admin/analytics/summary?from=${firstDay}&to=${today}`).catch(() => ({ ok: false, online: { total: 0, count: 0 } })),
        apiRequest(`/admin/analytics/timeseries?from=${firstDay}&to=${today}&source=online`).catch(() => ({ ok: true, points: [] })),
        apiRequest('/admin/inventory/slow-moving/summary?days=120&threshold=2').catch(() => ({ ok: false, deadCount: 0, slowCount: 0, deadValue: 0, slowValue: 0 })),
      ]);

      setStats(statsData);
      setSalesChartData(salesData);
      setProfitChartData(profitData);
      setLowStockProducts(lowStockData);
      setRecentProducts(recentData.slice(0, 6));
      const summary = summaryRes as AnalyticsSummary;
      setOnlineStats(summary?.ok ? summary.online : { total: 0, count: 0 });
      setOperationsCount(summary?.ok ? (Number(summary.pos?.count ?? 0) + Number(summary.online?.count ?? 0)) : 0);
      setOnlineChartData((onlineTimeseriesRes as { ok?: boolean; points?: TimeseriesPoint[] })?.points ?? []);
      const sm = slowMovingRes as { ok?: boolean; deadCount?: number; slowCount?: number; deadValue?: number; slowValue?: number };
      setDeadSlowStats(sm?.ok ? { deadCount: sm.deadCount ?? 0, slowCount: sm.slowCount ?? 0, deadValue: sm.deadValue ?? 0, slowValue: sm.slowValue ?? 0 } : null);
      try {
        const staffData = await apiRequest('/users');
        setStaffCount(Array.isArray(staffData) ? staffData.length : 0);
      } catch (err) {
        setStaffCount(null);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ar-SA', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const chartSalesData = salesChartData;
  const chartProfitData = profitChartData;

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        {importNotice && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200 shadow-[0_0_18px_rgba(34,197,94,0.16)] flex items-start justify-between gap-4">
            <div className="font-semibold">{importNotice}</div>
            <button
              type="button"
              onClick={() => setImportNotice(null)}
              className="text-green-200/80 hover:text-green-100 text-xs"
            >
              {language === 'ar' ? 'إخفاء' : 'Dismiss'}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-cyan-200">{t('dashboard.title')}</h1>
          <div className="text-xs text-gray-500">
            {t('common.package')}:&nbsp;
            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] uppercase text-yellow-300 border border-yellow-500/50 bg-yellow-500/10 shadow-[0_0_12px_rgba(255,215,0,0.35)]">
              {user?.package || 'bronze'}
            </span>
          </div>
        </div>
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="p-6 neon-card rounded-xl neon-glow-cyan">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">{t('dashboard.totalSales')}</p>
              <TrendingUp className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-3xl font-bold text-cyan-400">
              {loading ? '...' : format(stats.monthlyRevenue)}
            </h3>
          </div>
          <div className="p-6 neon-card rounded-xl border border-fuchsia-500/40 shadow-[0_0_18px_rgba(236,72,153,0.2)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">{t('dashboard.onlineSales')}</p>
              <TrendingUp className="w-5 h-5 text-fuchsia-400" />
            </div>
            <h3 className="text-3xl font-bold text-fuchsia-400">
              {loading ? '...' : format(onlineStats.total)}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {onlineStats.count} {language === 'ar' ? 'طلب مؤكد' : 'confirmed orders'}
            </p>
          </div>
          <div className="p-6 neon-card rounded-xl border border-amber-500/40">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">{language === 'ar' ? 'العمليات (POS + أونلاين مؤكد)' : 'Operations (POS + Online)'}</p>
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="text-3xl font-bold text-amber-400">
              {loading ? '...' : operationsCount}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {language === 'ar' ? 'فواتير + طلبات مؤكدة' : 'invoices + confirmed orders'}
            </p>
          </div>
          <div className="p-6 neon-card rounded-xl neon-glow-fuchsia">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">{t('dashboard.totalProducts')}</p>
              <Package className="w-5 h-5 text-fuchsia-400" />
            </div>
            <h3 className="text-3xl font-bold text-fuchsia-400">
              {loading ? '...' : stats.totalProducts.toLocaleString()}
            </h3>
          </div>
          <div className="p-6 neon-card rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">{t('dashboard.staffOnline')}</p>
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-3xl font-bold text-yellow-500">
              {staffCount === null ? '—' : staffCount.toLocaleString()}
            </h3>
          </div>
          {deadSlowStats && (deadSlowStats.deadCount > 0 || deadSlowStats.slowCount > 0) && (
            <Link href="/store-admin/inventory/slow-moving">
              <div className="p-6 neon-card rounded-xl border border-amber-500/40 hover:border-amber-500/60 cursor-pointer transition">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm">{t('dashboard.deadSlowStock')}</p>
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-2xl font-bold text-amber-400">
                  {language === 'ar' ? 'راكد' : 'Dead'}: {deadSlowStats.deadCount} | {language === 'ar' ? 'بطيء' : 'Slow'}: {deadSlowStats.slowCount}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{format(deadSlowStats.deadValue + deadSlowStats.slowValue)} {language === 'ar' ? 'قيمة مربوطة' : 'tied value'}</p>
              </div>
            </Link>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Sales Chart - grouped bars: POS amount + operations (transactions count) */}
          <div className="p-6 neon-card rounded-xl">
            <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('dashboard.salesChart')}</h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-500">{t('common.loading')}</p>
              </div>
            ) : chartSalesData.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-500">{language === 'ar' ? 'لا توجد بيانات' : 'No data available'}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartSalesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={formatDate} />
                  <YAxis yAxisId="left" stroke="#00f3ff" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                  <YAxis yAxisId="right" orientation="right" stroke="#ec4899" tickFormatter={(v) => String(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1220', border: '1px solid #00f3ff', borderRadius: '8px' }}
                    labelStyle={{ color: '#00f3ff' }}
                    formatter={(val: number, name: string) => [name === 'revenue' ? format(val) : String(val), name === 'revenue' ? (language === 'ar' ? 'المبيعات' : 'Sales') : (language === 'ar' ? 'العمليات' : 'Operations')]}
                  />
                  <Legend />
                  <Bar dataKey="revenue" yAxisId="left" fill="#00f3ff" name={language === 'ar' ? 'المبيعات' : 'Sales'} />
                  <Bar dataKey="transactions" yAxisId="right" fill="#ec4899" name={language === 'ar' ? 'العمليات' : 'Operations'} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Online Sales Chart - grouped bars: amount + confirmed orders count */}
          <div className="p-6 neon-card rounded-xl">
            <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('dashboard.onlineSalesChart')}</h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-500">{t('common.loading')}</p>
              </div>
            ) : onlineChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-500">{language === 'ar' ? 'لا توجد بيانات' : 'No data available'}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={onlineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={formatDate} />
                  <YAxis yAxisId="left" stroke="#ec4899" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                  <YAxis yAxisId="right" orientation="right" stroke="#00f3ff" tickFormatter={(v) => String(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1220', border: '1px solid #ec4899', borderRadius: '8px' }}
                    labelStyle={{ color: '#ec4899' }}
                    formatter={(val: number, name: string) => [name === 'total' ? format(val) : String(val), name === 'total' ? (language === 'ar' ? 'المبيعات' : 'Sales') : (language === 'ar' ? 'العمليات' : 'Operations')]}
                  />
                  <Legend />
                  <Bar dataKey="total" yAxisId="left" fill="#ec4899" name={language === 'ar' ? 'المبيعات' : 'Sales'} />
                  <Bar dataKey="count" yAxisId="right" fill="#00f3ff" name={language === 'ar' ? 'العمليات' : 'Operations'} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Profit Chart */}
          <div className="p-6 neon-card rounded-xl">
            <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('dashboard.profitChart')}</h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-500">{t('common.loading')}</p>
              </div>
            ) : chartProfitData.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-gray-500">{language === 'ar' ? 'لا توجد بيانات' : 'No data available'}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartProfitData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={formatDate} />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1220', border: '1px solid #00f3ff', borderRadius: '8px' }}
                    labelStyle={{ color: '#00f3ff' }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" fill="#00f3ff" name={t('dashboard.sales')} />
                  <Bar dataKey="profit" fill="#ec4899" name={t('dashboard.profit')} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Low Stock Alerts & Recent Stock */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low Stock Alerts */}
          <div className="p-6 neon-card rounded-xl border border-fuchsia-500/40 shadow-[0_0_18px_rgba(236,72,153,0.35)]">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-xl font-bold text-cyan-200">{t('dashboard.lowStockAlerts')}</h3>
              <span className="ml-auto bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-bold">
                {lowStockProducts.length}
              </span>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {loading ? (
                <p className="text-gray-500 text-center py-4">{t('common.loading')}</p>
              ) : lowStockProducts.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  {t('dashboard.noAlerts')}
                </p>
              ) : (
                lowStockProducts.map((product) => (
                  <div key={product.id} className="bg-gray-800 p-3 rounded-lg border-l-4 border-red-500">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-white">
                          {language === 'ar' ? product.name_ar : product.name_en}
                        </h4>
                        {product.category_name_ar && (
                          <p className="text-xs text-gray-400 mt-1">
                            {language === 'ar' ? product.category_name_ar : product.category_name_en}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-red-400 font-bold">
                          {product.stock_quantity} / {product.min_stock_level}
                        </p>
                        <p className="text-xs text-gray-500">
                          {language === 'ar' ? 'المتبقي' : 'remaining'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Stock Update */}
          <div className="p-6 neon-card rounded-xl">
            <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('dashboard.recentStock')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-800 text-cyan-500">
                    <th className="pb-3 px-2">{language === 'ar' ? 'اسم المنتج' : 'Product Name'}</th>
                    <th className="pb-3 px-2">{language === 'ar' ? 'المخزون' : 'Stock'}</th>
                    <th className="pb-3 px-2">{language === 'ar' ? 'السعر' : 'Price'}</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-500">
                        {t('common.loading')}
                      </td>
                    </tr>
                  ) : recentProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-500">
                        {language === 'ar' ? 'لا توجد بيانات' : 'No recent items'}
                      </td>
                    </tr>
                  ) : (
                    recentProducts.map((product) => (
                      <tr key={product.id} className="border-b border-gray-900 hover:bg-gray-800 transition">
                        <td className="py-3 px-2">
                          {language === 'ar' ? product.name_ar : product.name_en}
                        </td>
                        <td className="py-3 px-2 text-green-400">{product.stock_quantity}</td>
                        <td className="py-3 px-2">{format(product.sell_price)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {(user?.role === 'super_admin' || user?.package === 'gold') && <AIAssistant />}
    </div>
  );
}

